/**
 * Live 验证：对真实大模型跑 Agent。
 * 约定（已与用户确认）：
 *  - 自动断言只覆盖「结构 + 合规」；
 *  - 业务正确性（方向/手数/点位/条件是否合理）由人工核对，脚本完整打印供判断，不做硬断言；
 *  - 无台账/无行情时给「条件化建议（带前提条件）」是允许的，不算编造。
 * 用法：node tests/live/agent-live.mjs [轮数]
 */
const BUSINESS = process.env.BUSINESS_URL || 'http://localhost:3000';
const RUNTIME = process.env.RUNTIME_URL || 'http://localhost:3001';
const ROUNDS = Number(process.argv[2] || 1);

const jsonHeaders = { 'content-type': 'application/json' };
const post = (url, b) => fetch(url, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(b) });

/** 自动断言：仅结构 + 合规 */
function structuralIssues(result) {
  const issues = [];
  if (!result || typeof result !== 'object') return ['结果不是对象'];
  for (const k of ['schema_version', 'meta', 'data_status', 'exposure', 'advice', 'risk', 'compliance', 'lineage']) {
    if (!(k in result)) issues.push(`缺字段 ${k}`);
  }
  const c = result.compliance || {};
  if (c.no_order_placed !== true) issues.push('合规 no_order_placed 非 true');
  if (c.not_investment_advice !== true) issues.push('合规 not_investment_advice 非 true');
  if (c.human_review_required !== true) issues.push('合规 human_review_required 非 true');
  if (!c.disclaimer) issues.push('缺 disclaimer');
  if (!Array.isArray(result.advice)) issues.push('advice 非数组');
  for (const a of result.advice || []) {
    if (!a.reason || !a.reason.length) issues.push('advice.reason 为空');
    if (!Array.isArray(a.conditions)) issues.push('advice.conditions 非数组');
    if (a.entry_zone && a.entry_zone.unit !== '元/吨') issues.push('entry_zone.unit 非 元/吨');
    if (a.target_lots != null && (!Number.isInteger(a.target_lots) || a.target_lots < 0)) {
      issues.push(`target_lots 非法: ${a.target_lots}`);
    }
  }
  return issues;
}

/** 供人工核对：打印业务内容 */
function printForReview(result) {
  const d = result.data_status || {};
  console.log(`      数据状态: ${d.status}（缺: ${(d.missing || []).join('、') || '无'}）`);
  const ex = result.exposure || [];
  console.log(`      敞口: ${ex.length ? ex.map((e) => `${e.basis}=${e.net_ton}吨/${e.risk_direction}`).join(' | ') : '无'}`);
  for (const a of result.advice || []) {
    console.log(`      ▸ 建议: action=${a.action} instrument=${a.instrument} contract=${a.contract || '-'} lots=${a.target_lots ?? '-'}`);
    console.log(`        点位: ${a.entry_zone ? `${a.entry_zone.low}-${a.entry_zone.high} ${a.entry_zone.unit}` : '未给'} | 期限=${a.horizon || '-'}`);
    console.log(`        理由: ${(a.reason || '').slice(0, 160)}`);
    for (const c of a.conditions || []) console.log(`        条件: ${c}`);
  }
  const r = result.risk || {};
  if (r.blockers?.length) console.log(`      ⛔ 阻断: ${r.blockers.join(' | ')}`);
  if (r.warnings?.length) console.log(`      ⚠ 提示: ${r.warnings.join(' | ')}`);
}

async function main() {
  const health = await (await fetch(`${RUNTIME}/agent/health`)).json();
  console.log('runtime:', JSON.stringify(health));
  if (!health.configured) {
    console.error('未配置大模型，无法 live 测试。');
    process.exit(2);
  }

  const login = await post(`${BUSINESS}/auth/login`, { username: 'apple_demo', password: 'demo123' });
  const { enterprise_id: enterpriseId } = await login.json();
  console.log(`企业: ${enterpriseId} · 轮数: ${ROUNDS}\n`);

  let pass = 0;
  const failures = [];
  for (let i = 1; i <= ROUNDS; i++) {
    const started = Date.now();
    const res = await post(`${RUNTIME}/agent/run`, {
      enterprise_id: enterpriseId,
      user_request: '请分析我企业的套期保值需求，给出参考点位与前提条件。',
    });
    const ms = Date.now() - started;

    if (!res.ok) {
      const text = await res.text();
      console.log(`第 ${i} 轮 ✗ ${ms}ms  HTTP ${res.status}: ${text.slice(0, 300)}`);
      failures.push(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      continue;
    }
    const body = await res.json();
    const issues = structuralIssues(body.result);
    if (issues.length === 0) {
      pass++;
      console.log(`第 ${i} 轮 ✓ ${ms}ms attempts=${body.attempts} model=${body.model} —— 结构+合规通过，业务内容供人工核对：`);
      printForReview(body.result);
    } else {
      console.log(`第 ${i} 轮 ✗ ${ms}ms 结构/合规问题: ${issues.join('; ')}`);
      failures.push(issues.join('; '));
    }
    console.log('');
  }

  console.log(`==== live 汇总：结构+合规 通过 ${pass}/${ROUNDS} ====`);
  console.log('业务正确性（方向/手数/点位/条件）请据上方输出人工核对。');
  if (pass < ROUNDS) {
    console.log('失败明细：');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('live 测试异常：', e.message);
  process.exit(1);
});
