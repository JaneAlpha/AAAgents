import { NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WorkspaceService } from './workspace.service';

function makePrisma(exists = true) {
  return {
    enterprise: {
      findUnique: jest.fn().mockResolvedValue(exists ? { enterpriseId: 'ent_test' } : null),
      update: jest.fn().mockResolvedValue({}),
    },
  } as any;
}

describe('WorkspaceService', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'ws-'));
    process.env.WORKSPACE_ROOT = root;
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('首次初始化：创建 data/skills/runtime 并返回 created=true', async () => {
    const svc = new WorkspaceService(makePrisma(true));
    const res = await svc.init('ent_test');

    expect(res.created).toBe(true);
    expect(res.workspace_path).toBe(join(root, 'ent_test'));
    for (const sub of ['data', 'skills', 'runtime']) {
      await expect(fs.access(join(root, 'ent_test', sub))).resolves.toBeUndefined();
    }
  });

  it('幂等：重复初始化跳过创建，created=false，路径不变', async () => {
    const svc = new WorkspaceService(makePrisma(true));
    const first = await svc.init('ent_test');
    const second = await svc.init('ent_test');

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.workspace_path).toBe(first.workspace_path);
  });

  it('企业不存在 → NotFoundException', async () => {
    const svc = new WorkspaceService(makePrisma(false));
    await expect(svc.init('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
