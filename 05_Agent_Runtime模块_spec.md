# Agent Runtime模块 Spec

## 接口

### POST /agent/run — 同步运行

输入：enterprise_id、user_request、session_id（可选）

处理流程：

1.  读取 LLM 配置（共享文件 > 环境变量）。
2.  按 enterprise_id 从业务服务获取企业品种与 skill_path。
3.  加载会话历史（workspace/{eid}/runtime/sessions/{sid}.json）。
4.  创建 deepagents 实例：backend 根 = workspace/{eid}，skills = /skills/。
5.  运行 Agent，得到完整输出。
6.  交由输出层校验。
7.  校验失败：回灌错误并重试，最多 3 次。
8.  保存会话，返回结构化结果。

输出：{ session_id, mode, attempts, result }

### POST /agent/stream — 流式运行（SSE）

事件：

- start   { session_id, mode, variety }
- token   { delta, attempt, source } —— 逐段文本增量，source 标注来源：
  - ai：模型推理叙述
  - tool：工具活动（目录/文件/命令等工程细节）
  - json：结构化结果 JSON（mock 模式全部为此类）
- attempt { attempt, errors } —— 校验失败、即将重试
- result  RunOutput           —— 校验通过的结构化结果
- error   { message }

前端据此分层呈现：推理过程（ai）/ 工具活动（tool，默认折叠）/ 结构化结果（由 result 事件渲染），json 类 token 不单独展示以免与结果重复。

处理流程：同 /run，但边生成边推送 token；末尾推送 result。

### GET /agent/health

输出：{ status, mode, model, configured }

## 配置

LLM 网关优先级：`/workspace/_shared/llm-config.json`（后台可改）> 环境变量。

- mode：mock（确定性桩，无需网关）/ live（调用真实网关）
- base_url / model / api_key

## 输出

agent_result: object（结构见 06 与 schema/hedge_advice.schema.json）

## 技术实现

- TypeScript
- deepagents（createDeepAgent + FilesystemBackend）
- SSE（Express Response 直写）
