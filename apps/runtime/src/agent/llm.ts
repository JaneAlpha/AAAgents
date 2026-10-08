import { LlmConfig } from './llm-config';

/**
 * 构建模型实例。
 * DeepSeek 思考模式要求把 reasoning_content 回传，通用 OpenAI 客户端会丢弃它导致 400，
 * 故 DeepSeek 走专用集成 ChatDeepSeek；其余兼容 OpenAI 协议的网关走 ChatOpenAI。
 */
export async function buildModel(config: LlmConfig): Promise<any> {
  if (/deepseek\.com/i.test(config.base_url)) {
    const mod: any = await import('@langchain/deepseek');
    return new mod.ChatDeepSeek({
      model: config.model,
      apiKey: config.api_key,
      configuration: config.base_url ? { baseURL: config.base_url } : undefined,
    });
  }
  const mod: any = await import('@langchain/openai');
  return new mod.ChatOpenAI({
    model: config.model || '',
    apiKey: config.api_key || 'sk-noop',
    configuration: config.base_url ? { baseURL: config.base_url } : undefined,
  });
}

/** 从模型返回内容中提取 JSON 对象。 */
export function extractJson(content: unknown): unknown {
  if (typeof content !== 'string') {
    return content;
  }
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('无法从 Agent 输出中解析 JSON');
  }
}
