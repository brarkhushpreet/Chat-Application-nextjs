import assert from "node:assert/strict";
import { test } from "node:test";
import { AsyncLocalStorage } from "node:async_hooks";
import type { DurableObjectState } from "@cloudflare/workers-types";
import type { PrismaClient } from "@prisma/client";
import { RealtimeHub } from "../cloudflare/realtime-hub";
import type { NexusCloudflareEnv } from "../lib/cloudflare";
import { fileFormat, validFileKey } from "../lib/uploads";
import { CloudflareSocket } from "../lib/cloudflare-socket";

Object.defineProperty(globalThis, "WebSocketRequestResponsePair", { value: class {}, configurable: true });
function fixture() {
  const inputGate = new AsyncLocalStorage<boolean>();
  let mutationQueue = Promise.resolve<unknown>(undefined);
  let beforeAccess: (userId: string) => Promise<void> = async () => {};
  const data = new Map<string, unknown>();
  const sockets: { deserializeAttachment(): unknown; serializeAttachment(value: unknown): void; send(value: string): void; close(): void }[] = [];
  const ctx = {
    setWebSocketAutoResponse() {}, getWebSockets: () => sockets,
    blockConcurrencyWhile: <T>(fn: () => Promise<T>) => {
      if (inputGate.getStore()) return fn();
      const task = mutationQueue.then(() => inputGate.run(true, fn));
      mutationQueue = task.catch(() => {});
      return task;
    },
    storage: {
      get: async (key: string) => structuredClone(data.get(key)),
      put: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); },
      delete: async (key: string) => data.delete(key), setAlarm: async () => {},
      list: async ({ prefix }: { prefix: string }) => new Map([...data].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key, structuredClone(value)])),
    },
  };
  const allowed = new Set(["alice", "bob"]);
  let accessQueries = 0;
  const fakeDb = {
    channel: { findFirst: async ({ where }: { where: { id: string; server: { members: { some: { profile: { userId: string } } } } } }) => {
      accessQueries++;
      await beforeAccess(where.server.members.some.profile.userId);
      return where.id === "room" && allowed.has(where.server.members.some.profile.userId) ? { id: "room" } : null;
    },
      findUniqueOrThrow: async () => ({ name: "Video room", type: "VIDEO", serverId: "team", server: {
        members: ["alice", "bob"].map(userId => ({ profile: { userId, name: userId } })),
      } }),
    },
    profile: { findUnique: async ({ where }: { where: { userId: string } }) => ({ name: where.userId, imageUrl: "" }) },
  };
  class Hub extends RealtimeHub {
    protected override database<T>(fn: (db: PrismaClient) => Promise<T>) {
      assert.equal(inputGate.getStore(), undefined, "Network database I/O must not block all realtime events");
      return fn(fakeDb as unknown as PrismaClient);
    }
  }
  const makeHub = () => new Hub(ctx as unknown as DurableObjectState, {} as NexusCloudflareEnv);
  let hub = makeHub();
  const request = (path: string, user = "alice", body?: unknown) => hub.fetch(new Request(`https://internal${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-nexus-user": user, "x-nexus-expires": String(Date.now() + 60_000) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  return { data, sockets, allowed, accessQueries: () => accessQueries, hub: () => hub, restart: () => { hub = makeHub(); }, request,
    beforeAccess: (fn: typeof beforeAccess) => { beforeAccess = fn; },
    connect: async (user = "alice") => (await (await request("/connect", user, {})).json()).id as string,
    event: async (id: string, user: string, event: string, payload: unknown) => (await request(`/event?sid=${id}`, user, { event, payload })).json(),
    poll: async (id: string, user: string, cursor = 0) => (await request(`/poll?sid=${id}&cursor=${cursor}`, user)).json(),
  };
}

test("polling rooms authorize membership, scope messages, survive hibernation, and replay until cursor acknowledgement", async () => {
  const f = fixture(); const alice = await f.connect(); const bob = await f.connect("bob"); const eve = await f.connect("eve");
  assert.equal((await f.event(alice, "alice", "room:join", { roomId: "room", kind: "channel" })).ok, true);
  assert.equal((await f.event(eve, "eve", "room:join", { roomId: "room", kind: "channel" })).ok, false);
  assert.equal((await f.request(`/poll?sid=${alice}`, "eve")).status, 410);
  await f.request("/publish", "", { room: "chat:room", event: "chat:room:messages", payload: { id: "m1" } });
  assert.equal((await f.poll(alice, "alice")).events.length, 1);
  assert.equal((await f.poll(bob, "bob")).events.length, 0);
  assert.equal((await f.poll(eve, "eve")).events.length, 0);
  f.restart();
  const replay = await f.poll(alice, "alice");
  assert.equal(replay.events[0].message.payload.id, "m1");
  assert.equal((await f.poll(alice, "alice", replay.cursor)).events.length, 0);
  f.allowed.delete("alice");
  await f.request("/publish", "", { room: "chat:room", event: "chat:room:messages", payload: { id: "private" } });
  assert.equal((await f.poll(alice, "alice", replay.cursor)).events.length, 0);
});

test("a slow membership lookup does not block another caller, and late signals cannot reach a departed peer", async () => {
  const f = fixture(); const alice = await f.connect(); const bob = await f.connect("bob");
  const join = { roomId: "room", kind: "channel" };
  for (const [id, user] of [[alice, "alice"], [bob, "bob"]]) await f.event(id, user, "call:join", join);
  let release!: () => void; let started!: () => void;
  const waiting = new Promise<void>(resolve => { started = resolve; });
  const delay = new Promise<void>(resolve => { release = resolve; });
  f.beforeAccess(async user => { if (user === "alice") { started(); await delay; } });
  const offer = f.event(alice, "alice", "call:offer", { roomId: "room", target: bob, data: "offer" });
  await waiting;
  try {
    assert.equal((await f.event(bob, "bob", "call:leave", "room")).ok, true);
    assert.equal((await f.poll(bob, "bob")).events.some((e: { message: { event: string } }) => e.message.event === "call:offer"), false);
  } finally { release(); }
  assert.equal((await offer).ok, false);
});

test("accept ACK can be recovered after hibernation without a second caller notification", async () => {
  const f = fixture(); const alice = await f.connect(); const bob = await f.connect("bob");
  await f.event(alice, "alice", "call:join", { roomId: "room", kind: "channel" });
  await f.event(alice, "alice", "call:ring", { roomId: "room" });
  const incoming = (await f.poll(bob, "bob")).events.find((e: { message: { event: string } }) => e.message.event === "call:incoming");
  const answer = { id: incoming.message.payload.id, action: "accept" };
  const first = await f.event(bob, "bob", "call:respond", answer);
  assert.equal(first.ok, true);
  f.restart();
  assert.deepEqual(await f.event(bob, "bob", "call:respond", answer), first);
  const notifications = (await f.poll(alice, "alice")).events.filter((e: { message: { payload?: { message?: string } } }) =>
    e.message.payload?.message === "bob accepted. Connecting…");
  assert.equal(notifications.length, 1);
  f.allowed.delete("bob");
  assert.equal((await f.event(bob, "bob", "call:respond", answer)).ok, false);
});

test("new-conversation and unread notifications are private to the addressed user", async () => {
  const f = fixture(); const alice = await f.connect(); const bob = await f.connect("bob");
  for (const event of ["conversation:created", "sidebar:message", "sidebar:read", "space:updated"]) {
    await f.request("/publish", "", { room: "user:alice", event, payload: { roomId: "room" } });
  }
  assert.equal((await f.poll(alice, "alice")).events.length, 4);
  assert.equal((await f.poll(bob, "bob")).events.length, 0);
});

test("call participants, targeted signaling, leave events and expired polling cleanup", async () => {
  const f = fixture(); const alice = await f.connect(); const bob = await f.connect("bob"); const eve = await f.connect("eve");
  const join = { roomId: "room", kind: "channel" };
  assert.deepEqual((await f.event(alice, "alice", "call:join", join)).peers, []);
  assert.equal((await f.event(bob, "bob", "call:join", join)).peers[0].socketId, alice);
  assert.equal((await f.event(eve, "eve", "call:join", join)).ok, false);
  assert.equal((await f.event(alice, "alice", "call:offer", { roomId: "room", target: eve, data: "secret" })).ok, false);
  assert.equal((await f.event(alice, "alice", "call:offer", { roomId: "room", target: bob, data: "offer" })).ok, true);
  assert.equal((await f.poll(bob, "bob")).events.at(-1).message.payload.from, alice);
  assert.equal((await f.poll(eve, "eve")).events.length, 0);
  await f.event(alice, "alice", "call:leave", "room");
  assert.equal((await f.poll(bob, "bob")).events.at(-1).message.event, "call:peer-left");
  const stored = f.data.get(`poll:${bob}`) as { seen: number };
  stored.seen = Date.now() - 60_000;
  await f.hub().alarm();
  assert.equal(f.data.has(`poll:${bob}`), false);
});

test("incoming calls reach other chats, survive hibernation, and relay decline to the caller", async () => {
  const f = fixture(); const alice = await f.connect(); const bob = await f.connect("bob"); const eve = await f.connect("eve");
  await f.event(alice, "alice", "call:join", { roomId: "room", kind: "channel" });
  assert.equal((await f.event(alice, "alice", "call:ring", { roomId: "room" })).ok, true);
  const incoming = (await f.poll(bob, "bob")).events.find((item: { message: { event: string } }) => item.message.event === "call:incoming");
  assert.ok(incoming);
  assert.equal((await f.poll(eve, "eve")).events.length, 0);
  f.restart();
  assert.equal((await f.event(eve, "eve", "call:respond", { id: incoming.message.payload.id, action: "accept" })).ok, false);
  assert.equal((await f.event(bob, "bob", "call:respond", { id: incoming.message.payload.id, action: "decline" })).ok, true);
  assert.ok((await f.poll(alice, "alice")).events.some((item: { message: { payload?: { message?: string } } }) => item.message.payload?.message === "bob is busy right now."));
});

test("ICE batches authorize both peers once per batch and immediately reject revoked membership", async () => {
  const f = fixture(); const alice = await f.connect(); const bob = await f.connect("bob");
  for (const [id, user] of [[alice, "alice"], [bob, "bob"]])
    await f.event(id, user, "call:join", { roomId: "room", kind: "channel" });
  const before = f.accessQueries();
  const payload = { roomId: "room", target: bob, data: Array.from({ length: 16 }, (_, i) => ({ candidate: `fixture-${i}` })) };
  assert.equal((await f.event(alice, "alice", "call:ice-batch", payload)).ok, true);
  assert.equal(f.accessQueries() - before, 2, "16 candidates need two checks, not 32");
  assert.ok((await f.poll(bob, "bob")).events.some((item: { message: { event: string } }) => item.message.event === "call:ice-batch"));
  const current = f.accessQueries();
  assert.equal((await f.event(alice, "alice", "call:ice-batch", { ...payload, data: Array(17).fill({ candidate: "fixture" }) })).ok, false);
  assert.equal(f.accessQueries(), current);
  f.allowed.delete("bob");
  assert.equal((await f.event(alice, "alice", "call:ice-batch", payload)).ok, false);
  assert.equal((await f.event(alice, "alice", "call:restart", { ...payload, data: {} })).ok, false);
});

test("websocket commands acknowledge and retain attachments after object restart", async () => {
  const f = fixture(); const id = await f.connect(); let attachment = f.data.get(`poll:${id}`); f.data.delete(`poll:${id}`);
  const messages: string[] = [];
  const socket = { deserializeAttachment: () => structuredClone(attachment), serializeAttachment: (value: unknown) => { attachment = structuredClone(value); },
    send: (value: string) => messages.push(value), close() {} };
  f.sockets.push(socket);
  await f.hub().webSocketMessage(socket as never, JSON.stringify({ event: "room:join", payload: { roomId: "room", kind: "channel" }, ack: "a1" }));
  assert.deepEqual(JSON.parse(messages[0]), { ack: "a1", result: { ok: true } });
  f.restart();
  await f.request("/publish", "", { room: "chat:room", event: "updated", payload: 123 });
  assert.equal(JSON.parse(messages.at(-1)!).payload, 123);
});

test("upload validation rejects active content and traversal and identifies allowed formats", () => {
  assert.equal(fileFormat(new TextEncoder().encode("<svg onload=evil()>")), null);
  assert.equal(fileFormat(new TextEncoder().encode("%PDF-1.7"))?.extension, "pdf");
  assert.equal(fileFormat(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]))?.type, "image/png");
  assert.equal(validFileKey("../../secret.pdf"), false);
  assert.equal(validFileKey(`${crypto.randomUUID()}.png`), true);
});

test("browser adapter reconnects, falls back to polling, and upgrades back to WebSocket without reload", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  const originalWebSocket = globalThis.WebSocket;
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", { value: { href: "https://chat.example.test", protocol: "https:" }, configurable: true });
  const sockets: FakeSocket[] = [];
  class FakeSocket {
    static OPEN = 1; readyState = 1;
    onmessage?: (event: { data: string }) => void; onclose?: () => void;
    constructor() { sockets.push(this); }
    send() {} close() { this.onclose?.(); }
    welcome(id: string) { this.onmessage?.({ data: JSON.stringify({ event: "welcome", payload: { id } }) }); }
  }
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  t.mock.method(globalThis, "fetch", async (url: string) => Response.json(url.includes("/connect") ? { id: "poll-1" } : { events: [], cursor: 0 }));
  const client = new CloudflareSocket(); let connects = 0;
  client.on("connect", () => connects++);
  try {
    client.connect(); sockets[0].welcome("ws-1");
    assert.equal(client.connected, true);
    sockets[0].close(); t.mock.timers.tick(2000);
    sockets[1].close();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(client.transport, "polling");
    assert.equal(client.connected, true);
    t.mock.timers.tick(25_000);
    sockets.at(-1)!.welcome("ws-2");
    assert.equal(client.transport, "websocket");
    assert.equal(client.id, "ws-2"); assert.equal(connects, 3);
    client.disconnect();
    assert.equal(client.connected, false);
  } finally {
    client.disconnect(); globalThis.WebSocket = originalWebSocket;
    if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation);
    else Reflect.deleteProperty(globalThis, "location");
  }
});
