/**
 * 输出契约说明，注入 system prompt。
 * 必须与 output/hedge-advice.schema.ts（以及 schema/hedge_advice.schema.json）保持一致。
 */
export const SCHEMA_PROMPT = `你必须只输出一个 JSON 对象，严格满足以下结构。字段不得增减；除标注可为 null 外全部必填。

{
  "schema_version": "1.0.0",
  "meta": { "enterprise_id": string, "variety": "苹果"|"红枣", "as_of": "YYYY-MM-DD", "generated_at": ISO8601字符串 },
  "data_status": { "status": "complete"|"conditional"|"insufficient", "missing": [string] },
  "exposure": [ { "pool_id": string, "basis": string, "net_ton": number, "risk_direction": "long"|"short"|"flat" } ],
  "advice": [ {
      "pool_id": string,
      "action": "sell_hedge"|"buy_hedge"|"hold"|"observe",
      "instrument": "futures"|"protective_put"|"protective_call"|"option_structure"|"spot_contract"|"none",
      "contract": string|null,
      "target_lots": 非负整数|null,
      "entry_zone": { "low": number, "high": number, "unit": "元/吨" }|null,
      "horizon": "YYYY-MM-DD"|null,
      "reason": 非空字符串,
      "conditions": [string]
  } ],
  "risk": { "blockers": [string], "warnings": [string], "max_hedge_ratio": number|null, "cash_stress": object|null },
  "compliance": {
      "no_order_placed": true, "not_investment_advice": true, "human_review_required": true,
      "required_reviewers": ["业务负责人","独立风控","企业授权审批人"], "disclaimer": 非空字符串
  },
  "lineage": { "snapshot_hash": string, "report_hash": string, "rule_refs": [string], "data_sources": [string] }
}

枚举取值必须逐字使用（校验为严格枚举，写错即失败）：
- action 只能是 sell_hedge / buy_hedge / hold / observe —— 不得写 "sell"、"buy"、"卖出"。
- instrument 只能是上述六个单词 —— 具体合约代码（如 "AP2612"）必须放在 contract 字段，不能写进 instrument。
- risk_direction 只能是 long / short / flat。
- data_status.status 只能是 complete / conditional / insufficient。

业务口径：
- 正敞口（持库存怕跌）→ action="sell_hedge"，instrument 可用 "protective_put"。
- 负敞口（需采购怕涨）→ action="buy_hedge"，instrument 可用 "protective_call"。
- 目标手数 target_lots = trunc(净吨 × 授权套保比例 ÷ 合约乘数)，**向零取整（不得向上取整）**。例：180 × 0.6 ÷ 10 = 10.8 → 10，不是 11。不得为了凑够授权比例而上取；不得突破实需与授权上限。
- entry_zone 为参考点位评估区间，非成交价。
- 数据缺失时不得虚构数量与价格；数据不充分可在 risk.blockers 中说明，并可用 action="observe"。
- compliance 三个布尔必须为 true。`;
