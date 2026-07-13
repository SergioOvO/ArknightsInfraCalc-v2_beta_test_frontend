import { describe, expect, it } from "vitest";

import { initialSetupStep, shouldAutoOpenSetup } from "../src/onboarding";

describe("onboarding", () => {
  it("首次访问且没有 Box 时自动打开", () => {
    expect(shouldAutoOpenSetup(null, false)).toBe(true);
  });

  it("已看过或已有 Box 时不自动打开", () => {
    expect(shouldAutoOpenSetup("1", false)).toBe(false);
    expect(shouldAutoOpenSetup(null, true)).toBe(false);
  });

  it("根据 Box 状态选择手动打开时的步骤", () => {
    expect(initialSetupStep(false)).toBe("box");
    expect(initialSetupStep(true)).toBe("layout");
  });
});
