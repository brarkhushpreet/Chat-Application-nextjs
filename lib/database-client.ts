import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { neonConfig } from "@neondatabase/serverless";

export function createDatabase(connectionString: string) {
  const isNeon = new URL(connectionString).hostname.endsWith(".neon.tech");
  if (isNeon) {
    neonConfig.webSocketConstructor = globalThis.WebSocket;
    return new PrismaClient({ adapter: new PrismaNeon({ connectionString, max: 1 }) });
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 3 }) });
}

export async function withDatabase<T>(connectionString: string, operation: (db: PrismaClient) => Promise<T>) {
  const client = createDatabase(connectionString);
  try {
    return await operation(client);
  } finally {
    await client.$disconnect(); // Never reuse a socket across Worker requests.
  }
}
