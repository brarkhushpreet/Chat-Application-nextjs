import type { PrismaClient } from "@prisma/client";
import { canAccessRoom, type RoomKind } from "./realtime-access";

export type IncomingCall = {
  id: string; roomId: string; kind: RoomKind; callerName: string;
  callerImageUrl: string; roomName: string; video: boolean; url: string; expiresAt: number;
};
type Recipient = { userId: string; name: string; url: string };
type Audience = { callerName: string; callerImageUrl: string; roomName: string; video: boolean; recipients: Recipient[] };
export type PendingCall = Omit<IncomingCall, "url"> & {
  callerId: string; sessionId: string; recipients: Recipient[];
};
type Connection = { id: string; userId: string; roomId?: string };
export interface CallStore {
  list(): Promise<PendingCall[]>;
  put(call: PendingCall): Promise<void>;
  delete(id: string): Promise<void>;
}

// Derive identity, recipients and destinations on the server. Conversation URLs
// use the OTHER member's ID, not the conversation's ID.
export async function callAudience(db: PrismaClient, userId: string, roomId: string, kind: RoomKind): Promise<Audience | null> {
  if (!await canAccessRoom(db, userId, roomId, kind)) return null;
  const caller = await db.profile.findUnique({ where: { userId } });
  if (!caller) return null;
  const base = { callerName: caller.name, callerImageUrl: caller.imageUrl };
  if (kind === "conversation") {
    const room = await db.conversation.findUniqueOrThrow({ where: { id: roomId }, include: {
      memberOne: { include: { profile: true } }, memberTwo: { include: { profile: true } },
    } });
    const [self, other] = room.memberOne.profile.userId === userId
      ? [room.memberOne, room.memberTwo] : [room.memberTwo, room.memberOne];
    return { ...base, roomName: "Private conversation", video: true, recipients: [{
      userId: other.profile.userId, name: other.profile.name,
      url: `/servers/${encodeURIComponent(other.serverId)}/conversations/${encodeURIComponent(self.id)}?video=true`,
    }] };
  }
  const room = await db.channel.findUniqueOrThrow({ where: { id: roomId }, include: {
    server: { include: { members: { include: { profile: true } } } },
  } });
  if (room.type === "TEXT") return null;
  return { ...base, roomName: room.name, video: room.type === "VIDEO", recipients: room.server.members
    .filter(member => member.profile.userId !== userId).map(member => ({
      userId: member.profile.userId, name: member.profile.name,
      url: `/servers/${encodeURIComponent(room.serverId)}/channels/${encodeURIComponent(roomId)}`,
    })) };
}

/** Shared invitation state machine for Socket.IO and the hibernating Worker. */
export class CallInvitations {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private store: CallStore, private transport: {
    connections(): Promise<Connection[]>;
    send(userId: string, event: string, payload: unknown): Promise<void>;
    audience(userId: string, roomId: string, kind: RoomKind): Promise<Audience | null>;
    allowed(userId: string, roomId: string, kind: RoomKind): Promise<boolean>;
  }) {}

  // Serialize responses from different tabs, including on the local Node server.
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn);
    this.queue = result.catch(() => {});
    return result;
  }
  private async dismiss(call: PendingCall) {
    await this.store.delete(call.id);
    for (const recipient of call.recipients) await this.transport.send(recipient.userId, "call:dismissed", { id: call.id });
  }
  private async sweep() {
    const connections = await this.transport.connections();
    for (const call of await this.store.list()) {
      const active = connections.some(c => c.id === call.sessionId && c.roomId === call.roomId);
      if (call.expiresAt <= Date.now() || !active) {
        await this.dismiss(call);
        if (active && call.recipients.length) await this.transport.send(call.callerId, "call:ring-status", {
          roomId: call.roomId, message: "No answer. You can leave the call and try again later.",
        });
      }
    }
  }
  expire() { return this.run(() => this.sweep()); }
  cancel(sessionId: string) {
    return this.run(async () => {
      for (const call of await this.store.list()) if (call.sessionId === sessionId) await this.dismiss(call);
    });
  }
  private notification(call: PendingCall, recipient: Recipient): IncomingCall {
    return { id: call.id, roomId: call.roomId, kind: call.kind, callerName: call.callerName,
      callerImageUrl: call.callerImageUrl, roomName: call.roomName, video: call.video,
      expiresAt: call.expiresAt, url: `${recipient.url}${recipient.url.includes("?") ? "&" : "?"}incomingCall=${call.id}` };
  }
  ring(sessionId: string, userId: string, roomId: string, kind: RoomKind) {
    return this.run(async () => {
      await this.sweep();
      const connections = await this.transport.connections();
      if (!connections.some(c => c.id === sessionId && c.userId === userId && c.roomId === roomId)) return { ok: false };
      const existing = await this.store.list();
      if (existing.some(call => call.sessionId === sessionId && call.roomId === roomId)) return { ok: true };
      const audience = await this.transport.audience(userId, roomId, kind);
      if (!audience) return { ok: false, error: "Call access denied" };
      const recipients: Recipient[] = [];
      let busy = false;
      for (const recipient of audience.recipients) {
        const online = connections.filter(c => c.userId === recipient.userId);
        if (!online.length || online.some(c => c.roomId === roomId)) continue;
        if (online.some(c => c.roomId) || existing.some(call => call.recipients.some(r => r.userId === recipient.userId))) {
          busy = true;
          await this.transport.send(userId, "call:ring-status", { roomId, message: `${recipient.name} is busy right now.` });
        } else recipients.push(recipient);
      }
      const call: PendingCall = { ...audience, recipients, id: crypto.randomUUID(), roomId, kind,
        callerId: userId, sessionId, expiresAt: Date.now() + 30_000 };
      await this.store.put(call);
      if (recipients.length) {
        await this.transport.send(userId, "call:ring-status", { roomId, message: "Ringing…" });
        for (const recipient of recipients) await this.transport.send(recipient.userId, "call:incoming", this.notification(call, recipient));
      } else if (!busy) await this.transport.send(userId, "call:ring-status", { roomId, message: "No other members are available to ring right now." });
      return { ok: true };
    });
  }
  respond(userId: string, id: string, action: "accept" | "decline") {
    return this.run(async () => {
      await this.sweep();
      const call = (await this.store.list()).find(call => call.id === id);
      const recipient = call?.recipients.find(r => r.userId === userId);
      if (!call || !recipient || !await this.transport.allowed(userId, call.roomId, call.kind)) {
        return { ok: false, error: "This call is no longer available." };
      }
      const notification = this.notification(call, recipient);
      call.recipients = call.recipients.filter(r => r.userId !== userId);
      await this.store.put(call);
      await this.transport.send(userId, "call:dismissed", { id });
      await this.transport.send(call.callerId, "call:ring-status", { roomId: call.roomId,
        message: action === "decline" ? `${recipient.name} is busy right now.` : `${recipient.name} accepted. Connecting…` });
      return { ok: true, url: action === "accept" ? notification.url : undefined };
    });
  }
  sync(userId: string) {
    return this.run(async () => {
      await this.sweep();
      for (const call of await this.store.list()) {
        const recipient = call.recipients.find(r => r.userId === userId);
        if (recipient && await this.transport.allowed(userId, call.roomId, call.kind)) {
          await this.transport.send(userId, "call:incoming", this.notification(call, recipient));
        }
      }
      return { ok: true };
    });
  }
}
