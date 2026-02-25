# Autonome (元律)

**AI 驱动的生物信息学分析平台**

Autonome 是一个现代化的生物信息学分析平台，将 AI 大模型与传统生信工具深度融合，让研究人员能够通过自然语言交互完成从数据管理到分析可视化的全流程工作。

---

## 核心特性

### AI 智能助手
- **Bio-Copilot**: 基于 LangGraph 的智能代理，支持自然语言交互
- **代码生成**: 自动生成 Nextflow 流程 / Python / R 脚本
- **错误诊断**: AI 自动分析任务失败日志并提供修复建议
- **结构化输出**: 使用 Instructor 库确保 LLM 输出格式规范

### 生信分析引擎
- **Nextflow 集成**: 原生支持 Nextflow 工作流引擎
- **Docker 容器化**: 分析任务在隔离容器中安全执行
- **实时日志**: WebSocket 实时推送任务执行日志
- **并发控制**: 可配置用户并发任务数量限制

### 数据管理
- **项目管理**: 多项目隔离，支持样本表和文件关联
- **文件上传**: 支持 FASTQ/BAM 等大文件上传
- **样本管理**: 灵活的样本元数据管理和 R1/R2 配对

### 知识库
- **智能检索**: 混合检索（向量语义 + 精确文本）
- **GEO 数据集**: 自动清洗和向量化公共数据集元信息
- **一键导入**: 将公共数据集元信息导入项目

---

## 技术架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                        │
│   React 19 + TailwindCSS + Monaco Editor + WebSocket            │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend (FastAPI)                         │
│   SQLModel + PostgreSQL (pgvector) + Redis + Celery             │
└─────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐
│  LLM Provider   │  │ Nextflow Engine │  │   Docker Sandbox        │
│ Ollama/OpenAI/  │  │   (Pipeline)    │  │ (Code Execution)        │
│ DeepSeek/智谱    │  │                 │  │                         │
└─────────────────┘  └─────────────────┘  └─────────────────────────┘
```

---

## 目录结构

```
autonome/
├── backend/                    # Python 后端
│   ├── app/
│   │   ├── api/routes/        # API 路由
│   │   │   ├── ai.py          # AI 相关接口 (Copilot/代码生成)
│   │   │   ├── workflow.py    # 工作流/样本/分析管理
│   │   │   ├── knowledge.py   # 知识库检索
│   │   │   ├── files.py       # 文件上传管理
│   │   │   └── auth.py        # 用户认证
│   │   ├── core/              # 核心模块
│   │   │   ├── config.py      # 配置管理
│   │   │   ├── db.py          # 数据库连接
│   │   │   ├── llm.py         # LLM 客户端 (Instructor)
│   │   │   └── agent.py       # LangGraph 代理
│   │   ├── models/            # 数据模型
│   │   │   ├── user.py        # 用户/项目/样本/分析
│   │   │   ├── bio.py         # 工作流模板
│   │   │   └── knowledge.py   # 公共数据集
│   │   ├── services/          # 业务逻辑
│   │   │   ├── sandbox.py     # Docker 沙箱执行
│   │   │   ├── workflow_service.py  # Nextflow 执行
│   │   │   └── knowledge_service.py # 知识库服务
│   │   └── worker.py          # Celery 任务
│   ├── pipelines/             # Nextflow 流程
│   │   └── rnaseq_qc/         # RNA-Seq QC 示例流程
│   └── Dockerfile
├── frontend/                   # Next.js 前端
│   ├── src/
│   │   ├── app/               # 页面路由
│   │   │   ├── dashboard/     # 主控制台
│   │   │   └── admin/         # 管理后台
│   │   └── components/        # React 组件
│   │       ├── ProjectWorkspace.tsx  # 项目工作区
│   │       ├── CopilotPanel.tsx      # AI 助手面板
│   │       ├── WorkflowManager.tsx   # 流程管理
│   │       └── KnowledgeBase.tsx     # 知识库检索
│   └── Dockerfile
├── tools_env/                  # 沙箱环境镜像
│   └── Dockerfile             # 包含 Python/R/Perl
├── docker-compose.yml         # 容器编排
└── .env                       # 环境变量配置
```

---

## 快速开始

### 环境要求

- Docker 20.10+
- Docker Compose 2.0+
- 16GB+ RAM (推荐)
- 50GB+ 磁盘空间

### 1. 克隆项目

```bash
git clone https://github.com/your-org/autonome.git
cd autonome
```

### 2. 配置环境变量

复制并编辑 `.env` 文件：

```bash
cp .env.example .env
```

关键配置项说明：

```bash
# === 数据库配置 ===
POSTGRES_USER=autonome
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=autonome_core

# === LLM 配置 ===
# 支持: ollama, openai, deepseek, zhipu
LLM_PROVIDER=zhipu
LLM_BASE_URL=https://open.bigmodel.cn/api/coding/paas/v4
LLM_MODEL=GLM-4.7
LLM_API_KEY=your_api_key

# === 存储路径 (宿主机) ===
HOST_DATA_ROOT=/path/to/autonome_data
HOST_WORK_DIR=/path/to/autonome_workspace
HOST_CONDA_DIR=/path/to/autonome_conda
```

### 3. 构建沙箱镜像

```bash
cd tools_env
docker build -t autonome-tool-env:latest .
cd ..
```

### 4. 启动服务

```bash
docker-compose up -d --build
```

### 5. 访问应用

- **前端**: http://localhost:3001
- **API 文档**: http://localhost:8000/docs
- **API**: http://localhost:8000/api/v1

---

## 配置指南

### LLM 提供商配置

#### Ollama (本地部署)

```bash
LLM_PROVIDER=ollama
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_MODEL=llama3.1:70b
LLM_API_KEY=ollama
```

#### OpenAI

```bash
LLM_PROVIDER=openai
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4-turbo
LLM_API_KEY=sk-xxx
```

#### 智谱 AI (GLM)

```bash
LLM_PROVIDER=zhipu
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_MODEL=GLM-4
LLM_API_KEY=xxx
```

#### DeepSeek

```bash
LLM_PROVIDER=deepseek
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-coder
LLM_API_KEY=sk-xxx
```

### 并发控制

```bash
# 每个用户最大并发任务数
MAX_CONCURRENT_TASKS=2
```

### Nextflow 配置

在 `backend/pipelines/` 目录下创建新的流程：

```
pipelines/
└── my_pipeline/
    ├── main.nf           # 流程主文件
    └── nextflow.config   # 流程配置
```

---

## API 接口

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/auth/register` | 用户注册 |
| POST | `/api/v1/auth/login` | 用户登录 |

### 项目管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/files/projects` | 获取项目列表 |
| POST | `/api/v1/files/projects` | 创建项目 |
| GET | `/api/v1/files/projects/{id}` | 获取项目详情 |

### 工作流

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/workflow/projects/{id}/analyses` | 提交分析任务 |
| GET | `/api/v1/workflow/analyses/{id}/log` | 获取任务日志 |
| WS | `/api/v1/workflow/analyses/{id}/ws/log` | 实时日志流 |
| GET | `/api/v1/workflow/analyses/{id}/report` | 下载分析报告 |

### AI 助手

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/ai/generate` | 生成工作流代码 |
| POST | `/api/v1/ai/projects/{id}/copilot/chat` | Copilot 对话 |
| POST | `/api/v1/ai/projects/{id}/analyses/{aid}/diagnose` | 错误诊断 |

### 知识库

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/knowledge/search` | 搜索公共数据集 |
| POST | `/api/v1/knowledge/import` | 导入数据集到项目 |

---

## 开发指南

### 本地开发 (不使用 Docker)

#### 后端

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### 前端

```bash
cd frontend
pnpm install
pnpm dev
```

#### Celery Worker

```bash
cd backend
celery -A app.worker.celery_app worker --loglevel=info
```

### 添加新的工作流模板

1. 在数据库中创建 `WorkflowTemplate` 记录
2. 或在 `backend/pipelines/` 创建 Nextflow 流程

### 扩展 AI 能力

核心文件：
- `backend/app/core/llm.py` - LLM 客户端
- `backend/app/core/agent.py` - LangGraph 代理
- `backend/app/services/sandbox.py` - 代码沙箱

---

## 安全注意事项

1. **生产环境** 请修改 `SECRET_KEY` 为随机字符串
2. **数据库密码** 请使用强密码
3. **API Key** 请妥善保管，不要提交到版本控制
4. **沙箱隔离** 代码执行在无网络容器中，限制 CPU/内存

---

## 常见问题

### Q: 任务一直处于 pending 状态？
A: 检查 Celery Worker 是否正常运行：
```bash
docker-compose logs celery_worker
```

### Q: LLM 调用失败？
A: 检查 LLM 配置和网络连接：
```bash
docker-compose exec backend python -c "from app.core.llm import llm_client; print(llm_client.base_url)"
```

### Q: 文件上传失败？
A: 检查存储目录权限和磁盘空间：
```bash
ls -la autonome_data/
df -h
```

---

## License

MIT License

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request
