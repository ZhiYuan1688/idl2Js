import { generateJsSdk } from './generator.js';

export { generateJsSdk };

/**
 * 主函数 - 提供简单的 API 用于生成 SDK
 * @param {string} idlPath IDL 文件路径
 * @param {Object} options 其他选项
 * @returns {Promise<string>} 生成的 SDK 路径
 */
export default async function idl2js(idlPath, options = {}) {
  return generateJsSdk({
    idlPath,
    ...options
  });
}