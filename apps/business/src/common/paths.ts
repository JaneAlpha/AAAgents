import { join } from 'path';

/** 容器内工作区根目录，对应命名卷 workspace_data */
export function workspaceRoot(): string {
  return process.env.WORKSPACE_ROOT || '/workspace';
}

export function enterpriseDir(enterpriseId: string): string {
  return join(workspaceRoot(), enterpriseId);
}

export function dataDir(enterpriseId: string): string {
  return join(enterpriseDir(enterpriseId), 'data');
}

export function skillsDir(enterpriseId: string): string {
  return join(enterpriseDir(enterpriseId), 'skills');
}

/** 企业上传材料解析结果目录（与两份记忆文档分开存放） */
export function materialsDir(enterpriseId: string): string {
  return join(dataDir(enterpriseId), '资料');
}

export function runtimeDir(enterpriseId: string): string {
  return join(enterpriseDir(enterpriseId), 'runtime');
}

/** 系统级分品种资料，所有企业共享 */
export function sharedReferenceDir(): string {
  return join(workspaceRoot(), '_shared', '分品种资料');
}

/** 共享的 LLM 网关配置（后台可改，runtime 读取） */
export function llmConfigFile(): string {
  return join(workspaceRoot(), '_shared', 'llm-config.json');
}

/** 防止路径穿越：仅接受安全的文件名/品种名片段 */
export function safeSegment(value: string): string {
  if (!value || value.includes('..') || value.includes('/') || value.includes('\\')) {
    throw new Error(`非法路径片段: ${value}`);
  }
  return value;
}
