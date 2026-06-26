import * as XLSX from "xlsx";
import { OperBoxEntry } from "./types";

function pickValue(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in row && row[key] !== undefined) {
      return row[key];
    }
  }
  return undefined;
}

function boolValue(value: unknown): boolean {
  if (value === false) return false;
  if (typeof value === "string" && value.toLowerCase() === "false") return false;
  if (typeof value === "number" && value === 0) return false;
  return true;
}

function numberValue(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function assertOperbox(value: unknown): OperBoxEntry[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("练度 JSON 需要是非空数组。");
  }
  return value as OperBoxEntry[];
}

export async function readOperboxFile(file: File): Promise<OperBoxEntry[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    return rows
      .filter((row) => pickValue(row, ["name", "id", "干员", "干员名称"]))
      .map((row) => {
        const name = String(pickValue(row, ["name", "干员名称", "干员", "名称", "id"]) ?? "");
        return {
          id: String(pickValue(row, ["id", "char_id", "干员ID", "干员编号"]) ?? name),
          name,
          elite: numberValue(
            pickValue(row, ["elite", "精英化等级", "精英化", "精英"]),
            0
          ),
          level: numberValue(pickValue(row, ["level", "等级", "当前等级"]), 1),
          own: boolValue(pickValue(row, ["own", "拥有", "是否已招募"])),
          potential: numberValue(pickValue(row, ["potential", "潜能等级", "潜能"]), 1),
          rarity: numberValue(pickValue(row, ["rarity", "星级", "稀有度"]), 1),
        };
      });
  }

  return assertOperbox(JSON.parse(await file.text()));
}

export function countOwned(operbox: OperBoxEntry[] | null): number {
  return operbox?.filter((entry) => entry.own).length ?? 0;
}

export function countElite2(operbox: OperBoxEntry[] | null): number {
  return operbox?.filter((entry) => entry.own && entry.elite >= 2).length ?? 0;
}

export function countSixStar(operbox: OperBoxEntry[] | null): number {
  return operbox?.filter((entry) => entry.own && entry.rarity >= 6).length ?? 0;
}
