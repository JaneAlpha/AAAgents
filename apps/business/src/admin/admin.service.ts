import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { dataDir, llmConfigFile, safeSegment, sharedReferenceDir } from '../common/paths';
import { DistributionService } from '../distribution/distribution.service';
import { PrismaService } from '../prisma/prisma.service';

export const DOC_NAMES = ['长期记忆', '日常状态'] as const;
export type DocName = (typeof DOC_NAMES)[number];

export interface CreateEnterpriseInput {
  name: string;
  variety: string;
  username?: string;
  password?: string;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly distribution: DistributionService,
  ) {}

  // ================= 企业信息 =================

  listEnterprises() {
    return this.prisma.enterprise.findMany({
      orderBy: { createdAt: 'desc' },
      include: { users: { select: { username: true } } },
    });
  }

  async getEnterprise(enterpriseId: string) {
    const enterprise = await this.prisma.enterprise.findUnique({
      where: { enterpriseId },
      include: { users: { select: { username: true } } },
    });
    if (!enterprise) {
      throw new NotFoundException('企业不存在');
    }
    return enterprise;
  }

  async createEnterprise(input: CreateEnterpriseInput) {
    const enterpriseId = `ent_${randomUUID()}`;
    const data: any = {
      enterpriseId,
      name: input.name,
      variety: input.variety,
    };
    if (input.username && input.password) {
      data.users = {
        create: {
          username: input.username,
          passwordHash: await bcrypt.hash(input.password, 10),
        },
      };
    }
    return this.prisma.enterprise.create({ data });
  }

  async updateEnterprise(enterpriseId: string, input: { name?: string; variety?: string }) {
    await this.getEnterprise(enterpriseId);
    return this.prisma.enterprise.update({ where: { enterpriseId }, data: input });
  }

  async deleteEnterprise(enterpriseId: string) {
    await this.getEnterprise(enterpriseId);
    await this.prisma.user.deleteMany({ where: { enterpriseId } });
    await this.prisma.enterprise.delete({ where: { enterpriseId } });
    return { enterprise_id: enterpriseId, deleted: true };
  }

  // ================= 文档类数据 =================

  async getDocument(enterpriseId: string, name: string) {
    this.assertDocName(name);
    await this.getEnterprise(enterpriseId);
    const file = join(dataDir(enterpriseId), `${name}.md`);
    try {
      return { enterprise_id: enterpriseId, name, content: await fs.readFile(file, 'utf8') };
    } catch {
      return { enterprise_id: enterpriseId, name, content: '' };
    }
  }

  async putDocument(enterpriseId: string, name: string, content: string) {
    this.assertDocName(name);
    await this.getEnterprise(enterpriseId);
    const dir = dataDir(enterpriseId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, `${name}.md`), content ?? '', 'utf8');
    return { enterprise_id: enterpriseId, name, saved: true };
  }

  // ================= 行情 =================

  listQuotes(variety?: string) {
    return this.prisma.marketQuote.findMany({
      where: variety ? { variety } : undefined,
      orderBy: [{ quoteDate: 'desc' }, { contract: 'asc' }],
    });
  }

  createQuote(input: {
    variety: string;
    contract: string;
    settle: number;
    volume: number;
    open_interest: number;
    quote_date: string;
    source: string;
  }) {
    return this.prisma.marketQuote.create({
      data: {
        variety: input.variety,
        contract: input.contract,
        settle: input.settle,
        volume: input.volume,
        openInterest: input.open_interest,
        quoteDate: new Date(input.quote_date),
        source: input.source,
      },
    });
  }

  // ================= 系统级分品种资料 =================

  async listReference() {
    const root = sharedReferenceDir();
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      const result: Array<{ variety: string; files: string[] }> = [];
      for (const entry of entries.filter((e) => e.isDirectory())) {
        const files = await fs.readdir(join(root, entry.name));
        result.push({ variety: entry.name, files: files.filter((f) => f.endsWith('.md')) });
      }
      return result;
    } catch {
      return [];
    }
  }

  /** 规则更新后重分发到该品种的全部企业（方案A）。 */
  async redeployReference(variety: string) {
    return this.distribution.redeploy(variety);
  }

  async getReference(variety: string, file: string) {
    const safeVariety = safeSegment(variety);
    const safeFile = safeSegment(file);
    const target = join(sharedReferenceDir(), safeVariety, safeFile);
    try {
      return { variety: safeVariety, file: safeFile, content: await fs.readFile(target, 'utf8') };
    } catch {
      throw new NotFoundException('资料不存在');
    }
  }

  // ================= LLM 网关配置 =================

  async getLlmConfig() {
    let cfg: any = {};
    try {
      cfg = JSON.parse(await fs.readFile(llmConfigFile(), 'utf8'));
    } catch {
      cfg = {};
    }
    const apiKey = cfg.api_key ?? process.env.LLM_API_KEY ?? '';
    return {
      base_url: cfg.base_url || process.env.LLM_BASE_URL || '',
      model: cfg.model || process.env.LLM_MODEL || '',
      api_key_set: !!apiKey,
      api_key_masked: apiKey ? `${String(apiKey).slice(0, 4)}****` : '',
    };
  }

  async putLlmConfig(input: { base_url?: string; model?: string; api_key?: string }) {
    const file = llmConfigFile();
    let cfg: any = {};
    try {
      cfg = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
      cfg = {};
    }
    delete cfg.mode;
    if (input.base_url !== undefined) cfg.base_url = input.base_url;
    if (input.model !== undefined) cfg.model = input.model;
    if (input.api_key !== undefined) {
      if (input.api_key === '') {
        delete cfg.api_key; // 传空串表示清除
      } else {
        cfg.api_key = input.api_key;
      }
    }
    await fs.mkdir(dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(cfg, null, 2), 'utf8');
    return this.getLlmConfig();
  }

  private assertDocName(name: string) {
    if (!DOC_NAMES.includes(name as DocName)) {
      throw new BadRequestException(`文档名必须为 ${DOC_NAMES.join(' / ')}`);
    }
  }
}
