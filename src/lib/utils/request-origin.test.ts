import assert from "node:assert/strict";
import test from "node:test";
import { requestOrigin } from "./request-origin.ts";

function request(headers: Record<string, string>, origin = "http://localhost:3000") {
  return {
    headers: new Headers(headers),
    nextUrl: { origin },
  } as Parameters<typeof requestOrigin>[0];
}

test("uses the public reverse-proxy origin for OAuth callbacks", () => {
  assert.equal(requestOrigin(request({
    "x-forwarded-host": "soydiary.owwi.io.vn",
    "x-forwarded-proto": "https",
  })), "https://soydiary.owwi.io.vn");
});

test("falls back to the request origin without valid proxy headers", () => {
  assert.equal(requestOrigin(request({})), "http://localhost:3000");
  assert.equal(requestOrigin(request({
    "x-forwarded-host": "attacker.example",
    "x-forwarded-proto": "javascript",
  })), "http://localhost:3000");
});
