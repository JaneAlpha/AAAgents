import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AdminService } from './admin.service';

function makePrisma() {
  return {
    enterprise: {
      findUnique: jest.fn().mockResolvedValue({ enterpriseId: 'ent_test', name: 'E', variety: '苹果' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    marketQuote: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

describe('AdminService', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'admin-'));
    process.env.WORKSPACE_ROOT = root;
    await fs.mkdir(join(root, 'ent_test'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('文档：写入后可读回', async () => {
    const svc = new AdminService(makePrisma());
    await svc.putDocument('ent_test', '长期记忆', '# 记忆\n内容');
    const got = await svc.getDocument('ent_test', '长期记忆');
    expect(got.content).toContain('内容');
  });

  it('文档：非法名称 → BadRequestException', async () => {
    const svc = new AdminService(makePrisma());
    await expect(svc.putDocument('ent_test', '随便', 'x')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('文档：不存在时返回空字符串，不抛错', async () => {
    const svc = new AdminService(makePrisma());
    const got = await svc.getDocument('ent_test', '日常状态');
    expect(got.content).toBe('');
  });

  it('分品种资料：列出共享资料目录', async () => {
    const refRoot = join(root, '_shared', '分品种资料', '苹果');
    await fs.mkdir(refRoot, { recursive: true });
    await fs.writeFile(join(refRoot, '合约规则.md'), '# 规则', 'utf8');

    const svc = new AdminService(makePrisma());
    const list = await svc.listReference();
    expect(list).toEqual([{ variety: '苹果', files: ['合约规则.md'] }]);
  });

  it('LLM 配置：写入后可读回，key 脱敏', async () => {
    const svc = new AdminService(makePrisma());
    const saved = await svc.putLlmConfig({
      mode: 'live',
      base_url: 'https://gw.example.com/v1',
      model: 'demo-model',
      api_key: 'secret-key-123',
    });
    expect(saved.mode).toBe('live');
    expect(saved.base_url).toBe('https://gw.example.com/v1');
    expect(saved.api_key_set).toBe(true);
    expect(saved.api_key_masked).toBe('secr****');
    expect(JSON.stringify(saved)).not.toContain('secret-key-123');
  });

  it('LLM 配置：传空串清除 key', async () => {
    const svc = new AdminService(makePrisma());
    await svc.putLlmConfig({ api_key: 'x-key' });
    const cleared = await svc.putLlmConfig({ api_key: '' });
    expect(cleared.api_key_set).toBe(false);
  });
});
