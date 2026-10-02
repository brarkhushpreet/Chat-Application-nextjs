import assert from "node:assert/strict";
import { test } from "node:test";
import { respondToCall } from "../lib/call-response";
import type { RealtimeSocket } from "../lib/cloudflare-socket";

test("accept retries a missing ACK with the same call and answer, then returns its destination", async () => {
  const sent: unknown[] = [];
  const socket = { connected: true, timeout: () => ({
    emit: (event: string, payload: unknown, ack: (error: Error | null, result?: unknown) => void) => {
      sent.push({ event, payload });
      if (sent.length === 1) ack(new Error("Acknowledgement timed out"));
      else ack(null, { ok: true, url: "/servers/team/channels/room?incomingCall=call" });
    },
  }) } as unknown as RealtimeSocket;
  assert.equal((await respondToCall(socket, "call", "accept")).ok, true);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], sent[1]);
});

test("an expired/denied invitation is not retried and transport retries are bounded", async () => {
  let sent = 0;
  let fail = false;
  const socket = { connected: true, timeout: () => ({
    emit: (_event: string, _payload: unknown, ack: (error: Error | null, result?: unknown) => void) => {
      sent++;
      if (fail) ack(new Error("Timeout")); else ack(null, { ok: false, error: "Expired" });
    },
  }) } as unknown as RealtimeSocket;
  assert.equal((await respondToCall(socket, "call", "accept")).ok, false);
  assert.equal(sent, 1);
  fail = true;
  await assert.rejects(respondToCall(socket, "call", "accept"));
  assert.equal(sent, 3);
});
