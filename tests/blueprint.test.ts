import { describe, expect, it } from "vitest";

import { maxRoomLevel } from "../src/blueprint";
import { planToRows } from "../src/schedule";
import type { BaseBlueprint, RoomKind } from "../src/types";

describe("blueprint room levels", () => {
  it.each<[RoomKind, number]>([
    ["control_center", 5],
    ["dormitory", 5],
    ["trade_post", 3],
    ["factory", 3],
    ["power_plant", 3],
    ["office", 3],
    ["meeting_room", 3],
    ["workshop", 3],
  ])("limits %s rooms to level %i", (kind, expected) => {
    expect(maxRoomLevel(kind)).toBe(expected);
  });

  it("places control first and office before meeting", () => {
    const layout: BaseBlueprint = {
      template: "order-test",
      drone_cap: 0,
      scenario: {},
      rooms: [
        { id: "meeting", kind: "meeting_room", level: 3 },
        { id: "trade", kind: "trade_post", level: 3 },
        { id: "office", kind: "office", level: 3 },
        { id: "control", kind: "control_center", level: 5 },
      ],
    };

    expect(planToRows(undefined, undefined, layout).map((row) => row.group)).toEqual([
      "control",
      "trading",
      "hire",
      "meeting",
    ]);
  });
});
