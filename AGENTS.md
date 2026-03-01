# AGENTS.md

This document provides guidelines for AI coding agents working in the Autonome codebase.

## Project Overview

Autonome is a bioinformatics automation workflow platform with a Next.js frontend and FastAPI backend.

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 + React 19 + TypeScript + Tailwind CSS + Zustand |
| Backend | FastAPI + SQLModel + Celery + LangChain/LangGraph |
| Database | PostgreSQL (pgvector extension) |
| Cache/Queue | Redis |
| Deployment | Docker Compose |

---

## Build/Lint/Test Commands

### Frontend (from `frontend/` directory)

```bash
# Install dependencies
pnpm install

# Development server (port 3000)
pnpm dev

# Production build
pnpm build

# Start production server
pnpm start

# Lint with ESLint
pnpm lint

# Lint specific file
pnpm lint -- --file src/components/MyComponent.tsx

# Type check (run tsc manually)
npx tsc --noEmit
```

### Backend (from `backend/` directory)

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Development server (port 8000)
uvicorn app.main:app --reload --host 0.0.0.0

# Run with specific module
uvicorn app.main:app --reload --port 8000

# Celery worker (in separate terminal)
celery -A app.worker.celery_app worker --loglevel=info

# Celery beat scheduler
celery -A app.core.celery_app beat --loglevel=info
```

### Docker (from root directory)

```bash
# Build and start all services
docker-compose up -d --build

# View logs (all services)
docker-compose logs -f

# View logs (specific service)
docker-compose logs -f backend
docker-compose logs -f frontend

# Stop all services
docker-compose down

# Rebuild specific service
docker-compose up -d --build backend
```

### Running Tests

Currently, no test framework is configured. When adding tests:

**Frontend (Vitest recommended):**
```bash
# Install vitest
pnpm add -D vitest @testing-library/react @testing-library/jest-dom

# Run tests
pnpm test

# Run single test file
pnpm test src/components/__tests__/MyComponent.test.tsx
```

**Backend (pytest recommended):**
```bash
# Install pytest
pip install pytest pytest-asyncio httpx

# Run tests
pytest

# Run single test file
pytest tests/test_auth.py -v

# Run with coverage
pytest --cov=app tests/
```

---

## Code Style Guidelines

### TypeScript/React (Frontend)

#### Imports
```typescript
// 1. React and Next.js imports first
import { useState, useEffect, useRef } from 'react';
import type { Metadata } from 'next';

// 2. Third-party libraries
import { create } from 'zustand';
import { useQuery } from '@tanstack/react-query';

// 3. Internal components (use @/ alias)
import MyComponent from '@/components/MyComponent';
import { useStore } from '@/stores/myStore';

// 4. Types
import type { Message } from '@/types';
```

#### Component Structure
```typescript
'use client';  // Required for client components

import { useState } from 'react';

interface MyComponentProps {
  title: string;
  onSubmit: (data: FormData) => Promise<void>;
  isLoading?: boolean;
}

export default function MyComponent({ title, onSubmit, isLoading = false }: MyComponentProps) {
  const [value, setValue] = useState('');

  return (
    <div className="flex flex-col">
      {/* JSX content */}
    </div>
  );
}
```

#### Naming Conventions
- **Components**: PascalCase (`ChatPanel.tsx`, `WorkflowEditor.tsx`)
- **Hooks**: camelCase with `use` prefix (`useCopilotStore`, `useChat`)
- **Types/Interfaces**: PascalCase (`Message`, `CopilotState`)
- **Constants**: SCREAMING_SNAKE_CASE for true constants
- **Files**: PascalCase for components, camelCase for utilities

#### Styling
- Use Tailwind CSS classes directly on elements
- Use dark theme by default (bg-gray-900, bg-gray-950)
- Primary accent: blue-600/blue-500
- Border colors: gray-700/gray-800

#### State Management
```typescript
// Zustand store pattern
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MyState {
  data: Record<string, string>;
  getData: (key: string) => string;
  setData: (key: string, value: string) => void;
}

export const useMyStore = create<MyState>()(
  persist(
    (set, get) => ({
      data: {},
      getData: (key) => get().data[key] || '',
      setData: (key, value) => set(state => ({
        data: { ...state.data, [key]: value }
      })),
    }),
    { name: 'my-storage' }
  )
);
```

### Python (Backend)

#### Imports
```python
# 1. Standard library
from datetime import datetime, timedelta
from typing import Optional, List, Any

# 2. Third-party
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

# 3. Local imports (absolute)
from app.core.config import settings
from app.core.db import get_session
from app.models.user import User
```

#### Naming Conventions
- **Classes**: PascalCase (`User`, `WorkflowService`)
- **Functions/Methods**: snake_case (`get_user`, `create_access_token`)
- **Constants**: SCREAMING_SNAKE_CASE (`ACCESS_TOKEN_EXPIRE_MINUTES`)
- **Private methods**: prefix with underscore (`_internal_method`)
- **Files**: snake_case (`workflow_service.py`, `copilot_orchestrator.py`)

#### Route Definitions
```python
router = APIRouter()

@router.post("/items", response_model=ItemPublic)
def create_item(
    item_in: ItemCreate,
    session: Session = Depends(get_session)
):
    """Brief description of endpoint."""
    # Implementation
    pass
```

#### Error Handling
```python
from fastapi import HTTPException, status

# Use HTTPException for API errors
if not user:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="User not found"
    )

# Use try/except for internal operations
try:
    result = some_operation()
except Exception as e:
    print(f"Error: {e}")
    raise HTTPException(status_code=500, detail=str(e))
```

#### Models (SQLModel)
```python
class UserBase(SQLModel):
    email: str = Field(unique=True, index=True)
    full_name: Optional[str] = None

class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(UserBase):
    password: str

class UserPublic(UserBase):
    id: int
    created_at: datetime
```

---

## Architecture Notes

### Frontend Structure
```
frontend/src/
├── app/              # Next.js App Router pages
│   ├── layout.tsx    # Root layout
│   ├── page.tsx      # Home page
│   ├── providers.tsx # Query client provider
│   └── dashboard/    # Dashboard routes
├── components/       # Reusable React components
└── stores/           # Zustand state stores
```

### Backend Structure
```
backend/app/
├── api/
│   ├── routes/       # API endpoint handlers
│   └── deps.py       # Dependency injection
├── core/             # Core modules (config, db, security)
├── models/           # SQLModel database models
├── schemas/          # Pydantic request/response schemas
└── services/         # Business logic services
```

### API Convention
- Base path: `/api/v1`
- All routes are defined in `backend/app/main.py`
- Use dependency injection for database sessions

---

## Common Tasks

### Adding a new frontend component
1. Create file in `frontend/src/components/`
2. Use `'use client'` directive if client-side interactivity needed
3. Export as default
4. Import with `@/components/ComponentName`

### Adding a new backend route
1. Create route file in `backend/app/api/routes/`
2. Define router with `APIRouter()`
3. Register in `backend/app/main.py` with `app.include_router()`

### Adding a new database model
1. Create model in `backend/app/models/`
2. Import in `backend/app/core/db.py` for table creation
3. Create corresponding Create/Public schema classes

---

## Environment Variables

Backend (`.env`):
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`
- `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`
- `REDIS_HOST`, `REDIS_PORT`
- `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`
- `MINIO_ENDPOINT`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`

Frontend (`.env.local`):
- `NEXT_PUBLIC_API_URL` - Backend API URL


# 核心开发与部署工作流规范

你当前运行在一个由 Git 进行版本控制，并使用 Docker Compose 进行服务编排的 Mac 服务器项目中。对于收到的任何开发任务，你必须严格遵循以下步骤：

1. **bug修改**：当用户提出`bug修复`，读取根目录下TEST.md文档，处理其中未标记为完成的问题，处理后编辑TEST.md，将处理好的问题标记为完成。
2. **执行开发**：完成用户要求的代码编写或编辑任务。
3. **状态验证**：代码修改完成后，如有必要可运行 `git status` 或测试命令确认状态。
4. **自动部署**：你必须调用项目根目录下的 `./auto_deploy.sh` 脚本来完成后续动作。
   - 必须使用 `-s` 参数传递简要的修改总结（如 "feat: 增加用户登录接口"）。
   - 必须使用 `-d` 参数传递详细的修改说明（Comments），解释修改了哪些逻辑及原因。
   - 示例命令：`./auto_deploy.sh -s "fix: 修复数据库连接超时" -d "调整了 db_config.js 中的 timeout 参数，从 3000ms 增加到 5000ms，以适应当前网络环境。"`，注意：该脚本已内置 `git add .`、`git commit` 以及 `docker-compose down && docker-compose up -d --build` 的完整逻辑，你只需调用该脚本并传入准确的参数即可。