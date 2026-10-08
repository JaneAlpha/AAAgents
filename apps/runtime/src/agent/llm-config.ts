import { promises as fs } from 'fs';
import { join } from 'path';
import { workspaceRoot } from '../common/paths';

export interface LlmConfig {
  base_url: string;
  model: string;
  api_key: string;
}

/** 共享配置文件路径：business 后台写入，runtime 读取。 */
export function llmConfigFile(): string {
  return join(workspaceRoot(), '_shared', 'llm-config.json');
}

/**
 * 配置优先级：共享配置文件 > 环境变量 > 默认值。
 * 后台改配置后无需重启 runtime，下次请求即生效。
 * 推理必须由真实大模型完成——不存在离线/mock 路径。
 */
export async function loadLlmConfig(): Promise<LlmConfig> {
  let fileCfg: Partial<LlmConfig> = {};
  try {
    fileCfg = JSON.parse(await fs.readFile(llmConfigFile(), 'utf8'));
  } catch {
    fileCfg = {};
  }
  return {
    base_url: fileCfg.base_url || process.env.LLM_BASE_URL || '',
    model: fileCfg.model || process.env.LLM_MODEL || '',
    api_key: fileCfg.api_key || process.env.LLM_API_KEY || '',
  };
}
