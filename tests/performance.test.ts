import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { scopedDatabase, withDatabaseScope, withDatabaseResponseScope } from "../lib/database-scope";
import { unreadCounts } from "../lib/unread-counts";
import { ensureDemoWorkspace } from "../lib/demo-workspace";

function clients() {
  let created = 0;
  const closed: number[] = [];
  return { closed, count: () => created, create: () => {
    const id = ++created;
    return { $disconnect: async () => { closed.push(id); } } as unknown as PrismaClient;
  } };
}

test("database scope shares one client across queries but isolates concurrent requests", async () => {
  const f = clients();
  const ready = Promise.withResolvers<void>();
  const first = withDatabaseScope(async () => {
    const client = scopedDatabase(f.create);
    await ready.promise;
    assert.equal(scopedDatabase(f.create), client);
    return client;
  });
  const second = await withDatabaseScope(async () => {
    const client = scopedDatabase(f.create);
    assert.equal(scopedDatabase(f.create), client);
    return client;
  });
  ready.resolve();
  assert.notEqual(await first, second);
  assert.equal(f.count(), 2);
  assert.equal(f.closed.length, 2);
  assert.equal(scopedDatabase(f.create), undefined);
  await withDatabaseScope(async () => {});
  assert.equal(f.count(), 2, "static/realtime requests must not create unused clients");
});

test("scope cleans up failed operations and response creation failures", async () => {
  const f = clients();
  await assert.rejects(withDatabaseScope(async () => { scopedDatabase(f.create); throw new Error("query failure"); }));
  const tasks: Promise<unknown>[] = [];
  await assert.rejects(withDatabaseResponseScope(async () => {
    scopedDatabase(f.create); throw new Error("render failure");
  }, task => { tasks.push(task); }));
  await Promise.all(tasks);
  assert.equal(f.closed.length, 2);
});

test("streamed rendering and waitUntil work keep the request client until both complete", async () => {
  const f = clients();
  const tasks: Promise<unknown>[] = [];
  const background = Promise.withResolvers<void>();
  let initial: PrismaClient | undefined;
  const response = await withDatabaseResponseScope(async track => {
    initial = scopedDatabase(f.create);
    track(background.promise.then(() => assert.equal(scopedDatabase(f.create), initial)));
    let chunk = 0;
    return new Response(new ReadableStream({
      async pull(controller) {
        await Promise.resolve();
        assert.equal(scopedDatabase(f.create), initial);
        if (++chunk === 3) controller.close();
        else controller.enqueue(new TextEncoder().encode(`chunk${chunk}`));
      },
    }), { headers: { "content-type": "text/x-component" } });
  }, task => { tasks.push(task); });
  assert.equal(response.headers.get("content-type"), "text/x-component");
  assert.equal(await response.text(), "chunk1chunk2");
  assert.equal(f.closed.length, 0);
  background.resolve();
  await Promise.all(tasks);
  assert.equal(f.count(), 1);
  assert.equal(f.closed.length, 1);
});

test("cancelled and broken response streams release their clients", async () => {
  for (const broken of [false, true]) {
    const f = clients(); const tasks: Promise<unknown>[] = [];
    const response = await withDatabaseResponseScope(async () => {
      scopedDatabase(f.create);
      return new Response(new ReadableStream({
        pull(controller) { if (broken) controller.error(new Error("stream failed")); },
      }));
    }, task => { tasks.push(task); });
    if (broken) await assert.rejects(response.text());
    else await response.body!.cancel();
    await Promise.all(tasks);
    assert.equal(f.closed.length, 1);
  }
});

test("unread counts use two aggregate queries with independent read cutoffs", async () => {
  const cutoff = new Date("2026-10-01T00:00:00Z");
  const channels = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}` }));
  const conversations = [{ id: "dm" }];
  let queries = 0;
  type Query = { where: { deleted: boolean; memberId: { not: string }; OR: unknown[] } };
  const db = {
    message: { groupBy: async ({ where }: Query) => {
      queries++; assert.equal(where.deleted, false); assert.equal(where.memberId.not, "self");
      assert.equal(where.OR.length, 20);
      assert.deepEqual(where.OR[0], { channelId: "c0", createdAt: { gt: cutoff } });
      assert.deepEqual(where.OR[1], { channelId: "c1", createdAt: { gt: new Date(0) } });
      return [{ channelId: "c0", _count: { _all: 3 } }];
    } },
    directMessage: { groupBy: async ({ where }: Query) => {
      queries++; assert.equal(where.deleted, false); assert.equal(where.memberId.not, "self");
      assert.deepEqual(where.OR, [{ conversationId: "dm", createdAt: { gt: new Date(0) } }]);
      return [{ conversationId: "dm", _count: { _all: 2 } }];
    } },
  } as unknown as PrismaClient;
  const result = await unreadCounts(db, "self", channels, conversations, new Map([["c0", cutoff]]), new Map());
  assert.equal(queries, 2);
  assert.equal(result.channelUnreadMap.get("c0"), 3);
  assert.equal(result.channelUnreadMap.get("c1") ?? 0, 0);
  assert.equal(result.conversationUnreadMap.get("dm"), 2);
  await unreadCounts(db, "self", [], [], new Map(), new Map());
  assert.equal(queries, 2, "empty room lists must not query unrelated messages");
});

test("existing demo skips seed writes; missing guest or workspace falls back to seeding", async () => {
  for (const missing of ["none", "user", "workspace"]) {
    let writes = 0;
    const guest = { id: "fixture", name: "Guest", email: "fixture@example.test" };
    const db = {
      user: { findUnique: async () => missing === "user" ? null : guest },
      server: { findFirst: async () => missing === "workspace" ? null : { id: "workspace" } },
      $transaction: async () => { writes++; return guest; },
    } as unknown as PrismaClient;
    const result = await ensureDemoWorkspace(db);
    assert.equal(result.id, guest.id);
    assert.equal(writes, missing === "none" ? 0 : 1);
  }
});
