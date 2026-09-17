import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { DurableObjectNamespace, R2Bucket } from "@cloudflare/workers-types";

export interface NexusCloudflareEnv {
  REALTIME: DurableObjectNamespace;
  UPLOADS: R2Bucket;
  DATABASE_URL: string;
  AUTH_SECRET: string;
  TURN_KEY_ID?: string;
  TURN_API_TOKEN?: string;
}

export function cloudflareEnv(): NexusCloudflareEnv | null {
  try {
    return getCloudflareContext().env as unknown as NexusCloudflareEnv;
  } catch {
    return null; // The Node development server does not run inside workerd.
  }
}

export function realtimeStub(env: Pick<NexusCloudflareEnv, "REALTIME">) {
  // A single coordinator for a portfolio/small-team deployment, not a random
  // isolate per request. Rooms and users remain independently authorized.
  return env.REALTIME.get(env.REALTIME.idFromName("nexus-v1"));
}

export function publicRequestOrigin(request: Request) {
  // OpenNext's internal Next request can use localhost. These forwarded headers
  // are overwritten by our Worker, never accepted from an external client.
  const host = request.headers.get("x-forwarded-host");
  const protocol = request.headers.get("x-forwarded-proto");
  if (cloudflareEnv() && host && (protocol === "http" || protocol === "https")) return `${protocol}://${host}`;
  return new URL(request.url).origin;
}
