import layout153 from "./layouts/153.json";
import layout243 from "./layouts/243.json";
import layout252 from "./layouts/252.json";
import layout333 from "./layouts/333.json";
import layout342 from "./layouts/342.json";
import { BaseBlueprint, BlueprintRoom, FactoryProduct, PresetDef, RoomKind, TradeProduct } from "./types";

export type FactoryRecipe = FactoryProduct["factory"]["recipe"];
export type TradeOrder = TradeProduct["trade"]["order"];

export const PRESETS: PresetDef[] = [
  { label: "243", trading: 2, manufacture: 4, power: 3, layout: layout243 as BaseBlueprint },
  { label: "153", trading: 1, manufacture: 5, power: 3, layout: layout153 as BaseBlueprint },
  { label: "333", trading: 3, manufacture: 3, power: 3, layout: layout333 as BaseBlueprint },
  { label: "252", trading: 2, manufacture: 5, power: 2, layout: layout252 as BaseBlueprint },
  { label: "342", trading: 3, manufacture: 4, power: 2, layout: layout342 as BaseBlueprint },
];

export const FACTORY_RECIPE_OPTIONS: { recipe: FactoryRecipe; label: string }[] = [
  { recipe: "gold", label: "赤金" },
  { recipe: "battle_record", label: "作战记录" },
  { recipe: "originium", label: "源石碎片" },
];

export const TRADE_ORDER_OPTIONS: { order: TradeOrder; label: string }[] = [
  { order: "gold", label: "龙门币订单" },
  { order: "originium", label: "合成玉订单" },
];

export function buildBlueprint(preset: PresetDef): BaseBlueprint {
  return structuredClone(preset.layout);
}

export function roomSummary(layout: BaseBlueprint): string {
  const trade = layout.rooms.filter((room) => room.kind === "trade_post").length;
  const manu = layout.rooms.filter((room) => room.kind === "factory").length;
  const power = layout.rooms.filter((room) => room.kind === "power_plant").length;
  return `${trade} 贸易 / ${manu} 制造 / ${power} 发电`;
}

export function updateFactoryRecipe(layout: BaseBlueprint, roomId: string, recipe: FactoryRecipe): BaseBlueprint {
  return {
    ...layout,
    scenario: structuredClone(layout.scenario),
    rooms: layout.rooms.map((room) => {
      if (room.id !== roomId || room.kind !== "factory") return structuredClone(room);
      return {
        ...structuredClone(room),
        product: { factory: { recipe } },
      };
    }),
  };
}

export function updateTradeOrder(layout: BaseBlueprint, roomId: string, order: TradeOrder): BaseBlueprint {
  return {
    ...layout,
    scenario: structuredClone(layout.scenario),
    rooms: layout.rooms.map((room) => {
      if (room.id !== roomId || room.kind !== "trade_post") return structuredClone(room);
      return {
        ...structuredClone(room),
        product: { trade: { order } },
      };
    }),
  };
}

export function factoryRecipeFor(room: BlueprintRoom): FactoryRecipe {
  if (room.product && "factory" in room.product) return room.product.factory.recipe;
  return "gold";
}

export function tradeOrderFor(room: BlueprintRoom): TradeOrder {
  if (room.product && "trade" in room.product) return room.product.trade.order;
  return "gold";
}

export function productLabel(room: BlueprintRoom): string | undefined {
  if (!room.product) return undefined;

  if ("factory" in room.product) {
    const recipe = room.product.factory.recipe;
    return FACTORY_RECIPE_OPTIONS.find((option) => option.recipe === recipe)?.label;
  }

  if ("trade" in room.product) {
    const order = room.product.trade.order;
    return TRADE_ORDER_OPTIONS.find((option) => option.order === order)?.label;
  }

  return undefined;
}

export function roomKindLabel(kind: RoomKind): string {
  const labels: Record<RoomKind, string> = {
    control_center: "控制中枢",
    trade_post: "贸易站",
    factory: "制造站",
    power_plant: "发电站",
    dormitory: "宿舍",
    office: "办公室",
    meeting_room: "会客室",
    workshop: "加工站",
  };
  return labels[kind];
}
