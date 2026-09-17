import type { Server as SocketIOServer } from "socket.io";
import { cloudflareEnv, realtimeStub } from "./cloudflare";

const realtimeState = globalThis as typeof globalThis & {
  nexusIO?: SocketIOServer;
};

export const chatRoom = (roomId: string) => `chat:${roomId}`;
export const callRoom = (roomId: string) => `call:${roomId}`;
export const userRoom = (userId: string) => `user:${userId}`;

export function registerRealtimeServer(io: SocketIOServer) {
  realtimeState.nexusIO = io;
}

export async function emitChatEvent(
  roomId: string,
  event: string,
  payload: unknown,
) {
  if (cloudflareEnv()) {
    await publish({ room: chatRoom(roomId), event, payload });
  } else {
    realtimeState.nexusIO?.to(chatRoom(roomId)).emit(event, payload);
  }
}

export async function emitUserEvent(
  userId: string,
  event: string,
  payload: unknown,
) {
  if (cloudflareEnv()) {
    await publish({ room: userRoom(userId), event, payload });
  } else {
    realtimeState.nexusIO?.to(userRoom(userId)).emit(event, payload);
  }
}

export async function isUserOnline(userId: string) {
  const env = cloudflareEnv();
  if (env) {
    const response = await realtimeStub(env).fetch(`https://realtime.internal/online?userId=${encodeURIComponent(userId)}`);
    if (!response.ok) return false;
    return (await response.json() as { online: boolean }).online;
  }
  return Boolean(
    realtimeState.nexusIO?.sockets.adapter.rooms.get(userRoom(userId))?.size,
  );
}

async function publish(event: { room: string; event: string; payload: unknown }) {
  const env = cloudflareEnv()!;
  const response = await realtimeStub(env).fetch("https://realtime.internal/publish", {
    method: "POST", body: JSON.stringify(event),
  });
  if (!response.ok) throw new Error("Realtime publication failed");
}
