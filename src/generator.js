/**
 * generate-sdk.js
 * ------------------------------------------------------------
 * 使用 anchor-client-gen 将 Anchor IDL 生成纯 JavaScript SDK。
 * ★ 关键特性
 *   1. 优先本地 node_modules/.bin
 *   2. 能识别 PATH 中的全局安装
 *   3. 覆盖常见 UNIX 全局目录（PATH 不规范时也能找到）
 *   4. 最终 fallback：自动 npx -y anchor-client-gen …
 *      —— 首次使用也能直接跑通，无需手动安装
 *   5. 查找逻辑封装成 findAnchorClientGen()，主流程更清晰
 * ------------------------------------------------------------
 * 2025‑05‑14
 */

import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { globby } from "globby";
import { build } from "esbuild";
import chalk from "chalk";
import ora from "ora";
import logSymbols from "log-symbols";
import { spawn } from "node:child_process";

/* -------------------------------------------------------------------------- */
/* util: cross‑platform spawn                                                 */
/* -------------------------------------------------------------------------- */
const run = (cmd, args = [], { stdio = "pipe", shell = false } = {}) =>
  new Promise((ok, fail) => {
    const child = spawn(cmd, args, { stdio, shell });
    let stderr = "";
    child.stderr?.on("data", (d) => (stderr += d));
    child.on("close", (code) =>
      code === 0 ? ok() : fail(new Error(`Command ${cmd} ${args.join(" ")} → ${code}\n${stderr}`)),
    );
    child.on("error", fail);
  });

/* -------------------------------------------------------------------------- */
/* 从 IDL 提取 programId                                                      */
/* -------------------------------------------------------------------------- */
export async function extractProgramIdFromIdl(idlPath) {
  try {
    const idl = JSON.parse(await fs.readFile(idlPath, "utf8"));
    return (idl?.metadata?.address ?? idl?.address ?? "").trim() || null;
  } catch (e) {
    console.error(`提取 programId 失败: ${e.message}`);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* 查找 / 生成 anchor‑client‑gen 运行命令                                      */
/* -------------------------------------------------------------------------- */
async function findAnchorClientGen({ verbose = false } = {}) {
  const isWin = process.platform === "win32";
  const cmdName = isWin ? "anchor-client-gen.cmd" : "anchor-client-gen";

  const candidatePaths = [
    // 1. 本地 node_modules/.bin
    resolve(process.cwd(), "node_modules", ".bin", cmdName),
    // 2. 直接依赖 PATH
    cmdName,
  ];

  if (!isWin) {
    candidatePaths.push(
      "/usr/local/bin/anchor-client-gen",
      "/usr/bin/anchor-client-gen",
      `${process.env.HOME}/.npm-global/bin/anchor-client-gen`,
      `${process.env.HOME}/.yarn/bin/anchor-client-gen`,
      `${process.env.NVM_BIN || ""}/anchor-client-gen`,
    );
  }

  if (verbose) {
    ora().info("⛳️ 尝试以下位置查找 anchor-client-gen:");
    candidatePaths.forEach((p) => ora().info(`  • ${p}`));
  }

  // 检测 helper: 存在则返回 true
  const exists = async (p) =>
    p === cmdName
      ? // 直接命令名 ➜ 用 where/which 测试 PATH
        run(isWin ? "where" : "which", [cmdName], { stdio: "ignore", shell: true }).then(
          () => true,
          () => false,
        )
      : fs.access(p).then(
          () => true,
          () => false,
        );

  for (const p of candidatePaths) {
    if (await exists(p)) {
      if (verbose) ora().info(`✅ 采用: ${p}`);
      return { cmd: p, argsPrefix: [], useShell: p === cmdName }; // PATH 下的命令需 shell
    }
  }

  /* ---------- 最后手段: npx 自动下载执行 -------------------------------- */
  const npxCmd = isWin ? "npx.cmd" : "npx";
  if (verbose) ora().info("⚠️ 本地 / 全局未安装，使用 npx 即时执行");
  return { cmd: npxCmd, argsPrefix: ["-y", "anchor-client-gen"], useShell: true };
}

/* -------------------------------------------------------------------------- */
/* 生成 JS SDK                                                                */
/* -------------------------------------------------------------------------- */
export async function generateJsSdk({
  idlPath = "./idl.json",
  programId = null,
  tsOutDir = "./.tmp-ts",
  jsOutDir = "./sdk-js",
  format = "esm",
  target = "es2022",
  verbose = false,
} = {}) {
  /* ---------- 路径解析 & 基础检查 -------------------------------------- */
  idlPath = resolve(idlPath);
  tsOutDir = resolve(tsOutDir);
  jsOutDir = resolve(jsOutDir);
  await fs.access(idlPath).catch(() => {
    throw new Error(`IDL 文件不存在: ${idlPath}`);
  });

  /* ---------- programId ------------------------------------------------- */
  if (!programId) {
    const s = ora("提取 programId...").start();
    programId = await extractProgramIdFromIdl(idlPath);
    if (programId) s.succeed(`programId: ${chalk.green(programId)}`);
    else {
      s.warn("未在 IDL 里找到 address, 使用默认 So111... ");
      programId = "So11111111111111111111111111111111111111112";
    }
  }

  /* ---------- 清理输出目录 --------------------------------------------- */
  const clean = ora("清理旧目录...").start();
  await Promise.all([
    fs.rm(tsOutDir, { recursive: true, force: true }).catch(() => {}),
    fs.rm(jsOutDir, { recursive: true, force: true }).catch(() => {}),
  ]);
  await Promise.all([
    fs.mkdir(tsOutDir, { recursive: true }),
    fs.mkdir(jsOutDir, { recursive: true }),
  ]);
  clean.succeed("目录准备完成");

  /* ---------- 找 anchor-client-gen ------------------------------------- */
  const { cmd: acgCmd, argsPrefix, useShell } = await findAnchorClientGen({ verbose });

  /* ---------- 调用生成 TS 客户端 --------------------------------------- */
  const genTS = ora("生成 TypeScript 客户端...").start();
  const acgArgs = [...argsPrefix, idlPath, tsOutDir, "--program-id", programId];
  if (verbose) ora().info(`$ ${acgCmd} ${acgArgs.join(" ")}`);
  await run(acgCmd, acgArgs, { stdio: verbose ? "inherit" : "pipe", shell: useShell });
  genTS.succeed("TypeScript 客户端 OK");

  /* ---------- esbuild JS ------------------------------------------------ */
  const tsFiles = await globby(["**/*.ts"], { cwd: tsOutDir, absolute: true });
  await build({
    entryPoints: tsFiles,
    outdir: jsOutDir,
    platform: "node",
    format,
    target,
    bundle: false,
    sourcemap: false,
  });
  ora().succeed(`已输出 JS 文件: ${chalk.cyan(tsFiles.length)}`);

  /* ---------- 清理临时目录 --------------------------------------------- */
  await fs.rm(tsOutDir, { recursive: true, force: true }).catch(() => {});

  console.log(
    logSymbols.success,
    chalk.green.bold(`生成完成 → ${chalk.blue(jsOutDir)}`),
  );
  return jsOutDir;
}

/* -------------------------------------------------------------------------- */
/* CLI 入口                                                                    */
/* -------------------------------------------------------------------------- */
if (process.argv[1] === new URL(import.meta.url).pathname) {
  generateJsSdk({ verbose: true }).catch((e) => {
    console.error(chalk.red(e.stack || e.message));
    process.exitCode = 1;
  });
}
