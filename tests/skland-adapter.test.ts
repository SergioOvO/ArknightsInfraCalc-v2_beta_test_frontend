import { describe, expect, it } from "vitest";

import { scanStatusFromError } from "../src/server/skland/adapter";

function sklandKitError(status: number, msg: string) {
  return Object.assign(new Error("【skland-kit】获取扫码登录状态错误"), { cause: { status, msg, type: "A" } });
}

describe("Skland QR status adapter", () => {
  it.each([
    [100, "未扫码", "waiting"],
    [101, "已扫码待确认", "scanned"],
    [102, "已失效", "expired"],
  ])("maps Hypergryph status %i", (status, msg, expected) => {
    expect(scanStatusFromError(sklandKitError(status, msg))).toBe(expected);
  });

  it("leaves unknown failures to the public error classifier", () => {
    expect(scanStatusFromError(new Error("network down"))).toBeNull();
  });
});
