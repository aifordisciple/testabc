import re
import ast
import math
from typing import Optional, Dict, Any, List, Tuple
from sqlmodel import Session, select
from app.models.user import Project, SampleSheet, Sample, File, ProjectFileLink, Analysis
from app.models.bio import WorkflowTemplate
from uuid import UUID
from datetime import datetime


class FastPathResult:
    def __init__(
        self,
        handled: bool,
        response: Optional[str] = None,
        query_data: Optional[Dict[str, Any]] = None,
        mode: str = "fast_path"
    ):
        self.handled = handled
        self.response = response or ""
        self.query_data = query_data
        self.mode = mode


class FastPathHandler:
    """
    快速路径处理器 - 用于处理简单命令，无需调用 LLM
    实现毫秒级响应
    """

    def __init__(self):
        self.patterns = self._compile_patterns()

    def _compile_patterns(self) -> List[Tuple[str, re.Pattern, callable]]:
        return [
            ("math_eval", re.compile(r'^[\d\s\+\-\*\/\.\(\)\%\,\:\']+$'), self._eval_math),
            ("list_files", re.compile(r'^(列出|list|show|显示|有哪些|what.*files?|ls|dir)\s*$', re.IGNORECASE), self._list_files),
            ("count_files", re.compile(r'^(多少|how many|count|数量)\s*(files?|文件)', re.IGNORECASE), self._count_files),
            ("list_samples", re.compile(r'^(样本|samples?)\s*(列表|list)?$', re.IGNORECASE), self._list_samples),
            ("count_samples", re.compile(r'^(多少|how many|count)\s*(samples?|样本)', re.IGNORECASE), self._count_samples),
            ("help", re.compile(r'^(help|帮助|命令|commands?|有哪些命令)$', re.IGNORECASE), self._show_help),
            ("project_info", re.compile(r'^(项目|project)\s*(信息|info)?$', re.IGNORECASE), self._project_info),
            ("task_status", re.compile(r'(task|任务|analysis).*(status|状态|完成|finished|done)', re.IGNORECASE), self._task_status),
            ("hello", re.compile(r'^(hi|hello|hey|你好|您好|嗨)$', re.IGNORECASE), self._hello),
        ]

    def can_handle(self, user_input: str) -> bool:
        user_input = user_input.strip()
        if not user_input:
            return False
        for name, pattern, _ in self.patterns:
            if pattern.match(user_input):
                return True
        return False

    def handle(self, user_input: str, project_id: str, session: Session) -> FastPathResult:
        user_input = user_input.strip()
        
        for name, pattern, handler in self.patterns:
            if pattern.match(user_input):
                try:
                    return handler(user_input, project_id, session)
                except Exception as e:
                    print(f"[FastPath] Error in handler {name}: {e}")
                    return FastPathResult(handled=False)
        
        return FastPathResult(handled=False)

    def _eval_math(self, user_input: str, project_id: str, session: Session) -> FastPathResult:
        try:
            clean_expr = user_input.strip()
            clean_expr = clean_expr.replace(',', '')
            
            allowed_chars = set('0123456789+-*/.()% ')
            if not all(c in allowed_chars for c in clean_expr):
                return FastPathResult(handled=False)
            
            result = ast.literal_eval(clean_expr)
            
            if isinstance(result, float):
                if result.is_integer():
                    result = int(result)
                else:
                    result = round(result, 10)
            
            response = f"**计算结果**: `{result}`"
            return FastPathResult(handled=True, response=response)
        except Exception:
            return FastPathResult(handled=False)

    def _list_files(self, user_input: str, project_id: str, session: Session) -> FastPathResult:
        project_uuid = UUID(project_id)
        links = session.exec(
            select(ProjectFileLink).where(ProjectFileLink.project_id == project_uuid)
        ).all()
        
        file_ids = [link.file_id for link in links]
        
        if not file_ids:
            response = "📁 **项目暂无文件**\n\n请先上传数据文件。"
            return FastPathResult(handled=True, response=response)
        
        files = session.exec(select(File).where(File.id.in_(file_ids))).all()
        
        file_list = []
        for f in files[:15]:
            if not f.is_directory:
                size_str = self._format_size(f.size) if f.size else "-"
                file_list.append(f"- {f.filename} ({size_str})")
        
        response = f"📁 **项目文件列表** (共 {len(files)} 个)\n\n"
        response += "\n".join(file_list)
        
        if len(files) > 15:
            response += f"\n\n*...还有 {len(files) - 15} 个文件*"
        
        return FastPathResult(handled=True, response=response)

    def _count_files(self, user_input: str, project_id: str, session: Session) -> FastPathResult:
        project_uuid = UUID(project_id)
        links = session.exec(
            select(ProjectFileLink).where(ProjectFileLink.project_id == project_uuid)
        ).all()
        
        file_ids = [link.file_id for link in links]
        count = 0
        
        if file_ids:
            files = session.exec(select(File).where(File.id.in_(file_ids))).all()
            count = sum(1 for f in files if not f.is_directory)
        
        response = f"📊 **文件数量**: {count} 个"
        return FastPathResult(handled=True, response=response)

    def _list_samples(self, user_input: str, project_id: str, session: Session) -> FastPathResult:
        project_uuid = UUID(project_id)
        sample_sheets = session.exec(
            select(SampleSheet).where(SampleSheet.project_id == project_uuid)
        ).all()
        
        if not sample_sheets:
            response = "🧬 **项目暂无样本表**\n\n请先创建样本表。"
            return FastPathResult(handled=True, response=response)
        
        all_samples = []
        for sheet in sample_sheets:
            samples = session.exec(
                select(Sample).where(Sample.sample_sheet_id == sheet.id)
            ).all()
            for s in samples:
                all_samples.append(f"- {s.name} ({sheet.name})")
        
        response = f"🧬 **样本列表** (共 {len(all_samples)} 个)\n\n"
        response += "\n".join(all_samples[:15])
        
        if len(all_samples) > 15:
            response += f"\n\n*...还有 {len(all_samples) - 15} 个样本*"
        
        return FastPathResult(handled=True, response=response)

    def _count_samples(self, user_input: str, project_id: str, session: Session) -> FastPathResult:
        project_uuid = UUID(project_id)
        sample_sheets = session.exec(
            select(SampleSheet).where(SampleSheet.project_id == project_uuid)
        ).all()
        
        count = 0
        for sheet in sample_sheets:
            samples = session.exec(
                select(Sample).where(Sample.sample_sheet_id == sheet.id)
            ).all()
            count += len(samples)
        
        response = f"🧬 **样本数量**: {count} 个"
        return FastPathResult(handled=True, response=response)

    def _show_help(self, user_input: str, project_id: str, session: Session) -> FastPathResult:
        response = """📖 **可用命令**

**快速查询:**
- `列出文件` / `list files` - 列出项目文件
- `有多少文件` / `how many files` - 统计文件数量
- `列出样本` / `list samples` - 列出样本列表
- `有多少样本` / `how many samples` - 统计样本数量
- `项目信息` - 查看项目信息

**简单计算:**
- 直接输入数学表达式，如 `1+1` 或 `2*3.14`

**分析任务:**
- 描述您的分析需求，如 "进行 RNA-Seq 差异表达分析"

---
💡 您可以直接用自然语言描述需求，Copilot 会智能理解并帮助您。"""
        
        return FastPathResult(handled=True, response=response)

    def _project_info(self, user_input: str, project_id: str, session: Session) -> FastPathResult:
        project = session.get(Project, UUID(project_id))
        
        if not project:
            return FastPathResult(handled=True, response="❌ 项目不存在")
        
        created = project.created_at.strftime("%Y-%m-%d %H:%M") if project.created_at else "-"
        
        links = session.exec(
            select(ProjectFileLink).where(ProjectFileLink.project_id == project.id)
        ).all()
        file_count = len(links)
        
        sample_sheets = session.exec(
            select(SampleSheet).where(SampleSheet.project_id == project.id)
        ).all()
        
        sample_count = 0
        for sheet in sample_sheets:
            samples = session.exec(
                select(Sample).where(Sample.sample_sheet_id == sheet.id)
            ).all()
            sample_count += len(samples)
        
        response = f"""📋 **项目信息**

- **名称**: {project.name}
- **描述**: {project.description or "无"}
- **创建时间**: {created}
- **文件数量**: {file_count}
- **样本数量**: {sample_count}
- **样本表数量**: {len(sample_sheets)}"""
        
        return FastPathResult(handled=True, response=response)

    def _task_status(self, user_input: str, project_id: str, session: Session) -> FastPathResult:
        from sqlalchemy import desc
        
        project_uuid = UUID(project_id)
        analyses = session.exec(
            select(Analysis)
            .where(Analysis.project_id == project_uuid)
            .order_by(desc(Analysis.start_time))
            .limit(5)
        ).all()
        
        if not analyses:
            response = "📊 **暂无分析任务**"
            return FastPathResult(handled=True, response=response)
        
        status_emoji = {
            "pending": "⏳",
            "running": "🔄",
            "completed": "✅",
            "failed": "❌",
            "error": "❌"
        }
        
        response = "📊 **最近分析任务**\n\n"
        for a in analyses:
            status = status_emoji.get(a.status, "❓")
            time = a.start_time.strftime("%m-%d %H:%M") if a.start_time else "-"
            response += f"{status} `{a.status}` - {a.workflow or 'N/A'} ({time})\n"
        
        return FastPathResult(handled=True, response=response)

    def _hello(self, user_input: str, project_id: str, session: Session) -> FastPathResult:
        response = """👋 **您好！**

我是 Bio-Copilot，您的 AI 生物信息学助手。

我可以帮您：
- 📁 查询项目文件和样本
- 🔬 推荐和执行分析流程
- 💻 生成自定义分析代码
- 📊 查看任务状态和分析结果

请直接告诉我您想做什么！"""
        
        return FastPathResult(handled=True, response=response)

    def _format_size(self, size: int) -> str:
        if not size:
            return "0 B"
        
        units = ['B', 'KB', 'MB', 'GB', 'TB']
        unit_idx = 0
        size_float = float(size)
        
        while size_float >= 1024 and unit_idx < len(units) - 1:
            size_float /= 1024
            unit_idx += 1
        
        return f"{size_float:.1f} {units[unit_idx]}"


fast_path_handler = FastPathHandler()
