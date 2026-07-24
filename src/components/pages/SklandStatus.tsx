import { Database } from "lucide-react";

import { Panel } from "@/components";
import { InfrastructureSnapshot } from "@/skland-components";
import type { SklandSnapshot } from "@/types";

interface SklandStatusProps {
  snapshot: SklandSnapshot | null;
  layoutMatches: boolean;
  onApplyLayout: () => void;
}

export function SklandStatus({ snapshot, layoutMatches, onApplyLayout }: SklandStatusProps) {
  if (!snapshot) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">尚未同步森空岛数据。请在右上角登录森空岛账号。</p>
      </div>
    );
  }

  return (
    <Panel title="当前状态 · 森空岛基建" icon={<Database className="size-4" />}>
      <InfrastructureSnapshot
        snapshot={snapshot}
        layoutMatches={layoutMatches ?? false}
        onApplyLayout={onApplyLayout}
      />
    </Panel>
  );
}
