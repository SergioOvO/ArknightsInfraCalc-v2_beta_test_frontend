"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Building2, Check, LoaderCircle, LogOut, RefreshCw, ScanLine, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { pollSklandQr, startSklandQr } from "./api";
import type { ShiftComparison, SklandSnapshot } from "./types";

const QRCodeSVG = dynamic(() => import("qrcode.react").then((module) => module.QRCodeSVG), { ssr: false });

type AccountProps = {
  configured: boolean;
  disabledReason?: string | null;
  snapshot: SklandSnapshot | null;
  busy: boolean;
  onAuthenticated: (snapshot: SklandSnapshot) => void;
  onRefresh: () => Promise<void>;
  onRoleChange: (uid: string) => Promise<void>;
  onLogout: () => Promise<void>;
};

export function SklandAccount({
  configured,
  disabledReason,
  snapshot,
  busy,
  onAuthenticated,
  onRefresh,
  onRoleChange,
  onLogout,
}: AccountProps) {
  const [open, setOpen] = useState(false);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [scanState, setScanState] = useState<"idle" | "loading" | "waiting" | "scanned" | "expired">("idle");
  const [error, setError] = useState<string | null>(null);

  async function createQr() {
    setError(null);
    setScanState("loading");
    setScanId(null);
    setScanUrl(null);
    try {
      const result = await startSklandQr();
      if (!result.success || !result.scanId || !result.scanUrl) throw new Error(result.error ?? "二维码生成失败。");
      setScanId(result.scanId);
      setScanUrl(result.scanUrl);
      setScanState("waiting");
    } catch (caught) {
      setScanState("idle");
      setError(caught instanceof Error ? caught.message : "二维码生成失败。");
    }
  }

  useEffect(() => {
    if (!open || !scanId) return;
    let cancelled = false;
    let timer: number | null = null;
    const poll = async () => {
      try {
        const result = await pollSklandQr(scanId);
        if (cancelled) return;
        if (result.status === "authenticated" && result.snapshot) {
          onAuthenticated(result.snapshot);
          setOpen(false);
          setScanId(null);
          setScanUrl(null);
          setScanState("idle");
          return;
        }
        if (result.status === "expired") {
          setScanState("expired");
          setError(result.error ?? "二维码已过期，请刷新。");
          return;
        }
        setScanState(result.status === "scanned" ? "scanned" : "waiting");
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "登录状态查询失败，将继续重试。");
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), 1500);
    };
    timer = window.setTimeout(() => void poll(), 1500);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [open, onAuthenticated, scanId]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && !snapshot && configured && scanState === "idle") void createQr();
    if (!next && !snapshot) {
      setScanId(null);
      setScanUrl(null);
      setScanState("idle");
      setError(null);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" className="min-w-0 justify-start" onClick={() => handleOpenChange(true)} disabled={!configured && !snapshot}>
        {snapshot ? (
          <>
            <span
              className="size-6 shrink-0 rounded-full bg-muted bg-cover bg-center"
              style={snapshot.player.avatarUrl ? { backgroundImage: `url(${snapshot.player.avatarUrl})` } : undefined}
              aria-hidden="true"
            />
            <span className="max-w-32 truncate">{snapshot.player.nickname}</span>
          </>
        ) : (
          <>
            <ScanLine />
            登录森空岛
          </>
        )}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          {snapshot ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserRound className="size-4" />
                  {snapshot.player.nickname}
                </DialogTitle>
                <DialogDescription>
                  {snapshot.player.channelName} · Lv.{snapshot.player.level} · UID {snapshot.player.uid}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <span className="text-xs font-medium text-muted-foreground">绑定角色</span>
                {snapshot.roles.map((role) => (
                  <Button
                    type="button"
                    key={role.uid}
                    variant={role.uid === snapshot.player.uid ? "secondary" : "outline"}
                    className="justify-between"
                    disabled={busy || role.uid === snapshot.player.uid}
                    onClick={() => void onRoleChange(role.uid)}
                  >
                    <span className="truncate">{role.nickname} · {role.channelName}</span>
                    {role.uid === snapshot.player.uid ? <Check /> : null}
                  </Button>
                ))}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={() => void onLogout()}>
                  <LogOut />退出
                </Button>
                <Button type="button" disabled={busy} onClick={() => void onRefresh()}>
                  <RefreshCw className={busy ? "animate-spin" : ""} />刷新数据
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>扫码登录森空岛</DialogTitle>
                <DialogDescription>使用森空岛 App 扫码并确认。登录凭证仅保存在加密的 HttpOnly Cookie 中。</DialogDescription>
              </DialogHeader>
              {!configured ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{disabledReason}</div>
              ) : (
                <div className="grid place-items-center gap-3 py-2">
                  <div className="grid size-56 place-items-center rounded-xl border bg-white p-3">
                    {scanUrl ? <QRCodeSVG value={scanUrl} size={196} /> : <LoaderCircle className="size-8 animate-spin text-muted-foreground" />}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {scanState === "scanned" ? "已扫码，请在森空岛中确认登录。" : scanState === "expired" ? "二维码已过期。" : "等待扫码…"}
                  </p>
                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                  {scanState === "expired" || error ? (
                    <Button type="button" variant="outline" onClick={() => void createQr()}><RefreshCw />刷新二维码</Button>
                  ) : null}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatTime(timestamp: number): string {
  if (!timestamp) return "未知";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "medium" }).format(new Date(timestamp * 1000));
}

function roomLabel(group: string, index: number): string {
  const labels: Record<string, string> = { control: "控制中枢", trading: "贸易站", manufacture: "制造站", power: "发电站", dormitory: "宿舍", meeting: "会客室", hire: "办公室" };
  return `${labels[group] ?? group}${["control", "meeting", "hire"].includes(group) ? "" : ` ${index + 1}`}`;
}

export function InfrastructureSnapshot({
  snapshot,
  layoutMatches,
  onApplyLayout,
}: {
  snapshot: SklandSnapshot;
  layoutMatches: boolean;
  onApplyLayout: () => void;
}) {
  const occupied = snapshot.infrastructure.rooms.filter((room) => room.operators.length > 0);
  return (
    <div className="grid gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={layoutMatches ? "secondary" : "destructive"}>{layoutMatches ? "布局一致" : "布局不一致"}</Badge>
        <span className="text-xs text-muted-foreground">存档于 {formatTime(snapshot.infrastructure.storeTs)}</span>
      </div>
      {!layoutMatches && snapshot.infrastructure.layoutSuggestion ? (
        <Button type="button" size="sm" variant="outline" onClick={onApplyLayout}><Building2 />应用森空岛 {snapshot.infrastructure.layoutLabel} 布局</Button>
      ) : null}
      {snapshot.infrastructure.layoutWarning ? <p className="text-xs text-amber-700">{snapshot.infrastructure.layoutWarning}</p> : null}
      <div className="grid gap-2">
        {occupied.map((room) => (
          <div key={room.key} className="rounded-lg border bg-muted/30 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-xs">{roomLabel(room.group, room.index)} · Lv.{room.level}</strong>
              {room.product ? <span className="text-[11px] text-muted-foreground">{room.product}</span> : null}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {room.operators.map((operator) => (
                <Badge key={`${room.key}-${operator.id}`} variant={operator.morale <= 4 ? "destructive" : "outline"}>{operator.name} {operator.morale}</Badge>
              ))}
            </div>
            {room.production ? (
              <div className="mt-1.5 text-[11px] text-muted-foreground">
                库存 {room.production.stock ?? "—"}/{room.production.capacity ?? "—"}
                {room.production.completed !== null ? ` · 已完成 ${room.production.completed}` : ""}
                {room.production.remaining !== null ? ` · 剩余 ${room.production.remaining}` : ""}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="grid gap-1 text-xs text-muted-foreground">
        <span>无人机：{snapshot.infrastructure.labor.value}/{snapshot.infrastructure.labor.maxValue}</span>
        <span>疲劳干员：{snapshot.infrastructure.tiredOperators.join("、") || "无"}</span>
        <span>训练室：{snapshot.infrastructure.training ? `${snapshot.infrastructure.training.trainee ?? "空"} / ${snapshot.infrastructure.training.trainer ?? "无协助"}` : "空闲"}</span>
      </div>
    </div>
  );
}

export function ShiftComparisonCard({ comparison }: { comparison: ShiftComparison | null }) {
  if (!comparison) return null;
  const lines = [
    ["需要换入", comparison.missing],
    ["需要换出", comparison.unexpected],
    ["位置不一致", comparison.misplaced],
    ["疲劳但仍排入", comparison.tiredScheduled],
  ] as const;
  return (
    <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>当前最接近第 {comparison.planIndex + 1} 班</strong>
        <Badge variant="secondary">房间匹配 {comparison.score}%</Badge>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        {lines.map(([label, names]) => <span key={label}>{label}：{names.join("、") || "无"}</span>)}
      </div>
    </div>
  );
}
