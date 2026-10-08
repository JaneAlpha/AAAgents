/**
 * 标准答案用例：造一份有确定正确答案的企业数据，跑 live 后逐项比对。
 * 正确答案（手算）：
 *   敞口 = 自有库存 130 吨（正敞口，怕跌）
 *   授权套保比例 = 0.6；苹果 = 10 吨/手
 *   目标手数 = trunc(130 × 0.6 ÷ 10) = trunc(7.8) = 7 手
 *   方向 = 卖出保值 / 买入保护性看跌
 *   （上限：trunc(130 × 0.8 ÷ 10) = 10 手，7 ≤ 10 合规）
 */
const BUSINESS = process.env.BUSINESS_URL || 'http://localhost:3000';
const RUNTIME = process.env.RUNTIME_URL || 'http://localhost:3001';
const USER = 'answer_case';
const PASSWORD = 'demo123';

const jsonHeaders = { 'content-type': 'application/json' };
const post = (u, b) => fetch(u, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(b) });
const put = (u, b) => fetch(u, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(b) });

const LONG_MEMORY = `# 标准用例企业 长期记忆

- 品种：苹果
- 企业类型：贸易
- 套保目标：锁定经营毛利
- 授权套保比例：0.6（上限 0.8）
- 合约乘数：苹果期货 10 吨/手
`;

const DAILY_STATE = `# 标准用例企业 日常状态

## 经营敞口（风险池）
- 风险池：2026|山东栖霞|一级红富士|2026-12-15
- 敞口类型：自有库存（正敞口，价格下跌会亏损）
- 数量：130 吨
- 保值期限：2026-12-15
- 已建仓衍生品：无

## 行情快照（2026-10-05）
- AP2612 结算价 8500 元/吨
- AP2701 结算价 8620 元/吨
`;

const EXPECT = { direction: '卖出保值 / 买入保护性看跌', lots: 7, capLots: 10 };

async function ensureEnterprise() {
  const reg = await post(`${BUSINESS}/auth/register`, {
    username: USER,
    password: PASSWORD,
    enterprise_name: '标准用例企业',
    variety: '苹果',
  });
  if (reg.ok) {
    const { enterprise_id } = await reg.json();
    return enterprise_id;
  }
  const login = await post(`${BUSINESS}/auth/login`, { username: USER, password: PASSWORD });
  const { enterprise_id } = await login.json();
  return enterprise_id;
}

async function writeCase(enterpriseId) {
  await post(`${BUSINESS}/workspace/init`, { enterprise_id: enterpriseId });
  await put(`${BUSINESS}/admin/enterprises/${encodeURIComponent(enterpriseId)}/documents/${encodeURIComponent('长期记忆')}`, {
    content: LONG_MEMORY,
  });
  await put(`${BUSINESS}/admin/enterprises/${encodeURIComponent(enterpriseId)}/documents/${encodeURIComponent('日常状态')}`, {
    content: DAILY_STATE,
  });
}

function judge(result) {
  const advices = result.advice || [];
  const a = advices[0];
  const sellLike = a && (a.action === 'sell_hedge' || a.instrument === 'protective_put');
  const buyLike = a && (a.action === 'buy_hedge' || a.instrument === 'protective_call');
  const lots = a?.target_lots ?? null;
  return {
    hasAdvice: advices.length > 0,
    directionOk: !!sellLike,
    wrongDirection: !!buyLike,
    lots,
    lotsOk: lots === EXPECT.lots,
    withinCap: typeof lots === 'number' && lots <= EXPECT.capLots,
    contract: a?.contract ?? null,
    entryZone: a?.entry_zone ? `${a.entry_zone.low}-${a.entry_zone.high}` : null,
    status: result.data_status?.status,
    action: a?.action ?? null,
    instrument: a?.instrument ?? null,
    blockers: result.risk?.blockers ?? [],
  };
}

async function main() {
  const health = await (await fetch(`${RUNTIME}/agent/health`)).json();
  if (!health.configured) {
    console.error('未配置大模型，无法 live 测试。');
    process.exit(2);
  }
  const enterpriseId = await ensureEnterprise();
  await writeCase(enterpriseId);
  console.log(`用例企业: ${enterpriseId}`);
  console.log(`标准答案: 方向=${EXPECT.direction} 目标手数=${EXPECT.lots} 手（上限 ${EXPECT.capLots} 手）\n`);

  const res = await post(`${RUNTIME}/agent/run`, {
    enterprise_id: enterpriseId,
    user_request: '请分析我企业的套期保值需求，给出保值方向、目标手数、参考点位与前提条件。',
  });
  if (!res.ok) {
    console.error(`运行失败 HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
    process.exit(1);
  }
  const body = await res.json();
  const j = judge(body.result);

  console.log('模型输出：');
  console.log(`  数据状态      : ${j.status}`);
  console.log(`  action        : ${j.action} / instrument=${j.instrument}`);
  console.log(`  合约          : ${j.contract}`);
  console.log(`  目标手数      : ${j.lots}`);
  console.log(`  参考点位      : ${j.entryZone}`);
  if (j.blockers.length) console.log(`  阻断项        : ${j.blockers.join(' | ')}`);
  console.log('');

  const checks = [
    ['给出了建议', j.hasAdvice],
    ['方向正确（卖出保值/保护性看跌）', j.directionOk],
    [`手数正确 = ${EXPECT.lots}`, j.lotsOk],
    [`未突破上限 ${EXPECT.capLots} 手`, j.withinCap],
    ['未给出反向建议', !j.wrongDirection],
  ];
  let pass = 0;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    if (ok) pass++;
  }
  console.log(`\n==== 标准答案命中 ${pass}/${checks.length} ====`);
  process.exit(pass === checks.length ? 0 : 1);
}

main().catch((e) => {
  console.error('异常：', e.message);
  process.exit(1);
});
