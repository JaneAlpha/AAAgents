import { Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { runtimeDir, safeSegment } from '../common/paths';
import { PrismaService } from '../prisma/prisma.service';

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** 会话记录即 workspace 下 runtime/sessions/{sessionId}.json（Runtime 写入，本服务读取）。 */
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  private dir(enterpriseId: string) {
    return join(runtimeDir(enterpriseId), 'sessions');
  }

  private file(enterpriseId: string, sessionId: string) {
    return join(this.dir(enterpriseId), `${safeSegment(sessionId)}.json`);
  }

  private async assertEnterprise(enterpriseId: string) {
    const enterprise = await this.prisma.enterprise.findUnique({ where: { enterpriseId } });
    if (!enterprise) {
      throw new NotFoundException('企业不存在');
    }
  }

  /** 会话标题：取首条用户消息前 24 字。 */
  private titleOf(messages: SessionMessage[]): string {
    const first = messages.find((m) => m.role === 'user' && m.content);
    return first ? first.content.replace(/\s+/g, ' ').slice(0, 24) : '新对话';
  }

  async list(enterpriseId: string) {
    await this.assertEnterprise(enterpriseId);
    let names: string[] = [];
    try {
      names = (await fs.readdir(this.dir(enterpriseId))).filter((n) => n.endsWith('.json'));
    } catch {
      return { enterprise_id: enterpriseId, sessions: [] };
    }

    const sessions: Array<{
      session_id: string;
      title: string;
      message_count: number;
      updated_at: string;
    }> = [];
    for (const name of names) {
      const full = join(this.dir(enterpriseId), name);
      try {
        const stat = await fs.stat(full);
        const parsed = JSON.parse(await fs.readFile(full, 'utf8'));
        const messages: SessionMessage[] = Array.isArray(parsed) ? parsed : [];
        sessions.push({
          session_id: name.replace(/\.json$/, ''),
          title: this.titleOf(messages),
          message_count: messages.length,
          updated_at: stat.mtime.toISOString(),
        });
      } catch {
        // 跳过损坏或非法的会话文件
      }
    }
    sessions.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    return { enterprise_id: enterpriseId, sessions };
  }

  async get(enterpriseId: string, sessionId: string) {
    await this.assertEnterprise(enterpriseId);
    const full = this.file(enterpriseId, sessionId);
    try {
      const stat = await fs.stat(full);
      const parsed = JSON.parse(await fs.readFile(full, 'utf8'));
      return {
        enterprise_id: enterpriseId,
        session_id: sessionId,
        updated_at: stat.mtime.toISOString(),
        messages: Array.isArray(parsed) ? parsed : [],
      };
    } catch {
      throw new NotFoundException('会话不存在');
    }
  }

  async remove(enterpriseId: string, sessionId: string) {
    await this.assertEnterprise(enterpriseId);
    try {
      await fs.unlink(this.file(enterpriseId, sessionId));
    } catch {
      throw new NotFoundException('会话不存在');
    }
    return { ok: true };
  }
}
