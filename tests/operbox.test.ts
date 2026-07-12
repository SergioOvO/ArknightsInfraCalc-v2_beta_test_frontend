import { describe, expect, it } from "vitest";

import { assertOperbox, readOperboxText } from "../src/operbox";

const valid = [{ id: "char_1001_amiya", name: "阿米娅", elite: 2, level: 80, own: true, potential: 6, rarity: 5 }];

describe("MAA operbox validation", () => {
  it("accepts the official field shape", () => {
    expect(assertOperbox(valid)).toEqual(valid);
    expect(readOperboxText(JSON.stringify(valid))).toEqual(valid);
  });

  it.each([
    [[{ ...valid[0], own: 1 }], "own"],
    [[{ ...valid[0], elite: 3 }], "elite"],
    [[{ ...valid[0], potential: 0 }], "potential"],
    [[valid[0], valid[0]], "重复"],
  ])("rejects invalid fields", (value, message) => {
    expect(() => assertOperbox(value)).toThrow(message as string);
  });

  it("reports malformed pasted JSON", () => {
    expect(() => readOperboxText("not json")).toThrow("MAA JSON 无法解析");
  });
});
