import { describe, expect, it } from 'vitest';
import { stripJsonBlocks } from './format';

describe('stripJsonBlocks', () => {
  it('剔除 ```json 围栏块，保留前后叙述', () => {
    const text = '分析如下：\n```json\n{"schema_version":"1.0.0"}\n```\n以上。';
    const out = stripJsonBlocks(text);
    expect(out).toContain('分析如下：');
    expect(out).toContain('以上。');
    expect(out).not.toContain('schema_version');
  });

  it('剔除未闭合的围栏块（流式中途）', () => {
    const text = '正在推理……\n```json\n{"schema_version":"1.0.0","meta":{';
    expect(stripJsonBlocks(text)).toBe('正在推理……');
  });

  it('剔除裸 JSON 结果段（无围栏）', () => {
    const text = '结论：\n{"schema_version":"1.0.0","meta":{"enterprise_id":"e"},"advice":[]}';
    expect(stripJsonBlocks(text)).not.toContain('schema_version');
  });

  it('纯叙述原样保留', () => {
    const text = '正敞口应卖出保值或买入保护性看跌。';
    expect(stripJsonBlocks(text)).toBe(text);
  });

  it('空输入返回空串', () => {
    expect(stripJsonBlocks('')).toBe('');
  });
});
