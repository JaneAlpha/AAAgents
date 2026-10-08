import { Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { enterpriseDir } from '../common/paths';
import { DistributionService } from '../distribution/distribution.service';
import { PrismaService } from '../prisma/prisma.service';

export interface WorkspaceInitResult {
  enterprise_id: string;
  workspace_path: string;
  created: boolean;
  variety: string;
  distributed_rules: string[];
  skill_path: string;
}

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly distribution: DistributionService,
  ) {}

  /**
   * 创建企业 Workspace。幂等：目录已存在则跳过创建，仍返回路径。
   */
  async init(enterpriseId: string): Promise<WorkspaceInitResult> {
    const enterprise = await this.prisma.enterprise.findUnique({ where: { enterpriseId } });
    if (!enterprise) {
      throw new NotFoundException('企业不存在');
    }

    const dir = enterpriseDir(enterpriseId);
    let created = false;
    if (!(await this.exists(dir))) {
      await fs.mkdir(join(dir, 'data'), { recursive: true });
      await fs.mkdir(join(dir, 'skills'), { recursive: true });
      await fs.mkdir(join(dir, 'runtime'), { recursive: true });
      created = true;
    }

    await this.prisma.enterprise.update({
      where: { enterpriseId },
      data: { workspacePath: dir },
    });

    // 方案A：按企业品种把规则资料分发到其专属工作区（幂等）
    const distributed = await this.distribution.distribute(enterpriseId, enterprise.variety);

    return {
      enterprise_id: enterpriseId,
      workspace_path: dir,
      created,
      variety: enterprise.variety,
      distributed_rules: distributed.files,
      skill_path: distributed.skill,
    };
  }

  private async exists(target: string): Promise<boolean> {
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }
}
