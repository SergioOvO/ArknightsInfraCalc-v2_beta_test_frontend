import * as XLSX from "xlsx";
import { OperBoxEntry } from "./types";

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
      .filter((row) => row.name || row.id || row["干员"])
      .map((row) => {
        const name = String(row.name ?? row["干员"] ?? row["名称"] ?? row.id ?? "");
        return {
          id: String(row.id ?? row.char_id ?? name),
          name,
          elite: numberValue(row.elite ?? row["精英化"] ?? row["精英"], 0),
          level: numberValue(row.level ?? row["等级"], 1),
          own: boolValue(row.own ?? row["拥有"]),
          potential: numberValue(row.potential ?? row["潜能"], 1),
          rarity: numberValue(row.rarity ?? row["星级"], 1),
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
