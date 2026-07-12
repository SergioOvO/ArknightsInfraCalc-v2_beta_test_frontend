import { describe, expect, it } from "vitest";

import { isSecureSklandRequest, sealSklandSession, unsealSklandSession, type SklandSessionPayload } from "../src/server/skland/session";

const secret = "test-secret-that-is-definitely-longer-than-thirty-two-bytes";
const payload: SklandSessionPayload = {
  version: 1,
  cred: "credential",
  token: "token",
  dId: "device",
  userId: "user",
  selectedUid: "12345678",
  refreshedAt: 1_700_000_000_000,
  expiresAt: 1_800_000_000_000,
};

describe("Skland session cookie", () => {
  it("round-trips encrypted payloads without exposing credentials", () => {
    const sealed = sealSklandSession(payload, secret);
    expect(sealed).not.toContain(payload.cred);
    expect(unsealSklandSession(sealed, secret, payload.refreshedAt)).toEqual(payload);
  });

  it("rejects tampering and expiry", () => {
    const sealed = sealSklandSession(payload, secret);
    const replacement = sealed.endsWith("a") ? "b" : "a";
    expect(unsealSklandSession(`${sealed.slice(0, -1)}${replacement}`, secret, payload.refreshedAt)).toBeNull();
    expect(unsealSklandSession(sealed, secret, payload.expiresAt)).toBeNull();
  });

  it("allows localhost and HTTPS but blocks public HTTP", () => {
    expect(isSecureSklandRequest(new Request("http://0.0.0.0:5174", { headers: { host: "127.0.0.1:5174" } }), "development")).toBe(true);
    expect(isSecureSklandRequest(new Request("https://beta.example.com"), "production")).toBe(true);
    expect(isSecureSklandRequest(new Request("http://110.42.36.46:4174"), "production")).toBe(false);
    expect(isSecureSklandRequest(new Request("http://110.42.36.46:4174", { headers: { host: "127.0.0.1:5174" } }), "production")).toBe(false);
  });
});
