import { BaseBlueprint, BlueprintRoom, PresetDef } from "./types";

export const PRESETS: PresetDef[] = [
  { label: "243", trading: 2, manufacture: 4, power: 3 },
  { label: "153", trading: 1, manufacture: 5, power: 3 },
  { label: "333", trading: 3, manufacture: 3, power: 3 },
  { label: "252", trading: 2, manufacture: 5, power: 2 },
  { label: "342", trading: 3, manufacture: 4, power: 2 },
];

function roomId(kind: string, index: number): string {
  const map: Record<string, string> = {
    trading: "trade",
    manufacture: "manu",
    power: "power",
    dormitory: "dorm",
    control: "control",
    meeting: "meeting",
    processing: "workshop",
    hire: "office",
  };
  const base = map[kind] ?? kind;
  if (["control", "meeting", "processing", "hire"].includes(kind)) return base;
  return `${base}_${index + 1}`;
}

function kindToBlueprint(kind: string): BlueprintRoom["kind"] {
  const map: Record<string, BlueprintRoom["kind"]> = {
    trading: "trade_post",
    manufacture: "factory",
    power: "power_plant",
    control: "control_center",
    dormitory: "dormitory",
    meeting: "meeting_room",
    processing: "workshop",
    hire: "office",
  };
  return map[kind];
}

function factoryRecipe(index: number, total: number): "gold" | "battle_record" {
  const goldCount = Math.ceil(total / 2);
  return index < goldCount ? "gold" : "battle_record";
}

export function buildBlueprint(preset: PresetDef): BaseBlueprint {
  const order: [string, number][] = [
    ["control", 1],
    ["trading", preset.trading],
    ["manufacture", preset.manufacture],
    ["power", preset.power],
    ["meeting", 1],
    ["dormitory", 4],
    ["processing", 1],
    ["hire", 1],
  ];
  const rooms: BlueprintRoom[] = [];

  for (const [kind, count] of order) {
    for (let index = 0; index < count; index += 1) {
      const room: BlueprintRoom = {
        id: roomId(kind, index),
        kind: kindToBlueprint(kind),
        level: 3,
      };

      if (kind === "trading") {
        room.product = { trade: { order: "gold" } };
      } else if (kind === "manufacture") {
        room.product = { factory: { recipe: factoryRecipe(index, count) } };
      } else if (kind === "dormitory") {
        room.dorm_beds = 5;
      }

      rooms.push(room);
    }
  }

  return {
    template: preset.label,
    drone_cap: 135,
    scenario: {
      sui_facility_count: 2,
      dorm_occupant_count: 20,
      initial_global: {
        monster_cuisine: 3,
      },
    },
    rooms,
  };
}

export function roomSummary(layout: BaseBlueprint): string {
  const trade = layout.rooms.filter((room) => room.kind === "trade_post").length;
  const manu = layout.rooms.filter((room) => room.kind === "factory").length;
  const power = layout.rooms.filter((room) => room.kind === "power_plant").length;
  return `${trade} 贸易 / ${manu} 制造 / ${power} 发电`;
}
