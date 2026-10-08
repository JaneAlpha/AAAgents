import { Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { safeSegment, skillsDir } from '../common/paths';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SkillService {
  constructor(private readonly prisma: PrismaService) {}

  /** 返回企业的 skill 概览：企业品种对应的 skill_path 及已上传文件。 */
  async overview(enterpriseId: string) {
    const enterprise = await this.prisma.enterprise.findUnique({ where: { enterpriseId } });
    if (!enterprise) {
      throw new NotFoundException('企业不存在');
    }
    const root = skillsDir(enterpriseId);
    let dirNames: string[] = [];
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      dirNames = [];
    }

    const varieties: Record<string, string[]> = {};
    for (const dir of dirNames) {
      const files = await fs.readdir(join(root, dir));
      varieties[dir] = files.filter((f) => f.endsWith('.md'));
    }

    return {
      enterprise_id: enterpriseId,
      variety: enterprise.variety,
      skill_path: join(root, enterprise.variety),
      varieties,
    };
  }

  /** 上传/覆盖 Skill 文档（仅支持重新上传覆盖，无版本管理）。 */
  async upload(enterpriseId: string, variety: string, filename: string, content: string) {
    await this.assertEnterprise(enterpriseId);
    const safeVariety = safeSegment(variety);
    const rawName = filename.endsWith('.md') ? filename : `${filename}.md`;
    const safeFile = safeSegment(rawName);
    const dir = join(skillsDir(enterpriseId), safeVariety);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, safeFile), content ?? '', 'utf8');
    return { enterprise_id: enterpriseId, variety: safeVariety, filename: safeFile, skill_path: dir, saved: true };
  }

  async read(enterpriseId: string, variety: string, filename: string) {
    await this.assertEnterprise(enterpriseId);
    const safeVariety = safeSegment(variety);
    const safeFile = safeSegment(filename);
    const target = join(skillsDir(enterpriseId), safeVariety, safeFile);
    try {
      return {
        enterprise_id: enterpriseId,
        variety: safeVariety,
        filename: safeFile,
        content: await fs.readFile(target, 'utf8'),
      };
    } catch {
      throw new NotFoundException('Skill 文件不存在');
    }
  }

  private async assertEnterprise(enterpriseId: string) {
    const enterprise = await this.prisma.enterprise.findUnique({ where: { enterpriseId } });
    if (!enterprise) {
      throw new NotFoundException('企业不存在');
    }
    return enterprise;
  }
}
