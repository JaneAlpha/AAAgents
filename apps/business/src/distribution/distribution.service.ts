import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { dataDir, sharedReferenceDir, skillsDir } from '../common/paths';
import { skillDoc, VARIETY_RULES } from '../common/variety-rules';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 品种规则分发。
 * 数据层（/workspace/_shared/分品种资料/）为单一来源；初始化时按企业品种
 * 分发到企业工作区的 /data/品种资料/（供 Agent 查阅）与 /skills/{品种}/SKILL.md（供 deepagents 加载）。
 */
@Injectable()
export class DistributionService {
  private readonly logger = new Logger(DistributionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 用内置规则初始化共享目录（仅在缺失时写入，不覆盖后台的修改）。 */
  async ensureSharedRules(): Promise<void> {
    for (const [variety, files] of Object.entries(VARIETY_RULES)) {
      const dir = join(sharedReferenceDir(), variety);
      await fs.mkdir(dir, { recursive: true });
      for (const [name, content] of Object.entries(files)) {
        const target = join(dir, name);
        try {
          await fs.access(target);
        } catch {
          await fs.writeFile(target, content, 'utf8');
        }
      }
    }
  }

  /** 读取共享目录中该品种的规则文件（以数据层为准，便于后台增删改）。 */
  private async readSharedRules(variety: string): Promise<Record<string, string>> {
    const dir = join(sharedReferenceDir(), variety);
    let names: string[] = [];
    try {
      names = (await fs.readdir(dir)).filter((n) => n.endsWith('.md'));
    } catch {
      return {};
    }
    const out: Record<string, string> = {};
    for (const name of names) {
      out[name] = await fs.readFile(join(dir, name), 'utf8');
    }
    return out;
  }

  /** 分发：把该品种规则写入企业工作区（幂等，覆盖式）。 */
  async distribute(enterpriseId: string, variety: string): Promise<{ files: string[]; skill: string }> {
    if (!variety) {
      throw new BadRequestException('企业未设置品种，无法分发品种规则');
    }
    const rules = await this.readSharedRules(variety);
    const existing = Object.keys(rules).length;
    if (existing === 0) {
      this.logger.warn(`共享目录无「${variety}」规则，跳过分发（请先在数据管理后台维护）`);
    }

    // 1) 规则原文 → /data/品种资料/
    const docsDir = join(dataDir(enterpriseId), '品种资料');
    await fs.mkdir(docsDir, { recursive: true });
    for (const [name, content] of Object.entries(rules)) {
      await fs.writeFile(join(docsDir, name), content, 'utf8');
    }

    // 2) Skill 文档 → /skills/{品种}/SKILL.md
    const skillDir = join(skillsDir(enterpriseId), variety);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(join(skillDir, 'SKILL.md'), skillDoc(variety), 'utf8');

    return { files: Object.keys(rules), skill: `/skills/${variety}/SKILL.md` };
  }

  /** 规则更新后，重分发到该品种的全部企业。 */
  async redeploy(variety: string) {
    const enterprises = await this.prisma.enterprise.findMany({ where: { variety } });
    const detail: Array<{ enterprise_id: string; files: string[] }> = [];
    for (const e of enterprises) {
      const r = await this.distribute(e.enterpriseId, variety);
      detail.push({ enterprise_id: e.enterpriseId, files: r.files });
    }
    return { variety, enterprises: detail.length, detail };
  }
}
