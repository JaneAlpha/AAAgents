const BUSINESS = (import.meta.env.VITE_BUSINESS_URL as string) || '';
const RUNTIME = (import.meta.env.VITE_RUNTIME_URL as string) || 'http://localhost:3001';

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return (await res.json()) as T;
}

const jsonHeaders = { 'content-type': 'application/json' };

export const api = {
  register: (body: { username: string; password: string; enterprise_name: string; variety: string }) =>
    fetch(`${BUSINESS}/auth/register`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }).then(handle<{ enterprise_id: string }>),

  login: (body: { username: string; password: string }) =>
    fetch(`${BUSINESS}/auth/login`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }).then(handle<{ enterprise_id: string }>),

  initWorkspace: (enterprise_id: string) =>
    fetch(`${BUSINESS}/workspace/init`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ enterprise_id }) }).then(
      handle<{ workspace_path: string; created: boolean }>,
    ),

  listEnterprises: () => fetch(`${BUSINESS}/admin/enterprises`).then(handle<any[]>),
  getEnterprise: (id: string) => fetch(`${BUSINESS}/admin/enterprises/${encodeURIComponent(id)}`).then(handle<any>),
  updateEnterprise: (id: string, body: { name?: string; variety?: string }) =>
    fetch(`${BUSINESS}/admin/enterprises/${encodeURIComponent(id)}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(body) }).then(handle<any>),

  listQuotes: (variety?: string) =>
    fetch(`${BUSINESS}/admin/market-quotes${variety ? `?variety=${encodeURIComponent(variety)}` : ''}`).then(handle<any[]>),
  listReference: () => fetch(`${BUSINESS}/admin/reference`).then(handle<any[]>),

  getDocument: (id: string, name: string) =>
    fetch(`${BUSINESS}/admin/enterprises/${encodeURIComponent(id)}/documents/${encodeURIComponent(name)}`).then(handle<{ content: string }>),
  putDocument: (id: string, name: string, content: string) =>
    fetch(`${BUSINESS}/admin/enterprises/${encodeURIComponent(id)}/documents/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ content }),
    }).then(handle<any>),

  skillOverview: (id: string) => fetch(`${BUSINESS}/skill/${encodeURIComponent(id)}`).then(handle<any>),

  // 企业材料（上传 + 解析）
  uploadMaterial: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${BUSINESS}/admin/enterprises/${encodeURIComponent(id)}/materials`, {
      method: 'POST',
      body: form,
    }).then(handle<any>);
  },
  listMaterials: (id: string) =>
    fetch(`${BUSINESS}/admin/enterprises/${encodeURIComponent(id)}/materials`).then(handle<any>),
  getMaterial: (id: string, file: string) =>
    fetch(
      `${BUSINESS}/admin/enterprises/${encodeURIComponent(id)}/materials/${encodeURIComponent(file)}`,
    ).then(handle<any>),

  // 会话记录（Runtime 写入 workspace 会话文件，业务服务只读提供）
  listSessions: (enterpriseId: string) =>
    fetch(`${BUSINESS}/sessions?enterprise_id=${encodeURIComponent(enterpriseId)}`).then(
      handle<{ sessions: any[] }>,
    ),
  getSession: (enterpriseId: string, sessionId: string) =>
    fetch(
      `${BUSINESS}/sessions/${encodeURIComponent(enterpriseId)}/${encodeURIComponent(sessionId)}`,
    ).then(handle<{ messages: any[] }>),
  deleteSession: (enterpriseId: string, sessionId: string) =>
    fetch(`${BUSINESS}/sessions/${encodeURIComponent(enterpriseId)}/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    }).then(handle<any>),

  // 与常驻智能体对话（user / system 统一入口）
  chatAgent: (body: { enterprise_id: string; message: string; session_id?: string; author?: 'user' | 'system' }) =>
    fetch(`${RUNTIME}/agent/chat`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }).then(
      handle<any>,
    ),
  uploadSkill: (id: string, variety: string, filename: string, content: string) =>
    fetch(`${BUSINESS}/skill/${encodeURIComponent(id)}/${encodeURIComponent(variety)}`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ filename, content }),
    }).then(handle<any>),

  runAgent: (body: { enterprise_id: string; user_request: string; session_id?: string }) =>
    fetch(`${RUNTIME}/agent/run`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }).then(handle<any>),

  getLlmConfig: () => fetch(`${BUSINESS}/admin/llm-config`).then(handle<any>),
  putLlmConfig: (body: { base_url?: string; model?: string; api_key?: string }) =>
    fetch(`${BUSINESS}/admin/llm-config`, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(body) }).then(handle<any>),
};

/** 流式对话（SSE）：事件 start|token|memory|result|error */
export async function chatAgentStream(
  body: { enterprise_id: string; message: string; session_id?: string; author?: 'user' | 'system' },
  onEvent: (type: string, data: any) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${RUNTIME}/agent/chat/stream`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`${res.status}: ${await res.text().catch(() => '')}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const lines = part.split('\n');
      const eventLine = lines.find((l) => l.startsWith('event:'));
      const dataLine = lines.find((l) => l.startsWith('data:'));
      if (eventLine && dataLine) {
        try {
          onEvent(eventLine.slice(6).trim(), JSON.parse(dataLine.slice(5).trim()));
        } catch {
          /* 忽略 */
        }
      }
    }
  }
}

/** 流式调用 Agent（SSE），逐事件回调。 */
export async function streamAgent(
  body: { enterprise_id: string; user_request: string; session_id?: string },
  onEvent: (type: string, data: any) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${RUNTIME}/agent/stream`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`${res.status}: ${await res.text().catch(() => '')}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const lines = part.split('\n');
      const eventLine = lines.find((l) => l.startsWith('event:'));
      const dataLine = lines.find((l) => l.startsWith('data:'));
      if (eventLine && dataLine) {
        const type = eventLine.slice(6).trim();
        try {
          onEvent(type, JSON.parse(dataLine.slice(5).trim()));
        } catch {
          /* 忽略无法解析的分片 */
        }
      }
    }
  }
}
