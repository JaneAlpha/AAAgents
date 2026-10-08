import { join } from 'path';

export function workspaceRoot(): string {
  return process.env.WORKSPACE_ROOT || '/workspace';
}

export function enterpriseDir(enterpriseId: string): string {
  return join(workspaceRoot(), enterpriseId);
}

export function runtimeDir(enterpriseId: string): string {
  return join(enterpriseDir(enterpriseId), 'runtime');
}

export function dataDir(enterpriseId: string): string {
  return join(enterpriseDir(enterpriseId), 'data');
}

export function safeSegment(value: string): string {
  if (!value || value.includes('..') || value.includes('/') || value.includes('\\')) {
    throw new Error(`非法路径片段: ${value}`);
  }
  return value;
}
