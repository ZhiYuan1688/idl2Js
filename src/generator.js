/**
 * generate-sdk.js
 * ---------------
 * 使用anchor-client-gen 将 Anchor IDL 生成纯 JavaScript SDK。
 */

import { promises as fs } from "node:fs";
import { resolve, dirname } from "node:path";
import { globby } from "globby";
import { build } from "esbuild";
import chalk from "chalk";
import ora from "ora";
import logSymbols from "log-symbols";
import { spawn } from "node:child_process";

/* -------------------------------------------------------------------------- */
/* util: cross-platform spawn                                                 */
/* -------------------------------------------------------------------------- */
const run = (
  cmd,
  args,
  { stdio = "pipe", useShell = false } = {},
) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(cmd, args, { stdio, shell: useShell });
    let stderr = "";
    child.stderr?.on("data", (d) => (stderr += d));
    child.on("close", (code) =>
      code === 0
        ? resolveRun()
        : rejectRun(
            new Error(
              `Command ${cmd} ${args.join(
                " ",
              )} exited with code ${code}\n${stderr}`,
            ),
          ),
    );
    child.on("error", rejectRun);
  });

/* -------------------------------------------------------------------------- */
/* 从 IDL 提取 programId                                                      */
/* -------------------------------------------------------------------------- */
export async function extractProgramIdFromIdl(idlPath) {
  try {
    const idl = JSON.parse(await fs.readFile(idlPath, "utf8"));
    return (idl?.metadata?.address ?? idl?.address ?? null)?.trim() ?? null;
  } catch (err) {
    console.error(`提取 programId 失败: ${err.message}`);
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
  /* ---------- 路径解析 & 基础检查 ---------------------------------------- */
  idlPath = resolve(idlPath);
  tsOutDir = resolve(tsOutDir);
  jsOutDir = resolve(jsOutDir);

  await fs.access(idlPath).catch(() => {
    throw new Error(`IDL 文件不存在: ${idlPath}`);
  });

  /* ---------- programId --------------------------------------------------- */
  if (!programId) {
    const spinner = ora("正在从 IDL 提取 programId...").start();
    programId = await extractProgramIdFromIdl(idlPath);
    if (programId) {
      spinner.succeed(`成功提取 programId: ${chalk.green(programId)}`);
    } else {
      spinner.warn(
        "无法从 IDL 提取 programId，将使用默认值: So11111111111111111111111111111111111111112",
      );
      programId = "So11111111111111111111111111111111111111112";
    }
  }

  /* ---------- 清理旧输出目录 --------------------------------------------- */
  const cleanSpinner = ora("清理旧目录...").start();
  try {
    await Promise.all([
      fs.rm(tsOutDir, { recursive: true, force: true }).catch(() => {}),
      fs.rm(jsOutDir, { recursive: true, force: true }).catch(() => {}),
    ]);
    await Promise.all([
      fs.mkdir(tsOutDir, { recursive: true }),
      fs.mkdir(jsOutDir, { recursive: true }),
    ]);
    cleanSpinner.succeed("目录清理完成");
  } catch (err) {
    cleanSpinner.fail(`目录清理失败: ${err.message}`);
    throw err;
  }

  /* ---------- 调用 anchor-client-gen ------------------------------------- */
  const genSpinner = ora(
    "使用 anchor-client-gen 生成 TypeScript 客户端...",
  ).start();
  try {
    const binDir = resolve(process.cwd(), "node_modules", ".bin");
    const cmdStub = resolve(binDir, "anchor-client-gen.cmd");
    const shStub = resolve(binDir, "anchor-client-gen"); // bash stub
    const pkgDir = resolve(process.cwd(), "node_modules", "anchor-client-gen");

    let runner; // 可执行文件
    let args; // 参数
    let opts; // spawn 选项

    /* ---- Windows：优先使用 .cmd -------------------------------------- */
    if (
      process.platform === "win32" &&
      (await fs.access(cmdStub).then(() => true).catch(() => false))
    ) {
      runner = cmdStub;
      args = [idlPath, tsOutDir, "--program-id", programId];
      opts = { stdio: verbose ? "inherit" : "pipe", useShell: true };
    } else {
      /* ---- 其他平台 / 回退到 JS 入口 -------------------------------- */
      let jsEntry = shStub; // bash stub 里的 shebang 指向真实 JS

      const exists = await fs
        .access(jsEntry)
        .then(() => true)
        .catch(() => false);

      if (!exists) {
        const pkgJson = JSON.parse(
          await fs.readFile(resolve(pkgDir, "package.json"), "utf8"),
        );
        const binField =
          typeof pkgJson.bin === "string"
            ? pkgJson.bin
            : pkgJson.bin?.["anchor-client-gen"] ?? "";
        jsEntry = resolve(pkgDir, binField);
      }

      runner = process.execPath; // 当前 node
      args = [jsEntry, idlPath, tsOutDir, "--program-id", programId];
      opts = { stdio: verbose ? "inherit" : "pipe" };
    }

    if (verbose) ora().info(`执行命令: ${runner} ${args.join(" ")}`);
    await run(runner, args, opts);
    genSpinner.succeed("TypeScript 客户端生成完成");
  } catch (err) {
    genSpinner.fail(`TypeScript 客户端生成失败: ${err.message}`);
    throw err;
  }

  /* ---------- 收集 TS 文件 ---------------------------------------------- */
  const collectSpinner = ora("收集 TypeScript 文件...").start();
  let entryPoints;
  try {
    entryPoints = await globby(["**/*.ts"], {
      cwd: tsOutDir,
      absolute: true,
    });
    collectSpinner.succeed(
      `找到 ${chalk.cyan(entryPoints.length)} 个 TypeScript 文件`,
    );
  } catch (err) {
    collectSpinner.fail(`TypeScript 文件收集失败: ${err.message}`);
    throw err;
  }

  /* ---------- esbuild 转 JS --------------------------------------------- */
  const buildSpinner = ora("使用 esbuild 转换为 JavaScript...").start();
  try {
    await build({
      entryPoints,
      outdir: jsOutDir,
      platform: "node",
      format,
      target,
      bundle: false,
      sourcemap: false,
    });
    buildSpinner.succeed("JavaScript 转换完成");
  } catch (err) {
    buildSpinner.fail(`JavaScript 转换失败: ${err.message}`);
    throw err;
  }

  /* ---------- 清理临时 TS 目录 ------------------------------------------- */
  const cleanupSpinner = ora("清理临时 TypeScript 文件...").start();
  try {
    await fs.rm(tsOutDir, { recursive: true, force: true });
    cleanupSpinner.succeed("临时文件清理完成");
  } catch (err) {
    cleanupSpinner.warn(`临时文件清理失败，但这不影响最终结果: ${err.message}`);
  }

  /* ---------- 完成 ------------------------------------------------------- */
  console.log(
    "\n",
    logSymbols.success,
    chalk.bold.green(` 已成功生成纯 JavaScript SDK → ${chalk.blue(jsOutDir)}`),
  );
  return jsOutDir;
}

/* -------------------------------------------------------------------------- */
/* 示例 CLI                                                                   */
/* -------------------------------------------------------------------------- */
if (process.argv[1] === new URL(import.meta.url).pathname) {
  // 允许直接 `node generate-sdk.js` 运行
  generateJsSdk({ verbose: true }).catch((e) => {
    console.error(chalk.red(e.stack || e.message));
    process.exitCode = 1;
  });
}
