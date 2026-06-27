import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Database,
  FileJson,
  FlaskConical,
  LayoutGrid,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { getHealth, getSampleOperbox, runPlan, saveFeedback } from "./api";
import {
  buildBlueprint,
  FactoryRecipe,
  PRESETS,
  roomSummary,
  TradeOrder,
  updateFactoryRecipe,
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
import { countOwned, readOperboxFile } from "./operbox";
import { planToRows, RoomRow } from "./schedule";
import { BaseBlueprint, FeedbackApiResponse, IssueReport, OperBoxEntry, PlanApiResponse, PresetDef } from "./types";
import "./styles.css";

const SESSION_KEY = "arknights-infra-calc-beta-session-v2";
const KNOWN_ISSUES = [
  "β 测试阶段仍可能出现排班策略和预期不一致的情况；请用“标记问题”提交上下文。",
  "目前已知问题："
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
  return safeParseJson(window.localStorage.getItem(SESSION_KEY));
}

function resolvePreset(value: PresetDef | undefined): PresetDef {
  return PRESETS.find((preset) => preset.label === value?.label) ?? PRESETS[0];
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
          product: { trade: { order: cachedRoom.product.trade.order } },
        };
      }
      return room;
    }),
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

function App() {
  const initialSession = readSessionState() as
    | {
        preset?: PresetDef;
        layout?: BaseBlueprint;
        operbox?: OperBoxEntry[] | null;
        fileName?: string | null;
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
  const [inputError, setInputError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanApiResponse | null>(initialSession?.result ?? null);
  const [loading, setLoading] = useState(false);
  const [cliPath, setCliPath] = useState<string | null>(null);
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

  const activePlan = result?.maaJson?.plans?.[activeShift];
  const activeRotationShift = result?.rotationJson?.shifts?.[activeShift];
  const rows = useMemo(() => planToRows(activePlan, activeRotationShift, layout), [activePlan, activeRotationShift, layout]);
  const canRun = Boolean(operbox && operbox.length > 0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const session = {
      preset,
      layout,
      operbox,
      fileName,
      result,
      activeShift,
      issueOpen,
      issueDraftRow,
      issueDraftNote,
      issue: savedIssue,
      feedback: feedbackResult,
    };
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }, [preset, layout, operbox, fileName, result, activeShift, issueOpen, issueDraftRow, issueDraftNote, savedIssue, feedbackResult]);

  useEffect(() => {
    getHealth()
      .then((health) => {
        if (health.ok) {
          setCliPath(health.cliPath ?? null);
          if (!health.cliPath) {
            setApiError("API 正常，但未找到可执行的 infra-cli。");
          }
        } else {
          setApiError(health.error ?? "本地 API 服务不可用。");
        }
      })
      .catch((error) => {
        setApiError(error instanceof Error ? error.message : "本地 API 服务不可用。");
      });
  }, []);

  async function handleFile(file: File) {
    setInputError(null);
    setResult(null);
    clearIssueState();
    try {
      const entries = await readOperboxFile(file);
      setOperbox(entries);
      setFileName(file.name);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "练度文件解析失败。");
    }
  }

  async function handleRun() {
    if (!operbox) return;
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
    clearPlanResult();
  }

  function handleFactoryRecipeChange(roomId: string, recipe: FactoryRecipe) {
    setLayout((current) => updateFactoryRecipe(current, roomId, recipe));
    clearPlanResult();
  }

  function handleTradeOrderChange(roomId: string, order: TradeOrder) {
    setLayout((current) => updateTradeOrder(current, roomId, order));
    clearPlanResult();
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
    <main>
      <header className="topbar">
        <div>
          <span className="eyebrow">Arknights InfraCalc</span>
          <h1>β 排班验收台</h1>
        </div>
        <div className="topbar-actions">
          <StatusBar
            loading={loading}
            result={result}
            error={inputError ?? apiError}
            cliPath={cliPath}
          />
          <RunButton canRun={canRun} loading={loading} onRun={handleRun} />
        </div>
      </header>

      <section className="workspace">
        <aside className="left-column">
          <Panel title="输入" icon={<Database size={18} />}>
            <FileDrop fileName={fileName} onFile={handleFile} />
            <button type="button" className="sample-button" onClick={handleLoadSample}>
              <FlaskConical size={16} />
              载入 243 全精二样例
            </button>
          <AccountStats operbox={operbox} />
          {operbox && countOwned(operbox) === 0 && (
            <div className="warning-line">
              练度表已读入，但没有识别到 `own=true`，仍可继续生成排班。
            </div>
          )}
            <div className="hint-line">
              <Boxes size={15} />
              <span>当前布局：{preset.label}，{roomSummary(layout)}</span>
            </div>
          </Panel>

          <Panel title="布局" icon={<LayoutGrid size={18} />}>
            <PresetSelector presets={PRESETS} selected={preset} onSelect={handlePresetSelect} />
            <LayoutEditor
              layout={layout}
              onFactoryRecipeChange={handleFactoryRecipeChange}
              onTradeOrderChange={handleTradeOrderChange}
            />
          </Panel>
        </aside>

        <section className="center-column">
          <Panel title="三班排班" icon={<ShieldCheck size={18} />} className="board-panel">
            <div className="board-header">
              <div>
                <strong>{result?.maaJson?.title ?? "等待生成排班"}</strong>
                <span>{activePlan?.description ?? "可先调整房间订单和配方，上传练度表后点击生成排班。"}</span>
              </div>
              <ShiftTabs maaJson={result?.maaJson} active={activeShift} onChange={setActiveShift} />
            </div>
            <ScheduleBoard
              rows={rows}
              layout={layout}
              onIssue={handleMarkIssue}
              onFactoryRecipeChange={handleFactoryRecipeChange}
              onTradeOrderChange={handleTradeOrderChange}
            />
          </Panel>
        </section>

        <aside className="right-column">
          <Panel title="问题上下文" icon={<FileJson size={18} />}>
            <IssuePanel
              issue={issueForPanel}
              report={issueReport}
              feedback={feedbackResult}
              feedbackError={feedbackError}
            />
          </Panel>

          <Panel title="调试输出" icon={<Terminal size={18} />}>
            <DebugActions
              result={result}
              onDownloadMaa={handleDownloadMaa}
              onDownloadBundle={handleDownloadBundle}
              onCopyCommand={handleCopyCommand}
            />
            <details className="raw-details">
              <summary>stdout / stderr</summary>
              <pre>{result?.stdout || result?.stderr || "暂无输出。"}</pre>
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

      <aside className="known-issues" aria-label="目前已知问题">
        <strong>目前已知问题</strong>
        <ul>
          {KNOWN_ISSUES.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      </aside>
    </main>
  );
}

export default App;
