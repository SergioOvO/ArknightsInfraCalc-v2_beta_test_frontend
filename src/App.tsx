"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  Database,
  FileJson,
  FlaskConical,
  LayoutGrid,
  ShieldCheck,
  Terminal,
  Upload,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  getHealth,
  getSampleOperbox,
  getSklandSession,
  logoutSkland,
  runPlan,
  saveFeedback,
  selectSklandRole,
  syncSkland,
} from "./api";
import {
  buildBlueprint,
  FactoryRecipe,
  PRESETS,
  roomSummary,
  TradeOrder,
  updateFactoryRecipe,
  updateRoomLevel,
  updateTradeOrder,
} from "./blueprint";
import {
  AccountStats,
  DebugActions,
  FileDrop,
  IssuePanel,
  IssueNoteModal,
  LayoutEditor,
  Panel,
  PresetSelector,
  RunButton,
  ScheduleBoard,
  ShiftTabs,
  StatusBar,
} from "./components";
import { copyText, downloadJson } from "./download";
import { countOwned, readOperboxFile, readOperboxText } from "./operbox";
import { planToRows, RoomRow } from "./schedule";
import { closestShift, compareShifts } from "./skland";
import { InfrastructureSnapshot, ShiftComparisonCard, SklandAccount } from "./skland-components";
import {
  BaseBlueprint,
  BoxSource,
  BlueprintRoom,
  FeedbackApiResponse,
  IssueReport,
  OperBoxEntry,
  PlanApiResponse,
  PresetDef,
  SklandSnapshot,
} from "./types";

const SESSION_KEY = "arknights-infra-calc-beta-session-v3";
const LEGACY_SESSION_KEY = "arknights-infra-calc-beta-session-v2";
const KNOWN_ISSUES = [
  "Beta 测试阶段仍可能出现排班策略和预期不一致的情况；请用“标记问题”提交上下文。",
  "如遇到 CLI 运行失败，请先下载调试包并保留本次运行记录。",
];

function safeParseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readSessionState() {
  if (typeof window === "undefined") return null;
  return safeParseJson(window.localStorage.getItem(SESSION_KEY)) ?? safeParseJson(window.localStorage.getItem(LEGACY_SESSION_KEY));
}

function resolvePreset(value: PresetDef | undefined): PresetDef {
  return PRESETS.find((preset) => preset.label === value?.label) ?? PRESETS[0];
}

function parseLayoutJson(value: unknown): BaseBlueprint | null {
  if (!value || typeof value !== "object") return null;
  const layout = value as Partial<BaseBlueprint>;
  if (typeof layout.template !== "string" || !Array.isArray(layout.rooms) || !layout.scenario || typeof layout.scenario !== "object") {
    return null;
  }
  const rooms = layout.rooms.map((room) => {
    if (!room || typeof room !== "object" || typeof room.id !== "string" || typeof room.kind !== "string") return null;
    const level = Number((room as BlueprintRoom).level);
    const maxLevel = (room as BlueprintRoom).kind === "control_center" || (room as BlueprintRoom).kind === "dormitory" ? 5 : 3;
    if (!Number.isInteger(level) || level < 1 || level > maxLevel) return null;
    return { ...room, level } as BlueprintRoom;
  });
  if (rooms.some((room) => room === null) || !rooms.some((room) => room?.kind === "control_center")) return null;
  return { ...layout, drone_cap: Number(layout.drone_cap ?? 0), scenario: layout.scenario, rooms: rooms as BlueprintRoom[] } as BaseBlueprint;
}

function layoutValidationError(layout: BaseBlueprint): string | null {
  if (!layout.rooms.some((room) => room.kind === "control_center")) return "布局必须包含控制中枢。";
  const invalid = layout.rooms.find((room) => {
    const maxLevel = room.kind === "control_center" || room.kind === "dormitory" ? 5 : 3;
    return !Number.isInteger(room.level) || room.level < 1 || room.level > maxLevel;
  });
  if (!invalid) return null;
  const maxLevel = invalid.kind === "control_center" || invalid.kind === "dormitory" ? 5 : 3;
  return `${invalid.id} 的设施等级必须在 1–${maxLevel} 之间。`;
}

function restoreEditableProducts(baseLayout: BaseBlueprint, cachedLayout: BaseBlueprint | undefined): BaseBlueprint {
  if (!cachedLayout) return baseLayout;

  const cachedRooms = new Map(cachedLayout.rooms.map((room) => [room.id, room]));
  return {
    ...baseLayout,
    rooms: baseLayout.rooms.map((room) => {
      const cachedRoom = cachedRooms.get(room.id);
      if (room.kind === "factory" && cachedRoom?.kind === "factory" && cachedRoom.product && "factory" in cachedRoom.product) {
        return {
          ...room,
          level: Number.isFinite(cachedRoom.level) ? cachedRoom.level : room.level,
          product: { factory: { recipe: cachedRoom.product.factory.recipe } },
        };
      }
      if (
        room.kind === "trade_post" &&
        cachedRoom?.kind === "trade_post" &&
        cachedRoom.product &&
        "trade" in cachedRoom.product
      ) {
        return {
          ...room,
          level: Number.isFinite(cachedRoom.level) ? cachedRoom.level : room.level,
          product: { trade: { order: cachedRoom.product.trade.order } },
        };
      }
      return { ...room, level: typeof cachedRoom?.level === "number" ? cachedRoom.level : room.level };
    }),
  };
}

function mergeSklandLayout(current: BaseBlueprint, suggestion: BaseBlueprint): BaseBlueprint {
  return {
    ...suggestion,
    drone_cap: current.drone_cap,
    scenario: structuredClone(current.scenario),
  };
}

function buildIssueReport(
  issue: { row: RoomRow; note: string } | null,
  sourceName: string | null,
  command?: string
): IssueReport | null {
  if (!issue) return null;
  return {
    type: "room_issue",
    sourceName,
    room: {
      title: issue.row.title,
      group: issue.row.group,
      product: issue.row.product,
      operators: issue.row.operators,
      inferredRule: issue.row.rule,
      efficiency: issue.row.efficiency,
      efficiencyLabel: issue.row.efficiencyLabel,
    },
    command,
    note: issue.note,
  };
}

function WorkbenchApp() {
  const initialSession = readSessionState() as
    | {
        preset?: PresetDef;
        layout?: BaseBlueprint;
        operbox?: OperBoxEntry[] | null;
        fileName?: string | null;
        boxSource?: BoxSource;
        layoutDirty?: boolean;
        result?: PlanApiResponse | null;
        activeShift?: number;
        issueOpen?: boolean;
        issueDraftRow?: RoomRow | null;
        issueDraftNote?: string;
        issue?: { row: RoomRow; note: string } | null;
        feedback?: FeedbackApiResponse | null;
      }
    | null;

  const initialPreset = resolvePreset(initialSession?.preset);
  const initialLayout = restoreEditableProducts(buildBlueprint(initialPreset), initialSession?.layout);
  const [preset, setPreset] = useState<PresetDef>(initialPreset);
  const [layout, setLayout] = useState<BaseBlueprint>(initialLayout);
  const [operbox, setOperbox] = useState<OperBoxEntry[] | null>(initialSession?.operbox ?? null);
  const [fileName, setFileName] = useState<string | null>(initialSession?.fileName ?? null);
  const [boxSource, setBoxSource] = useState<BoxSource>(initialSession?.boxSource ?? (initialSession?.operbox ? "maa" : "sample"));
  const [layoutDirty, setLayoutDirty] = useState(initialSession?.layoutDirty ?? Boolean(initialSession?.layout));
  const [inputMode, setInputMode] = useState<"skland" | "maa">("skland");
  const [maaPaste, setMaaPaste] = useState("");
  const [sklandSnapshot, setSklandSnapshot] = useState<SklandSnapshot | null>(null);
  const [sklandConfigured, setSklandConfigured] = useState(false);
  const [sklandDisabledReason, setSklandDisabledReason] = useState<string | null>(null);
  const [sklandBusy, setSklandBusy] = useState(false);
  const initialLayoutForRestore = useRef(initialLayout);
  const initialBoxSource = useRef(boxSource);
  const initialOperbox = useRef(operbox);
  const initialLayoutDirty = useRef(layoutDirty);
  const [inputError, setInputError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanApiResponse | null>(initialSession?.result ?? null);
  const [loading, setLoading] = useState(false);
  const [cliPath, setCliPath] = useState<string | null>(null);
  const [cliReady, setCliReady] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [activeShift, setActiveShift] = useState(initialSession?.activeShift ?? 0);
  const [issueDraftRow, setIssueDraftRow] = useState<RoomRow | null>(
    initialSession?.issueDraftRow ?? initialSession?.issue?.row ?? null
  );
  const [issueDraftNote, setIssueDraftNote] = useState(
    initialSession?.issueDraftNote ?? initialSession?.issue?.note ?? ""
  );
  const [savedIssue, setSavedIssue] = useState<{ row: RoomRow; note: string } | null>(
    initialSession?.issue ?? null
  );
  const [issueOpen, setIssueOpen] = useState(initialSession?.issueOpen ?? false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState<FeedbackApiResponse | null>(initialSession?.feedback ?? null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const scheduleResult = result?.success ? result : null;
  const activePlan = scheduleResult?.maaJson?.plans?.[activeShift];
  const activeRotationShift = scheduleResult?.rotationJson?.shifts?.[activeShift];
  const rows = useMemo(() => planToRows(activePlan, activeRotationShift, layout), [activePlan, activeRotationShift, layout]);
  const shiftComparisons = useMemo(
    () => compareShifts(scheduleResult?.maaJson, sklandSnapshot?.infrastructure),
    [scheduleResult?.maaJson, sklandSnapshot?.infrastructure]
  );
  const closestComparison = useMemo(() => closestShift(shiftComparisons), [shiftComparisons]);
  const sklandLayoutMatches = useMemo(() => {
    const suggestion = sklandSnapshot?.infrastructure.layoutSuggestion;
    if (!suggestion) return false;
    const compact = (value: BaseBlueprint) => value.rooms.map((room) => [room.id, room.kind, room.level, room.product]);
    return JSON.stringify(compact(layout)) === JSON.stringify(compact(suggestion));
  }, [layout, sklandSnapshot?.infrastructure.layoutSuggestion]);
  const canRun = Boolean(operbox && operbox.length > 0 && cliReady);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const session = {
      preset,
      layout,
      operbox,
      fileName,
      boxSource,
      layoutDirty,
      result: result?.success ? result : null,
      activeShift,
      issueOpen,
      issueDraftRow,
      issueDraftNote,
      issue: savedIssue,
      feedback: feedbackResult,
    };
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (error) {
      console.warn("Failed to persist workbench session", error);
    }
  }, [preset, layout, operbox, fileName, boxSource, layoutDirty, result, activeShift, issueOpen, issueDraftRow, issueDraftNote, savedIssue, feedbackResult]);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([getHealth(), getSklandSession()]).then(([healthResult, sessionResult]) => {
      if (cancelled) return;
      if (healthResult.status === "fulfilled") {
        const health = healthResult.value;
        setSklandConfigured(Boolean(health.sklandConfigured));
        setSklandDisabledReason(health.sklandDisabledReason ?? null);
        if (health.ok && health.cliReady) {
          setCliPath(health.cliPath ?? null);
          setCliReady(true);
          setApiError(null);
        } else {
          setCliReady(false);
          setCliPath(health.cliPath ?? null);
          setApiError(health.serveError ?? health.error ?? "API 正常，但未找到可执行的 infra-cli。");
        }
      } else {
        setCliReady(false);
        setApiError(healthResult.reason instanceof Error ? healthResult.reason.message : "本地 API 服务不可用。");
      }

      if (sessionResult.status === "fulfilled") {
        const session = sessionResult.value;
        setSklandConfigured(session.configured);
        setSklandDisabledReason(session.disabledReason ?? null);
        if (session.authenticated && session.snapshot) {
          setSklandSnapshot(session.snapshot);
          if (initialBoxSource.current === "skland" || !initialOperbox.current) {
            setOperbox(session.snapshot.operbox);
            setFileName(session.snapshot.sourceName);
            setBoxSource("skland");
          }
          if (!initialLayoutDirty.current && session.snapshot.infrastructure.layoutSuggestion) {
            const suggestion = session.snapshot.infrastructure.layoutSuggestion;
            setLayout(mergeSklandLayout(initialLayoutForRestore.current, suggestion));
            setPreset(resolvePreset(PRESETS.find((item) => item.label === session.snapshot?.infrastructure.layoutLabel)));
          }
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFile(file: File) {
    setInputError(null);
    setResult(null);
    clearIssueState();
    try {
      const entries = await readOperboxFile(file);
      setOperbox(entries);
      setFileName(file.name);
      setBoxSource("maa");
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "练度文件解析失败。");
    }
  }

  function applySklandSnapshot(snapshot: SklandSnapshot, applyLayoutWhenClean = true) {
    setSklandSnapshot(snapshot);
    setOperbox(snapshot.operbox);
    setFileName(snapshot.sourceName);
    setBoxSource("skland");
    setInputMode("skland");
    clearPlanResult();
    if (applyLayoutWhenClean && !layoutDirty && snapshot.infrastructure.layoutSuggestion) {
      setLayout((current) => mergeSklandLayout(current, snapshot.infrastructure.layoutSuggestion as BaseBlueprint));
      setPreset(resolvePreset(PRESETS.find((item) => item.label === snapshot.infrastructure.layoutLabel)));
      setLayoutDirty(false);
    }
  }

  function handleMaaPaste() {
    setInputError(null);
    try {
      const entries = readOperboxText(maaPaste);
      setOperbox(entries);
      setFileName("粘贴的 Arknights_OperBox_Export.json");
      setBoxSource("maa");
      clearPlanResult();
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "MAA JSON 解析失败。");
    }
  }

  async function handleSklandRefresh() {
    setSklandBusy(true);
    setInputError(null);
    try {
      const session = await syncSkland();
      if (!session.authenticated || !session.snapshot) throw new Error(session.error ?? "森空岛同步失败。");
      applySklandSnapshot(session.snapshot, false);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "森空岛同步失败。");
    } finally {
      setSklandBusy(false);
    }
  }

  async function handleSklandRole(uid: string) {
    setSklandBusy(true);
    setInputError(null);
    try {
      const session = await selectSklandRole(uid);
      if (!session.authenticated || !session.snapshot) throw new Error(session.error ?? "角色切换失败。");
      applySklandSnapshot(session.snapshot, false);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "角色切换失败。");
    } finally {
      setSklandBusy(false);
    }
  }

  async function handleSklandLogout() {
    setSklandBusy(true);
    setInputError(null);
    try {
      await logoutSkland();
      setSklandSnapshot(null);
      if (boxSource === "skland") {
        setOperbox(null);
        setFileName(null);
        setBoxSource("sample");
        clearPlanResult();
      }
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "退出森空岛失败。");
    } finally {
      setSklandBusy(false);
    }
  }

  function handleApplySklandLayout() {
    const suggestion = sklandSnapshot?.infrastructure.layoutSuggestion;
    if (!suggestion) return;
    setLayout((current) => mergeSklandLayout(current, suggestion));
    setPreset(resolvePreset(PRESETS.find((item) => item.label === sklandSnapshot.infrastructure.layoutLabel)));
    setLayoutDirty(false);
    clearPlanResult();
  }

  async function handleRun() {
    if (!operbox) return;
    const layoutError = layoutValidationError(layout);
    if (layoutError) {
      setApiError(layoutError);
      return;
    }
    if (!cliReady) {
      setApiError("当前没有可运行的 infra-cli；Windows 本地请设置 INFRA_CLI_PATH 指向 infra-cli.exe。");
      return;
    }
    setLoading(true);
    setInputError(null);
    setApiError(null);
    setResult(null);
    setActiveShift(0);
    clearIssueState();

    try {
      const response = await runPlan({
        layout,
        operbox,
        sourceName: fileName,
      });
      setResult(response);
      if (!response.success) {
        setApiError(response.error ?? "infra-cli 没有成功生成排班。");
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "排班请求失败。");
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadSample() {
    setInputError(null);
    setResult(null);
    clearIssueState();
    try {
      const sample = await getSampleOperbox();
      if (!sample.success || !sample.operbox) {
        throw new Error(sample.error ?? "样例数据读取失败。");
      }
      setOperbox(sample.operbox);
      setFileName(sample.sourceName ?? "243 全精二样例");
      setBoxSource("sample");
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "样例数据读取失败。");
    }
  }

  function handleDownloadMaa() {
    if (result?.maaJson) downloadJson("infra-calc-beta-maa.json", result.maaJson);
  }

  function handleDownloadBundle() {
    if (result?.debugBundle) downloadJson("infra-calc-beta-debug-bundle.json", result.debugBundle);
  }

  function handleCopyCommand() {
    if (result?.command) void copyText(result.command);
  }

  function clearIssueState() {
    setIssueDraftRow(null);
    setIssueDraftNote("");
    setSavedIssue(null);
    setIssueOpen(false);
    setFeedbackResult(null);
    setFeedbackError(null);
  }

  function handleMarkIssue(row: RoomRow) {
    setIssueDraftRow(row);
    setIssueDraftNote("");
    setSavedIssue(null);
    setFeedbackResult(null);
    setFeedbackError(null);
    setIssueOpen(true);
  }

  async function handleSaveIssue() {
    if (!issueDraftRow || !issueDraftNote.trim()) return;
    if (!operbox || operbox.length === 0) {
      setFeedbackError("请先上传或载入 operbox。");
      return;
    }

    const issue = { row: issueDraftRow, note: issueDraftNote.trim() };
    const report = buildIssueReport(issue, fileName, result?.debugBundle?.command);
    if (!report) return;

    setFeedbackSaving(true);
    setFeedbackError(null);
    setApiError(null);
    try {
      const response = await saveFeedback({
        issue: report,
        operbox,
        sourceName: fileName,
        debugBundle: result?.debugBundle,
      });
      if (!response.success) {
        throw new Error(response.error ?? "反馈保存失败。");
      }
      setSavedIssue(issue);
      setFeedbackResult(response);
      setIssueOpen(false);
      setIssueDraftRow(null);
      setIssueDraftNote("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "反馈保存失败。";
      setFeedbackError(message);
      setApiError(message);
    } finally {
      setFeedbackSaving(false);
    }
  }

  function handleCancelIssue() {
    setIssueOpen(false);
    setIssueDraftRow(null);
    setIssueDraftNote("");
  }

  function clearPlanResult() {
    setResult(null);
    setActiveShift(0);
    clearIssueState();
  }

  function handlePresetSelect(nextPreset: PresetDef) {
    setPreset(nextPreset);
    setLayout(buildBlueprint(nextPreset));
    setLayoutDirty(true);
    clearPlanResult();
  }

  function handleFactoryRecipeChange(roomId: string, recipe: FactoryRecipe) {
    setLayout((current) => updateFactoryRecipe(current, roomId, recipe));
    setLayoutDirty(true);
    clearPlanResult();
  }

  function handleTradeOrderChange(roomId: string, order: TradeOrder) {
    setLayout((current) => updateTradeOrder(current, roomId, order));
    setLayoutDirty(true);
    clearPlanResult();
  }

  function handleRoomLevelChange(roomId: string, level: number) {
    setLayout((current) => updateRoomLevel(current, roomId, level));
    setLayoutDirty(true);
    clearPlanResult();
  }

  async function handleLayoutFile(file: File) {
    try {
      const parsed = parseLayoutJson(JSON.parse(await file.text()));
      if (!parsed) throw new Error("layout JSON 格式无效：需要 rooms[].id、kind 和合法的设施等级。");
      setLayout(parsed);
      setLayoutDirty(true);
      clearPlanResult();
      setInputError(null);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "布局 JSON 读取失败。");
    }
  }

  const issueForPanel = useMemo(
    () => savedIssue ?? (issueDraftRow && issueOpen ? { row: issueDraftRow, note: issueDraftNote } : null),
    [issueDraftNote, issueDraftRow, issueOpen, savedIssue]
  );
  const issueReport = useMemo(
    () => buildIssueReport(issueForPanel, fileName, result?.debugBundle?.command),
    [issueForPanel, fileName, result?.debugBundle?.command]
  );

  return (
    <main className="min-h-screen bg-muted/40 px-4 py-4 text-foreground sm:px-5">
      <header className="mx-auto mb-4 flex max-w-[1760px] items-center justify-between gap-4 border-b pb-4 max-lg:flex-col max-lg:items-stretch">
        <div className="min-w-0">
          <span className="text-xs font-semibold uppercase tracking-normal text-primary">Arknights InfraCalc</span>
          <h1 className="mt-1 text-2xl font-semibold leading-tight">排班验收台</h1>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2 max-lg:items-stretch max-sm:flex-col">
          <StatusBar loading={loading} result={result} error={inputError ?? apiError} cliPath={cliPath} />
          <SklandAccount
            configured={sklandConfigured}
            disabledReason={sklandDisabledReason}
            snapshot={sklandSnapshot}
            busy={sklandBusy}
            onAuthenticated={applySklandSnapshot}
            onRefresh={handleSklandRefresh}
            onRoleChange={handleSklandRole}
            onLogout={handleSklandLogout}
          />
          <RunButton canRun={canRun} loading={loading} onRun={handleRun} />
        </div>
      </header>

      <section className="mx-auto grid max-w-[1760px] grid-cols-[340px_minmax(560px,1fr)_390px] items-start gap-4 max-[1500px]:grid-cols-[320px_minmax(0,1fr)] max-[900px]:block">
        <aside className="min-w-0 space-y-4">
          <Panel title="输入" icon={<Database className="size-4" />}>
            <Tabs value={inputMode} onValueChange={(value) => setInputMode(value as "skland" | "maa")}>
              <TabsList className="w-full">
                <TabsTrigger value="skland">森空岛同步</TabsTrigger>
                <TabsTrigger value="maa">MAA 导入</TabsTrigger>
              </TabsList>
              <TabsContent value="skland" className="pt-2">
                {sklandSnapshot ? (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <strong className="block truncate text-sm">{sklandSnapshot.player.nickname}</strong>
                        <span className="text-xs text-muted-foreground">已同步 {sklandSnapshot.operbox.length} 名干员</span>
                      </div>
                      <Button type="button" size="sm" variant="outline" disabled={sklandBusy} onClick={() => void handleSklandRefresh()}>
                        刷新
                      </Button>
                    </div>
                    {sklandSnapshot.warnings.length ? (
                      <ul className="mt-2 grid gap-1 text-xs text-amber-700">
                        {sklandSnapshot.warnings.map((warning) => <li key={warning}>· {warning}</li>)}
                      </ul>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    {sklandConfigured ? "从页面右上角扫码登录，Box 和基建状态会自动同步。" : sklandDisabledReason ?? "森空岛登录未配置。"}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="maa" className="space-y-2 pt-2">
                <FileDrop fileName={boxSource === "maa" ? fileName : null} onFile={handleFile} />
                <Textarea
                  value={maaPaste}
                  onChange={(event) => setMaaPaste(event.target.value)}
                  placeholder="粘贴 Arknights_OperBox_Export.json 内容"
                  className="min-h-24 resize-y font-mono text-xs"
                />
                <Button type="button" variant="outline" className="w-full" disabled={!maaPaste.trim()} onClick={handleMaaPaste}>
                  导入粘贴内容
                </Button>
              </TabsContent>
            </Tabs>
            <Button type="button" variant="outline" className="mt-2 w-full" onClick={handleLoadSample}>
              <FlaskConical />
              载入 243 全精二样例
            </Button>
            <AccountStats operbox={operbox} />
            <div className="mt-3 rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
              Box 来源：{boxSource === "skland" ? "森空岛" : boxSource === "maa" ? "MAA 导入" : "测试样例"}
              {fileName ? <span className="mt-0.5 block truncate">{fileName}</span> : null}
            </div>
            {operbox && countOwned(operbox) === 0 ? (
              <Alert className="mt-3 border-amber-200 bg-amber-50 text-amber-700">
                <AlertDescription className="text-amber-700">
                  练度表已读入，但没有识别到 own=true，仍可继续生成排班。
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Boxes className="size-4" />
              <span className="truncate">
                当前布局：{preset.label}，{roomSummary(layout)}
              </span>
            </div>
          </Panel>

          <Panel title="布局" icon={<LayoutGrid className="size-4" />}>
            <PresetSelector presets={PRESETS} selected={preset} onSelect={handlePresetSelect} />
            <label className="mt-3 flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed text-sm font-medium text-muted-foreground transition hover:border-primary hover:text-primary">
              <Upload className="size-4" />
              导入 layout JSON
              <input
                className="sr-only"
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleLayoutFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <Button type="button" variant="outline" className="mt-2 w-full" onClick={() => downloadJson(`layout-${layout.template}.json`, layout)}>
              <FileJson />
              导出当前 layout JSON
            </Button>
            <LayoutEditor
              layout={layout}
              onFactoryRecipeChange={handleFactoryRecipeChange}
              onTradeOrderChange={handleTradeOrderChange}
              onRoomLevelChange={handleRoomLevelChange}
            />
          </Panel>
        </aside>

        <section className="min-w-0 max-[900px]:mt-4">
          <Panel title="三班排班" icon={<ShieldCheck className="size-4" />} className="min-h-[calc(100vh-112px)]">
            <div className="mb-3 flex items-start justify-between gap-3 max-sm:flex-col">
              <div className="min-w-0">
                <strong className="block truncate text-sm font-medium">
                  {result?.maaJson?.title ?? "等待生成排班"}
                </strong>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {activePlan?.description ?? "可先调整房间订单和配方，上传练度表后点击生成排班。"}
                </span>
              </div>
              <ShiftTabs maaJson={result?.maaJson} active={activeShift} closest={closestComparison?.planIndex} onChange={setActiveShift} />
            </div>
            <ShiftComparisonCard comparison={closestComparison} />
            <ScheduleBoard
              rows={rows}
              layout={layout}
              onIssue={handleMarkIssue}
              onFactoryRecipeChange={handleFactoryRecipeChange}
              onTradeOrderChange={handleTradeOrderChange}
            />
          </Panel>
        </section>

        <aside className="min-w-0 space-y-4 max-[1500px]:col-span-full max-[1500px]:grid max-[1500px]:grid-cols-2 max-[1500px]:gap-4 max-[1500px]:space-y-0 max-[900px]:mt-4 max-[900px]:block max-[900px]:space-y-4">
          {sklandSnapshot ? (
            <Panel title="森空岛基建快照" icon={<Database className="size-4" />}>
              <InfrastructureSnapshot snapshot={sklandSnapshot} layoutMatches={sklandLayoutMatches} onApplyLayout={handleApplySklandLayout} />
            </Panel>
          ) : null}
          <Panel title="问题上下文" icon={<FileJson className="size-4" />}>
            <IssuePanel
              issue={issueForPanel}
              report={issueReport}
              feedback={feedbackResult}
              feedbackError={feedbackError}
            />
          </Panel>

          <Panel title="调试输出" icon={<Terminal className="size-4" />}>
            <DebugActions
              result={result}
              onDownloadMaa={handleDownloadMaa}
              onDownloadBundle={handleDownloadBundle}
              onCopyCommand={handleCopyCommand}
            />
            <details className="mt-3 text-sm text-muted-foreground">
              <summary className="cursor-pointer">stdout / stderr</summary>
              <Textarea
                readOnly
                value={result?.stdout || result?.stderr || "暂无输出。"}
                className="mt-2 max-h-64 min-h-32 resize-y font-mono text-xs"
              />
            </details>
          </Panel>
        </aside>
      </section>

      <IssueNoteModal
        open={issueOpen}
        row={issueDraftRow}
        note={issueDraftNote}
        saving={feedbackSaving}
        onNoteChange={setIssueDraftNote}
        onSave={handleSaveIssue}
        onCancel={handleCancelIssue}
      />

      <aside
        className="fixed bottom-4 right-4 z-30 w-[min(360px,calc(100vw-2rem))] rounded-lg border border-amber-200 bg-background/95 p-3 text-sm shadow-lg backdrop-blur"
        aria-label="目前已知问题"
      >
        <strong className="block text-sm font-medium">目前已知问题</strong>
        <ul className="mt-2 grid gap-1 pl-4 text-xs leading-5 text-muted-foreground">
          {KNOWN_ISSUES.map((issue) => (
            <li key={issue} className="list-disc">
              {issue}
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}

export default WorkbenchApp;

