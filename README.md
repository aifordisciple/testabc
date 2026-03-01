# Autonome

生物信息学自动化工作流平台，采用前后端分离架构 + Docker 容器化部署。

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | Next.js 16 + React 19 + TailwindCSS + Zustand + Monaco Editor |
| **后端** | FastAPI + SQLModel + Celery + LangChain/LangGraph |
| **数据库** | PostgreSQL (pgvector 扩展，支持向量搜索) |
| **缓存/队列** | Redis |
| **部署** | Docker Compose |

## 核心功能模块

1. **用户认证** (`backend/app/api/routes/auth.py`) - JWT 登录/注册
2. **文件管理** (`backend/app/api/routes/files.py`) - 上传/管理生物数据文件
3. **工作流引擎** (`backend/app/api/routes/workflow.py`, `backend/app/services/workflow_service.py`) - RNA-Seq 等生信分析流程
4. **AI Copilot** (`backend/app/api/routes/ai.py`, `backend/app/services/copilot_orchestrator.py`) - AI 助手辅助分析
5. **知识库** (`backend/app/api/routes/knowledge.py`, `backend/app/services/knowledge_service.py`) - 向量化知识存储与检索
6. **沙箱执行** (`backend/app/services/sandbox.py`) - 安全执行分析脚本
7. **Agent 系统** (`backend/app/core/agent.py`, `backend/app/core/intent_parser.py`) - LLM 驱动的智能代理

## 服务架构

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Frontend   │───▶│   Backend   │───▶│  PostgreSQL │
│  (Next.js)  │    │  (FastAPI)  │    │  (pgvector) │
└─────────────┘    └──────┬──────┘    └─────────────┘
                          │
                   ┌──────┴──────┐
                   │    Redis    │
                   └──────┬──────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    Celery Worker   Celery Beat    (异步任务)
```

## 端口映射

| 服务 | 端口 |
|------|------|
| 前端 | `3001` → 3000 |
| 后端 API | `8000` |
| PostgreSQL | `5433` |
| Redis | `6379` |

## 目录结构

```
autonome/
├── backend/                # FastAPI 后端
│   ├── app/
│   │   ├── api/           # API 路由
│   │   ├── core/          # 核心模块 (配置、Agent、LLM)
│   │   ├── models/        # 数据模型
│   │   ├── schemas/       # Pydantic 模式
│   │   └── services/      # 业务服务
│   ├── pipelines/         # 分析流程脚本
│   └── workspace/         # 工作空间
├── frontend/              # Next.js 前端
│   └── src/
│       ├── app/           # 页面路由
│       ├── components/    # React 组件
│       └── stores/        # Zustand 状态
├── autonome_data/         # 上传数据存储
├── autonome_workspace/    # 用户工作空间
├── docker-compose.yml     # 容器编排
└── auto_deploy.sh         # 自动部署脚本
```

## 快速开始

```bash
# 启动所有服务
docker-compose up -d --build

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

## 开发部署

修改代码后，使用自动部署脚本：

```bash
./auto_deploy.sh -s "简要修改说明" -d "详细修改内容"
```
