import type { PrismaClient } from "@prisma/client";
import { cloudflareEnv } from "./cloudflare";
import { createDatabase, withDatabase } from "./database-client";

const local = globalThis as typeof globalThis & { prisma?: PrismaClient };
const localDatabase = () => local.prisma ??= createDatabase(
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/nexus_chat",
);

// Cloudflare operations own their connections; interactive transactions retain
// one client until their callback finishes. Local Node keeps its normal pool.
export const db = new Proxy({} as PrismaClient, {
  get(_target, model: string) {
    const env = cloudflareEnv();
    if (!env) {
      const client = localDatabase();
      const value = Reflect.get(client, model);
      return typeof value === "function" ? value.bind(client) : value;
    }
    if (model.startsWith("$")) {
      return (...args: unknown[]) => withDatabase(env.DATABASE_URL, (client) =>
        Reflect.get(client, model).apply(client, args));
    }
    return new Proxy({}, {
      get(_delegate, operation: string) {
        return (...args: unknown[]) => withDatabase(env.DATABASE_URL, (client) => {
          const delegate = Reflect.get(client, model);
          return delegate[operation](...args);
        });
      },
    });
  },
});
