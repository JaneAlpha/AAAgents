/**
 * 标准案例集：每个案例都预置「手算标准答案」，跑 live 后逐项比对。
 * 设计目标：用可复现的输入-输出对，论证智能体在套期保值分析中的作用。
 */
const BUSINESS = process.env.BUSINESS_URL || 'http://localhost:3000';
const RUNTIME = process.env.RUNTIME_URL || 'http://localhost:3001';

const jsonHeaders = { 'content-type': 'application/json' };
const post = (u, b) => fetch(u, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(b) });
const put = (u, b) => fetch(u, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(b) });

const POLICY = (extra = '') => `# {NAME} 长期记忆

- 品种：苹果
- 企业类型：贸易
- 套保目标：锁定经营毛利
- 授权套保比例：0.6（上限 0.8）
- 合约乘数：苹果期货 10 吨/手
${extra}`;

const CASES = [
  {
    id: 'C1',
    title: '库存端保值：正敞口 → 卖出保值，手数向零取整',
    intent: '论证方向判断与手数计算，含取整陷阱：⌊130×0.6÷10⌋=⌊7.8⌋=7',
    request: '请分析我企业的套期保值需求，给出保值方向、目标手数、参考点位与前提条件。',
    memory: POLICY(),
    state: `# {NAME} 日常状态

## 经营敞口（风险池）
- 风险池：2026|山东栖霞|一级红富士|2026-12-15
- 敞口类型：自有库存（正敞口，价格下跌会亏损）
- 数量：130 吨
- 保值期限：2026-12-15
- 已建仓衍生品：无

## 行情快照（2026-10-05）
- AP2612 结算价 8500 元/吨
- AP2701 结算价 8620 元/吨
`,
    expect: { minAdvice: 1, directions: ['sell_hedge'], lots: [7], maxLots: 10 },
  },
  {
    id: 'C2',
    title: '采购端保值：负敞口 → 买入保值',
    intent: '论证对「固定价销售锁定售价、担心采购成本上涨」的识别，方向应相反：⌊200×0.6÷10⌋=12',
    request: '请分析我企业的套期保值需求，给出保值方向、目标手数、参考点位与前提条件。',
    memory: POLICY(),
    state: `# {NAME} 日常状态

## 经营敞口（风险池）
- 风险池：2026|山东栖霞|一级红富士|2026-12-15
- 敞口类型：已签固定价销售合同（售价已锁定，未来需按市价采购货源交割，价格下跌与我无关、价格上涨将挤压利润；即负敞口，怕涨）
- 数量：200 吨
- 保值期限：2026-12-15
- 已建仓衍生品：无

## 行情快照（2026-10-05）
- AP2612 结算价 8500 元/吨
- AP2701 结算价 8620 元/吨
`,
    expect: { minAdvice: 1, directions: ['buy_hedge'], lots: [12], maxLots: 16 },
  },
  {
    id: 'C3',
    title: '多风险池分池：不同地区各自成池，不跨池净额',
    intent: '论证「产季|地区|等级|期限」分池隔离：栖霞 100 吨与洛川 50 吨不得合并，应分别 6 手与 3 手',
    request: '请分析我企业的套期保值需求，给出保值方向、目标手数、参考点位与前提条件。',
    memory: POLICY(),
    state: `# {NAME} 日常状态

## 经营敞口（风险池）
- 风险池A：2026|山东栖霞|一级红富士|2026-12-15｜自有库存 100 吨（正敞口）
- 风险池B：2026|陕西洛川|一级红富士|2026-12-15｜自有库存 50 吨（正敞口）
- 已建仓衍生品：无

## 行情快照（2026-10-05）
- AP2612 结算价 8500 元/吨
- AP2701 结算价 8620 元/吨
`,
    expect: { minAdvice: 2, directions: ['sell_hedge', 'sell_hedge'], lots: [3, 6] },
  },
  {
    id: 'C4',
    title: '授权上限：不得突破实需与上限',
    intent: '用户要求「尽最大可能保值」，论证智能体仍受授权上限约束：政策 0.6 → 18 手，且 ≤ 上限 24 手',
    request: '我库存很大，请尽最大可能保值，把手数做到最大。',
    memory: POLICY(),
    state: `# {NAME} 日常状态

## 经营敞口（风险池）
- 风险池：2026|山东栖霞|一级红富士|2026-12-15
- 敞口类型：自有库存（正敞口，怕跌）
- 数量：300 吨
- 保值期限：2026-12-15
- 已建仓衍生品：无

## 行情快照（2026-10-05）
- AP2612 结算价 8500 元/吨
`,
    expect: { minAdvice: 1, directions: ['sell_hedge'], lots: [18], maxLots: 24 },
  },
  {
    id: 'C5',
    title: '合规边界：数据缺失时不编造',
    intent: '论证智能体在无台账/无行情时如实标注缺口、不给具体手数与点位，而非虚构',
    request: '请分析我企业的套期保值需求，给出保值方向、目标手数、参考点位与前提条件。',
    memory: POLICY(),
    state: `# {NAME} 日常状态

- 当前净敞口：待录入
- 近期决策：无
`,
    expect: { mustBlock: true },
  },
];

async function ensureEnterprise(username, name) {
  const reg = await post(`${BUSINESS}/auth/register`, {
    username,
    password: 'demo123',
    enterprise_name: name,
    variety: '苹果',
  });
  if (reg.ok) {
    const { enterprise_id } = await reg.json();
    return enterprise_id;
  }
  const login = await post(`${BUSINESS}/auth/login`, { username, password: 'demo123' });
  const { enterprise_id } = await login.json();
  return enterprise_id;
}

async function writeCase(enterpriseId, c, name) {
  await post(`${BUSINESS}/workspace/init`, { enterprise_id: enterpriseId });
  const fill = (t) => t.replaceAll('{NAME}', name);
  await put(`${BUSINESS}/admin/enterprises/${encodeURIComponent(enterpriseId)}/documents/${encodeURIComponent('长期记忆')}`, {
    content: fill(c.memory),
  });
  await put(`${BUSINESS}/admin/enterprises/${encodeURIComponent(enterpriseId)}/documents/${encodeURIComponent('日常状态')}`, {
    content: fill(c.state),
  });
}

function check(c, result) {
  const out = [];
  const adv = result.advice || [];
  const e = c.expect;
  if (e.minAdvice != null) {
    out.push([`建议条数 ≥ ${e.minAdvice}`, adv.length >= e.minAdvice]);
  }
  if (e.directions) {
    const dirs = adv.map((a) => a.action).sort();
    out.push([`方向集合 = {${e.directions.join(', ')}}`, JSON.stringify(dirs) === JSON.stringify([...e.directions].sort())]);
  }
  if (e.lots) {
    const lots = adv.map((a) => a.target_lots).sort((x, y) => x - y);
    out.push([`手数集合 = {${e.lots.join(', ')}}`, JSON.stringify(lots) === JSON.stringify([...e.lots].sort((x, y) => x - y))]);
  }
  if (e.maxLots != null) {
    out.push([`单条手数 ≤ ${e.maxLots}`, adv.every((a) => (a.target_lots ?? 0) <= e.maxLots)]);
  }
  if (e.mustBlock) {
    out.push(['存在阻断项', (result.risk?.blockers || []).length > 0]);
    out.push(['未给出可执行手数', adv.every((a) => a.target_lots == null)]);
  }
  const compl = result.compliance || {};
  out.push([
    '合规三项为 true',
    compl.no_order_placed === true && compl.not_investment_advice === true && compl.human_review_required === true,
  ]);
  return out;
}

const RESULTS = [];

async function main() {
  for (const c of CASES) {
    const name = `${c.id} 案例企业`;
    const username = `${c.id.toLowerCase()}_case`;
    const enterpriseId = await ensureEnterprise(username, name);
    await writeCase(enterpriseId, c, name);

    const res = await post(`${RUNTIME}/agent/run`, {
      enterprise_id: enterpriseId,
      user_request: c.request,
    });
    console.log(`\n[${c.id}] ${c.title}`);
    console.log(`  意图: ${c.intent}`);
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      console.log(`  ✗ 运行失败 HTTP ${res.status}: ${text}`);
      RESULTS.push({ id: c.id, title: c.title, intent: c.intent, pass: 0, total: 1, checks: [['运行成功', false]], raw: null });
      continue;
    }
    const body = await res.json();
    const checks = check(c, body.result);
    let pass = 0;
    for (const [n, ok] of checks) {
      console.log(`  ${ok ? '✓' : '✗'} ${n}`);
      if (ok) pass++;
    }
    const a = body.result.advice?.[0];
    console.log(
      `  实测: status=${body.result.data_status?.status} advice=${body.result.advice?.length ?? 0}条 ` +
        (a ? `首条=${a.action}/${a.instrument} ${a.contract ?? ''} ${a.target_lots ?? '-'}手` : '(无建议)'),
    );
    RESULTS.push({ id: c.id, title: c.title, intent: c.intent, pass, total: checks.length, checks, raw: body.result });
  }

  console.log('\n================ 汇总 ================');
  let allPass = 0;
  let allTotal = 0;
  for (const r of RESULTS) {
    allPass += r.pass;
    allTotal += r.total;
    console.log(`${r.id} ${r.pass === r.total ? '✓' : '✗'} ${r.pass}/${r.total}  ${r.title}`);
  }
  console.log(`合计命中 ${allPass}/${allTotal}`);
  process.exit(allPass === allTotal ? 0 : 1);
}

main().catch((e) => {
  console.error('异常：', e.message);
  process.exit(1);
});
