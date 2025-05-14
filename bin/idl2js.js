#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateJsSdk } from '../src/generator.js';
import figlet from 'figlet';

const program = new Command();

// 版本信息从 package.json 中获取
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
);

console.log(chalk.cyan(figlet.textSync('idl2js', { font: 'Standard' })));
console.log(chalk.gray(`v${packageJson.version} - Anchor IDL → Pure JavaScript\n`));

program
  .name('idl2js')
  .description('将 Anchor IDL 转换为纯 JavaScript SDK，无需 TypeScript 编译')
  .version(packageJson.version)
  .argument('[idlPath]', 'IDL 文件路径', './idl.json')
  .option('-p, --program-id <id>', '程序 ID')
  .option('-t, --ts-out <dir>', 'TypeScript 输出目录', './.tmp-ts')
  .option('-j, --js-out <dir>', 'JavaScript 输出目录', './sdk-js')
  .option('-f, --format <format>', '输出格式 (esm 或 cjs)', 'esm')
  .option('--target <target>', 'JavaScript 目标版本', 'es2022')
  .option('-v, --verbose', '显示详细日志', false)
  .option('-i, --interactive', '交互式配置', false)
  .action(async (idlPath, options) => {    
    // 如果选择了交互式模式，通过问询用户获取配置
    if (options.interactive) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'idlPath',
          message: 'IDL 文件路径:',
          default: idlPath,
          validate: (input) => {
            if (!existsSync(resolve(input))) {
              return '文件不存在，请提供有效路径';
            }
            return true;
          }
        },
        {
          type: 'input',
          name: 'programId',
          message: 'Program ID (留空自动提取):',
          default: options.programId || ''
        },
        {
          type: 'input',
          name: 'jsOut',
          message: 'JavaScript 输出目录:',
          default: options.jsOut
        },
        {
          type: 'list',
          name: 'format',
          message: '输出格式:',
          choices: ['esm', 'cjs'],
          default: options.format
        }
      
      ]);
      
      // 合并回答到选项
      idlPath = answers.idlPath;
      options.programId = answers.programId || options.programId;
      options.jsOut = answers.jsOut;
      options.format = answers.format;
    }

    try {
      await generateJsSdk({
        idlPath,
        programId: options.programId,
        tsOutDir: options.tsOut,
        jsOutDir: options.jsOut,
        format: options.format,
        target: options.target,
        verbose: options.verbose
      });
      
      console.log(chalk.bold('\n📚 使用方法:'));
      console.log(chalk.gray('在你的项目中:'));
      
      if (options.format === 'esm') {
        console.log(chalk.green(`
// ESM 导入方式
import { SomeProgram } from './${options.jsOut}';

// 使用 SDK
const program = new SomeProgram(connection, wallet);
`));
      } else {
        console.log(chalk.green(`
// CommonJS 导入方式
const { SomeProgram } = require('./${options.jsOut}');

// 使用 SDK
const program = new SomeProgram(connection, wallet);
`));
      }
      
    } catch (error) {
      console.error(chalk.red(`\n❌ 转换失败: ${error.message}`));
      process.exit(1);
    }
  });

program.parse();