import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { promises as fs } from 'fs';
import { join } from 'path';
import { VARIETY_RULES } from '../src/common/variety-rules';

const prisma = new PrismaClient();
const ROOT = process.env.WORKSPACE_ROOT || '/workspace';
const PASSWORD = 'demo123';

const ENTERPRISES = [
  { enterpriseId: 'ent_demo_apple', name: '苹果示范企业', variety: '苹果', username: 'apple_demo' },
  { enterpriseId: 'ent_demo_jujube', name: '红枣示范企业', variety: '红枣', username: 'jujube_demo' },
];

// 品种规则来源见 src/common/variety-rules.ts（单一来源）

const QUOTES = [
  { variety: '苹果', contract: 'AP2610', settle: 8500, volume: 52000, open_interest: 120000, quote_date: '2026-10-02', source: 'mock' },
  { variety: '苹果', contract: 'AP2701', settle: 8620, volume: 31000, open_interest: 88000, quote_date: '2026-10-02', source: 'mock' },
  { variety: '红枣', contract: 'CJ2601', settle: 10200, volume: 41000, open_interest: 95000, quote_date: '2026-10-03', source: 'mock' },
  { variety: '红枣', contract: 'CJ2605', settle: 10550, volume: 22000, open_interest: 61000, quote_date: '2026-10-03', source: 'mock' },
];

async function writeEnterpriseWorkspace(enterpriseId: string, name: string, variety: string) {
  const dir = join(ROOT, enterpriseId);
  await fs.mkdir(join(dir, 'data'), { recursive: true });
  await fs.mkdir(join(dir, 'skills'), { recursive: true });
  await fs.mkdir(join(dir, 'runtime'), { recursive: true });

  await fs.writeFile(
    join(dir, 'data', '长期记忆.md'),
    `# ${name} 长期记忆\n\n- 品种：${variety}\n- 企业类型：贸易\n- 套保目标：锁定经营毛利\n- 授权套保比例：0.6（上限 0.8）\n`,
    'utf8',
  );
  await fs.writeFile(
    join(dir, 'data', '日常状态.md'),
    `# ${name} 日常状态\n\n- 当前净敞口：待录入\n- 近期决策：无\n`,
    'utf8',
  );

  const skillDir = join(dir, 'skills', variety);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    join(skillDir, 'SKILL.md'),
    `---\nname: ${variety}套期保值分析\ndescription: 依据 workspace 的敞口台账、行情与企业套保政策，按套期保值口径给出保值方向、目标手数、参考点位区间与前提条件，并输出严格符合 hedge_advice schema 的 JSON。数据缺失时应如实标注并给出条件化建议或阻断项，不得虚构敞口与价格。\n---\n\n# ${variety}套期保值分析 Skill\n\n> 本 Skill 为规则文档形态：描述 ${variety} 的套期保值分析口径与输出要求，由 Agent 依据 workspace 数据完成分析。\n\n## 输入\n- ${variety} 经营台账（敞口）\n- 行情（合约、结算价）\n- 企业套保政策\n\n## 分析口径\n1. 按风险池汇总净敞口。\n2. 正敞口（持库存怕跌）→ 卖出保值/买 Put；负敞口（需采购怕涨）→ 买入保值/买 Call。\n3. 目标手数向零取整，不突破实需与授权上限。\n\n## 输出\n- 严格按 hedge_advice schema：给出敞口、建议(含参考点位区间)、阻断项与合规声明。\n`,
    'utf8',
  );

  return dir;
}

async function main() {
  for (const e of ENTERPRISES) {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await prisma.enterprise.upsert({
      where: { enterpriseId: e.enterpriseId },
      update: { name: e.name, variety: e.variety },
      create: { enterpriseId: e.enterpriseId, name: e.name, variety: e.variety },
    });
    await prisma.user.upsert({
      where: { username: e.username },
      update: { passwordHash, enterpriseId: e.enterpriseId },
      create: { username: e.username, passwordHash, enterpriseId: e.enterpriseId },
    });
    const dir = await writeEnterpriseWorkspace(e.enterpriseId, e.name, e.variety);
    await prisma.enterprise.update({ where: { enterpriseId: e.enterpriseId }, data: { workspacePath: dir } });
  }

  // 共享规则目录（数据层单一来源）：仅缺失时写入，不覆盖后台维护的版本
  for (const [variety, files] of Object.entries(VARIETY_RULES)) {
    const dir = join(ROOT, '_shared', '分品种资料', variety);
    await fs.mkdir(dir, { recursive: true });
    for (const [fileName, content] of Object.entries(files)) {
      const target = join(dir, fileName);
      try {
        await fs.access(target);
      } catch {
        await fs.writeFile(target, content, 'utf8');
      }
    }
  }

  for (const q of QUOTES) {
    const quoteDate = new Date(q.quote_date);
    const existing = await prisma.marketQuote.findFirst({
      where: { variety: q.variety, contract: q.contract, quoteDate },
    });
    if (!existing) {
      await prisma.marketQuote.create({
        data: {
          variety: q.variety,
          contract: q.contract,
          settle: q.settle,
          volume: q.volume,
          openInterest: q.open_interest,
          quoteDate,
          source: q.source,
        },
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log('seed done: 2 enterprises, users, workspaces, reference docs, market quotes');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
