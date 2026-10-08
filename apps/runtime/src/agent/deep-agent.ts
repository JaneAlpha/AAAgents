import { enterpriseDir } from '../common/paths';
import { AgentContext } from './agent-context';
import { buildModel, extractJson } from './llm';
import { LlmConfig } from './llm-config';
import { analyzePrompt, conversePrompt } from './prompts';

type Messages = Array<{ role: 'user' | 'assistant'; content: string }>;
export type AgentMode = 'analyze' | 'converse';

async function createAgent(ctx: AgentContext, config: LlmConfig, mode: AgentMode): Promise<any> {
  const deep: any = await import('deepagents');
  const lg: any = await import('@langchain/langgraph');
  const model = await buildModel(config);

  // backend 根目录 = 企业工作区，虚拟路径 /skills /data 等直接映射到真实文件
  const backend = new deep.FilesystemBackend({
    rootDir: enterpriseDir(ctx.enterprise_id),
    virtualMode: true,
  });

  return deep.createDeepAgent({
    model,
    systemPrompt: mode === 'analyze' ? analyzePrompt(ctx) : conversePrompt(ctx),
    skills: ['/skills/'],
    backend,
    checkpointer: new lg.MemorySaver(),
  });
}

function lastText(result: any): string {
  const last = result.messages[result.messages.length - 1];
  const content = last?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((c: any) => (typeof c === 'string' ? c : c?.text ?? '')).join('');
  }
  return String(content ?? '');
}

/** 分析模式（一次性）：返回解析后的 JSON 结果。 */
export async function invokeLive(
  ctx: AgentContext,
  messages: Messages,
  sessionId: string,
  config: LlmConfig,
): Promise<unknown> {
  const agent = await createAgent(ctx, config, 'analyze');
  const result = await agent.invoke({ messages }, { configurable: { thread_id: sessionId } });
  return extractJson(lastText(result));
}

/** 对话模式：返回自由文本回复（智能体可在运行中读写工作区、维护记忆）。 */
export async function invokeConversation(
  ctx: AgentContext,
  messages: Messages,
  sessionId: string,
  config: LlmConfig,
): Promise<string> {
  const agent = await createAgent(ctx, config, 'converse');
  const result = await agent.invoke({ messages }, { configurable: { thread_id: sessionId } });
  return lastText(result);
}

/** 对话流式分片来源：think=思考（工具调用前的推理叙述），tool=工具活动，answer=最终回答 */
export type ChatSource = 'think' | 'tool' | 'answer';
export interface ChatChunk {
  delta: string;
  source: ChatSource;
}

/**
 * 对话模式（流式）并按阶段分类：
 * - 首个工具调用之前的模型叙述 → think
 * - 工具活动 → tool
 * - 之后的模型叙述 → answer
 * - 全程无工具调用时，全部叙述视为 answer（正常流式回答）
 */
export async function* invokeConversationStream(
  ctx: AgentContext,
  messages: Messages,
  sessionId: string,
  config: LlmConfig,
): AsyncGenerator<ChatChunk> {
  const agent = await createAgent(ctx, config, 'converse');
  let seenTool = false;
  let pending = '';
  let emitted = false;
  try {
    const stream: any = await agent.stream(
      { messages },
      { configurable: { thread_id: sessionId }, streamMode: 'messages' },
    );
    for await (const chunk of stream) {
      const parsed = extractChunk(chunk);
      if (!parsed) {
        continue;
      }
      emitted = true;
      if (parsed.source === 'tool') {
        if (pending) {
          yield { delta: pending, source: 'think' };
          pending = '';
        }
        seenTool = true;
        yield { delta: parsed.delta, source: 'tool' };
      } else if (seenTool) {
        yield { delta: parsed.delta, source: 'answer' };
      } else {
        pending += parsed.delta;
      }
    }
  } catch {
    // 走下面的兜底
  }

  if (pending) {
    yield { delta: pending, source: seenTool ? 'think' : 'answer' };
  }
  if (!emitted) {
    const reply = await invokeConversation(ctx, messages, sessionId, config);
    yield { delta: reply, source: 'answer' };
  }
}

/** 流式分片的来源：ai=模型推理叙述，tool=工具活动 */
export type ChunkSource = 'ai' | 'tool' | 'json';
export interface StreamChunk {
  delta: string;
  source: ChunkSource;
}

function messageSource(message: any): ChunkSource {
  const type = message?.type ?? message?._getType?.() ?? message?.getType?.();
  return type === 'tool' ? 'tool' : 'ai';
}

/** 从流式 chunk 中抽取文本增量与来源（导出以便单测） */
export function extractChunk(chunk: any): StreamChunk | null {
  const message = Array.isArray(chunk) ? chunk[0] : chunk;
  const content = message?.content;
  let delta = '';
  if (typeof content === 'string') {
    delta = content;
  } else if (Array.isArray(content)) {
    delta = content.map((c: any) => (typeof c === 'string' ? c : c?.text ?? '')).join('');
  }
  if (!delta) {
    return null;
  }
  return { delta, source: messageSource(message) };
}

/** 分析模式（流式）：逐段文本增量；失败则退化为一次性结果。 */
export async function* invokeLiveStream(
  ctx: AgentContext,
  messages: Messages,
  sessionId: string,
  config: LlmConfig,
): AsyncGenerator<StreamChunk> {
  const agent = await createAgent(ctx, config, 'analyze');
  let emitted = false;
  try {
    const stream: any = await agent.stream(
      { messages },
      { configurable: { thread_id: sessionId }, streamMode: 'messages' },
    );
    for await (const chunk of stream) {
      const parsed = extractChunk(chunk);
      if (parsed) {
        emitted = true;
        yield parsed;
      }
    }
  } catch {
    // 流式失败，走回退
  }
  if (!emitted) {
    const raw = await invokeLive(ctx, messages, sessionId, config);
    yield { delta: JSON.stringify(raw), source: 'json' };
  }
}
