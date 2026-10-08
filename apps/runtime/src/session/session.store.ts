import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { runtimeDir, safeSegment } from '../common/paths';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 多轮会话历史持久化到 workspace 的 runtime/sessions/ 下。 */
@Injectable()
export class SessionStore {
  private file(enterpriseId: string, sessionId: string): string {
    return join(
      runtimeDir(enterpriseId),
      'sessions',
      `${safeSegment(sessionId)}.json`,
    );
  }

  async load(enterpriseId: string, sessionId: string): Promise<ChatMessage[]> {
    try {
      const raw = await fs.readFile(this.file(enterpriseId, sessionId), 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async save(enterpriseId: string, sessionId: string, messages: ChatMessage[]): Promise<void> {
    const target = this.file(enterpriseId, sessionId);
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(messages, null, 2), 'utf8');
  }
}
