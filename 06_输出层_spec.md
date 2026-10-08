# 输出层 Spec

## 输入

agent_result: object（由 Agent 输出解析得到，同步或流式皆然）

## 处理流程

1.  接收 Agent 结果。
2.  按 schema/hedge_advice.schema.json（Zod 实现）校验。
3.  检查必填字段与字段类型；compliance 三个布尔必须为 true。
4.  校验通过 → 输出标准结构。
5.  校验失败 → 返回错误清单，由 Runtime 回灌给 Agent 重试（最多 3 次）。

## 输出

formatted_result: object（即 hedge_advice 结构）

## 流式行为

流式运行中，token 事件为原始增量文本；**只有末尾 result 事件承载已通过校验的结构化结果**，中间文本不作为交付物。

## 技术实现

- TypeScript
- Zod（源 schema：schema/hedge_advice.schema.json）
- 同进程函数
