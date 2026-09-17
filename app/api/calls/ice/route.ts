import { auth } from "@/auth";
import { cloudflareEnv } from "@/lib/cloudflare";
import { db } from "@/lib/db";
import { canAccessRoom } from "@/lib/realtime-access";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Sign in to join calls" }, { status: 401 });
  const url = new URL(request.url);
  const roomId = url.searchParams.get("roomId");
  const kind = url.searchParams.get("kind");
  if (!roomId || (kind !== "channel" && kind !== "conversation") || !await canAccessRoom(db, session.user.id, roomId, kind)) {
    return Response.json({ error: "Room access denied" }, { status: 403 });
  }
  const env = cloudflareEnv();
  const keyId = env?.TURN_KEY_ID ?? process.env.TURN_KEY_ID;
  const apiToken = env?.TURN_API_TOKEN ?? process.env.TURN_API_TOKEN;
  const headers = { "Cache-Control": "private, no-store" };
  if (!keyId || !apiToken) {
    if (env) return Response.json({ error: "Calls need Cloudflare TURN configuration. Ask the host to set TURN_KEY_ID and TURN_API_TOKEN." }, { status: 503, headers });
    return Response.json({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }], ttl: 3600 }, { headers });
  }
  try {
    const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
      method: "POST", headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 3600 }), signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("TURN unavailable");
    const result = await response.json() as { iceServers?: RTCIceServer[] };
    if (!result.iceServers?.length) throw new Error("Invalid TURN response");
    return Response.json({ iceServers: result.iceServers, ttl: 3600 }, { headers });
  } catch {
    return Response.json({ error: "Call relay is unavailable. Please try again shortly." }, { status: 503, headers });
  }
}
