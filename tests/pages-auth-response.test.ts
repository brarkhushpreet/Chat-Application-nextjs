import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { test } from "node:test";
import { pagesAuthResponse } from "../lib/pages-auth-response";

// Reproduce Auth.js's Pages Router cookie propagation, including the branch
// that mistakes OpenNext's plain headers object for Web Headers.
function writeAuthCookies(response: ReturnType<typeof pagesAuthResponse>, cookies: string[]) {
  for (const cookie of cookies) {
    if ("headers" in response) {
      (response.headers as Headers).append("set-cookie", cookie);
    } else {
      response.appendHeader("set-cookie", cookie);
    }
  }
}

for (const runtime of ["Node", "OpenNext-style"] as const) {
  test(`${runtime}: auth appends cookies to the original response without overwriting headers`, () => {
    const response = new ServerResponse(new IncomingMessage(new Socket()));
    const headers = {};
    if (runtime === "OpenNext-style") Object.assign(response, { headers });
    const cookies = [
      "existing=fixture; Path=/; HttpOnly",
      "session.0=fixture; Path=/; HttpOnly; Secure",
      "session.1=fixture; Expires=Thu, 01 Oct 2026 12:00:00 GMT; Path=/; HttpOnly",
    ];
    response.setHeader("set-cookie", [cookies[0]]);
    response.setHeader("x-fixture", "unchanged");

    const adapted = pagesAuthResponse(response);
    assert.equal("headers" in adapted, false);
    writeAuthCookies(adapted, cookies.slice(1));
    assert.deepEqual(response.getHeader("set-cookie"), cookies);
    assert.equal(response.getHeader("x-fixture"), "unchanged");
    if (runtime === "OpenNext-style") {
      assert.equal(Reflect.get(response, "headers"), headers);
      assert.deepEqual(headers, {});
    }

    // An auth result with no cookie updates must leave the response untouched.
    writeAuthCookies(adapted, []);
    assert.deepEqual(response.getHeader("set-cookie"), cookies);
  });
}
