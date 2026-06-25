import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Download,
  FileWarning,
  Loader2,
  Play,
  Upload,
} from "lucide-react";
import { ChangeEvent, ReactNode } from "react";
import { MetaCheck, RoomRow } from "./schedule";
import { DebugBundle, MaaJson, OperBoxEntry, PlanApiResponse, PresetDef, UserProfile } from "./types";
import { countElite2, countOwned, countSixStar } from "./operbox";

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`btn btn-${variant}`}
    >
      {children}
    </button>
  );
}

export function Panel({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-title">
        {icon}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function FileDrop({
  fileName,
  onFile,
}: {
  fileName: string | null;
  onFile: (file: File) => void;
}) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.currentTarget.value = "";
  }

  return (
    <label className="file-drop">
      <Upload size={20} />
      <span>{fileName ?? "上传练度 JSON / XLSX"}</span>
      <small>支持前端导出的 operbox.json，也支持小饼 xlsx</small>
      <input type="file" accept=".json,.xlsx,.xls" onChange={handleChange} />
    </label>
  );
}

export function PresetSelector({
  presets,
  selected,
  onSelect,
}: {
  presets: PresetDef[];
  selected: PresetDef;
  onSelect: (preset: PresetDef) => void;
}) {
  return (
    <div className="preset-grid">
      {presets.map((preset) => (
        <button
          key={preset.label}
          type="button"
          className={`preset ${selected.label === preset.label ? "active" : ""}`}
          onClick={() => onSelect(preset)}
        >
          <strong>{preset.label}</strong>
          <span>
            {preset.trading} 贸 / {preset.manufacture} 制 / {preset.power} 电
          </span>
        </button>
      ))}
    </div>
  );
}

export function AccountStats({ operbox }: { operbox: OperBoxEntry[] | null }) {
  return (
    <div className="stats-grid">
      <div>
        <span>拥有干员</span>
        <strong>{countOwned(operbox)}</strong>
      </div>
      <div>
        <span>精二干员</span>
        <strong>{countElite2(operbox)}</strong>
      </div>
      <div>
        <span>六星干员</span>
        <strong>{countSixStar(operbox)}</strong>
      </div>
    </div>
  );
}

export function StatusBar({
  loading,
  result,
  error,
  cliPath,
}: {
  loading: boolean;
  result: PlanApiResponse | null;
  error: string | null;
  cliPath: string | null;
}) {
  if (loading) {
    return (
      <div className="status running">
        <Loader2 className="spin" size={18} />
        <span>正在调用 infra-cli plan</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="status error">
        <AlertTriangle size={18} />
        <span>{error}</span>
      </div>
    );
  }
  if (result?.success) {
    return (
      <div className="status ok">
        <CheckCircle2 size={18} />
        <span>运行完成：{result.durationMs ?? "?"}ms</span>
      </div>
    );
  }
  return (
    <div className="status idle">
      <CircleHelp size={18} />
      <span>{cliPath ? `CLI: ${cliPath}` : "等待连接本地 CLI 服务"}</span>
    </div>
  );
}

export function RunButton({
  canRun,
  loading,
  onRun,
}: {
  canRun: boolean;
  loading: boolean;
  onRun: () => void;
}) {
  return (
    <Button onClick={onRun} disabled={!canRun || loading}>
      {loading ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
      {loading ? "计算中" : "生成排班"}
    </Button>
  );
}

export function MetaChecks({ checks }: { checks: MetaCheck[] }) {
  return (
    <div className="meta-list">
      {checks.map((check) => (
        <div key={check.id} className={`meta-item ${check.status}`}>
          <div>
            <span>{check.scope}</span>
            <strong>{check.title}</strong>
            <small>{check.detail}</small>
          </div>
          <em>
            {check.status === "hit"
              ? "命中"
              : check.status === "partial"
                ? "部分"
                : check.status === "missing"
                  ? "未见"
                  : "待测"}
          </em>
        </div>
      ))}
    </div>
  );
}

export function ProfileSummary({ profile }: { profile?: UserProfile }) {
  if (!profile) {
    return <div className="empty">运行后显示账号画像和效率域。</div>;
  }
  const summary = profile.summary;
  return (
    <div className="profile-summary">
      <div>
        <span>贸易池</span>
        <strong>{summary.trade_pool_ready}</strong>
      </div>
      <div>
        <span>制造池</span>
        <strong>{summary.manu_pool_ready}</strong>
      </div>
      <div>
        <span>轮换贸易</span>
        <strong>{profile.rotation.daily_trade.toFixed(2)}</strong>
      </div>
      <div>
        <span>轮换制造</span>
        <strong>{profile.rotation.daily_manu.toFixed(2)}</strong>
      </div>
    </div>
  );
}

export function ShiftTabs({
  maaJson,
  active,
  onChange,
}: {
  maaJson?: MaaJson;
  active: number;
  onChange: (index: number) => void;
}) {
  const labels = ["α 12h", "β 6h", "γ 6h"];
  const plans = maaJson?.plans ?? [];

  return (
    <div className="shift-tabs">
      {plans.length === 0 ? (
        <button type="button" disabled>
          等待结果
        </button>
      ) : (
        plans.map((plan, index) => (
          <button
            key={`${plan.name}-${index}`}
            type="button"
            className={active === index ? "active" : ""}
            onClick={() => onChange(index)}
          >
            {labels[index] ?? plan.name ?? `班次 ${index + 1}`}
          </button>
        ))
      )}
    </div>
  );
}

export function ScheduleBoard({
  rows,
  onIssue,
}: {
  rows: RoomRow[];
  onIssue: (row: RoomRow) => void;
}) {
  if (rows.length === 0) {
    return <div className="empty board-empty">运行后按房间展示三班排班。</div>;
  }

  return (
    <div className="schedule-grid">
      {rows.map((row) => (
        <article key={row.key} className={`room-card ${row.group} ${row.suspicious ? "suspicious" : ""}`}>
          <header>
            <span>{row.title}</span>
            {row.product ? <em>{row.product}</em> : null}
          </header>
          <div className="op-list">
            {row.operators.length > 0 ? (
              row.operators.map((operator) => <b key={operator}>{operator}</b>)
            ) : (
              <i>空置</i>
            )}
          </div>
          <footer>
            <span>{row.rule}</span>
            <button type="button" onClick={() => onIssue(row)}>
              <FileWarning size={14} />
              标记问题
            </button>
          </footer>
        </article>
      ))}
    </div>
  );
}

export function IssuePanel({
  row,
  sourceName,
  debugBundle,
}: {
  row: RoomRow | null;
  sourceName: string | null;
  debugBundle?: DebugBundle;
}) {
  if (!row) {
    return <div className="empty">点击房间里的“标记问题”，这里会生成反馈上下文。</div>;
  }

  const report = {
    type: "room_issue",
    sourceName,
    room: {
      title: row.title,
      group: row.group,
      product: row.product,
      operators: row.operators,
      inferredRule: row.rule,
    },
    command: debugBundle?.command,
    note: "请在这里补充：哪个干员不该上 / 哪个干员应该上 / 哪个组合关系错了。",
  };

  return (
    <div className="issue-box">
      <strong>{row.title}</strong>
      <p>{row.operators.join(" / ") || "空置"}</p>
      <textarea readOnly value={JSON.stringify(report, null, 2)} />
    </div>
  );
}

export function DebugActions({
  result,
  onDownloadMaa,
  onDownloadBundle,
  onCopyCommand,
}: {
  result: PlanApiResponse | null;
  onDownloadMaa: () => void;
  onDownloadBundle: () => void;
  onCopyCommand: () => void;
}) {
  return (
    <div className="debug-actions">
      <Button variant="ghost" disabled={!result?.maaJson} onClick={onDownloadMaa}>
        <Download size={16} />
        下载 MAA
      </Button>
      <Button variant="ghost" disabled={!result?.debugBundle} onClick={onDownloadBundle}>
        <Download size={16} />
        下载调试包
      </Button>
      <Button variant="ghost" disabled={!result?.command} onClick={onCopyCommand}>
        复制 CLI 命令
      </Button>
    </div>
  );
}
