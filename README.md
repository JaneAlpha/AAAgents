# 金融套期保值智能体系统

数据层 · 推理层 · 输出层三层架构，落地为 **docker-compose 三服务**（业务服务 + Agent Runtime + PostgreSQL）。

## 架构

```
┌──────────────── business 服务 (NestJS, :3000) ────────────────┐
│ 01 auth        注册 / 登录，返回 enterprise_id（一对一，无鉴权）│
│ 02 workspace   初始化企业 Workspace（幂等）                    │
│ 03 admin       企业信息 / 文档类数据 / 行情 / 分品种资料        │
│ 04 skill       Skill 规则文档上传与维护（覆盖式，无版本）       │
│ + React 管理后台（/admin 静态托管）                            │
└───────────────────────────────────────────────────────────────┘
┌──────────────── runtime 服务 (NestJS + deepagents, :3001) ────┐
│ 05 agent   createDeepAgent + FilesystemBackend，按企业品种载Skill│
│ 06 output  同进程函数：Zod 校验 hedge_advice，失败回灌重试      │
└───────────────────────────────────────────────────────────────┘
                   共享命名卷 workspace_data → /workspace
```

- **存储**：PostgreSQL（企业、用户、行情）+ 本地命名卷（Workspace 文档、Skill）。
- **模型**：兼容 OpenAI 协议的外部网关（env 配置），`LLM_MODE=mock` 时以确定性桩替代，便于离线测试。
- **合规**：系统不下单；输出含 `no_order_placed / not_investment_advice / human_review_required` 硬约束。

## 目录

```
schema/hedge_advice.schema.json     输出 Schema（JSON Schema，源）
apps/business                       业务服务（auth/workspace/admin/skill/materials）
apps/runtime                        Agent Runtime + 输出层 + 自主巡检
apps/admin-web                      React 管理后台（Vite）
services/parser                     Python 文档解析服务（docx/pdf）
tests/system/system.e2e.mjs         系统级 E2E
tests/live/cases.mjs                标准答案案例集（live，5 案例）
tests/live/answer-check.mjs         单案例标准答案检查
tests/live/materials-chat.mjs       材料→记忆→对话 live 验证
docs/智能体验证与系统介绍.md          系统介绍与验证存档（建议先读）
.github/workflows/ci.yml            CI
```

## 快速开始

```bash
cp .env.example .env
npm run compose:up
```

> 本地提示：项目路径含中文时 BuildKit 会报 `x-docker-expose-session-sharedkey` 错，需用传统构建器；国内网络需指定 npm 镜像。命令：
>
> ```bash
> DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 NPM_REGISTRY=https://registry.npmmirror.com docker compose up -d --build
> ```
>
> **注意（重要）**：传统构建器的 `COPY . .` 缓存可能误判，导致**改完源码后镜像仍是旧代码**。若发现改动未生效，用 `--no-cache` 重建对应服务：
>
> ```bash
> DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 NPM_REGISTRY=https://registry.npmmirror.com docker compose build --no-cache business && docker compose up -d business
> ```
>
> 路径为纯 ASCII 的环境（如 CI）直接用 `npm run compose:up` 即可。

启动后：

- 管理后台：http://localhost:3000/admin
- 业务 API：http://localhost:3000
- Runtime API：http://localhost:3001

演示账号：`apple_demo` / `jujube_demo`，密码 `demo123`。

## 测试

```bash
npm install
npm run prisma:generate -w @hedging/business
npm test                    # 单元/服务级测试
npm run compose:up          # 启动全栈
npm run test:system         # 系统级 E2E（≥2 场景）
npm run compose:down
```

## 关键接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /auth/register | 注册（企业+用户+一对一关联） |
| POST | /auth/login | 登录 → enterprise_id |
| POST | /workspace/init | 初始化 Workspace（幂等） |
| GET/PATCH | /admin/enterprises/:id | 企业信息 |
| GET/PUT | /admin/enterprises/:id/documents/:name | 长期记忆 / 日常状态 md |
| GET/POST | /admin/market-quotes | 行情 |
| GET | /admin/reference | 系统级分品种资料 |
| GET/PUT | /admin/llm-config | LLM 网关配置（写入共享卷，runtime 读取） |
| GET/POST | /skill/:id[/:variety] | Skill 概览 / 上传覆盖 |
| POST/GET | /admin/enterprises/:id/materials | 企业材料上传解析 / 列表 |
| GET | /admin/enterprises/:id/materials/:file | 查看解析结果 |
| POST | /agent/run | 同步运行 → 结构化套保提示 |
| POST | /agent/stream | 流式运行（SSE：start/token/attempt/result/error） |
| POST | /agent/chat | 对话（作者 user/system），自主维护记忆 |
| POST | /agent/ingest | 数据层投递（system 对话） |
