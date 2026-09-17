import type * as CF from "@cloudflare/workers-types";
import type { NexusCloudflareEnv } from "../lib/cloudflare";
import { withDatabase } from "../lib/database-client";
import { canAccessRoom, markRoomRead, type RoomKind } from "../lib/realtime-access";

declare const WebSocketPair: { new(): { 0: CF.WebSocket; 1: CF.WebSocket } };
declare const WebSocketRequestResponsePair: { new(request: string, response: string): CF.WebSocketRequestResponsePair };

type Participant = {
  socketId: string; userId: string; name: string; imageUrl: string;
  audioEnabled: boolean; videoEnabled: boolean; screenSharing: boolean;
};
type Envelope = { event: string; payload?: unknown; ack?: string };
type Session = {
  id: string; userId: string; expires: number; seen: number;
  rooms: Record<string, RoomKind>;
  call?: { roomId: string; kind: RoomKind; participant: Participant };
  queue: { seq: number; message: Envelope }[]; seq: number;
};
type Connection = { session: Session; socket?: CF.WebSocket };
const json = (data: unknown, status = 200) => Response.json(data, { status });

/** One hibernating coordinator for this portfolio deployment, not a Node server.
 * Poll sessions are persisted so fallback also survives object eviction. */
export class RealtimeHub {
  constructor(private ctx: CF.DurableObjectState, private env: NexusCloudflareEnv) {
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  protected database<T>(fn: Parameters<typeof withDatabase<T>>[1]) {
    return withDatabase(this.env.DATABASE_URL, fn);
  }
  private async connections(): Promise<Connection[]> {
    const sockets = this.ctx.getWebSockets().map(socket => ({ socket, session: socket.deserializeAttachment() as Session }));
    const polling = [...(await this.ctx.storage.list<Session>({ prefix: "poll:" })).values()].map(session => ({ session }));
    return [...sockets, ...polling];
  }
  private alive(c: Connection) {
    return c.session.expires > Date.now() && (c.socket || c.session.seen > Date.now() - 45_000);
  }
  private async save(c: Connection) {
    if (c.socket) c.socket.serializeAttachment(c.session);
    else await this.ctx.storage.put(`poll:${c.session.id}`, c.session);
  }
  private async send(c: Connection, message: Envelope) {
    if (!this.alive(c)) return;
    if (c.socket) {
      try { c.socket.send(JSON.stringify(message)); } catch { /* close handler cleans up */ }
    } else {
      c.session.queue.push({ seq: ++c.session.seq, message });
      c.session.queue = c.session.queue.slice(-128);
      // Durable Object KV values are bounded. A cursor gap triggers a full
      // history/sidebar reconciliation rather than silently losing updates.
      while (c.session.queue.length > 1 && new TextEncoder().encode(JSON.stringify(c.session.queue)).length > 90_000) c.session.queue.shift();
      if (new TextEncoder().encode(JSON.stringify(c.session.queue)).length > 90_000) {
        c.session.queue = [{ seq: c.session.seq, message: { event: "resync" } }];
      }
      await this.save(c);
    }
  }
  private async broadcast(event: string, payload: unknown, select: (c: Connection) => boolean) {
    for (const c of await this.connections()) if (select(c)) await this.send(c, { event, payload });
  }
  private async leave(c: Connection) {
    const old = c.session.call;
    delete c.session.call;
    await this.save(c);
    if (old) await this.broadcast("call:peer-left", c.session.id,
      other => other.session.id !== c.session.id && other.session.call?.roomId === old.roomId);
  }
  private async remove(c: Connection) {
    await this.leave(c);
    if (c.socket) c.socket.close(1000, "Session ended");
    else await this.ctx.storage.delete(`poll:${c.session.id}`);
  }

  async fetch(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(() => this.handleFetch(request));
  }
  private async handleFetch(request: Request): Promise<Response> {
    // Internal-only routes: the public worker never forwards arbitrary paths.
    const url = new URL(request.url);
    if (url.pathname === "/publish" && request.method === "POST") {
      const { room, event, payload } = await request.json() as { room: string; event: string; payload: unknown };
      const allowed = new Map<string, boolean>();
      for (const c of await this.connections()) {
        if (!this.alive(c)) continue;
        if (room === `user:${c.session.userId}`) await this.send(c, { event, payload });
        const roomId = room.startsWith("chat:") ? room.slice(5) : "";
        const kind = c.session.rooms[roomId];
        if (kind) {
          if (!allowed.has(c.session.userId)) allowed.set(c.session.userId,
            await this.database(db => canAccessRoom(db, c.session.userId, roomId, kind)));
          if (allowed.get(c.session.userId)) await this.send(c, { event, payload });
          else { delete c.session.rooms[roomId]; await this.save(c); }
        }
      }
      return json({ ok: true });
    }
    if (url.pathname === "/online") return json({ online: (await this.connections()).some(c =>
      c.session.userId === url.searchParams.get("userId") && this.alive(c)) });

    const userId = request.headers.get("x-nexus-user");
    const expires = Number(request.headers.get("x-nexus-expires"));
    if (!userId || !Number.isFinite(expires) || expires <= Date.now()) return json({ error: "Unauthorized" }, 401);
    if (url.pathname === "/socket" || url.pathname === "/connect") {
      const session: Session = { id: crypto.randomUUID(), userId, expires, seen: Date.now(), rooms: {}, queue: [], seq: 0 };
      if (url.pathname === "/socket") {
        const pair = new WebSocketPair();
        const [client, socket] = Object.values(pair);
        this.ctx.acceptWebSocket(socket);
        socket.serializeAttachment(session);
        socket.send(JSON.stringify({ event: "welcome", payload: { id: session.id } }));
        return new Response(null, { status: 101, webSocket: client } as ResponseInit);
      }
      await this.save({ session });
      await this.ctx.storage.setAlarm(Date.now() + 45_000);
      return json({ id: session.id });
    }
    const id = url.searchParams.get("sid") ?? "";
    const session = await this.ctx.storage.get<Session>(`poll:${id}`);
    const c = session ? { session } : null;
    if (!c || c.session.userId !== userId || !this.alive(c)) return json({ error: "Reconnect required" }, 410);
    c.session.seen = Date.now();
    if (url.pathname === "/disconnect") { await this.remove(c); return json({ ok: true }); }
    if (url.pathname === "/poll") {
      const cursor = Number(url.searchParams.get("cursor") ?? 0);
      const gap = c.session.queue.length > 0 && cursor < c.session.queue[0].seq - 1;
      c.session.queue = c.session.queue.filter(item => item.seq > cursor);
      await this.save(c);
      return json({ events: c.session.queue, cursor: c.session.seq, gap });
    }
    if (url.pathname === "/event") {
      await this.save(c);
      const body = await request.text();
      if (body.length > 65_536) return json({ error: "Event too large" }, 413);
      return json(await this.command(c, JSON.parse(body)));
    }
    return json({ error: "Not found" }, 404);
  }

  private async command(c: Connection, message: Envelope): Promise<unknown> {
    if (!this.alive(c)) return { ok: false, error: "Session expired" };
    try {
      const { event, payload } = message;
      if (event === "room:leave" && typeof payload === "string") {
        delete c.session.rooms[payload]; await this.save(c); return { ok: true };
      }
      if (event === "call:leave") { await this.leave(c); return { ok: true }; }
      if (!payload || typeof payload !== "object") return { ok: false };
      const p = payload as Record<string, unknown>;
      const roomId = p.roomId;
      if (typeof roomId !== "string" || roomId.length > 100) return { ok: false };
      if (["room:join", "room:read", "call:join"].includes(event)) {
        const kind = p.kind;
        if (kind !== "channel" && kind !== "conversation") return { ok: false };
        const allowed = await this.database(db => canAccessRoom(db, c.session.userId, roomId, kind));
        if (!allowed) return { ok: false, error: "Room access denied" };
        if (event === "room:join") {
          if (Object.keys(c.session.rooms).length >= 16 && !c.session.rooms[roomId]) return { ok: false };
          c.session.rooms[roomId] = kind; await this.save(c); return { ok: true };
        }
        if (event === "room:read") {
          const readAt = await this.database(db => markRoomRead(db, c.session.userId, roomId, kind));
          await this.broadcast("chat:read", { roomId, readerUserId: c.session.userId, readAt }, other => Boolean(other.session.rooms[roomId]));
          await this.broadcast("sidebar:read", { roomId, kind, readAt }, other => other.session.userId === c.session.userId);
          return { ok: true };
        }
        await this.leave(c);
        const profile = await this.database(db => db.profile.findUnique({ where: { userId: c.session.userId } }));
        if (!profile) return { ok: false };
        const participant: Participant = { socketId: c.session.id, userId: c.session.userId, name: profile.name,
          imageUrl: profile.imageUrl, audioEnabled: true, videoEnabled: true, screenSharing: false };
        c.session.call = { roomId, kind, participant }; await this.save(c);
        const peers = (await this.connections()).filter(other => other.session.id !== c.session.id && this.alive(other) && other.session.call?.roomId === roomId)
          .map(other => other.session.call!.participant);
        await this.broadcast("call:peer-joined", participant, other => other.session.id !== c.session.id && other.session.call?.roomId === roomId);
        return { ok: true, peers };
      }
      const call = c.session.call;
      if (!call || call.roomId !== roomId || !await this.database(db => canAccessRoom(db, c.session.userId, roomId, call.kind))) return { ok: false };
      if (["call:offer", "call:answer", "call:ice"].includes(event)) {
        const target = (await this.connections()).find(other => other.session.id === p.target && other.session.call?.roomId === roomId && this.alive(other));
        if (!target || !await this.database(db => canAccessRoom(db, target.session.userId, roomId, call.kind))) return { ok: false };
        await this.send(target, { event, payload: { from: c.session.id, data: p.data } });
        return { ok: true };
      }
      if (event === "call:media-state") {
        for (const key of ["audioEnabled", "videoEnabled", "screenSharing"] as const) {
          if (typeof p[key] === "boolean") call.participant[key] = p[key];
        }
        await this.save(c);
        await this.broadcast(event, call.participant, other => other.session.id !== c.session.id && other.session.call?.roomId === roomId);
        return { ok: true };
      }
      return { ok: false, error: "Unknown event" };
    } catch {
      return { ok: false, error: "Realtime operation failed. Please retry." };
    }
  }

  async webSocketMessage(socket: CF.WebSocket, data: string | ArrayBuffer) {
    return this.ctx.blockConcurrencyWhile(() => this.handleMessage(socket, data));
  }
  private async handleMessage(socket: CF.WebSocket, data: string | ArrayBuffer) {
    if (typeof data !== "string" || data.length > 65_536) { socket.close(1009, "Event too large"); return; }
    const c = { socket, session: socket.deserializeAttachment() as Session };
    if (!this.alive(c)) { await this.remove(c); return; }
    try {
      const message = JSON.parse(data) as Envelope;
      const result = await this.command(c, message);
      if (message.ack) socket.send(JSON.stringify({ ack: message.ack, result }));
    } catch { socket.close(1007, "Invalid event"); }
  }
  async webSocketClose(socket: CF.WebSocket) { await this.ctx.blockConcurrencyWhile(() => this.remove({ socket, session: socket.deserializeAttachment() as Session })); }
  async webSocketError(socket: CF.WebSocket) { await this.webSocketClose(socket); }
  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      for (const c of await this.connections()) if (!this.alive(c)) await this.remove(c);
      if ((await this.connections()).some(c => !c.socket)) await this.ctx.storage.setAlarm(Date.now() + 45_000);
    });
  }
}
