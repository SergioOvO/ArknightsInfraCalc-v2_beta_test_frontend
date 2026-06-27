# Agent 入口文档

> 新会话先读本文。这里是 `ArknightsInfraCli-v2` 明日方舟基建排班求解器的 beta 测试前端，不是核心求解器仓库。

## 项目定位

本仓库提供一个面向 beta 测试者的排班验收工作台，用来调用本地或指定路径下的 `infra-cli`，验收 `layout team-rotation --json` 生成的结果。

主要目标：

- 上传或载入干员练度表。
- 选择基建布局并运行三班排班求解。
- 展示房间排班、效率、调试信息和可导出的 MAA JSON。
- 收集 CLI 运行记录与反馈 JSON，方便定位前端、后端、策略表或用户 box 的问题。

非目标：

- 不在前端重写排班、技能、效率或策略求解逻辑。
- 不在 `server/` 中实现机制公式；后端只负责接收请求、调用 CLI、保存记录和提供静态页面。
- 不把 beta 测试页面做成介绍页或营销页；首屏应直接是验收工作台。

## 技术栈

- 前端：Vite + React + TypeScript。
- 本地 API：Express，入口为 `server/index.js`。
- 求解器：外部可执行文件 `infra-cli`。
- 样例数据：`fixtures/operbox_full_e2.json`。

## 常用命令

```bash
npm install
npm run dev:full
```

默认地址：

```text
http://127.0.0.1:5174
```

其他常用命令：

```bash
npm run build
npm run lint
npm start
```

`npm run dev:full` 会同时启动：

- Web：Vite dev server。
- API：`server/index.js`。

Vite 开发服务会把 `/api` 代理到 `http://127.0.0.1:4174`。

## CLI 关系

后端优先查找：

```text
bin/infra-cli
bin/infra-cli.exe
```

也可以通过环境变量指定：

```bash
INFRA_CLI_PATH=/path/to/infra-cli npm run dev:full
```

如果仓库内没有 CLI，后端会尝试回退到相邻核心仓库：

```text
../ArknightsInfraCalc-v2/target/release/infra-cli*
../ArknightsInfraCalc-v2/target/debug/infra-cli*
```

Linux 环境下确认可执行权限：

```bash
chmod +x bin/infra-cli
```

## 关键文件

| 路径 | 说明 |
|------|------|
| `src/App.tsx` | 主工作台状态与页面编排 |
| `src/components.tsx` | 复用 UI 组件 |
| `src/api.ts` | 前端 API 调用 |
| `src/types.ts` | 前后端共享的 TypeScript 数据形状 |
| `src/operbox.ts` | 练度表解析与样例载入 |
| `src/schedule.ts` | 排班结果整理 |
| `src/blueprint.ts` | 布局 / 蓝图相关处理 |
| `src/download.ts` | 调试包、MAA JSON 等导出 |
| `server/index.js` | API、CLI 调用、存储与生产静态服务 |
| `fixtures/operbox_full_e2.json` | 243 全精二样例 box |
| `bin/infra-cli` | Linux CLI 可执行文件 |
| `bin/infra-cli.exe` | Windows CLI 可执行文件 |

## 存储与环境变量

beta 测试阶段会保留 CLI 运行记录和反馈提交，默认写入：

```text
server/storage/cli-runs
server/storage/feedback
```

可用环境变量：

| 变量 | 用途 |
|------|------|
| `INFRA_CLI_PATH` | 指定 CLI 可执行文件 |
| `BETA_API_HOST` | API 监听地址，生产部署可设为 `0.0.0.0` |
| `BETA_API_PORT` | API 端口，默认 `4174` |
| `BETA_STORAGE_DIR` | 整体存储根目录 |
| `BETA_CLI_RUN_DIR` | CLI 运行记录目录 |
| `BETA_FEEDBACK_DIR` | 反馈记录目录 |

## 实现原则

1. 前端只展示和校验，不发明求解口径。
2. CLI 输出 JSON 是排班、效率、导出数据的事实源。
3. 修改数据结构时，同时检查 `src/types.ts`、`src/api.ts`、`server/index.js` 和 UI 展示。
4. 任何与排班算法、干员技能、效率公式相关的问题，优先去核心仓库 `../ArknightsInfraCalc-v2` 修改。
5. beta 用户路径要短：上传 box、选择布局、运行、查看结果、导出调试包。
6. 保持首屏为实际工具界面，不新增落地页。

## 验证建议

文档或小 UI 改动后至少运行：

```bash
npm run lint
```

涉及类型、构建或 API 契约时运行：

```bash
npm run build
```

涉及 CLI 调用链时，用可用的 `infra-cli` 跑：

```bash
npm run dev:full
```

然后在页面中载入 243 全精二样例并执行一次排班。
