import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson, randomToken, sha256Hex } from "../src/crypto";

describe("connector cryptography", () => {
  it("encrypts token payloads with authenticated AES-GCM", async () => {
    const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const encrypted = await encryptJson({ token: "private" }, key);
    expect(encrypted).not.toContain("private");
    expect(await decryptJson(encrypted, key)).toEqual({ token: "private" });
  });

  it("uses stable hashes and secure random state", async () => {
    expect(await sha256Hex("connector:v1|pub_test-1234|24h")).toHaveLength(64);
    expect(randomToken()).not.toEqual(randomToken());
  });
});

describe("private Worker routing", () => {
  it("returns a structured 404 for unknown routes", async () => {
    const response = await exports.default.fetch(new Request("https://internal.invalid/unknown"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Route not found.", code: "not_found" });
  });
});
