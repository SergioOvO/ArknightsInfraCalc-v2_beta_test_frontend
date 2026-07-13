import type { PlayerInfo } from "skland-kit";
import { describe, expect, it } from "vitest";

import { infrastructureFromPlayerInfo, operboxFromPlayerInfo, snapshotFromPlayerInfo } from "../src/server/skland/normalize";

function resident(charId: string, ap = 8_640_000) {
  return { charId, ap, lastApAddTime: 0, index: 0, workTime: 0, bubble: { normal: { add: 0, ts: 0 }, assist: { add: 0, ts: 0 } } };
}

function room(slotId: string, level = 3) {
  return { slotId, level, chars: [] };
}

function playerInfo(trading: number, manufacture: number, power: number): PlayerInfo {
  return {
    currentTs: 1_700_000_100,
    status: { uid: "10001", name: "博士", level: 120, avatar: { type: "ICON", id: "1", url: "https://example.com/avatar.png" }, storeTs: 1_700_000_000, lastOnlineTs: 1_700_000_000 },
    chars: [{ charId: "char_1", level: 80, evolvePhase: 2, potentialRank: 5, rarity: 5 }],
    charInfoMap: { char_1: { name: "能天使" }, char_2: { name: "阿米娅" } },
    manufactureFormulaInfoMap: {
      1: { id: "1", itemId: "3003", count: 1, weight: 1, costPoint: 1 },
      2: { id: "2", itemId: "2002", count: 1, weight: 1, costPoint: 1 },
      3: { id: "3", itemId: "3141", count: 1, weight: 1, costPoint: 1 },
    },
    building: {
      control: { ...room("control", 5), chars: [resident("char_2", 1_440_000)] },
      tradings: Array.from({ length: trading }, (_, index) => ({ ...room(`trade_${index}`), strategy: index === 0 ? "O_DIAMOND" : "O_GOLD", stock: [], stockLimit: 10, completeWorkTime: 0, lastUpdateTime: 0 })),
      manufactures: Array.from({ length: manufacture }, (_, index) => ({ ...room(`manu_${index}`), formulaId: (index % 3) + 1, speed: 1, complete: 2, capacity: 20, weight: 3, remain: 99, completeWorkTime: 0, lastUpdateTime: 0 })),
      powers: Array.from({ length: power }, (_, index) => room(`power_${index}`)),
      dormitories: Array.from({ length: 4 }, (_, index) => ({ ...room(`dorm_${index}`, 5), comfort: 5000 })),
      hire: null,
      training: null,
      meeting: null,
      labor: { value: 100, maxValue: 200, remainSecs: 10, lastUpdateTime: 0 },
      elevators: [],
      corridors: [],
      furniture: { total: 0 },
      tiredChars: [resident("char_2", 1_440_000)],
    },
  } as unknown as PlayerInfo;
}

describe("Skland normalization", () => {
  it("does not expose the player avatar URL", () => {
    const snapshot = snapshotFromPlayerInfo(
      playerInfo(2, 4, 3),
      [{ uid: "10001", nickname: "博士", channelName: "官服" }],
      "10001",
    );

    expect(snapshot.player).not.toHaveProperty("avatarUrl");
  });

  it("converts character ranges to MAA operbox fields", () => {
    expect(operboxFromPlayerInfo(playerInfo(2, 4, 3)).operbox).toEqual([
      { id: "char_1", name: "能天使", elite: 2, level: 80, own: true, potential: 6, rarity: 6 },
    ]);
  });

  it.each([
    [2, 4, 3, "243"],
    [1, 5, 3, "153"],
    [3, 3, 3, "333"],
    [2, 5, 2, "252"],
    [3, 4, 2, "342"],
  ])("maps %i/%i/%i to preset %s", (trading, manufacture, power, label) => {
    const infrastructure = infrastructureFromPlayerInfo(playerInfo(trading, manufacture, power));
    expect(infrastructure.layoutLabel).toBe(label);
    expect(infrastructure.layoutSuggestion?.rooms.find((item) => item.kind === "control_center")?.level).toBe(5);
  });

  it("maps trading and manufacturing products", () => {
    const infrastructure = infrastructureFromPlayerInfo(playerInfo(2, 4, 3));
    const rooms = infrastructure.layoutSuggestion?.rooms ?? [];
    expect(rooms.find((item) => item.kind === "trade_post")?.product).toEqual({ trade: { order: "originium" } });
    expect(rooms.filter((item) => item.kind === "factory").map((item) => item.product)).toContainEqual({ factory: { recipe: "gold" } });
    expect(rooms.filter((item) => item.kind === "factory").map((item) => item.product)).toContainEqual({ factory: { recipe: "battle_record" } });
    expect(rooms.filter((item) => item.kind === "factory").map((item) => item.product)).toContainEqual({ factory: { recipe: "originium" } });
  });

  it("does not replace unsupported layouts", () => {
    const infrastructure = infrastructureFromPlayerInfo(playerInfo(1, 1, 1));
    expect(infrastructure.layoutSuggestion).toBeNull();
    expect(infrastructure.layoutWarning).toContain("暂不支持");
  });
});
