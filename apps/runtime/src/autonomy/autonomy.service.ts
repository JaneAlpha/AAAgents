import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { AgentService } from '../agent/agent.service';
import { dataDir, runtimeDir } from '../common/paths';

/**
 * 后台自主巡检：定期间隔检查各企业是否有「未处理的新资料」，
 * 若有则由智能体自主查阅并维护两份记忆文档。
 * 与「对话干预」并存——用户在对话中的输入同样会触发记忆维护。
 */
@Injectable()
export class AutonomyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutonomyService.name);
  private readonly baseUrl = process.env.BUSINESS_URL || 'http://business:3000';
  private readonly enabled = (process.env.AUTONOMY_ENABLED ?? 'true') !== 'false';
  private readonly intervalMs = Math.max(1, Number(process.env.AUTONOMY_INTERVAL_MIN || 60)) * 60_000;
  private timer?: NodeJS.Timeout;

  constructor(private readonly agent: AgentService) {}

  onModuleInit() {
    if (!this.enabled) {
      this.logger.log('后台自主巡检：已禁用');
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.logger.log(`后台自主巡检：已启用，间隔 ${this.intervalMs / 60000} 分钟`);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async tick(): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/admin/enterprises`);
      if (!res.ok) {
        return;
      }
      const enterprises: any[] = (await res.json()) as any[];
      for (const e of enterprises) {
        await this.review(String(e.enterpriseId));
      }
    } catch (err) {
      this.logger.warn(`自主巡检异常：${(err as Error).message}`);
    }
  }

  /** 仅当存在晚于上次巡检的新资料时才触发，避免无谓消耗。 */
  private async review(enterpriseId: string): Promise<void> {
    const marker = join(runtimeDir(enterpriseId), '.last_review_at');
    let lastReview = 0;
    try {
      lastReview = Number(await fs.readFile(marker, 'utf8')) || 0;
    } catch {
      lastReview = 0;
    }

    const dir = join(dataDir(enterpriseId), '资料');
    let newest = 0;
    try {
      for (const name of await fs.readdir(dir)) {
        const stat = await fs.stat(join(dir, name));
        newest = Math.max(newest, stat.mtimeMs);
      }
    } catch {
      return; // 无资料目录，跳过
    }
    if (newest <= lastReview) {
      return;
    }

    this.logger.log(`自主巡检触发：${enterpriseId}`);
    try {
      await this.agent.chat({
        enterprise_id: enterpriseId,
        author: 'system',
        message:
          '【后台自主巡检】请查阅 /data/资料/ 下的企业资料，核对并维护长期记忆文档与短期记忆（日常状态）文档。',
      });
      await fs.mkdir(dirname(marker), { recursive: true });
      await fs.writeFile(marker, String(Date.now()), 'utf8');
    } catch (err) {
      this.logger.warn(`自主巡检处理失败：${(err as Error).message}`);
    }
  }
}
