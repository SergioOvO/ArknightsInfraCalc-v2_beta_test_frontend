# Arknights InfraCalc β 排班验收台

独立的 β 测试页面，用来验收 `infra-cli plan` 生成的账号画像、三班排班、MAA JSON 和调试包。

## 推荐入口

```powershell
npm install
npm run dev:full
```

页面默认打开：

```text
http://127.0.0.1:5174
```

API 服务会优先使用：

```text
../ArknightsInfraCalc-v2/target/release/infra-cli.exe
```

如果不存在，会回退到 `target/debug/infra-cli.exe` 或本仓库 `bin/infra-cli.exe`。

## 设计目标

- β 测试者只需要上传练度表、选择布局、点击运行。
- 首屏直接展示排班验收工作台，不做介绍页。
- 房间视角展示三班排班，并保留现有前端的深色基建色块风格。
- 一键导出调试包，便于判断前端、后端、策略表或用户 box 的问题。
