import { Injectable } from '@nestjs/common';
import { HedgeAdvice, HedgeAdviceSchema } from './hedge-advice.schema';

export type ValidateResult =
  | { ok: true; data: HedgeAdvice }
  | { ok: false; errors: string[] };

/**
 * 输出层：同进程函数。按 schema 校验 Agent 结果，失败时返回错误清单供上层重试。
 * 仅承担结构约束，不承担业务判断。
 */
@Injectable()
export class OutputService {
  validate(raw: unknown): ValidateResult {
    const parsed = HedgeAdviceSchema.safeParse(raw);
    if (parsed.success) {
      return { ok: true, data: parsed.data };
    }
    const errors = parsed.error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    });
    return { ok: false, errors };
  }
}
