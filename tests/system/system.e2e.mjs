/**
 * 系统级端到端测试（真实 HTTP，跨 business + runtime + postgres）。
 * 运行前置：docker compose 已启动（或服务已在本地端口就绪）。
 * 退出码：0 表示全部通过；1 表示有失败。
 */
const BUSINESS = process.env.BUSINESS_URL || 'http://localhost:3000';
const RUNTIME = process.env.RUNTIME_URL || 'http://localhost:3001';

let passed = 0;
let failed = 0;
const failures = [];

async function step(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    failures.push(`${name}: ${err.message}`);
    console.log(`  ✗ ${name} — ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function req(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const jsonHeaders = { 'content-type': 'application/json' };
const jpost = (url, b) => req(url, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(b) });
const jput = (url, b) => req(url, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(b) });
const jpatch = (url, b) => req(url, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(b) });

async function waitFor(url, timeoutMs = 240000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* keep waiting */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`等待服务超时: ${url}`);
}

/** 与 schema/hedge_advice.schema.json 对齐的结构与合规校验 */
function validateAdvice(a) {
  assert(a && typeof a === 'object', 'result 应为对象');
  for (const k of ['schema_version', 'meta', 'data_status', 'exposure', 'advice', 'risk', 'compliance', 'lineage']) {
    assert(k in a, `缺字段 ${k}`);
  }
  assert(a.schema_version === '1.0.0', 'schema_version 应为 1.0.0');
  assert(['苹果', '红枣'].includes(a.meta.variety), `variety 非法: ${a.meta.variety}`);
  assert(typeof a.meta.enterprise_id === 'string' && a.meta.enterprise_id.length > 0, 'meta.enterprise_id 必填');
  assert(['complete', 'conditional', 'insufficient'].includes(a.data_status.status), 'data_status.status 非法');
  assert(Array.isArray(a.advice), 'advice 应为数组');
  for (const item of a.advice) {
    assert(item.reason && item.reason.length > 0, 'advice.reason 必填非空');
    assert(Array.isArray(item.conditions), 'advice.conditions 必填');
    if (item.entry_zone) {
      assert(item.entry_zone.unit === '元/吨', 'entry_zone.unit 应为 元/吨');
      assert(typeof item.entry_zone.low === 'number', 'entry_zone.low 应为数字');
    }
  }
  // 合规硬约束
  assert(a.compliance.no_order_placed === true, '合规：no_order_placed 必须为 true');
  assert(a.compliance.not_investment_advice === true, '合规：not_investment_advice 必须为 true');
  assert(a.compliance.human_review_required === true, '合规：human_review_required 必须为 true');
  assert(typeof a.compliance.disclaimer === 'string' && a.compliance.disclaimer.length > 0, '合规：disclaimer 必填');
}

// ============ 场景 1：全新企业的完整业务链路 ============
async function scenarioFullFlow() {
  console.log('\n[场景 1] 注册 → 登录 → 初始化(幂等) → 上传 Skill → Agent 运行 → 输出校验');
  const suffix = Date.now();
  const username = `e2e_apple_${suffix}`;
  let enterpriseId = '';

  await step('注册新企业（苹果）', async () => {
    const r = await jpost(`${BUSINESS}/auth/register`, {
      username,
      password: 'secret123',
      enterprise_name: 'E2E 苹果企业',
      variety: '苹果',
    });
    assert(r.status === 201 || r.status === 200, `注册返回 ${r.status}: ${JSON.stringify(r.body)}`);
    assert(/^ent_/.test(r.body.enterprise_id), 'enterprise_id 格式错误');
    enterpriseId = r.body.enterprise_id;
  });

  await step('登录返回同一 enterprise_id', async () => {
    const r = await jpost(`${BUSINESS}/auth/login`, { username, password: 'secret123' });
    assert(r.status === 200 || r.status === 201, `登录返回 ${r.status}`);
    assert(r.body.enterprise_id === enterpriseId, '登录 enterprise_id 与注册不一致');
  });

  await step('初始化 Workspace（首次 created=true）', async () => {
    const r = await jpost(`${BUSINESS}/workspace/init`, { enterprise_id: enterpriseId });
    assert(r.status === 201 || r.status === 200, `init 返回 ${r.status}`);
    assert(r.body.created === true, '首次应 created=true');
    assert(r.body.workspace_path.endsWith(enterpriseId), 'workspace_path 不含 enterprise_id');
  });

  await step('重复初始化幂等（created=false，路径不变）', async () => {
    const r = await jpost(`${BUSINESS}/workspace/init`, { enterprise_id: enterpriseId });
    assert(r.body.created === false, '第二次应 created=false');
  });

  await step('上传 Skill（规则文档形态）', async () => {
    const r = await jpost(`${BUSINESS}/skill/${encodeURIComponent(enterpriseId)}/${encodeURIComponent('苹果')}`, {
      filename: 'SKILL.md',
      content: '# 苹果套保 Skill\n依据 workspace 数据输出 hedge_advice。',
    });
    assert(r.status === 201 || r.status === 200, `上传返回 ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.saved === true, 'saved 应为 true');
  });

  let runResult;
  await step('Agent Runtime 运行并返回结构化结果', async () => {
    const r = await jpost(`${RUNTIME}/agent/run`, {
      enterprise_id: enterpriseId,
      user_request: '请给出套保参考点位与前提条件。',
    });
    assert(r.status === 201 || r.status === 200, `运行返回 ${r.status}: ${JSON.stringify(r.body)}`);
    runResult = r.body;
    assert(typeof runResult.session_id === 'string', '缺 session_id');
    assert(runResult.attempts >= 1, 'attempts 应 >= 1');
  });

  await step('结果满足 hedge_advice schema 与合规硬约束', async () => {
    validateAdvice(runResult.result);
    assert(runResult.result.meta.enterprise_id === enterpriseId, '结果的 enterprise_id 不匹配');
    assert(runResult.result.meta.variety === '苹果', '结果 variety 应为苹果');
  });

  return enterpriseId;
}

// ============ 场景 2：数据中心与多轮会话 ============
async function scenarioDataAndMultiTurn() {
  console.log('\n[场景 2] 企业信息 / 文档 / 行情 / 参考资料 + 多轮会话');
  let enterpriseId = '';

  await step('seed 的示范企业可登录', async () => {
    const r = await jpost(`${BUSINESS}/auth/login`, { username: 'jujube_demo', password: 'demo123' });
    assert(r.status === 200 || r.status === 201, `登录返回 ${r.status}`);
    enterpriseId = r.body.enterprise_id;
    assert(enterpriseId, '未取得 enterprise_id');
  });

  await step('企业信息可读且含品种', async () => {
    const r = await req(`${BUSINESS}/admin/enterprises/${encodeURIComponent(enterpriseId)}`);
    assert(r.status === 200, `读取返回 ${r.status}`);
    assert(r.body.variety === '红枣', `品种应为红枣，实为 ${r.body.variety}`);
  });

  await step('企业信息可更新', async () => {
    const r = await jpatch(`${BUSINESS}/admin/enterprises/${encodeURIComponent(enterpriseId)}`, {
      name: 'E2E 红枣企业（已更新）',
    });
    assert(r.status === 200, `更新返回 ${r.status}`);
    assert(r.body.name.includes('已更新'), '名称未更新');
  });

  await step('文档类数据写后读回一致', async () => {
    const content = `# 日常状态\n- 净敞口：120 吨\n- 时间：${new Date().toISOString()}`;
    const w = await jput(
      `${BUSINESS}/admin/enterprises/${encodeURIComponent(enterpriseId)}/documents/${encodeURIComponent('日常状态')}`,
      { content },
    );
    assert(w.status === 200, `写入返回 ${w.status}`);
    const r = await req(
      `${BUSINESS}/admin/enterprises/${encodeURIComponent(enterpriseId)}/documents/${encodeURIComponent('日常状态')}`,
    );
    assert(r.body.content === content, '读回内容与写入不一致');
  });

  await step('行情可查询且为模拟来源', async () => {
    const r = await req(`${BUSINESS}/admin/market-quotes?variety=${encodeURIComponent('红枣')}`);
    assert(r.status === 200, `行情返回 ${r.status}`);
    assert(Array.isArray(r.body) && r.body.length >= 1, '红枣行情应至少 1 条');
    assert(r.body.every((q) => typeof q.settle === 'number'), '行情缺 settle');
  });

  await step('系统级分品种资料可读', async () => {
    const list = await req(`${BUSINESS}/admin/reference`);
    assert(list.status === 200, `资料列表返回 ${list.status}`);
    assert(list.body.some((x) => x.variety === '红枣'), '缺红枣参考资料');
    const file = await req(`${BUSINESS}/admin/reference/${encodeURIComponent('红枣')}/${encodeURIComponent('合约规则.md')}`);
    assert(file.status === 200 && file.body.content.includes('红枣'), '资料内容读取失败');
  });

  await step('多轮会话：同一 session 两次运行，历史累积', async () => {
    const first = await jpost(`${RUNTIME}/agent/run`, {
      enterprise_id: enterpriseId,
      user_request: '第一轮：分析敞口',
    });
    assert(first.status === 200 || first.status === 201, `第一轮返回 ${first.status}`);
    const sessionId = first.body.session_id;

    const second = await jpost(`${RUNTIME}/agent/run`, {
      enterprise_id: enterpriseId,
      user_request: '第二轮：给出参考点位',
      session_id: sessionId,
    });
    assert(second.body.session_id === sessionId, '第二轮 session_id 应复用');
    validateAdvice(second.body.result);
  });
}

// ============ 场景 3：流式输出 + LLM 配置 ============
async function scenarioStreamingAndConfig() {
  console.log('\n[场景 3] SSE 流式输出 + LLM 网关配置');
  let enterpriseId = '';

  await step('取示范企业（苹果）', async () => {
    const r = await jpost(`${BUSINESS}/auth/login`, { username: 'apple_demo', password: 'demo123' });
    assert(r.status === 200 || r.status === 201, `登录返回 ${r.status}`);
    enterpriseId = r.body.enterprise_id;
    assert(enterpriseId, '未取得 enterprise_id');
  });

  await step('GET /admin/llm-config 可读且 key 脱敏', async () => {
    const r = await req(`${BUSINESS}/admin/llm-config`);
    assert(r.status === 200, `返回 ${r.status}`);
    assert(['mock', 'live'].includes(r.body.mode), `mode 非法: ${r.body.mode}`);
    assert(!('api_key' in r.body), '响应不应包含明文 api_key');
  });

  await step('PUT /admin/llm-config 写入生效', async () => {
    const r = await jput(`${BUSINESS}/admin/llm-config`, {
      mode: 'mock',
      base_url: 'https://gw.example.com/v1',
      model: 'demo-model',
    });
    assert(r.status === 200, `返回 ${r.status}`);
    assert(r.body.base_url === 'https://gw.example.com/v1', 'base_url 未生效');
  });

  await step('SSE 流式（mock）：仅 start + result，不产生模拟推理 token', async () => {
    const res = await fetch(`${RUNTIME}/agent/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enterprise_id: enterpriseId, user_request: '流式分析敞口' }),
    });
    assert(res.status === 200, `流式返回 ${res.status}`);
    const text = await res.text();
    const types = [...text.matchAll(/^event:\s*(.+)$/gm)].map((m) => m[1].trim());
    assert(types[0] === 'start', `首个事件应为 start，实为 ${types[0]}`);
    assert(types[types.length - 1] === 'result', `末尾应为 result，实为 ${types[types.length - 1]}`);
    assert(!types.includes('token'), 'mock 模式不应产生推理 token（推理层只反映真实推理）');

    const blocks = text.split('\n\n').filter((b) => b.includes('event: result'));
    const dataLine = blocks[blocks.length - 1].split('\n').find((l) => l.startsWith('data:'));
    const payload = JSON.parse(dataLine.slice(5));
    validateAdvice(payload.result);
    assert(payload.attempts >= 1, 'attempts 应 >= 1');
  });
}

async function main() {
  console.log('系统级 E2E 测试启动…');
  await waitFor(`${BUSINESS}/admin/enterprises`);
  await waitFor(`${RUNTIME}/agent/health`);
  console.log('服务就绪，开始执行用例。');

  await scenarioFullFlow();
  await scenarioDataAndMultiTurn();
  await scenarioStreamingAndConfig();

  console.log(`\n==== 系统级测试汇总：通过 ${passed} / 失败 ${failed} ====`);
  if (failed > 0) {
    console.log('失败明细：');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('系统级测试异常终止：', err);
  process.exit(1);
});
