import { describe, expect, it } from "vitest";

import { manufacturePoolReady, normalizeServeRoomEfficiency, presentRoomEfficiency, profileEfficiency } from "../src/efficiency";

describe("CLI efficiency schema", () => {
  it("retains pure skill and cross-station display values separately", () => {
    expect(normalizeServeRoomEfficiency({
      room_id: "manu_1",
      manufacture_efficiency: 1.65,
      manufacture_skill_efficiency: 1.2,
      manufacture_display_efficiency: 1.38,
    })).toEqual({
      room_id: "manu_1",
      manu_score: 165,
      manu_prod_skill: 120,
      manu_display_pct: 138,
    });
  });
});

describe("room efficiency presentation", () => {
  it("separates pure skill and cross-station display efficiency", () => {
    const result = presentRoomEfficiency("manufacture", {
      manu_score: 165,
      manu_prod_skill: 120,
      manu_display_pct: 138,
      manu_storage_limit: 20,
    });

    expect(result).toMatchObject({
      primaryLabel: "展示效率",
      primaryValue: "138%",
      includesCrossStation: true,
    });
    expect(result?.details).toContainEqual({ label: "纯技能", value: "120%" });
    expect(result?.details).toContainEqual({ label: "跨设施", value: "+18%", kind: "cross-station" });
    expect(result?.details).toContainEqual({ label: "总制造", value: "165%" });
  });

  it("keeps legacy cached power efficiency visible", () => {
    expect(presentRoomEfficiency("power", { power_charge_speed_pct: 20 })).toMatchObject({
      primaryLabel: "充能效率",
      primaryValue: "20%",
      includesCrossStation: false,
    });
  });

  it("shows trade multiplier without treating it as a percentage", () => {
    const result = presentRoomEfficiency("trading", {
      trade_score: 2.8365,
      trade_skill_pct: 80,
      trade_display_pct: 92,
    });

    expect(result?.details).toContainEqual({ label: "订单倍率", value: "2.84×" });
  });
});

describe("profile schema compatibility", () => {
  it("accepts old and new profile field names", () => {
    expect(profileEfficiency({ operators: [], final_efficiency: 128 })).toBe(128);
    expect(profileEfficiency({ operators: [], score: 93 })).toBe(93);
    expect(manufacturePoolReady({ owned: 1, tier_up_owned: 1, trade_pool_ready: 1, manufacture_pool_ready: 8 })).toBe(8);
    expect(manufacturePoolReady({ owned: 1, tier_up_owned: 1, trade_pool_ready: 1, manu_pool_ready: 7 })).toBe(7);
  });
});
