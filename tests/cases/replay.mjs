/**
 * 案例回放：苹果贸易企业（分层素材）
 *   1) 上传 01_企业信息.txt（宏观背景）→ 智能体自主吸收为长期记忆
 *   2) 逐条回放 02_对话输入.md（本次业务：授权/敞口/期限/行情）→ 期望追问 + 结论
 *   3) 校验流式接口的事件与分类
 * 标准答案：⌊180 × 0.6 ÷ 10⌋ = 10 手（卖出保值）
 * 用法：node tests/cases/replay.mjs [case|stream]（缺省 case）
 */
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const BUSINESS = process.env.BUSINESS_URL || 'http://localhost:3000';
const RUNTIME = process.env.RUNTIME_URL || 'http://localhost:3001';
const HERE = dirname(fileURLToPath(import.meta.url));
const CASE_DIR = join(HERE, '..', '..', '案例', '苹果贸易企业');
const WHICH = (process.argv[2] || 'case').toLowerCase();
const EXPECT = { direction: '卖出保值', lots: 10, capLots: 14 };
const USER = 'case_apple_v7';

const jsonHeaders = { 'content-type': 'application/json' };
const post = (u, b) => fetch(u, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(b) });
const get = (u) => fetch(u);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 回复中不应出现的“记忆维护”口头汇报 */
const MEMORY_TALK = /已更新记忆|记忆已更新|更新了记忆|请核对记忆|是否符合你的记忆|我已(为|帮你)?更新/;

let pass = 0;
let fail = 0;
function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function ensureEnterprise() {
  const reg = await post(`${BUSINESS}/auth/register`, {
    username: USER,
    password: 'demo123',
    enterprise_name: '山东栖霞果品贸易有限公司',
    variety: '苹果',
  });
  if (reg.ok) return (await reg.json()).enterprise_id;
  const login = await post(`${BUSINESS}/auth/login`, { username: USER, password: 'demo123' });
  return (await login.json()).enterprise_id;
}

async function readMemory(enterpriseId) {
  const a = await (await get(`${BUSINESS}/admin/enterprises/${enterpriseId}/documents/长期记忆`)).json();
  const b = await (await get(`${BUSINESS}/admin/enterprises/${enterpriseId}/documents/日常状态`)).json();
  return `${a.content || ''}\n${b.content || ''}`;
}

async function ask(enterpriseId, message, sessionId) {
  const body = await (
    await post(`${RUNTIME}/agent/chat`, { enterprise_id: enterpriseId, message, session_id: sessionId })
  ).json();
  return { sessionId: body.session_id, reply: String(body.reply || ''), memory: body.memory_updates || [] };
}

async function readDialog() {
  const md = await readFile(join(CASE_DIR, '02_对话输入.md'), 'utf8');
  return md
    .split(/\n(?=\*\*第 \d+ 条\*\*)/)
    .slice(1)
    .map((b) =>
      b
        .split('\n---')[0]
        .replace(/^\*\*第 \d+ 条\*\*\s*\n/, '')
        .replace(/^>.*$/gm, '')
        .trim(),
    )
    .filter(Boolean);
}

async function runCase() {
  console.log('\n===== 案例：分层素材（背景 + 业务） =====');
  const enterpriseId = await ensureEnterprise();
  await post(`${BUSINESS}/workspace/init`, { enterprise_id: enterpriseId });
  console.log(`用例企业: ${enterpriseId}`);
  console.log(`标准答案: ${EXPECT.direction} · ${EXPECT.lots} 手（上限 ${EXPECT.capLots}）\n`);

  // 1) 上传宏观背景
  const buf = await readFile(join(CASE_DIR, '01_企业信息.txt'));
  const form = new FormData();
  form.append('file', new Blob([buf]), '01_企业信息.txt');
  const up = await fetch(`${BUSINESS}/admin/enterprises/${enterpriseId}/materials`, { method: 'POST', body: form });
  check('上传企业背景材料', up.ok, `HTTP ${up.status}`);

  let memory = '';
  for (let i = 0; i < 60; i++) {
    memory = await readMemory(enterpriseId);
    if (/冷库|批发|收购|2008|仓储/.test(memory)) break;
    await sleep(5000);
  }
  check(
    '智能体自主吸收企业背景（含冷库/批发/收购/2008 等）',
    /冷库|批发|收购|2008|仓储/.test(memory),
    memory ? `记忆内容片段: ${memory.replace(/\s+/g, ' ').slice(0, 160)}` : '等待超时，两份记忆仍为空',
  );

  // 2) 逐条对话（本次业务）
  const messages = await readDialog();
  let sessionId = '';
  let firstReply = '';
  let lastReply = '';
  for (let i = 0; i < messages.length; i++) {
    const r = await ask(enterpriseId, messages[i], sessionId || undefined);
    sessionId = r.sessionId;
    if (i === 0) firstReply = r.reply;
    lastReply = r.reply;
    const mem = r.memory.length ? `｜记忆更新(前端展示): ${r.memory.join('、')}` : '';
    console.log(`  · 第 ${i + 1}/${messages.length} 轮：${messages[i].slice(0, 20)}…${mem}`);
  }
  console.log('');

  check(
    '第 1 轮主动追问业务要素',
    /[?？]/.test(firstReply) && /授权|比例|敞口|库存|数量|期限|行情|价格|多少/.test(firstReply),
    firstReply.slice(0, 160),
  );
  check('第 1 轮未给出方向结论或手数', !/卖出保值|买入保值|\d+\s*手/.test(firstReply), firstReply.slice(0, 160));
  check('最终方向为卖出保值', /卖出|保护性看跌|protective_put/i.test(lastReply));
  check(`最终目标手数 = ${EXPECT.lots}`, /10\s*手|10手/.test(lastReply), lastReply.slice(0, 120));
  check('回复未出现记忆维护口头汇报', !MEMORY_TALK.test(lastReply), lastReply.slice(0, 160));

  console.log('\n  —— 第 1 轮回复（节选）——');
  console.log('  ' + firstReply.slice(0, 300).replace(/\n/g, '\n  '));
}

async function runStream() {
  console.log('\n===== 流式校验：/agent/chat/stream =====');
  const enterpriseId = await ensureEnterprise();
  await post(`${BUSINESS}/workspace/init`, { enterprise_id: enterpriseId });
  const res = await fetch(`${RUNTIME}/agent/chat/stream`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      enterprise_id: enterpriseId,
      message: '现有库存 180 吨一级红富士，授权比例 0.6，上限 0.8，保值到 2026-12-15，AP2612 结算价 8500。请给出方向与手数。',
    }),
  });
  const text = await res.text();
  const types = [...text.matchAll(/^event:\s*(.+)$/gm)].map((m) => m[1].trim());
  const sources = [...text.matchAll(/"source":"(\w+)"/g)].map((m) => m[1]);
  check('SSE 返回 200', res.status === 200, `HTTP ${res.status}`);
  check('含 start / token / result', types[0] === 'start' && types.includes('token') && types.includes('result'), types.join(','));
  check('token 均带合法 source', sources.length > 0 && sources.every((s) => ['think', 'tool', 'answer'].includes(s)), [...new Set(sources)].join(','));
  check('含 memory 事件', types.includes('memory'), types.join(','));
  console.log(`  · token ${types.filter((t) => t === 'token').length} 个，source: ${[...new Set(sources)].join('/') || '无'}`);
}

async function main() {
  const health = await (await get(`${RUNTIME}/agent/health`)).json();
  if (!health.configured) {
    console.error('未配置大模型');
    process.exit(2);
  }
  if (WHICH === 'stream') await runStream();
  else await runCase();
  console.log(`\n==== 回放汇总：通过 ${pass} / 失败 ${fail} ====`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('异常：', e.message);
  process.exit(1);
});
