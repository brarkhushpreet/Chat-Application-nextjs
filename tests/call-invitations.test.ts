import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { CallInvitations, callAudience, type PendingCall } from "../lib/call-invitations";

function fixture() {
  const data = new Map<string, PendingCall>();
  const events: { user: string; event: string; payload: Record<string, unknown> }[] = [];
  const connections: { id: string; userId: string; roomId?: string }[] = [
    { id: "caller", userId: "alice", roomId: "room" },
    { id: "recipient", userId: "bob" },
    { id: "recipient-tab", userId: "bob" },
    { id: "outsider", userId: "eve" },
  ];
  let allowed = true;
  const service = new CallInvitations({
    list: async () => structuredClone([...data.values()]),
    put: async call => { data.set(call.id, structuredClone(call)); },
    delete: async id => { data.delete(id); },
  }, {
    connections: async () => connections,
    send: async (user, event, payload) => { events.push({ user, event, payload: payload as Record<string, unknown> }); },
    audience: async () => ({ callerName: "Alice", callerImageUrl: "", roomName: "Team", video: true,
      recipients: [{ userId: "bob", name: "Bob", url: "/servers/team/conversations/alice-member?video=true" }] }),
    allowed: async () => allowed,
  });
  return { data, events, connections, service, revoke: () => { allowed = false; },
    ring: () => service.ring("caller", "alice", "room", "conversation"),
    id: () => [...data.keys()][0] };
}

test("rings recipients outside the call, blocks outsiders, and declines once across tabs", async () => {
  const f = fixture();
  assert.equal((await f.service.ring("outsider", "eve", "room", "conversation")).ok, false);
  await f.ring();
  await f.ring();
  const incoming = f.events.filter(e => e.event === "call:incoming");
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0].user, "bob");
  assert.equal(incoming[0].payload.callerName, "Alice");
  assert.equal((await f.service.respond("eve", f.id(), "accept")).ok, false);
  const results = await Promise.all([f.service.respond("bob", f.id(), "decline"), f.service.respond("bob", f.id(), "accept")]);
  assert.deepEqual(results.map(r => r.ok), [true, false]);
  assert.ok(f.events.some(e => e.user === "alice" && e.payload.message === "Bob is busy right now."));
  assert.equal(f.events.filter(e => e.user === "bob" && e.event === "call:dismissed").length, 1);
});

test("accept returns the call destination, sync replays pending invites, and rechecks membership", async () => {
  const f = fixture();
  await f.ring();
  await f.service.sync("bob");
  assert.equal(f.events.filter(e => e.event === "call:incoming").length, 2);
  const result = await f.service.respond("bob", f.id(), "accept");
  assert.ok(result.ok);
  assert.equal(result.url, `/servers/team/conversations/alice-member?video=true&incomingCall=${f.id()}`);
  assert.ok(f.events.some(e => e.payload.message === "Bob accepted. Connecting…"));
  await f.service.sync("bob");
  assert.equal(f.events.filter(e => e.event === "call:incoming").length, 2);
  const denied = fixture(); await denied.ring(); denied.revoke();
  assert.equal((await denied.service.respond("bob", denied.id(), "accept")).ok, false);
});

test("busy users are not interrupted, and ended or expired invitations cannot be accepted", async () => {
  const busy = fixture(); busy.connections[1].roomId = "another-room";
  await busy.ring();
  assert.equal(busy.events.filter(e => e.event === "call:incoming").length, 0);
  assert.ok(busy.events.some(e => e.payload.message === "Bob is busy right now."));
  for (const reason of ["cancel", "disconnect", "expired"] as const) {
    const f = fixture(); await f.ring(); const id = f.id();
    if (reason === "cancel") await f.service.cancel("caller");
    if (reason === "disconnect") f.connections.shift();
    if (reason === "expired") f.data.get(id)!.expiresAt = Date.now() - 1;
    await f.service.expire();
    assert.equal(f.data.size, 0);
    assert.equal((await f.service.respond("bob", id, "accept")).ok, false);
    assert.ok(f.events.some(e => e.user === "bob" && e.event === "call:dismissed"));
  }
});

test("private call destinations use the caller's member ID from either side of the conversation", async () => {
  const members = ["alice", "bob"].map(userId => ({ id: `${userId}-member`, serverId: "team", profile: { userId, name: userId } }));
  const db = {
    profile: { findUnique: async () => ({ name: "Caller", imageUrl: "" }) },
    conversation: { findFirst: async () => ({ id: "room" }), findUniqueOrThrow: async () => ({ memberOne: members[0], memberTwo: members[1] }) },
  } as unknown as PrismaClient;
  for (const caller of ["alice", "bob"]) {
    const result = await callAudience(db, caller, "room", "conversation");
    assert.equal(result?.recipients[0].url, `/servers/team/conversations/${caller}-member?video=true`);
    assert.notEqual(result?.recipients[0].userId, caller);
  }
});
