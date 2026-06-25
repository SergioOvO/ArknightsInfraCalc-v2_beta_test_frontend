import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Boxes,
  Database,
  FileJson,
  FlaskConical,
  LayoutGrid,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { getHealth, getSampleOperbox, runPlan } from "./api";
import { buildBlueprint, PRESETS, roomSummary } from "./blueprint";
import {
  AccountStats,
  DebugActions,
  FileDrop,
  IssuePanel,
  MetaChecks,
  Panel,
  PresetSelector,
  ProfileSummary,
  RunButton,
  ScheduleBoard,
  ShiftTabs,
  StatusBar,
} from "./components";
import { copyText, downloadJson } from "./download";
import { countOwned, readOperboxFile } from "./operbox";
import { buildMetaChecks, planToRows, RoomRow } from "./schedule";
import { OperBoxEntry, PlanApiResponse, PresetDef } from "./types";
import "./styles.css";

function App() {
  const [preset, setPreset] = useState<PresetDef>(PRESETS[0]);
  const [operbox, setOperbox] = useState<OperBoxEntry[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [cliPath, setCliPath] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [activeShift, setActiveShift] = useState(0);
  const [issueRow, setIssueRow] = useState<RoomRow | null>(null);

  const layout = useMemo(() => buildBlueprint(preset), [preset]);
  const activePlan = result?.maaJson?.plans?.[activeShift];
  const rows = useMemo(() => planToRows(activePlan), [activePlan]);
  const metaChecks = useMemo(
    () => buildMetaChecks(result?.maaJson, result?.profileJson),
    [result?.maaJson, result?.profileJson]
  );
  const canRun = Boolean(operbox && countOwned(operbox) > 0);

  useEffect(() => {
    getHealth()
      .then((health) => {
        if (health.ok && health.cliPath) {
          setCliPath(health.cliPath);
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
    setIssueRow(null);
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
    setIssueRow(null);
    setActiveShift(0);

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
    setIssueRow(null);
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
            <div className="hint-line">
              <Boxes size={15} />
              <span>当前布局：{preset.label}，{roomSummary(layout)}</span>
            </div>
          </Panel>

          <Panel title="布局" icon={<LayoutGrid size={18} />}>
            <PresetSelector presets={PRESETS} selected={preset} onSelect={setPreset} />
          </Panel>

          <Panel title="账号画像" icon={<Activity size={18} />}>
            <ProfileSummary profile={result?.profileJson} />
          </Panel>
        </aside>

        <section className="center-column">
          <Panel title="三班排班" icon={<ShieldCheck size={18} />} className="board-panel">
            <div className="board-header">
              <div>
                <strong>{result?.maaJson?.title ?? "等待生成排班"}</strong>
                <span>{activePlan?.description ?? "上传练度表后点击生成排班。"}</span>
              </div>
              <ShiftTabs maaJson={result?.maaJson} active={activeShift} onChange={setActiveShift} />
            </div>
            <ScheduleBoard rows={rows} onIssue={setIssueRow} />
          </Panel>
        </section>

        <aside className="right-column">
          <Panel title="关键体系" icon={<ShieldCheck size={18} />}>
            <MetaChecks checks={metaChecks} />
          </Panel>

          <Panel title="问题上下文" icon={<FileJson size={18} />}>
            <IssuePanel row={issueRow} sourceName={fileName} debugBundle={result?.debugBundle} />
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
    </main>
  );
}

export default App;
