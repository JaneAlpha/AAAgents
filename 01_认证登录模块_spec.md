# 认证登录模块 Spec

## 接口

### POST /auth/register — 注册

输入：username、password、enterprise_name、variety

处理流程：

1.  校验 username 未被占用，否则返回 409。
2.  创建企业：生成 enterprise_id，写入 name 与 variety。
3.  创建用户：password 经 bcrypt 哈希后存储。
4.  建立用户↔企业一对一关联（写入 users.enterprise_id）。
5.  返回 enterprise_id。

输出：enterprise_id: string

### POST /auth/login — 登录

输入：username、password

处理流程：

1.  按 username 查询用户；不存在返回 401。
2.  用 bcrypt 校验 password；不匹配返回 401。
3.  读取该用户关联的企业（一对一）。
4.  返回 enterprise_id。

输出：enterprise_id: string

## 数据存储

PostgreSQL：

- users(id, username UNIQUE, password_hash, enterprise_id)
- enterprises(id, enterprise_id UNIQUE, name, variety)
- 用户↔企业为一对一，归属由 users.enterprise_id 直接表达，不建独立关联表。

## 边界

- 无鉴权令牌：登录只返回 enterprise_id，不返回 token；后续模块不做身份校验。
- 品种 variety 仅取「苹果」「红枣」。
- 注册不触发 Workspace 创建；Workspace 由初始化模块按 enterprise_id 创建（幂等）。

## 技术实现

- TypeScript
- NestJS
- PostgreSQL
- 密码哈希：bcrypt
