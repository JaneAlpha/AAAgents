import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { dataDir } from '../common/paths';
import { HedgeAdvice } from '../output/hedge-advice.schema';
import { OutputService } from '../output/output.service';
import { ChatMessage, SessionStore } from '../session/session.store';
import { AgentContext } from './agent-context';
import { invokeConversation, invokeConversationStream, invokeLive, invokeLiveStream, StreamChunk } from './deep-agent';
import { extractJson } from './llm';
import { LlmConfig, loadLlmConfig } from './llm-config';

/** 智能体自主维护的两份记忆文档 */
const MEMORY_FILES = ['长期记忆.md', '日常状态.md'];

export interface ChatInput {
  enterprise_id: string;
  message: string;
  session_id?: string;
  author?: 'user' | 'system';
}

export interface ChatOutput {
  session_id: string;
  author: string;
  reply: string;
  memory_updates: string[];
}

export interface RunInput {
  enterprise_id: string;
  user_request: string;
  session_id?: string;
}

export interface RunOutput {
  session_id: string;
  model: string;
  attempts: number;
  result: HedgeAdvice;
}

export type AgentEvent =
  | { type: 'start'; data: { session_id: string; model: string; variety: string } }
  | { type: 'token'; data: { delta: string; attempt: number; source: StreamChunk['source'] } }
  | { type: 'attempt'; data: { attempt: number; errors: string[] } }
  | { type: 'result'; data: RunOutput }
  | { type: 'error'; data: { message: string } };

/** 对话流式事件 */
export type ChatEvent =
  | { type: 'start'; data: { session_id: string; model: string; author: string } }
  | { type: 'token'; data: { delta: string; source: 'think' | 'tool' | 'answer' } }
  | { type: 'memory'; data: { files: string[] } }
  | { type: 'result'; data: ChatOutput }
  | { type: 'error'; data: { message: string } };

const MAX_ATTEMPTS = 3;

@Injectable()
export class AgentService {
  private readonly sessions = new SessionStore();
  private readonly baseUrl = process.env.BUSINESS_URL || 'http://business:3000';

  constructor(private readonly output: OutputService) {}

  getConfig(): Promise<LlmConfig> {
    return loadLlmConfig();
  }

  private async loadContext(enterpriseId: string): Promise<AgentContext> {
    const [entRes, skillRes] = await Promise.all([
      fetch(`${this.baseUrl}/admin/enterprises/${encodeURIComponent(enterpriseId)}`),
      fetch(`${this.baseUrl}/skill/${encodeURIComponent(enterpriseId)}`),
    ]);
    if (!entRes.ok) {
      throw new NotFoundException('企业不存在或业务服务不可达');
    }
    const enterprise: any = await entRes.json();
    const skill: any = skillRes.ok ? await skillRes.json() : {};
    return {
      enterprise_id: enterpriseId,
      enterprise_name: enterprise.name,
      variety: enterprise.variety,
      skill_path: skill.skill_path || '',
    };
  }

  private feedback(errors: string[]): string {
    return `输出不符合 hedge_advice schema，请修正后仅返回 JSON：${errors.join('; ')}`;
  }

  /** 读取两份记忆文档的当前内容，用于检测智能体是否更新了它们。 */
  private async memoryState(enterpriseId: string): Promise<Record<string, string>> {
    const dir = dataDir(enterpriseId);
    const state: Record<string, string> = {};
    for (const name of MEMORY_FILES) {
      try {
        state[name] = await fs.readFile(join(dir, name), 'utf8');
      } catch {
        state[name] = '';
      }
    }
    return state;
  }

  /**
   * 对话模式（流式）。事件：
   * start → token(source=think|tool|answer) → memory(本轮更新的记忆文件) → result
   * 记忆维护为内部动作，单独以 memory 事件告知前端展示，不进入回复正文。
   */
  async *chatStream(input: ChatInput): AsyncGenerator<ChatEvent> {
    const config = await this.getConfig();
    const ctx = await this.loadContext(input.enterprise_id);
    const sessionId = input.session_id || randomUUID();
    const history = await this.sessions.load(input.enterprise_id, sessionId);
    const author = input.author || 'user';
    const content = author === 'system' ? `[系统/数据层] ${input.message}` : input.message;

    yield { type: 'start', data: { session_id: sessionId, model: config.model, author } };

    const before = await this.memoryState(input.enterprise_id);
    const messages: ChatMessage[] = [...history, { role: 'user', content }];
    let answer = '';
    try {
      for await (const chunk of invokeConversationStream(ctx, messages, sessionId, config)) {
        if (chunk.source === 'answer') {
          answer += chunk.delta;
        }
        yield { type: 'token', data: { delta: chunk.delta, source: chunk.source } };
      }
    } catch (err) {
      yield { type: 'error', data: { message: (err as Error).message } };
      return;
    }

    const after = await this.memoryState(input.enterprise_id);
    const memoryUpdates = MEMORY_FILES.filter((name) => before[name] !== after[name]);
    await this.sessions.save(input.enterprise_id, sessionId, [
      ...messages,
      { role: 'assistant', content: answer },
    ]);

    yield { type: 'memory', data: { files: memoryUpdates } };
    yield {
      type: 'result',
      data: { session_id: sessionId, author, reply: answer, memory_updates: memoryUpdates },
    };
  }

  /**
   * 统一对话入口。作者为 user（用户）或 system（数据层）。
   * 智能体在对话中自主查阅 /data/ 资料并维护两份记忆文档；返回本轮被修改的记忆文件。
   */
  async chat(input: ChatInput): Promise<ChatOutput> {
    const config = await this.getConfig();
    const ctx = await this.loadContext(input.enterprise_id);
    const sessionId = input.session_id || randomUUID();
    const history = await this.sessions.load(input.enterprise_id, sessionId);
    const author = input.author || 'user';
    const content = author === 'system' ? `[系统/数据层] ${input.message}` : input.message;

    const before = await this.memoryState(input.enterprise_id);
    const messages: ChatMessage[] = [...history, { role: 'user', content }];
    const reply = await invokeConversation(ctx, messages, sessionId, config);
    const after = await this.memoryState(input.enterprise_id);
    const memoryUpdates = MEMORY_FILES.filter((name) => before[name] !== after[name]);

    await this.sessions.save(input.enterprise_id, sessionId, [
      ...messages,
      { role: 'assistant', content: reply },
    ]);

    return { session_id: sessionId, author, reply, memory_updates: memoryUpdates };
  }

  /** 同步运行：调用真实大模型得到完整输出 → 校验 → 失败回灌重试 → 返回结构化结果。 */
  async run(input: RunInput): Promise<RunOutput> {
    const config = await this.getConfig();
    const ctx = await this.loadContext(input.enterprise_id);
    const sessionId = input.session_id || randomUUID();
    const history = await this.sessions.load(input.enterprise_id, sessionId);
    const messages: ChatMessage[] = [...history, { role: 'user', content: input.user_request }];

    let data: HedgeAdvice | null = null;
    let attempts = 0;
    let lastErrors: string[] = [];

    while (attempts < MAX_ATTEMPTS) {
      let raw: unknown;
      try {
        raw = await invokeLive(ctx, messages, sessionId, config);
      } catch (err) {
        attempts += 1;
        lastErrors = [(err as Error).message];
        messages.push({ role: 'user', content: `上一次模型调用失败：${(err as Error).message}。请重新给出符合 hedge_advice schema 的 JSON。` });
        continue;
      }
      attempts += 1;

      const check = this.output.validate(raw);
      if (check.ok) {
        data = check.data;
        break;
      }
      lastErrors = check.errors;
      messages.push({ role: 'assistant', content: JSON.stringify(raw) });
      messages.push({ role: 'user', content: this.feedback(check.errors) });
    }

    if (!data) {
      throw new ServiceUnavailableException(`模型调用/输出校验重试 ${MAX_ATTEMPTS} 次仍失败：${lastErrors.join('; ')}`);
    }

    const persisted: ChatMessage[] = [...messages, { role: 'assistant', content: JSON.stringify(data) }];
    await this.sessions.save(input.enterprise_id, sessionId, persisted);

    return { session_id: sessionId, model: config.model, attempts, result: data };
  }

  /**
   * 流式运行：逐段推真实推理 token（带来源标注），末尾给校验通过的结果；
   * 校验失败发 attempt 事件并要求模型修正后重试。
   */
  async *stream(input: RunInput): AsyncGenerator<AgentEvent> {
    const config = await this.getConfig();
    const ctx = await this.loadContext(input.enterprise_id);
    const sessionId = input.session_id || randomUUID();
    const history = await this.sessions.load(input.enterprise_id, sessionId);
    const messages: ChatMessage[] = [...history, { role: 'user', content: input.user_request }];

    yield { type: 'start', data: { session_id: sessionId, model: config.model, variety: ctx.variety } };

    let data: HedgeAdvice | null = null;
    let attempts = 0;
    let lastErrors: string[] = [];

    while (attempts < MAX_ATTEMPTS) {
      let rawText = '';
      try {
        for await (const chunk of invokeLiveStream(ctx, messages, sessionId, config)) {
          rawText += chunk.delta;
          yield { type: 'token', data: { delta: chunk.delta, attempt: attempts, source: chunk.source } };
        }
      } catch (err) {
        attempts += 1;
        lastErrors = [(err as Error).message];
        yield { type: 'attempt', data: { attempt: attempts, errors: lastErrors } };
        messages.push({ role: 'user', content: `上一次模型调用失败：${(err as Error).message}。请重新给出符合 hedge_advice schema 的 JSON。` });
        continue;
      }

      let raw: unknown;
      try {
        raw = extractJson(rawText);
      } catch (err) {
        raw = { parse_error: (err as Error).message };
      }
      attempts += 1;

      const check = this.output.validate(raw);
      if (check.ok) {
        data = check.data;
        break;
      }
      lastErrors = check.errors;
      yield { type: 'attempt', data: { attempt: attempts, errors: check.errors } };
      messages.push({ role: 'assistant', content: rawText });
      messages.push({ role: 'user', content: this.feedback(check.errors) });
    }

    if (!data) {
      yield { type: 'error', data: { message: `输出校验重试 ${MAX_ATTEMPTS} 次仍失败：${lastErrors.join('; ')}` } };
      return;
    }

    const persisted: ChatMessage[] = [...messages, { role: 'assistant', content: JSON.stringify(data) }];
    await this.sessions.save(input.enterprise_id, sessionId, persisted);
    yield { type: 'result', data: { session_id: sessionId, model: config.model, attempts, result: data } };
  }
}
