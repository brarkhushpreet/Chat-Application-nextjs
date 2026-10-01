import assert from "node:assert/strict";
import { test } from "node:test";
import { CallPeer, callVideoConstraints, playCallMedia, validIceBatch } from "../lib/call-peer";

const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function fixture(localId = "a", remoteId = "z") {
  const sent: { event: string; data: unknown }[] = [];
  const statuses: string[] = [];
  const added: RTCIceCandidateInit[] = [];
  const offers: RTCOfferOptions[] = [];
  let refreshes = 0;
  class FakePeer {
    connectionState = "new"; iceConnectionState = "new"; signalingState = "stable";
    localDescription: (RTCSessionDescriptionInit & { toJSON(): RTCSessionDescriptionInit }) | null = null;
    remoteDescription: RTCSessionDescriptionInit | null = null;
    configuration: RTCConfiguration = {};
    onicecandidate?: (event: { candidate: { toJSON(): RTCIceCandidateInit } | null }) => void;
    onconnectionstatechange?: () => void; oniceconnectionstatechange?: () => void;
    async createOffer(options: RTCOfferOptions) { offers.push(options); return { type: "offer" as const, sdp: "fixture-offer" }; }
    async createAnswer() { return { type: "answer" as const, sdp: "fixture-answer" }; }
    async setLocalDescription(data: RTCSessionDescriptionInit) {
      this.signalingState = data.type === "offer" ? "have-local-offer" : "stable";
      this.localDescription = { ...data, toJSON: () => data };
    }
    async setRemoteDescription(data: RTCSessionDescriptionInit) {
      this.remoteDescription = data; this.signalingState = data.type === "offer" ? "have-remote-offer" : "stable";
    }
    async addIceCandidate(candidate: RTCIceCandidateInit) { added.push(candidate); }
    getConfiguration() { return this.configuration; }
    setConfiguration(configuration: RTCConfiguration) { this.configuration = configuration; }
    async getStats() { return new Map(); }
    close() { this.connectionState = "closed"; }
  }
  const peer = new FakePeer();
  const session = new CallPeer(peer as unknown as RTCPeerConnection, {
    localId, remoteId, send: async (event, data) => { sent.push({ event, data }); },
    refreshIce: async () => { refreshes++; return [{ urls: "turn:relay.example.test" }]; },
    status: status => statuses.push(status.detail), stream: () => {},
  });
  return { peer, session, sent, statuses, added, offers, refreshes: () => refreshes };
}

test("candidate bursts are bounded batches and stop when the peer closes", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  for (let i = 0; i < 33; i++) f.peer.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: `fixture-${i}` }) } });
  t.mock.timers.tick(100); await settle();
  assert.deepEqual(f.sent.map(message => (message.data as unknown[]).length), [16, 16, 1]);
  assert.ok(f.sent.every(message => message.event === "call:ice-batch" && validIceBatch(message.data)));
  f.session.close(); t.mock.timers.tick(60_000); await settle();
  assert.equal(f.sent.length, 3);
  assert.equal(validIceBatch([]), false);
  assert.equal(validIceBatch(Array.from({ length: 17 }, () => ({ candidate: "fixture" }))), false);
  assert.equal(validIceBatch([{ candidate: "x".repeat(4097) }]), false);
});

test("candidates wait for SDP; stale ICE generations and duplicate answers are ignored", async () => {
  const f = fixture();
  await f.session.ice([{ candidate: "fixture", usernameFragment: "new-generation" }]);
  assert.equal(f.added.length, 0);
  await f.session.description({ type: "offer", sdp: "a=ice-ufrag:new-generation\r\n" });
  assert.equal(f.added.length, 1);
  assert.equal(f.sent[0].event, "call:answer");
  await f.session.ice([{ candidate: "old", usernameFragment: "old-generation" }]);
  assert.equal(f.added.length, 1);
  await f.session.description({ type: "answer", sdp: "duplicate" });
  assert.equal(f.peer.remoteDescription?.type, "offer");
  f.session.close();
});

test("simultaneous offers have one polite peer to avoid negotiation collisions", async () => {
  for (const polite of [false, true]) {
    const f = polite ? fixture("z", "a") : fixture();
    await f.session.offer();
    await f.session.description({ type: "offer", sdp: "competing-offer" });
    assert.equal(f.sent.some(message => message.event === "call:answer"), polite);
    f.session.close();
  }
});

test("failed connections retry twice with fresh relay config, then stop with a visible error", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const f = fixture();
  await f.session.offer();
  f.peer.connectionState = "failed"; f.peer.onconnectionstatechange?.();
  t.mock.timers.tick(1000); await settle();
  assert.equal(f.refreshes(), 1);
  assert.equal(f.offers.at(-1)?.iceRestart, true);
  t.mock.timers.tick(15_000); await settle();
  assert.equal(f.refreshes(), 2);
  assert.equal(f.peer.configuration.iceTransportPolicy, "relay");
  t.mock.timers.tick(15_000); await settle();
  assert.match(f.statuses.at(-1)!, /Unable to connect media/);
  t.mock.timers.tick(60_000); await settle();
  assert.equal(f.refreshes(), 2);
  f.session.close();
});

test("the other peer requests a restart rather than creating competing restart offers", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture("z", "a");
  f.peer.connectionState = "failed"; f.peer.onconnectionstatechange?.();
  t.mock.timers.tick(1000); await settle();
  assert.equal(f.sent[0].event, "call:restart");
  assert.equal(f.offers.length, 0);
  f.session.close();
});

test("mobile capture is lower-bandwidth and failed playback can be retried by a user gesture", async () => {
  assert.deepEqual(callVideoConstraints(true).frameRate, { ideal: 20, max: 24 });
  assert.deepEqual(callVideoConstraints(true).width, { ideal: 640, max: 960 });
  assert.deepEqual(callVideoConstraints(false).width, { ideal: 1280 });
  assert.equal(await playCallMedia({ play: async () => { throw new DOMException("blocked", "NotAllowedError"); } }), false);
  assert.equal(await playCallMedia({ play: async () => {} }), true);
});
