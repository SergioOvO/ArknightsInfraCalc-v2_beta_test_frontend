import express from "express";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const coreRoot = path.resolve(repoRoot, "..", "ArknightsInfraCalc-v2");
const tmpRoot = path.join(repoRoot, ".tmp");
const port = Number(process.env.BETA_API_PORT || 4174);
const timeoutMs = Number(process.env.BETA_CLI_TIMEOUT_MS || 120_000);

const app = express();
app.use(express.json({ limit: "80mb" }));

function resolveCliPath() {
  const candidates = [
    process.env.INFRA_CLI_PATH,
    path.join(coreRoot, "target", "release", "infra-cli.exe"),
    path.join(coreRoot, "target", "debug", "infra-cli.exe"),
    path.join(repoRoot, "bin", "infra-cli.exe"),
    path.join(repoRoot, "infra-cli.exe"),
  ].filter(Boolean);

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`没有找到 infra-cli.exe，已检查：${candidates.join(", ")}`);
  }
  return path.resolve(found);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertPlanBody(body) {
  if (!isObject(body) || !isObject(body.layout)) {
    throw new Error("请求缺少 layout 对象。");
  }
  if (!Array.isArray(body.operbox) || body.operbox.length === 0) {
    throw new Error("请求缺少非空 operbox 数组。");
  }
}

function spawnCli(exePath, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(exePath, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        child.kill();
        finished = true;
        resolve({
          code: null,
          signal: "SIGTERM",
          stdout,
          stderr: `${stderr}\n[timed out after ${timeoutMs}ms]`,
        });
      }
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (finished) return;
      clearTimeout(timer);
      finished = true;
      resolve({ code: null, signal: null, stdout, stderr: `spawn error: ${error.message}` });
    });
    child.on("close", (code, signal) => {
      if (finished) return;
      clearTimeout(timer);
      finished = true;
      resolve({ code, signal, stdout, stderr });
    });
  });
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf-8"));
  } catch {
    return undefined;
  }
}

app.get("/api/health", (_request, response) => {
  try {
    const cliPath = resolveCliPath();
    response.json({
      ok: true,
      cliPath,
      coreRoot,
      repoRoot,
    });
  } catch (error) {
    response.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/sample-operbox", async (_request, response) => {
  try {
    const samplePath = path.join(coreRoot, "data", "fixtures", "243", "operbox_full_e2.json");
    const sample = JSON.parse(await readFile(samplePath, "utf-8"));
    response.json({
      success: true,
      sourceName: "data/fixtures/243/operbox_full_e2.json",
      operbox: sample,
    });
  } catch (error) {
    response.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/plan", async (request, response) => {
  let runDir = "";
  const startedAt = new Date().toISOString();
  const start = performance.now();

  try {
    assertPlanBody(request.body);

    const cliPath = resolveCliPath();
    const runId = randomUUID();
    runDir = path.join(tmpRoot, runId);
    await mkdir(runDir, { recursive: true });

    const layoutPath = path.join(runDir, "layout.json");
    const operboxPath = path.join(runDir, "operbox.json");
    const profilePath = path.join(runDir, "profile.json");
    const maaPath = path.join(runDir, "maa.json");

    await writeFile(layoutPath, JSON.stringify(request.body.layout, null, 2), "utf-8");
    await writeFile(operboxPath, JSON.stringify(request.body.operbox, null, 2), "utf-8");

    const args = [
      "plan",
      "--layout",
      layoutPath,
      "--operbox",
      operboxPath,
      "--profile-out",
      profilePath,
      "--maa-out",
      maaPath,
    ];
    const spawnResult = await spawnCli(cliPath, args, coreRoot);
    const durationMs = Math.round(performance.now() - start);
    const profileJson = await readJsonIfExists(profilePath);
    const maaJson = await readJsonIfExists(maaPath);

    const success = spawnResult.code === 0 && Boolean(profileJson) && Boolean(maaJson);
    response.status(success ? 200 : 500).json({
      success,
      startedAt,
      durationMs,
      cliPath,
      command: `${cliPath} ${args.join(" ")}`,
      exitCode: spawnResult.code,
      signal: spawnResult.signal,
      stdout: spawnResult.stdout,
      stderr: spawnResult.stderr,
      profileJson,
      maaJson,
      debugBundle: {
        version: "beta-test-bundle-v1",
        startedAt,
        durationMs,
        cliPath,
        command: `${cliPath} ${args.join(" ")}`,
        exitCode: spawnResult.code,
        signal: spawnResult.signal,
        inputSummary: {
          layoutRooms: request.body.layout.rooms?.length ?? null,
          operboxCount: request.body.operbox.length,
          sourceName: request.body.sourceName ?? null,
        },
        layout: request.body.layout,
        operbox: request.body.operbox,
        profileJson,
        maaJson,
        stdout: spawnResult.stdout,
        stderr: spawnResult.stderr,
      },
      error: success
        ? undefined
        : [
            spawnResult.code !== 0 && `infra-cli exitCode=${spawnResult.code}`,
            !profileJson && "profile.json 未生成",
            !maaJson && "maa.json 未生成",
            spawnResult.stderr?.slice(0, 1200),
          ].filter(Boolean).join("\n"),
    });
  } catch (error) {
    response.status(400).json({
      success: false,
      startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (runDir) {
      await rm(runDir, { recursive: true, force: true });
    }
  }
});

app.listen(port, "127.0.0.1", () => {
  console.log(`beta API listening on http://127.0.0.1:${port}`);
});
