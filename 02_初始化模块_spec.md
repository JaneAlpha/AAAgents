# 初始化模块 Spec

## 输入

enterprise_id: string

## 处理流程

1.  接收enterprise_id。
2.  创建企业Workspace目录。
3.  保存Workspace路径。
4.  返回workspace_path。

Workspace路径规则：

/workspace/{enterprise_id}

Workspace目录：

/workspace/{enterprise_id}/

-   data/
-   skills/
-   runtime/

## 输出

workspace_path: string

## 数据存储

PostgreSQL保存enterprise_id与workspace_path关联关系。

MinIO保存Workspace文件内容。

## 技术实现

-   TypeScript
-   NestJS
-   PostgreSQL
-   MinIO
