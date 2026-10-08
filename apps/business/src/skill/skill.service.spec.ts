import { NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SkillService } from './skill.service';

function makePrisma(found = true) {
  return {
    enterprise: {
      findUnique: jest.fn().mockResolvedValue(found ? { enterpriseId: 'ent_test', variety: '苹果' } : null),
    },
  } as any;
}

describe('SkillService', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'skill-'));
    process.env.WORKSPACE_ROOT = root;
    await fs.mkdir(join(root, 'ent_test', 'skills'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('上传后 overview 能列出文件，并给出 skill_path', async () => {
    const svc = new SkillService(makePrisma(true));
    await svc.upload('ent_test', '苹果', 'SKILL.md', '# 规则');
    const ov = await svc.overview('ent_test');

    expect(ov.variety).toBe('苹果');
    expect(ov.skill_path).toBe(join(root, 'ent_test', 'skills', '苹果'));
    expect(ov.varieties['苹果']).toContain('SKILL.md');
  });

  it('重复上传覆盖（无版本）', async () => {
    const svc = new SkillService(makePrisma(true));
    await svc.upload('ent_test', '苹果', 'SKILL.md', 'v1');
    await svc.upload('ent_test', '苹果', 'SKILL.md', 'v2');
    const r = await svc.read('ent_test', '苹果', 'SKILL.md');
    expect(r.content).toBe('v2');
  });

  it('企业不存在 → NotFoundException', async () => {
    const svc = new SkillService(makePrisma(false));
    await expect(svc.upload('missing', '苹果', 'SKILL.md', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('路径穿越被拒绝', async () => {
    const svc = new SkillService(makePrisma(true));
    await expect(svc.upload('ent_test', '苹果', '../evil.md', 'x')).rejects.toThrow();
  });
});
