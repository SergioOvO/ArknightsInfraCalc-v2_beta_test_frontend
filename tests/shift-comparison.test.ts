import { describe, expect, it } from "vitest";

import { closestShift, compareShifts } from "../src/skland";
import type { MaaJson, SklandInfrastructure } from "../src/types";

const infrastructure: SklandInfrastructure = {
  currentTs: 1,
  storeTs: 1,
  layoutLabel: "243",
  layoutSuggestion: null,
  layoutWarning: null,
  rooms: [
    { key: "trade-1", group: "trading", index: 0, level: 3, operators: [{ id: "a", name: "能天使", morale: 20 }, { id: "b", name: "阿米娅", morale: 2 }] },
    { key: "factory-1", group: "manufacture", index: 0, level: 3, operators: [{ id: "c", name: "煌", morale: 20 }] },
  ],
  tiredOperators: ["阿米娅"],
  labor: { value: 0, maxValue: 200, remainSecs: 0 },
  training: null,
};

const maa: MaaJson = {
  title: "test",
  plans: [
    { name: "α", rooms: { trading: [{ operators: ["能天使", "煌"] }], manufacture: [{ operators: ["阿米娅", "德克萨斯"] }] } },
    { name: "β", rooms: { trading: [{ operators: ["能天使", "阿米娅"] }], manufacture: [{ operators: ["煌"] }] } },
  ],
};

describe("shift comparison", () => {
  it("separates missing, misplaced and tired scheduled operators", () => {
    const result = compareShifts(maa, infrastructure)[0];
    expect(result.matched).toEqual(["能天使"]);
    expect(result.missing).toEqual(["德克萨斯"]);
    expect(result.misplaced).toEqual(["煌", "阿米娅"]);
    expect(result.tiredScheduled).toEqual(["阿米娅"]);
  });

  it("selects the closest shift", () => {
    expect(closestShift(compareShifts(maa, infrastructure))?.planIndex).toBe(1);
    expect(closestShift(compareShifts(maa, infrastructure))?.score).toBe(100);
  });
});
