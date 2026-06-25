import { MaaJson, MaaPlan, MaaRoom, MaaRooms, UserProfile } from "./types";

export type RoomGroup = keyof MaaRooms;

export interface RoomRow {
  key: string;
  group: RoomGroup;
  groupLabel: string;
  index: number;
  title: string;
  product?: string;
  operators: string[];
  rule: string;
  suspicious: boolean;
}

export interface MetaCheck {
  id: string;
  title: string;
  scope: "贸易" | "制造" | "中枢" | "轮换";
  status: "hit" | "missing" | "partial" | "unknown";
  detail: string;
}

const GROUP_LABELS: Record<RoomGroup, string> = {
  trading: "贸易站",
  manufacture: "制造站",
  power: "发电站",
  control: "控制中枢",
  dormitory: "宿舍",
  meeting: "会客室",
  hire: "办公室",
  processing: "加工站",
};

const GROUP_ORDER: RoomGroup[] = [
  "trading",
  "manufacture",
  "power",
  "control",
  "dormitory",
  "meeting",
  "processing",
  "hire",
];

function operatorName(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value) {
    const slot = value as { name?: string; skill?: number };
    return slot.skill ? `${slot.name ?? ""} S${slot.skill}` : slot.name ?? "";
  }
  return "";
}

function plainOperatorName(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value) {
    return (value as { name?: string }).name ?? "";
  }
  return "";
}

function roomOperators(room: MaaRoom): string[] {
  return room.operators.map(operatorName).filter(Boolean);
}

function plainRoomOperators(room: MaaRoom): string[] {
  return room.operators.map(plainOperatorName).filter(Boolean);
}

function includesAny(operators: string[], names: string[]): boolean {
  return names.some((name) => operators.some((operator) => operator.includes(name)));
}

function ruleFor(group: RoomGroup, operators: string[]): string {
  if (group === "trading") {
    if (includesAny(operators, ["但书"])) return "但书优先贸易 meta";
    if (includesAny(operators, ["可露希尔"])) return "可露希尔贸易 meta";
    if (includesAny(operators, ["龙舌兰", "巫恋"])) return "龙舌兰/巫恋订单体系";
    return "贸易散件工具人";
  }

  if (group === "manufacture") {
    if (includesAny(operators, ["安哲拉", "斯卡蒂", "歌蕾蒂娅", "幽灵鲨", "乌尔比安"])) {
      return "深海猎人制造体系";
    }
    if (includesAny(operators, ["帕拉斯", "石棉", "火神"])) return "标准化制造组";
    if (includesAny(operators, ["芬", "泡普卡", "斑点"])) return "急性子/慢性子回退池";
    return "制造工具人池";
  }

  if (group === "control") return "中枢全局注入";
  if (group === "power") return "发电效率";
  return "辅助设施";
}

function titleFor(group: RoomGroup, index: number): string {
  const label = GROUP_LABELS[group];
  if (["control", "meeting", "processing", "hire"].includes(group)) return label;
  return `${label} ${index + 1}`;
}

export function planToRows(plan: MaaPlan | undefined): RoomRow[] {
  if (!plan) return [];

  const rows: RoomRow[] = [];
  for (const group of GROUP_ORDER) {
    const rooms = plan.rooms[group] ?? [];
    rooms.forEach((room, index) => {
      const operators = roomOperators(room);
      rows.push({
        key: `${group}-${index}`,
        group,
        groupLabel: GROUP_LABELS[group],
        index,
        title: titleFor(group, index),
        product: room.product,
        operators,
        rule: ruleFor(group, plainRoomOperators(room)),
        suspicious: operators.length === 0 && group !== "dormitory",
      });
    });
  }
  return rows;
}

function allPlainOperators(maaJson: MaaJson | undefined): string[] {
  if (!maaJson) return [];
  const names: string[] = [];
  for (const plan of maaJson.plans) {
    for (const group of GROUP_ORDER) {
      for (const room of plan.rooms[group] ?? []) {
        names.push(...plainRoomOperators(room));
      }
    }
  }
  return names;
}

function metaStatus(names: string[], required: string[], alternatives: string[] = []): MetaCheck["status"] {
  const requiredHits = required.filter((name) => includesAny(names, [name])).length;
  const altHit = alternatives.length > 0 && includesAny(names, alternatives);
  if (requiredHits === required.length && (alternatives.length === 0 || altHit)) return "hit";
  if (requiredHits > 0 || altHit) return "partial";
  return "missing";
}

export function buildMetaChecks(
  maaJson: MaaJson | undefined,
  profile: UserProfile | undefined
): MetaCheck[] {
  const names = allPlainOperators(maaJson);
  const hasProfile = Boolean(profile);

  return [
    {
      id: "trade-docus",
      title: "但书优先上场",
      scope: "贸易",
      status: metaStatus(names, ["但书"]),
      detail: includesAny(names, ["但书"]) ? "已在三班排班中出现。" : "未在排班中出现，需要确认 box 或贸易策略。",
    },
    {
      id: "trade-closure",
      title: "可露希尔次高工具人",
      scope: "贸易",
      status: metaStatus(names, ["可露希尔"]),
      detail: includesAny(names, ["可露希尔"]) ? "已在三班排班中出现。" : "未在排班中出现，需要确认练度或策略优先级。",
    },
    {
      id: "trade-tequila-shamare",
      title: "龙舌兰 / 巫恋订单体系",
      scope: "贸易",
      status: metaStatus(names, ["龙舌兰", "巫恋"]),
      detail: "检查是否作为订单体系而非固定三人组处理。",
    },
    {
      id: "trade-siracusa",
      title: "叙拉古跨站组合",
      scope: "中枢",
      status: metaStatus(names, [], ["伺夜", "贝洛内", "八幡海铃"]),
      detail: "用于观察跨站组合是否被拆成同站组合。",
    },
    {
      id: "manu-standardization",
      title: "标准化制造组",
      scope: "制造",
      status: metaStatus(names, [], ["帕拉斯", "石棉", "火神"]),
      detail: "应作为同站 meta 或扩展池自然命中。",
    },
    {
      id: "manu-abyssal",
      title: "深海猎人规则",
      scope: "制造",
      status: metaStatus(names, [], ["安哲拉", "斯卡蒂", "歌蕾蒂娅", "幽灵鲨", "乌尔比安"]),
      detail: "命中时属于正常制造规则，不应误报为异常散件。",
    },
    {
      id: "profile",
      title: "账号画像输出",
      scope: "轮换",
      status: hasProfile ? "hit" : "unknown",
      detail: hasProfile ? `${profile?.domains.length ?? 0} 个效率域，${profile?.actions.length ?? 0} 条建议。` : "等待运行。",
    },
  ];
}

export function formatNumber(value: unknown, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "暂无";
  return value.toFixed(digits);
}
