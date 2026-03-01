# Autonome 升级历史

## 2026-02-28: Bio-Copilot 统一化升级

### 背景

系统存在两套独立的 Copilot 实现（`CopilotOrchestrator` 和 `Agent` 系统），导致 bio-copilot 无法正常工作。主要问题包括：

1. **双重实现并存**: `CopilotOrchestrator` 和 `Agent` 系统同时存在，职责重叠
2. **前端入口分散**: `/copilot` 页面和 `CopilotPanel` 组件使用不同的 API
3. **会话模型不统一**: `CopilotMessage` 与 `Conversation`+`ConversationMessage` 两套模型
4. **LLM 客户端重复初始化**: 多处独立创建 LLM 客户端实例
5. **插件系统与核心断连**

### 升级目标

- 统一使用 `/copilot` 页面作为唯一入口
- 统一使用 `Conversation` + `ConversationMessage` 模型
- 统一使用 `llm_client` 单例

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `backend/app/core/intent_parser.py` | 重写为使用统一的 `llm_client` 单例 |
| `backend/app/services/workflow_matcher.py` | 修改为使用 `llm_client` |
| `backend/app/api/routes/ai.py` | 修改 `chat/stream` 端点使用 `ConversationMessage` 存储消息 |
| `backend/app/models/conversation.py` | 添加 `plan_data` 和 `attachments` 字段别名供前端兼容 |
| `backend/app/api/routes/conversations.py` | 更新 4 处返回位置填充 `plan_data` 和 `attachments` 字段 |
| `backend/app/services/copilot_orchestrator.py` | 添加废弃警告，建议迁移到 Agent 系统 |
| `backend/app/main.py` | 添加 `WorkflowTemplate` 初始化检查 |

### 详细修改说明

#### 1. 统一 LLM 客户端 (P1-1)

**intent_parser.py**
- 移除独立的 LLM 客户端初始化
- 改用 `from app.core.llm import llm_client` 导入单例
- 保持 `ParsedIntent` 返回格式不变

**workflow_matcher.py**
- 移除独立的 OpenAI 客户端初始化
- 改用统一的 `llm_client` 单例
- 保持 `WorkflowMatch` 返回格式不变

#### 2. 统一会话模型 (P2-1)

**ai.py - chat/stream 端点**
```python
# 新增 Conversation 和 ConversationMessage 导入
from app.models.conversation import Conversation, ConversationMessage

# 修改请求体，添加 conversation_id 字段
class ChatStreamRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    conversation_id: Optional[str] = None  # 新增
    project_id: Optional[str] = None

# 使用 ConversationMessage 存储用户和助手消息
user_msg = ConversationMessage(
    conversation_id=conversation.id,
    role="user",
    content=payload.message
)
```

**conversation.py - MessagePublic 扩展**
```python
class MessagePublic(SQLModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    created_at: datetime
    response_mode: Optional[str] = None
    response_data: Optional[dict] = None
    plan_data: Optional[dict] = None  # 前端兼容别名
    files: Optional[list] = None
    attachments: Optional[list] = None  # 前端兼容别名
```

**conversations.py - 返回格式更新**
- 更新 4 处消息返回位置
- 同时填充 `response_data`/`plan_data` 和 `files`/`attachments`

#### 3. 添加废弃通知 (P2-2)

**copilot_orchestrator.py**
```python
"""
DEPRECATED: This module is deprecated and will be removed in a future version.

The CopilotOrchestrator class has been superseded by the unified Agent system.
Please use the Agent class from app.core.agent instead.

Migration guide:
- Use Agent.handle_request() instead of CopilotOrchestrator.analyze_request()
- Use ConversationMessage model instead of CopilotMessage
- Access the /copilot page as the single entry point

This module is kept temporarily for backward compatibility.
"""
```

#### 4. P0 修复

**main.py - WorkflowTemplate 初始化检查**
```python
# 启动时检查 WorkflowTemplate 数量
template_count = session.exec(select(func.count()).select_from(WorkflowTemplate)).first()
print(f"✅ Found {template_count} WorkflowTemplate(s) in database.")
```

### 部署结果

- **Commit**: `d1ce2b8`
- **提交信息**: `feat: 统一bio-copilot使用Conversation模型和/copilot页面`
- **部署时间**: 2026-02-28 22:21

### 验证状态

| 检查项 | 状态 |
|--------|------|
| Python 语法检查 | ✅ 通过 |
| 后端服务启动 | ✅ 正常 |
| 前端服务启动 | ✅ 正常 |
| 数据库连接 | ✅ 正常 |
| WorkflowTemplate 加载 | ✅ 5 个模板已加载 |
| API 端点可访问 | ✅ 正常 (需认证) |

### 服务状态

```
autonome-backend    Running    http://localhost:8000
autonome-frontend   Running    http://localhost:3001
autonome-db         Running    localhost:5433
autonome-redis      Running    localhost:6379
autonome-celery     Running    
autonome-celery-beat Running   
```

### 待完成项 (P3 - 低优先级)

- [ ] 清理未使用的 `CopilotMessage` 模型 (迁移验证后)
- [ ] 移除废弃的 `copilot_orchestrator.py` (Agent 系统验证后)
- [ ] 更新前端移除 `CopilotPanel` 组件 (如仍存在)

### 架构改进

**升级前:**
```
Frontend (/copilot) ─→ ai.py (CopilotMessage)
                  └─→ CopilotPanel ─→ CopilotOrchestrator
                                      
Backend: CopilotOrchestrator ─→ 独立 LLM 客户端
         Agent 系统 ─→ 另一个 LLM 客户端
```

**升级后:**
```
Frontend (/copilot) ─→ conversations.py (ConversationMessage)
                  └─→ ai.py/chat/stream ─→ ConversationMessage
                                            
Backend: Agent 系统 ─→ llm_client (单例)
         CopilotOrchestrator (已废弃)
```
