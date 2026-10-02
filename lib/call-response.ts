import type { RealtimeSocket } from "./cloudflare-socket";

type Reply = { ok: boolean; url?: string; error?: string };

// The server persists the first answer. Repeating that same answer recovers a
// lost acknowledgement without ringing twice or changing accept into decline.
export async function respondToCall(socket: RealtimeSocket, id: string, action: "accept" | "decline"): Promise<Reply> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!socket.connected) throw new Error("Realtime disconnected");
    try {
      return await new Promise<Reply>((resolve, reject) => {
        socket.timeout(10_000).emit("call:respond", { id, action }, (error: Error | null, reply?: Reply) => {
          if (error || !reply) reject(error ?? new Error("Missing call response"));
          else resolve(reply);
        });
      });
    } catch (error) { if (attempt === 1) throw error; }
  }
  throw new Error("Call response unavailable");
}
