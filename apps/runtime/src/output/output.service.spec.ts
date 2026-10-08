import { OutputService } from './output.service';

const valid = {
  schema_version: '1.0.0',
  meta: { enterprise_id: 'ent_x', variety: '苹果', as_of: '2026-10-05', generated_at: '2026-10-05T00:00:00.000Z' },
  data_status: { status: 'complete', missing: [] },
  exposure: [{ pool_id: 'p1', basis: '2026|A|一级|2026-12-15', net_ton: 10, risk_direction: 'long' }],
  advice: [
    {
      pool_id: 'p1',
      action: 'sell_hedge',
      instrument: 'futures',
      contract: 'AP2610',
      target_lots: 1,
      entry_zone: { low: 8000, high: 8500, unit: '元/吨' },
      horizon: '2026-12-15',
      reason: 'r',
      conditions: [],
    },
  ],
  risk: { blockers: [], warnings: [] },
  compliance: {
    no_order_placed: true,
    not_investment_advice: true,
    human_review_required: true,
    required_reviewers: ['业务负责人'],
    disclaimer: 'd',
  },
  lineage: { snapshot_hash: 's', report_hash: 'r' },
};

describe('OutputService', () => {
  const svc = new OutputService();

  it('合法结构通过', () => {
    const res = svc.validate(valid);
    expect(res.ok).toBe(true);
  });

  it('缺 compliance → 失败并给出错误清单', () => {
    const { compliance, ...rest } = valid;
    const res = svc.validate(rest);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.join(';')).toContain('compliance');
    }
  });

  it('非法品种 → 失败', () => {
    const bad = { ...valid, meta: { ...valid.meta, variety: '香蕉' } };
    const res = svc.validate(bad);
    expect(res.ok).toBe(false);
  });

  it('compliance 布尔必须为 true（合规硬约束）', () => {
    const bad = { ...valid, compliance: { ...valid.compliance, no_order_placed: false } };
    const res = svc.validate(bad);
    expect(res.ok).toBe(false);
  });

  it('额外字段被拒绝（strict）', () => {
    const bad = { ...valid, unexpected: 1 };
    const res = svc.validate(bad);
    expect(res.ok).toBe(false);
  });
});
