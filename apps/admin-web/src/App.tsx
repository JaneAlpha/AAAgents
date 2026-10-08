import { useCallback, useEffect, useRef, useState } from 'react';
import { api, chatAgentStream } from './api';
import { stripJsonBlocks } from './format';

type Tab = 'chat' | 'enterprise' | 'materials' | 'documents' | 'market' | 'skill' | 'model';

const TAB_LABELS: Record<Tab, string> = {
  chat: '对话',
  enterprise: '企业信息',
  materials: '企业资料',
  documents: '文档数据',
  market: '行情',
  skill: 'Skill',
  model: '模型配置',
};

interface ChatMsg {
  who: 'user' | 'assistant';
  text?: string;
  think?: string;
  tool?: string;
  answer?: string;
  memory?: string[];
  streaming?: boolean;
  error?: string;
}

export function App() {
  const [enterpriseId, setEnterpriseId] = useState<string>(() => localStorage.getItem('eid') || '');
  const [username, setUsername] = useState('apple_demo');
  const [password, setPassword] = useState('demo123');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regVariety, setRegVariety] = useState('苹果');
  const [tab, setTab] = useState<Tab>('chat');
  const [toast, setToast] = useState('');

  const notify = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 4000);
  }, []);

  const onLogin = async () => {
    try {
      const r = await api.login({ username, password });
      setEnterpriseId(r.enterprise_id);
      localStorage.setItem('eid', r.enterprise_id);
      notify(`登录成功：${r.enterprise_id}`);
    } catch (e) {
      notify(`登录失败：${(e as Error).message}`);
    }
  };

  const onRegister = async () => {
    if (!regUsername.trim() || !regPassword || !regName.trim()) {
      notify('注册失败：请填写用户名、密码与企业名称');
      return;
    }
    if (regPassword.length < 6) {
      notify('注册失败：密码至少 6 位');
      return;
    }
    try {
      const r = await api.register({
        username: regUsername.trim(),
        password: regPassword,
        enterprise_name: regName.trim(),
        variety: regVariety,
      });
      setEnterpriseId(r.enterprise_id);
      localStorage.setItem('eid', r.enterprise_id);
      await api.initWorkspace(r.enterprise_id);
      notify(`注册并初始化成功：${r.enterprise_id}`);
    } catch (e) {
      const msg = (e as Error).message;
      notify(`注册失败：${/409/.test(msg) ? '用户名已存在，请换一个' : msg}`);
    }
  };

  const onLogout = () => {
    setEnterpriseId('');
    localStorage.removeItem('eid');
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>套期保值智能体 · 管理后台</h1>
        {enterpriseId ? (
          <div className="session">
            <span className="eid">{enterpriseId}</span>
            <button onClick={onLogout}>退出</button>
          </div>
        ) : (
          <span className="muted">未登录</span>
        )}
      </header>

      {toast && <div className="toast">{toast}</div>}

      {!enterpriseId ? (
        <section className="card login-card">
          <h2>登录 / 注册</h2>
          <div className="grid2">
            <label>
              用户名
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label>
              密码
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          </div>
          <div className="row">
            <button className="primary" onClick={onLogin}>
              登录
            </button>
          </div>
          <hr />
          <h3>注册新企业</h3>
          <div className="grid2">
            <label>
              用户名（新账号）
              <input
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                placeholder="例如 demo1"
              />
            </label>
            <label>
              密码（至少 6 位）
              <input
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
              />
            </label>
          </div>
          <div className="grid2">
            <label>
              企业名称
              <input
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="例如 山东栖霞果品贸易有限公司"
              />
            </label>
            <label>
              品种
              <select value={regVariety} onChange={(e) => setRegVariety(e.target.value)}>
                <option value="苹果">苹果</option>
                <option value="红枣">红枣</option>
              </select>
            </label>
          </div>
          <div className="row">
            <button className="primary" onClick={onRegister}>
              注册并初始化 Workspace
            </button>
          </div>
          <p className="hint">演示账号：apple_demo / jujube_demo，密码 demo123</p>
        </section>
      ) : (
        <>
          <nav className="tabs">
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
              <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </nav>
          <main>
            {tab === 'enterprise' && <EnterpriseTab enterpriseId={enterpriseId} notify={notify} />}
            {tab === 'documents' && <DocumentsTab enterpriseId={enterpriseId} notify={notify} />}
            {tab === 'market' && <MarketTab />}
            {tab === 'materials' && <MaterialsTab enterpriseId={enterpriseId} notify={notify} />}
            {tab === 'skill' && <SkillTab enterpriseId={enterpriseId} notify={notify} />}
            {tab === 'model' && <ModelTab notify={notify} />}
            {tab === 'chat' && <ChatTab enterpriseId={enterpriseId} notify={notify} />}
          </main>
        </>
      )}
    </div>
  );
}

function EnterpriseTab({ enterpriseId, notify }: { enterpriseId: string; notify: (s: string) => void }) {
  const [list, setList] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [name, setName] = useState('');
  const [variety, setVariety] = useState('苹果');

  const load = useCallback(async () => {
    try {
      const all = await api.listEnterprises();
      setList(all);
      const me = await api.getEnterprise(enterpriseId);
      setCurrent(me);
      setName(me.name);
      setVariety(me.variety);
    } catch (e) {
      notify(`加载企业失败：${(e as Error).message}`);
    }
  }, [enterpriseId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    try {
      await api.updateEnterprise(enterpriseId, { name, variety });
      notify('已保存');
      void load();
    } catch (e) {
      notify(`保存失败：${(e as Error).message}`);
    }
  };

  return (
    <div className="grid-main">
      <section className="card">
        <h2>当前企业</h2>
        {current && (
          <>
            <p>
              <b>enterprise_id：</b>
              {current.enterpriseId}
            </p>
            <p>
              <b>Workspace：</b>
              {current.workspacePath || '（未初始化）'}
            </p>
            <p>
              <b>用户：</b>
              {current.users?.map((u: any) => u.username).join(', ') || '—'}
            </p>
            <label>
              企业名称
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              品种
              <select value={variety} onChange={(e) => setVariety(e.target.value)}>
                <option value="苹果">苹果</option>
                <option value="红枣">红枣</option>
              </select>
            </label>
            <button className="primary" onClick={save}>
              保存
            </button>
          </>
        )}
      </section>
      <section className="card">
        <h2>全部企业</h2>
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>品种</th>
              <th>enterprise_id</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.enterpriseId}>
                <td>{e.name}</td>
                <td>{e.variety}</td>
                <td className="mono">{e.enterpriseId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function DocumentsTab({ enterpriseId, notify }: { enterpriseId: string; notify: (s: string) => void }) {
  const [doc, setDoc] = useState<'长期记忆' | '日常状态'>('长期记忆');
  const [content, setContent] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.getDocument(enterpriseId, doc);
      setContent(r.content);
    } catch (e) {
      notify(`加载失败：${(e as Error).message}`);
    }
  }, [enterpriseId, doc, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    try {
      await api.putDocument(enterpriseId, doc, content);
      notify('已保存');
    } catch (e) {
      notify(`保存失败：${(e as Error).message}`);
    }
  };

  return (
    <section className="card">
      <h2>文档类数据（每企业 data/ 下两个 md）</h2>
      <div className="row">
        <button className={doc === '长期记忆' ? 'active' : ''} onClick={() => setDoc('长期记忆')}>
          长期记忆.md
        </button>
        <button className={doc === '日常状态' ? 'active' : ''} onClick={() => setDoc('日常状态')}>
          日常状态.md
        </button>
      </div>
      <textarea rows={14} value={content} onChange={(e) => setContent(e.target.value)} />
      <button className="primary" onClick={save}>
        保存
      </button>
    </section>
  );
}

function MarketTab() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [reference, setReference] = useState<any[]>([]);

  useEffect(() => {
    void api.listQuotes().then(setQuotes).catch(() => setQuotes([]));
    void api.listReference().then(setReference).catch(() => setReference([]));
  }, []);

  return (
    <div className="grid-main">
      <section className="card">
        <h2>品种行情（外部定时拉取 / 演示为模拟数据）</h2>
        <table>
          <thead>
            <tr>
              <th>品种</th>
              <th>合约</th>
              <th>结算价</th>
              <th>成交量</th>
              <th>持仓量</th>
              <th>日期</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id}>
                <td>{q.variety}</td>
                <td className="mono">{q.contract}</td>
                <td>{q.settle}</td>
                <td>{q.volume}</td>
                <td>{q.openInterest}</td>
                <td>{String(q.quoteDate).slice(0, 10)}</td>
                <td>{q.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>系统级分品种资料（共享）</h2>
        {reference.map((r) => (
          <div key={r.variety}>
            <b>{r.variety}</b>
            <ul>
              {r.files.map((f: string) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

function SkillTab({ enterpriseId, notify }: { enterpriseId: string; notify: (s: string) => void }) {
  const [overview, setOverview] = useState<any>(null);
  const [variety, setVariety] = useState('苹果');
  const [filename, setFilename] = useState('SKILL.md');
  const [content, setContent] = useState('');
  const [fileContent, setFileContent] = useState('');

  const load = useCallback(async () => {
    try {
      const o = await api.skillOverview(enterpriseId);
      setOverview(o);
      setVariety(o.variety);
    } catch (e) {
      notify(`加载失败：${(e as Error).message}`);
    }
  }, [enterpriseId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async () => {
    try {
      await api.uploadSkill(enterpriseId, variety, filename, content);
      notify('上传成功（覆盖式）');
      void load();
    } catch (e) {
      notify(`上传失败：${(e as Error).message}`);
    }
  };

  return (
    <section className="card">
      <h2>Skill 资源（人工上传 + 后台维护，仅支持重新上传覆盖）</h2>
      {overview && (
        <p>
          <b>企业品种：</b>
          {overview.variety} &nbsp;|&nbsp; <b>skill_path：</b>
          <span className="mono">{overview.skill_path}</span>
        </p>
      )}
      <div className="grid2">
        <label>
          品种
          <select value={variety} onChange={(e) => setVariety(e.target.value)}>
            <option value="苹果">苹果</option>
            <option value="红枣">红枣</option>
          </select>
        </label>
        <label>
          文件名
          <input value={filename} onChange={(e) => setFilename(e.target.value)} />
        </label>
      </div>
      <textarea
        rows={10}
        placeholder="# SKILL.md 内容（规则文档形态）"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="row">
        <button className="primary" onClick={upload}>
          上传 / 覆盖
        </button>
      </div>

      <h3>已上传</h3>
      {overview?.varieties &&
        Object.entries(overview.varieties).map(([v, files]) => (
          <div key={v}>
            <b>{v}</b>: {(files as string[]).join(', ') || '（空）'}
          </div>
        ))}

      <hr />
      <h3>查看文件内容</h3>
      <button
        onClick={async () => {
          try {
            const url = `${(import.meta as any).env.VITE_BUSINESS_URL || ''}/skill/${encodeURIComponent(
              enterpriseId,
            )}/${encodeURIComponent(variety)}/${encodeURIComponent(filename)}`;
            const r = await fetch(url);
            if (!r.ok) throw new Error(await r.text());
            setFileContent(JSON.stringify(await r.json(), null, 2));
          } catch (e) {
            setFileContent(`读取失败：${(e as Error).message}`);
          }
        }}
      >
        读取
      </button>
      <pre className="mono small">{fileContent}</pre>
    </section>
  );
}

function MaterialsTab({ enterpriseId, notify }: { enterpriseId: string; notify: (s: string) => void }) {
  const [files, setFiles] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [viewing, setViewing] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.listMaterials(enterpriseId);
      setFiles(r.materials || []);
    } catch (e) {
      notify(`加载失败：${(e as Error).message}`);
    }
  }, [enterpriseId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const onUpload = async (f?: File | null) => {
    if (!f) {
      return;
    }
    setBusy(true);
    try {
      const r = await api.uploadMaterial(enterpriseId, f);
      notify(`已解析：${r.parsed_file}（${r.chars} 字），已作为 system 对话通知智能体`);
      void load();
    } catch (e) {
      notify(`上传失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const view = async (name: string) => {
    try {
      const r = await api.getMaterial(enterpriseId, name);
      setViewing(name);
      setContent(r.content);
    } catch (e) {
      notify(`读取失败：${(e as Error).message}`);
    }
  };

  return (
    <div className="grid-main">
      <section className="card">
        <h2>企业资料（上传 → 解析入库）</h2>
        <p className="muted small">
          支持 Word(.docx) / PDF(.pdf) / .md / .txt；解析结果存入 <span className="mono">data/资料/</span>，与两份记忆文档分开。
        </p>
        <input
          type="file"
          accept=".docx,.pdf,.md,.txt"
          disabled={busy}
          onChange={(e) => void onUpload(e.target.files?.[0])}
        />
        <h3>已入库资料</h3>
        {files.length === 0 ? (
          <p className="muted small">暂无资料。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>文件</th>
                <th>大小</th>
                <th>更新时间</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.name}>
                  <td className="mono small">{f.name}</td>
                  <td>{f.bytes}</td>
                  <td className="small">{String(f.updated_at).slice(0, 19).replace('T', ' ')}</td>
                  <td>
                    <button className="link" onClick={() => void view(f.name)}>
                      查看
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="card">
        <h2>解析结果 {viewing && <span className="muted small">· {viewing}</span>}</h2>
        {content ? <pre className="mono small">{content}</pre> : <p className="muted">点击左侧「查看」。</p>}
      </section>
    </div>
  );
}

function ChatTab({ enterpriseId, notify }: { enterpriseId: string; notify: (s: string) => void }) {
  const [sessions, setSessions] = useState<
    Array<{ session_id: string; title: string; message_count: number; updated_at: string }>
  >([]);
  const [currentId, setCurrentId] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentKey = `chat:current:${enterpriseId}`;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const loadSessions = useCallback(async () => {
    try {
      const r = await api.listSessions(enterpriseId);
      setSessions(r.sessions || []);
      return r.sessions || [];
    } catch (e) {
      notify(`加载会话列表失败：${(e as Error).message}`);
      return [];
    }
  }, [enterpriseId, notify]);

  const loadMessages = useCallback(
    async (sid: string) => {
      if (!sid) {
        setMessages([]);
        return;
      }
      try {
        const r = await api.getSession(enterpriseId, sid);
        setMessages(
          (r.messages || []).map((m: any) =>
            m.role === 'user' ? { who: 'user', text: m.content } : { who: 'assistant', answer: m.content },
          ),
        );
      } catch (e) {
        notify(`加载会话失败：${(e as Error).message}`);
        setMessages([]);
      }
    },
    [enterpriseId, notify],
  );

  // 进入页面 / 切 tab 回来：拉会话列表，并恢复上次查看的会话（记录来自服务端，不依赖本地存储）
  useEffect(() => {
    void (async () => {
      const list = await loadSessions();
      const saved = localStorage.getItem(currentKey) || '';
      const pick = list.find((s) => s.session_id === saved)?.session_id || list[0]?.session_id || '';
      setCurrentId(pick);
      await loadMessages(pick);
    })();
  }, [loadSessions, loadMessages, currentKey]);

  const selectSession = async (sid: string) => {
    setCurrentId(sid);
    localStorage.setItem(currentKey, sid);
    await loadMessages(sid);
  };

  const newChat = () => {
    setCurrentId('');
    setMessages([]);
    localStorage.removeItem(currentKey);
  };

  const removeSession = async (sid: string) => {
    if (!window.confirm('删除该会话记录？')) {
      return;
    }
    try {
      await api.deleteSession(enterpriseId, sid);
      if (sid === currentId) {
        newChat();
      }
      await loadSessions();
      notify('已删除该会话');
    } catch (e) {
      notify(`删除失败：${(e as Error).message}`);
    }
  };

  const patchLast = (fn: (m: ChatMsg) => ChatMsg) =>
    setMessages((list) => {
      const copy = [...list];
      const last = copy[copy.length - 1];
      if (last && last.who === 'assistant') {
        copy[copy.length - 1] = fn(last);
      }
      return copy;
    });

  const send = async () => {
    const text = input.trim();
    if (!text || busy) {
      return;
    }
    setInput('');
    setBusy(true);
    setMessages((m) => [...m, { who: 'user', text }, { who: 'assistant', streaming: true }]);
    try {
      await chatAgentStream(
        { enterprise_id: enterpriseId, message: text, session_id: currentId || undefined },
        (type, data) => {
          if (type === 'start') {
            setCurrentId((cur) => {
              if (!cur) {
                localStorage.setItem(currentKey, data.session_id);
                return data.session_id;
              }
              return cur;
            });
          } else if (type === 'token') {
            patchLast((m) => ({
              ...m,
              think: data.source === 'think' ? (m.think || '') + data.delta : m.think,
              tool: data.source === 'tool' ? (m.tool || '') + data.delta : m.tool,
              answer: data.source === 'answer' ? (m.answer || '') + data.delta : m.answer,
            }));
          } else if (type === 'memory') {
            patchLast((m) => ({ ...m, memory: data.files }));
          } else if (type === 'result') {
            patchLast((m) => ({ ...m, streaming: false, answer: data.reply }));
          } else if (type === 'error') {
            patchLast((m) => ({ ...m, streaming: false, error: data.message }));
          }
        },
      );
      await loadSessions();
    } catch (e) {
      patchLast((m) => ({ ...m, streaming: false, error: (e as Error).message }));
      notify(`对话失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-layout">
      <aside className="chat-sidebar">
        <button className="primary chat-new" onClick={newChat}>
          ＋ 新建对话
        </button>
        <div className="chat-list">
          {sessions.length === 0 && <p className="muted small">暂无历史会话</p>}
          {sessions.map((s) => (
            <div key={s.session_id} className={`chat-item${s.session_id === currentId ? ' active' : ''}`}>
              <button className="chat-item-main" onClick={() => void selectSession(s.session_id)}>
                <span className="chat-item-title">{s.title}</span>
                <span className="muted small">
                  {s.message_count} 条 · {s.updated_at.slice(0, 16).replace('T', ' ')}
                </span>
              </button>
              <button className="link" title="删除" onClick={() => void removeSession(s.session_id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>

      <div className="chat-shell">
        <div className="chat-scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="chat-empty">
              <p className="muted">与套期保值智能体对话。</p>
              <p className="muted small">
                可直接描述企业情况：品种、企业类型、经营目标、授权比例、敞口数量与期限、行情等。
                信息不足时智能体会主动提问补齐。
              </p>
            </div>
          )}
          {messages.map((m, i) =>
            m.who === 'user' ? (
              <div className="bubble-row user" key={i}>
                <div className="bubble user">{m.text}</div>
              </div>
            ) : (
              <div className="bubble-row assistant" key={i}>
                <div className="bubble assistant">
                  {m.think && (
                    <details className="chat-card">
                      <summary>💭 思考过程</summary>
                      <pre className="mono small">{stripJsonBlocks(m.think)}</pre>
                    </details>
                  )}
                  {m.tool && (
                    <details className="chat-card">
                      <summary>🛠 工具活动</summary>
                      <pre className="mono small">{m.tool}</pre>
                    </details>
                  )}
                  {m.answer ? (
                    <div className="bubble-text">{m.answer}</div>
                  ) : m.streaming ? (
                    <div className="muted small">思考中…</div>
                  ) : null}
                  {m.error && <div className="callout danger">{m.error}</div>}
                  {m.memory && m.memory.length > 0 && (
                    <details className="chat-card memory">
                      <summary>🗂 内部记忆维护（{m.memory.join('、')}）</summary>
                      <div className="muted small">
                        智能体已在后台更新上述记忆文档。这是系统内部动作，不影响你的咨询。
                      </div>
                    </details>
                  )}
                </div>
              </div>
            ),
          )}
        </div>

        <div className="chat-composer">
          <textarea
            rows={3}
            placeholder="描述你的企业情况或提出问题（Enter 发送，Shift+Enter 换行）"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button className="primary" disabled={busy} onClick={send}>
            {busy ? '…' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModelTab({ notify }: { notify: (s: string) => void }) {
  const [cfg, setCfg] = useState<any>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');

  const load = useCallback(async () => {
    try {
      const c = await api.getLlmConfig();
      setCfg(c);
      setBaseUrl(c.base_url);
      setModel(c.model);
    } catch (e) {
      notify(`加载失败：${(e as Error).message}`);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    try {
      await api.putLlmConfig({ base_url: baseUrl, model, api_key: apiKey });
      setApiKey('');
      notify('已保存（runtime 下次请求即生效，无需重启）');
      void load();
    } catch (e) {
      notify(`保存失败：${(e as Error).message}`);
    }
  };

  return (
    <section className="card">
      <h2>大模型网关配置（写入共享卷，runtime 读取）</h2>
      {cfg && (
        <p className="muted">
          当前 api_key：{cfg.api_key_set ? cfg.api_key_masked : '未设置'}（配置优先级：本文件 &gt; 环境变量）
        </p>
      )}
      <div className="grid2">
        <label>
          模型名
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="如 deepseek-chat" />
        </label>
        <label>
          Base URL（兼容 OpenAI 协议）
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.deepseek.com"
          />
        </label>
      </div>
      <label>
        API Key（留空则不变；输入新值覆盖）
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      </label>
      <button className="primary" onClick={save}>
        保存
      </button>
    </section>
  );
}
