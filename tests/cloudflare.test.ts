import assert from "node:assert/strict";
import { test } from "node:test";
import type { DurableObjectState } from "@cloudflare/workers-types";
import type { PrismaClient } from "@prisma/client";
import { RealtimeHub } from "../cloudflare/realtime-hub";
import type { NexusCloudflareEnv } from "../lib/cloudflare";
import { fileFormat, validFileKey } from "../lib/uploads";
import { CloudflareSocket } from "../lib/cloudflare-socket";

Object.defineProperty(globalThis, "WebSocketRequestResponsePair", { value: class {}, configurable: true });
function fixture() {
  const data = new Map<string, unknown>();
  const sockets: { deserializeAttachment(): unknown; serializeAttachment(value: unknown): void; send(value: string): void; close(): void }[] = [];
  const ctx = {
    setWebSocketAutoResponse() {}, getWebSockets: () => sockets,
    blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn(),
    storage: {
      get: async (key: string) => structuredClone(data.get(key)),
      put: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); },
      delete: async (key: string) => data.delete(key), setAlarm: async () => {},
      list: async ({ prefix }: { prefix: string }) => new Map([...data].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key, structuredClone(value)])),
    },
  };
  const allowed = new Set(["alice", "bob"]);
  const fakeDb = {
    channel: { findFirst: async ({ where }: { where: { id: string; server: { members: { some: { profile: { userId: string } } } } } }) =>
      where.id === "room" && allowed.has(where.server.members.some.profile.userId) ? { id: "room" } : null },
    profile: { findUnique: async ({ where }: { where: { userId: string } }) => ({ name: where.userId, imageUrl: "" }) },
  };
  class Hub extends RealtimeHub {
    protected override database<T>(fn: (db: PrismaClient) => Promise<T>) { return fn(fakeDb as unknown as PrismaClient); }
  }
  const makeHub = () => new Hub(ctx as unknown as DurableObjectState, {} as NexusCloudflareEnv);
  let hub = makeHub();
  const request = (path: string, user = "alice", body?: unknown) => hub.fetch(new Request(`https://internal${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-nexus-user": user, "x-nexus-expires": String(Date.now() + 60_000) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  return { data, sockets, allowed, hub: () => hub, restart: () => { hub = makeHub(); }, request,
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
