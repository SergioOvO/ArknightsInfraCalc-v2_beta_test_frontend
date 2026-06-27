# Arknights InfraCalc β 排班验收台

独立的 β 测试页面，用来验收 `infra-cli layout team-rotation --json` 生成的三班排班、房间效率、MAA JSON 和调试包。

## 本地开发

```powershell
npm install
npm run dev:full
```

页面默认打开：

```text
http://127.0.0.1:5174
```

开发服务会把 `/api` 代理到 `http://127.0.0.1:4174`。

## CLI 放置

后端会优先使用本仓库内的 CLI：

```text
bin/infra-cli        # Linux
bin/infra-cli.exe    # Windows
```

也可以通过 `INFRA_CLI_PATH` 指向任意可执行文件。为了兼容本地调试，如果仓库内没有 CLI，后端还会尝试读取 `../ArknightsInfraCalc-v2/target/{release,debug}/infra-cli*`。

Linux 部署前请把 Linux 版本的 `infra-cli` 放到 `bin/infra-cli`，并确认有执行权限：

```bash
chmod +x bin/infra-cli
```

## Linux 生产部署

```bash
npm ci
npm run build
BETA_API_HOST=0.0.0.0 BETA_API_PORT=4174 npm start
```

生产模式下 `server/index.js` 会同时提供 API 和 `dist/` 静态页面。反向代理可以直接转发到 `http://127.0.0.1:4174`，或在需要外部直连时使用上面的 `BETA_API_HOST=0.0.0.0`。

## 持久化数据

β 测试阶段 API 会保留每次 CLI 运行和反馈提交的 JSON，默认写入：

```text
server/storage/cli-runs
server/storage/feedback
```

可以用 `BETA_STORAGE_DIR` 改整体存储目录，也可以分别用 `BETA_CLI_RUN_DIR`、`BETA_FEEDBACK_DIR` 指定运行记录和反馈目录。

## 样例数据

“载入 243 全精二样例”优先读取：

```text
fixtures/operbox_full_e2.json
```

如果仓库内不存在，会回退到本地核心仓库的 `data/fixtures/243/operbox_full_e2.json`。

## 设计目标

- β 测试者只需要上传练度表、选择布局、点击运行。
- 首屏直接展示排班验收工作台，不做介绍页。
- 房间视角展示三班排班和对应效率。
- 一键导出调试包，便于判断前端、后端、策略表或用户 box 的问题。
