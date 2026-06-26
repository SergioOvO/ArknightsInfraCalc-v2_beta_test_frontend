import express from "express";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const bundledCliRoot = path.join(repoRoot, "bin");
const bundledFixtureRoot = path.join(repoRoot, "fixtures");
const coreRoot = path.resolve(process.env.INFRA_CORE_ROOT || path.join(repoRoot, "..", "ArknightsInfraCalc-v2"));
const storageRoot = path.resolve(process.env.BETA_STORAGE_DIR || path.join(repoRoot, "server", "storage"));
const feedbackRoot = path.resolve(process.env.BETA_FEEDBACK_DIR || path.join(storageRoot, "feedback"));
const cliRunRoot = path.resolve(process.env.BETA_CLI_RUN_DIR || path.join(storageRoot, "cli-runs"));
const port = Number(process.env.BETA_API_PORT || 4174);
const host = process.env.BETA_API_HOST || "0.0.0.0";
const timeoutMs = Number(process.env.BETA_CLI_TIMEOUT_MS || 120_000);
const distRoot = path.join(repoRoot, "dist");

const app = express();
app.use(express.json({ limit: "80mb" }));

function cliCandidates() {
  const platformCliName = process.platform === "win32" ? "infra-cli.exe" : "infra-cli";
  const fallbackCliName = process.platform === "win32" ? "infra-cli" : "infra-cli.exe";
  const candidates = [
    process.env.INFRA_CLI_PATH,
    path.join(bundledCliRoot, platformCliName),
    path.join(repoRoot, platformCliName),
    path.join(bundledCliRoot, fallbackCliName),
    path.join(repoRoot, fallbackCliName),
    path.join(coreRoot, "target", "release", platformCliName),
    path.join(coreRoot, "target", "debug", platformCliName),
    path.join(coreRoot, "target", "release", fallbackCliName),
    path.join(coreRoot, "target", "debug", fallbackCliName),
  ].filter(Boolean);

  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

function resolveCliPath() {
  const candidates = cliCandidates();
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`没有找到 infra-cli，已检查：${candidates.join(", ")}`);
  }
  return found;
}

function resolveSampleOperboxPath() {
  const candidates = [
    path.join(bundledFixtureRoot, "operbox_full_e2.json"),
    path.join(bundledFixtureRoot, "243", "operbox_full_e2.json"),
    path.join(coreRoot, "data", "fixtures", "243", "operbox_full_e2.json"),
  ].map((candidate) => path.resolve(candidate));

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`没有找到样例 operbox，已检查：${candidates.join(", ")}`);
  }
  return found;
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

function assertFeedbackBody(body) {
  if (!isObject(body) || !isObject(body.issue)) {
    throw new Error("请求缺少 issue 对象。");
  }
  if (!Array.isArray(body.operbox) || body.operbox.length === 0) {
    throw new Error("请求缺少对应的非空 operbox 数组。");
  }
}

function safePathSegment(value) {
  return String(value ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 48);
}

function makeStampedDirName(stamp, sourceName, id) {
  return [stamp.replace(/[:.]/g, "-"), safePathSegment(sourceName), id].filter(Boolean).join("_");
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function spawnCli(exePath, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(exePath, args, { cwd, windowsHide: true, shell: false });
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

function parseTrailingJson(value) {
  const start = value.lastIndexOf("\n{");
  const jsonText = start >= 0 ? value.slice(start + 1) : value.slice(value.indexOf("{"));
  if (!jsonText.trim().startsWith("{")) return undefined;

  try {
    return JSON.parse(jsonText);
  } catch {
    return undefined;
  }
}

app.get("/api/health", (_request, response) => {
  try {
    const candidates = cliCandidates();
    const cliPath = candidates.find((candidate) => existsSync(candidate));
    const samplePath = (() => {
      try {
        return resolveSampleOperboxPath();
      } catch {
        return null;
      }
    })();
    response.status(200).json({
      ok: true,
      apiReady: true,
      cliReady: Boolean(cliPath),
      cliPath: cliPath ?? null,
      candidates,
      coreRoot,
      repoRoot,
      bundledCliRoot,
      samplePath,
      storageRoot,
      feedbackRoot,
      cliRunRoot,
    });
  } catch (error) {
    response.status(200).json({
      ok: true,
      apiReady: true,
      cliReady: false,
      cliPath: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/sample-operbox", async (_request, response) => {
  try {
    const samplePath = resolveSampleOperboxPath();
    const sample = JSON.parse(await readFile(samplePath, "utf-8"));
    response.json({
      success: true,
      sourceName: path.relative(repoRoot, samplePath),
      operbox: sample,
    });
  } catch (error) {
    response.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/feedback", async (request, response) => {
  const savedAt = new Date().toISOString();

  try {
    assertFeedbackBody(request.body);

    const feedbackId = randomUUID();
    const dirName = makeStampedDirName(savedAt, request.body.sourceName, feedbackId);
    const feedbackDir = path.join(feedbackRoot, dirName);
    const metaPath = path.join(feedbackDir, "meta.json");
    const issuePath = path.join(feedbackDir, "issue.json");
    const operboxPersistPath = path.join(feedbackDir, "operbox.json");
    const debugBundlePath = path.join(feedbackDir, "debug-bundle.json");
    await mkdir(feedbackDir, { recursive: true });

    const meta = {
      feedbackId,
      savedAt,
      sourceName: request.body.sourceName ?? null,
      operboxCount: request.body.operbox.length,
      hasDebugBundle: isObject(request.body.debugBundle),
    };

    await writeJson(metaPath, meta);
    await writeJson(issuePath, request.body.issue);
    await writeJson(operboxPersistPath, request.body.operbox);

    if (isObject(request.body.debugBundle)) {
      await writeJson(debugBundlePath, request.body.debugBundle);
    }

    response.json({
      success: true,
      feedbackId,
      savedAt,
      path: feedbackDir,
      relativePath: path.relative(repoRoot, feedbackDir),
      issuePath,
      operboxPath: operboxPersistPath,
      debugBundlePath: isObject(request.body.debugBundle) ? debugBundlePath : undefined,
      relativeIssuePath: path.relative(repoRoot, issuePath),
      relativeOperboxPath: path.relative(repoRoot, operboxPersistPath),
      relativeDebugBundlePath: isObject(request.body.debugBundle) ? path.relative(repoRoot, debugBundlePath) : undefined,
    });
  } catch (error) {
    response.status(400).json({
      success: false,
      savedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/plan", async (request, response) => {
  let runDir = "";
  let resultPath = "";
  const startedAt = new Date().toISOString();
  const start = performance.now();

  try {
    assertPlanBody(request.body);

    const cliPath = resolveCliPath();
    const runId = randomUUID();
    runDir = path.join(cliRunRoot, makeStampedDirName(startedAt, request.body.sourceName, runId));
    await mkdir(runDir, { recursive: true });

    const layoutPath = path.join(runDir, "layout.json");
    const operboxPath = path.join(runDir, "operbox.json");
    const maaPath = path.join(runDir, "maa.json");
    const rotationPath = path.join(runDir, "rotation.json");
    const debugBundlePath = path.join(runDir, "debug-bundle.json");
    const stdoutPath = path.join(runDir, "stdout.txt");
    const stderrPath = path.join(runDir, "stderr.txt");
    const commandPath = path.join(runDir, "command.txt");
    resultPath = path.join(runDir, "result.json");

    await writeJson(layoutPath, request.body.layout);
    await writeJson(operboxPath, request.body.operbox);

    const args = [
      "layout",
      "team-rotation",
      "--json",
      "--layout",
      layoutPath,
      "--operbox",
      operboxPath,
      "--maa-out",
      maaPath,
    ];
    const command = `${cliPath} ${args.join(" ")}`;
    await writeFile(commandPath, command, "utf-8");

    const spawnResult = await spawnCli(cliPath, args, repoRoot);
    const durationMs = Math.round(performance.now() - start);
    const maaJson = await readJsonIfExists(maaPath);
    const rotationJson = parseTrailingJson(spawnResult.stdout);
    if (rotationJson) {
      await writeJson(rotationPath, rotationJson);
    }
    await writeFile(stdoutPath, spawnResult.stdout, "utf-8");
    await writeFile(stderrPath, spawnResult.stderr, "utf-8");

    const success = spawnResult.code === 0 && Boolean(maaJson) && Boolean(rotationJson);
    const debugBundle = {
      version: "beta-test-bundle-v1",
      startedAt,
      durationMs,
      cliPath,
      command,
      exitCode: spawnResult.code,
      signal: spawnResult.signal,
      inputSummary: {
        layoutRooms: request.body.layout.rooms?.length ?? null,
        operboxCount: request.body.operbox.length,
        sourceName: request.body.sourceName ?? null,
      },
      layout: request.body.layout,
      operbox: request.body.operbox,
      maaJson,
      rotationJson,
      stdout: spawnResult.stdout,
      stderr: spawnResult.stderr,
      savedFiles: {
        runDir: path.relative(repoRoot, runDir),
        layout: path.relative(repoRoot, layoutPath),
        operbox: path.relative(repoRoot, operboxPath),
        maa: path.relative(repoRoot, maaPath),
        rotation: rotationJson ? path.relative(repoRoot, rotationPath) : undefined,
        debugBundle: path.relative(repoRoot, debugBundlePath),
        stdout: path.relative(repoRoot, stdoutPath),
        stderr: path.relative(repoRoot, stderrPath),
        command: path.relative(repoRoot, commandPath),
        result: path.relative(repoRoot, resultPath),
      },
    };
    await writeJson(debugBundlePath, debugBundle);

    const resultPayload = {
      success,
      startedAt,
      durationMs,
      cliPath,
      command,
      exitCode: spawnResult.code,
      signal: spawnResult.signal,
      stdout: spawnResult.stdout,
      stderr: spawnResult.stderr,
      maaJson,
      rotationJson,
      debugBundle,
      runId,
      runPath: runDir,
      relativeRunPath: path.relative(repoRoot, runDir),
      resultPath,
      relativeResultPath: path.relative(repoRoot, resultPath),
      error: success
        ? undefined
        : [
            spawnResult.code !== 0 && `infra-cli exitCode=${spawnResult.code}`,
            !maaJson && "maa.json 未生成",
            !rotationJson && "--json 输出未解析",
            spawnResult.stderr?.slice(0, 1200),
          ].filter(Boolean).join("\n"),
    };
    await writeJson(resultPath, resultPayload);

    response.status(success ? 200 : 500).json(resultPayload);
  } catch (error) {
    const errorPayload = {
      success: false,
      startedAt,
      error: error instanceof Error ? error.message : String(error),
      runPath: runDir || undefined,
      relativeRunPath: runDir ? path.relative(repoRoot, runDir) : undefined,
    };
    if (resultPath) {
      await writeJson(resultPath, errorPayload);
    }
    response.status(400).json(errorPayload);
  }
});

if (existsSync(distRoot)) {
  app.use(express.static(distRoot));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(distRoot, "index.html"));
  });
}

app.listen(port, host, () => {
  console.log(`beta app listening on http://${host}:${port}`);
});
