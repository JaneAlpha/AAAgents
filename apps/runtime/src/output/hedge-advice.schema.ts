import { z } from 'zod';

/**
 * 套保提示结果 Schema（与 schema/hedge_advice.schema.json 保持一致）。
 * 合规：不下单 / 非投资建议 / 必须人工复核。可操作：合约、方向、手数、参考点位、前提条件。
 */
export const HedgeAdviceSchema = z
  .object({
    schema_version: z.literal('1.0.0'),
    meta: z
      .object({
        enterprise_id: z.string().min(1),
        variety: z.enum(['苹果', '红枣']),
        as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'as_of 需为 YYYY-MM-DD'),
        generated_at: z.string().min(1),
      })
      .strict(),
    data_status: z
      .object({
        status: z.enum(['complete', 'conditional', 'insufficient']),
        missing: z.array(z.string()),
      })
      .strict(),
    exposure: z.array(
      z
        .object({
          pool_id: z.string(),
          basis: z.string(),
          net_ton: z.number(),
          risk_direction: z.enum(['long', 'short', 'flat']),
        })
        .strict(),
    ),
    advice: z.array(
      z
        .object({
          pool_id: z.string(),
          action: z.enum(['sell_hedge', 'buy_hedge', 'hold', 'observe']),
          instrument: z.enum([
            'futures',
            'protective_put',
            'protective_call',
            'option_structure',
            'spot_contract',
            'none',
          ]),
          contract: z.string().nullable().optional(),
          target_lots: z.number().int().min(0).nullable().optional(),
          entry_zone: z
            .object({ low: z.number(), high: z.number(), unit: z.literal('元/吨') })
            .strict()
            .nullable()
            .optional(),
          horizon: z.string().nullable().optional(),
          reason: z.string().min(1),
          conditions: z.array(z.string()),
        })
        .strict(),
    ),
    risk: z
      .object({
        blockers: z.array(z.string()),
        warnings: z.array(z.string()),
        max_hedge_ratio: z.number().min(0).max(1).nullable().optional(),
        cash_stress: z.record(z.any()).nullable().optional(),
      })
      .strict(),
    compliance: z
      .object({
        no_order_placed: z.literal(true),
        not_investment_advice: z.literal(true),
        human_review_required: z.literal(true),
        required_reviewers: z.array(z.enum(['业务负责人', '独立风控', '企业授权审批人'])),
        disclaimer: z.string().min(1),
      })
      .strict(),
    lineage: z
      .object({
        snapshot_hash: z.string(),
        report_hash: z.string(),
        rule_refs: z.array(z.string()).optional(),
        data_sources: z.array(z.string()).optional(),
      })
      .strict(),
  })
  .strict();

export type HedgeAdvice = z.infer<typeof HedgeAdviceSchema>;
