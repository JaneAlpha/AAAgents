/**
 * 从推理叙述中剔除 JSON 代码块与最终结果 JSON。
 * 目的：推理区只呈现可读叙述，结构化结果由「结构化结果」区单独渲染，避免重复与噪声。
 */
export function stripJsonBlocks(text: string): string {
  return text
    // 完整围栏代码块（```json ... ``` / ``` ... ```）
    .replace(/```[^\n]*\n[\s\S]*?```/g, '')
    // 未闭合围栏（流式中途被截断）
    .replace(/```[\s\S]*$/g, '')
    // 裸 JSON 结果段（以结果字段名开头的对象，含未闭合情形）
    .replace(/\{\s*"(?:schema_version|meta|data_status|exposure|advice|risk|compliance|lineage)"[\s\S]*$/m, '')
    .trim();
}
