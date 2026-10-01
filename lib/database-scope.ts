import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "@prisma/client";

type Scope = { client?: PrismaClient; closed: boolean };
// Next's server bundle and the custom Worker entrypoint must use the SAME ALS.
// Only the context container is global, never a database client/connection.
const key = Symbol.for("nexus.database-request-scope");
const registry = globalThis as typeof globalThis & { [key]?: AsyncLocalStorage<Scope> };
const storage = registry[key] ??= new AsyncLocalStorage<Scope>();

export function scopedDatabase(create: () => PrismaClient): PrismaClient | undefined {
  const scope = storage.getStore();
  if (!scope) return undefined;
  if (scope.closed) throw new Error("Database request scope has already ended");
  return scope.client ??= create();
}

async function close(scope: Scope) {
  if (scope.closed) return;
  scope.closed = true;
  const client = scope.client;
  delete scope.client;
  await client?.$disconnect();
}

/** Non-streaming Durable Object events own a client for one event only. */
export async function withDatabaseScope<T>(operation: () => Promise<T>): Promise<T> {
  const scope: Scope = { closed: false };
  return storage.run(scope, async () => {
    try { return await operation(); }
    finally { await close(scope); }
  });
}

/** Keep the client alive until streamed RSC rendering AND background work end. */
export async function withDatabaseResponseScope(
  operation: (track: (task: Promise<unknown>) => void) => Promise<Response>,
  waitUntil: (task: Promise<unknown>) => void,
): Promise<Response> {
  const scope: Scope = { closed: false };
  const background = new Set<Promise<unknown>>();
  const track = (task: Promise<unknown>) => {
    const settled = task.catch(() => {}).finally(() => background.delete(settled));
    background.add(settled);
    waitUntil(task);
  };
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    waitUntil(storage.run(scope, async () => {
      while (background.size) await Promise.all([...background]);
      await close(scope);
    }));
  };
  return storage.run(scope, async () => {
    try {
      const response = await operation(track);
      if (!response.body || response.status === 101) { finish(); return response; }
      const reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array>({
        pull: controller => storage.run(scope, async () => {
          try {
            const { done, value } = await reader.read();
            if (done) { controller.close(); finish(); }
            else controller.enqueue(value);
          } catch (error) { controller.error(error); finish(); }
        }),
        cancel: reason => storage.run(scope, async () => {
          try { await reader.cancel(reason); } finally { finish(); }
        }),
      }, { highWaterMark: 0 });
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) { finish(); throw error; }
  });
}
