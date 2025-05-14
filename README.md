**idl2js – Anchor IDL → Pure JavaScript SDK**

1. 项目概述

   * **idl2js** 将 Solana Anchor IDL 一键转换为纯 JavaScript SDK，脱离 TypeScript 依赖，开箱即用。
   * 适合希望在 Node 环境或浏览器中直接调用 Anchor 程序、又不想引入 TS 构建链的开发者。

2. 主要特性

   * ✨ 自动推断 `programId`（亦可手动指定）。
   * 🎨 基于 `ora` 与 `chalk` 的友好终端 UI。
   * 🚀 同步与 **异步** 两套 API（v1.2 起默认异步）。
   * 📦 支持 **ESM** / **CommonJS** 双格式输出，可按需 Tree-Shaking。
   * 🔍 交互式 CLI，零参数快速生成；也可脚本化调用。
   * 🪶 零运行时依赖，仅用到 `@coral-xyz/anchor` 生成代码与 `esbuild` 转译。

3. 安装

   ```bash
   # 推荐全局安装便于命令行使用
   npm install -g idl2js

   # 或在项目内局部安装
   npm install idl2js --save-dev
   ```

4. 快速上手

   ```bash
   # 在包含 idl.json 的目录下
   idl2js                 # 默认读取 ./idl.json 并输出到 ./sdk-js

   # 指定 IDL 与输出格式
   idl2js ./my_idl.json -j ./client -f cjs
   ```

5. CLI 选项

   | 短标记 | 长标记 / 参数             | 说明                    | 默认值       |
   | --- | -------------------- | --------------------- | --------- |
   | -p  | --program-id <id>    | 手动指定 Program ID       | 自动推断      |
   | -j  | --js-out <dir>       | JavaScript 输出目录       | ./sdk-js  |
   | -f  | --format \<esm\|cjs> | 输出模块格式                | esm       |
   | -t  | --ts-out <dir>       | 临时 TypeScript 目录（调试用） | ./.tmp-ts |
   | -v  | --verbose            | 显示详细日志                | false     |
   | -i  | --interactive        | 交互式提问模式               | false     |

6. 编程式调用

   ```js
   import { generateJsSdk } from 'idl2js';

   await generateJsSdk({
     idlPath: './idl.json',
     programId: 'YourProgramPubkey',
     jsOutDir: './sdk',
     format: 'esm'
   });
   ```

7. 生成后如何使用

   ESM 项目：

   ```js
   import { MyProgram } from './sdk';
   const program = new MyProgram(connection, wallet);
   ```

   CommonJS 项目：

   ```js
   const { MyProgram } = require('./sdk');
   ```

8. 常见问题

   * *Q: anchor-client-gen 报错“failed to download crate index”？*
     A: 检查本地 Rust 环境与网络代理，或在 CI 中设置 `CARGO_NET_GIT_FETCH_WITH_CLI=true`。
   * *Q: 怎样支持浏览器?*
     A: esbuild 转换已启用目标 `es2022`，可通过 `--target es2020` 降级。若需 polyfill，请在打包器中注入 `buffer`、`stream` 等浏览器替代。


* Solana & Anchor 团队
* `esbuild`、`ora`、`chalk` 等优秀开源项目
