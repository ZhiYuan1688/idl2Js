/**
 * generator.js
 * ------------------------------------------------------------
 * 使用 anchor-client-gen 将 Anchor IDL 生成纯 JavaScript SDK
 * 简化版：使用 execSync 替代 spawn，解决 "Unreachable" 错误
 * ------------------------------------------------------------
 */

import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { globby } from "globby";
import { build } from "esbuild";
import chalk from "chalk";
import ora from "ora";
import logSymbols from "log-symbols";

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

  /* ---------- 使用 execSync 执行 anchor-client-gen --------------------- */
  const genTS = ora("生成 TypeScript 客户端...").start();
  try {
    // 构造命令行
    const isWin = process.platform === "win32";
    const cmd = `${isWin ? "npx.cmd" : "npx"} -y anchor-client-gen "${idlPath}" "${tsOutDir}" --program-id ${programId}`;
    
    if (verbose) ora().info(`执行命令: ${cmd}`);
    
    // 执行命令
    execSync(cmd, { 
      stdio: verbose ? "inherit" : "pipe",
      encoding: "utf8"
    });
    
    genTS.succeed("TypeScript 客户端 OK");
  } catch (error) {
    genTS.fail(`转换失败: ${error.message}`);
    throw error;
  }

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