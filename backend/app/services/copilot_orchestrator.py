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

import os
import json
from typing import Dict, Any, List, Optional
from uuid import UUID
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core.intent_parser import intent_parser, ParsedIntent
from app.core.fast_path import fast_path_handler, FastPathResult
from app.services.workflow_matcher import workflow_matcher, WorkflowMatch
from app.core.llm import llm_client
from app.models.user import User, Project, SampleSheet, Sample, File, ProjectFileLink, Analysis
from app.models.bio import WorkflowTemplate

class CopilotResponse(BaseModel):
    """Copilot 统一响应"""
    mode: str = Field(
        ...,
        description="响应模式: workflow_match | code_generation | clarification_needed | query_result | error"
    )
    
    matched_workflows: Optional[List[WorkflowMatch]] = Field(
        default=None,
        description="匹配到的流程列表 (workflow_match 模式)"
    )
    
    generated_code: Optional[str] = Field(
        default=None,
        description="生成的代码 (code_generation 模式)"
    )
    generated_schema: Optional[str] = Field(
        default=None,
        description="生成的参数 Schema (code_generation 模式)"
    )
    generated_description: Optional[str] = Field(
        default=None,
        description="生成代码的描述"
    )
    
    query_data: Optional[Dict[str, Any]] = Field(
        default=None,
        description="查询结果数据 (query_result 模式)"
    )
    
    parsed_intent: Optional[Dict[str, Any]] = Field(
        default=None,
        description="解析后的用户意图"
    )
    
    explanation: str = Field(
        default="",
        description="AI 的解释说明"
    )
    
    follow_up_questions: Optional[List[str]] = Field(
        default=None,
        description="需要用户澄清的问题 (clarification_needed 模式)"
    )
    
    available_sample_sheets: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="项目中可用的样本表"
    )
    
    error_message: Optional[str] = Field(
        default=None,
        description="错误信息 (error 模式)"
    )

class CopilotOrchestrator:
    """
    Copilot 主控制器
    协调意图解析、流程匹配、代码生成、信息查询等模块
    """
    
    MATCH_THRESHOLD = 0.65
    
    def __init__(self):
        print(f"🤖 [CopilotOrchestrator] Initialized with threshold: {self.MATCH_THRESHOLD}", flush=True)
    
    async def analyze_request(
        self,
        user_input: str,
        project_id: str,
        session: Session,
        user: User
    ) -> CopilotResponse:
        """
        分析用户请求并返回推荐方案
        """
        print(f"\n{'='*60}", flush=True)
        print(f"🎬 [CopilotOrchestrator] Processing request for project {project_id}", flush=True)
        print(f"📝 User input: {user_input[:100]}...", flush=True)
        print(f"{'='*60}", flush=True)
        
        if fast_path_handler.can_handle(user_input):
            print(f"⚡ [CopilotOrchestrator] Fast path detected", flush=True)
            fast_result = fast_path_handler.handle(user_input, project_id, session)
            if fast_result.handled:
                print(f"⚡ [CopilotOrchestrator] Fast path handled successfully", flush=True)
                return CopilotResponse(
                    mode="fast_path",
                    query_data=fast_result.query_data,
                    explanation=fast_result.response
                )
        
        try:
            project = session.get(Project, UUID(project_id))
            if not project or project.owner_id != user.id:
                return CopilotResponse(
                    mode="error",
                    error_message="项目不存在或无权限访问",
                    explanation="无法找到指定的项目，请确认项目ID是否正确。"
                )
            
            print(f"\n⏳ Step 1: Parsing intent...", flush=True)
            intent = intent_parser.parse(user_input)
            print(f"   ✓ Intent type: {intent.intent_type}", flush=True)
            print(f"   ✓ Confidence: {intent.confidence:.2%}", flush=True)
            
            if intent.intent_type == "query" and intent.query_target:
                return await self._handle_query_intent(intent, project, session)
            
            sample_sheets = session.exec(
                select(SampleSheet).where(SampleSheet.project_id == UUID(project_id))
            ).all()
            
            available_sheets = [
                {"id": str(sheet.id), "name": sheet.name, "description": sheet.description}
                for sheet in sample_sheets
            ]
            
            if intent.confidence < 0.3:
                return CopilotResponse(
                    mode="clarification_needed",
                    parsed_intent=intent.model_dump(),
                    explanation="我需要更多信息来理解您的需求。",
                    follow_up_questions=self._generate_clarification_questions(intent),
                    available_sample_sheets=available_sheets
                )
            
            print(f"\n⏳ Step 2: Matching workflows...", flush=True)
            matches = workflow_matcher.match(intent, session, top_k=3)
            
            if matches and matches[0].match_score >= self.MATCH_THRESHOLD:
                best_match = matches[0]
                
                if available_sheets:
                    best_match.inferred_params = workflow_matcher.infer_parameters_with_llm(
                        intent,
                        session.get(WorkflowTemplate, best_match.template_id),
                        available_sheets
                    )
                
                explanation = self._generate_match_explanation(intent, best_match)
                
                print(f"\n✅ Mode: WORKFLOW_MATCH", flush=True)
                print(f"   Best match: {best_match.template_name} ({best_match.match_score:.2%})", flush=True)
                
                return CopilotResponse(
                    mode="workflow_match",
                    matched_workflows=matches,
                    parsed_intent=intent.model_dump(),
                    explanation=explanation,
                    available_sample_sheets=available_sheets
                )
            
            else:
                print(f"\n⏳ Step 3: Generating custom code...", flush=True)
                
                code_result = llm_client.generate_workflow(
                    messages=[{"role": "user", "content": user_input}],
                    mode="MODULE"
                )
                
                explanation = self._generate_code_explanation(intent, code_result)
                
                print(f"\n✅ Mode: CODE_GENERATION", flush=True)
                
                return CopilotResponse(
                    mode="code_generation",
                    generated_code=code_result.get("main_nf", ""),
                    generated_schema=code_result.get("params_schema", "{}"),
                    generated_description=code_result.get("description", ""),
                    parsed_intent=intent.model_dump(),
                    explanation=explanation,
                    available_sample_sheets=available_sheets
                )
                
        except Exception as e:
            print(f"\n❌ [CopilotOrchestrator] Error: {e}", flush=True)
            import traceback
            traceback.print_exc()
            
            return CopilotResponse(
                mode="error",
                error_message=str(e),
                explanation=f"处理请求时发生错误: {str(e)}"
            )
    
    async def _handle_query_intent(
        self,
        intent: ParsedIntent,
        project: Project,
        session: Session
    ) -> CopilotResponse:
        """处理查询类型的意图"""
        query_target = intent.query_target
        project_id = project.id
        
        print(f"\n📊 Handling query: {query_target}", flush=True)
        
        if query_target == "files":
            return await self._query_files(project, session, intent)
        elif query_target == "samples":
            return await self._query_samples(project, session, intent)
        elif query_target == "analyses":
            return await self._query_analyses(project, session, intent)
        elif query_target == "workflow":
            return await self._query_workflows(project, session, intent)
        else:
            return CopilotResponse(
                mode="clarification_needed",
                parsed_intent=intent.model_dump(),
                explanation="我不太确定您想查询什么信息。",
                follow_up_questions=[
                    "您想查询什么信息？",
                    "文件列表 (输入: 文件)",
                    "样本信息 (输入: 样本)",
                    "分析记录 (输入: 分析)"
                ]
            )
    
    async def _query_files(
        self,
        project: Project,
        session: Session,
        intent: ParsedIntent
    ) -> CopilotResponse:
        """查询项目文件"""
        links = session.exec(
            select(ProjectFileLink).where(ProjectFileLink.project_id == project.id)
        ).all()
        
        file_ids = [link.file_id for link in links]
        files = []
        
        if file_ids:
            from sqlalchemy import or_
            file_records = session.exec(
                select(File).where(File.id.in_(file_ids))
            ).all()
            
            for f in file_records:
                file_info = {
                    "id": str(f.id),
                    "name": f.filename,
                    "size": f.size,
                    "type": f.content_type,
                    "is_directory": f.is_directory,
                    "uploaded_at": str(f.uploaded_at) if f.uploaded_at else None
                }
                
                if f.size:
                    if f.size < 1024:
                        file_info["size_readable"] = f"{f.size} B"
                    elif f.size < 1024 * 1024:
                        file_info["size_readable"] = f"{f.size / 1024:.1f} KB"
                    elif f.size < 1024 * 1024 * 1024:
                        file_info["size_readable"] = f"{f.size / (1024 * 1024):.1f} MB"
                    else:
                        file_info["size_readable"] = f"{f.size / (1024 * 1024 * 1024):.1f} GB"
                else:
                    file_info["size_readable"] = "-"
                
                files.append(file_info)
        
        if not files:
            explanation = f"📁 **项目 [{project.name}] 中暂无文件**\n\n"
            explanation += "您可以点击左侧的 **上传文件** 按钮添加数据文件。"
        else:
            explanation = f"📁 **项目 [{project.name}] 中的文件列表** (共 {len(files)} 个)\n\n"
            explanation += "| 文件名 | 大小 | 类型 |\n"
            explanation += "|--------|------|------|\n"
            
            for f in files[:20]:
                if not f.get("is_directory"):
                    name = f["name"][:30] + "..." if len(f["name"]) > 30 else f["name"]
                    explanation += f"| {name} | {f.get('size_readable', '-')} | {f.get('type', '-')} |\n"
            
            if len(files) > 20:
                explanation += f"\n*...还有 {len(files) - 20} 个文件未显示*\n"
            
            dir_count = sum(1 for f in files if f.get("is_directory"))
            file_count = len(files) - dir_count
            explanation += f"\n📊 统计: {file_count} 个文件, {dir_count} 个文件夹"
        
        return CopilotResponse(
            mode="query_result",
            parsed_intent=intent.model_dump(),
            query_data={"files": files, "total": len(files)},
            explanation=explanation
        )
    
    async def _query_samples(
        self,
        project: Project,
        session: Session,
        intent: ParsedIntent
    ) -> CopilotResponse:
        """查询样本信息"""
        sample_sheets = session.exec(
            select(SampleSheet).where(SampleSheet.project_id == project.id)
        ).all()
        
        all_samples = []
        sheet_info = []
        
        for sheet in sample_sheets:
            samples = session.exec(
                select(Sample).where(Sample.sample_sheet_id == sheet.id)
            ).all()
            
            sheet_info.append({
                "id": str(sheet.id),
                "name": sheet.name,
                "description": sheet.description,
                "sample_count": len(samples)
            })
            
            for s in samples:
                all_samples.append({
                    "id": str(s.id),
                    "name": s.name,
                    "group": s.group,
                    "replicate": s.replicate,
                    "sheet_name": sheet.name
                })
        
        if not sample_sheets:
            explanation = f"🧬 **项目 [{project.name}] 中暂无样本表**\n\n"
            explanation += "您可以先上传数据文件，然后在 **样本管理** 中创建样本表。"
        else:
            explanation = f"🧬 **项目 [{project.name}] 中的样本信息**\n\n"
            
            for sheet in sheet_info:
                explanation += f"### 📋 {sheet['name']}"
                if sheet['description']:
                    explanation += f" - {sheet['description']}"
                explanation += f" ({sheet['sample_count']} 个样本)\n\n"
            
            if all_samples:
                explanation += "| 样本名 | 分组 | 重复 | 样本表 |\n"
                explanation += "|--------|------|------|--------|\n"
                for s in all_samples[:15]:
                    explanation += f"| {s['name']} | {s['group']} | {s['replicate']} | {s['sheet_name']} |\n"
                
                if len(all_samples) > 15:
                    explanation += f"\n*...还有 {len(all_samples) - 15} 个样本*\n"
        
        return CopilotResponse(
            mode="query_result",
            parsed_intent=intent.model_dump(),
            query_data={"sample_sheets": sheet_info, "samples": all_samples, "total": len(all_samples)},
            explanation=explanation
        )
    
    async def _query_analyses(
        self,
        project: Project,
        session: Session,
        intent: ParsedIntent
    ) -> CopilotResponse:
        """查询分析任务"""
        from sqlalchemy import desc
        
        analyses = session.exec(
            select(Analysis)
            .where(Analysis.project_id == project.id)
            .order_by(desc(Analysis.start_time))
            .limit(20)
        ).all()
        
        if not analyses:
            explanation = f"📊 **项目 [{project.name}] 中暂无分析任务**\n\n"
            explanation += "您可以告诉我想要进行什么分析，我会帮您找到合适的流程。"
        else:
            explanation = f"📊 **项目 [{project.name}] 中的分析记录** (最近 {len(analyses)} 条)\n\n"
            explanation += "| 任务 | 流程 | 状态 | 开始时间 |\n"
            explanation += "|------|------|------|----------|\n"
            
            status_emoji = {
                "pending": "⏳",
                "running": "🔄",
                "completed": "✅",
                "failed": "❌",
                "error": "❌"
            }
            
            for a in analyses:
                status = status_emoji.get(a.status, "❓")
                start = a.start_time.strftime("%m-%d %H:%M") if a.start_time else "-"
                explanation += f"| {str(a.id)[:8]}... | {a.workflow} | {status} {a.status} | {start} |\n"
        
        return CopilotResponse(
            mode="query_result",
            parsed_intent=intent.model_dump(),
            query_data={"analyses": [{"id": str(a.id), "workflow": a.workflow, "status": a.status, "start_time": str(a.start_time)} for a in analyses]},
            explanation=explanation
        )
    
    async def _query_workflows(
        self,
        project: Project,
        session: Session,
        intent: ParsedIntent
    ) -> CopilotResponse:
        """查询可用流程"""
        templates = session.exec(
            select(WorkflowTemplate).where(WorkflowTemplate.is_public == True)
        ).all()
        
        if not templates:
            explanation = "📝 **暂无可用的分析流程**\n\n"
            explanation += "系统管理员尚未配置分析流程模板。"
        else:
            explanation = f"📝 **可用的分析流程** (共 {len(templates)} 个)\n\n"
            
            for t in templates[:15]:
                explanation += f"### 🔬 {t.name}\n"
                if t.description:
                    desc = t.description[:100] + "..." if len(t.description) > 100 else t.description
                    explanation += f"{desc}\n"
                explanation += f"- 类型: {t.workflow_type}\n"
                if t.category:
                    explanation += f"- 分类: {t.category}"
                    if t.subcategory:
                        explanation += f" / {t.subcategory}"
                    explanation += "\n"
                explanation += "\n"
        
        return CopilotResponse(
            mode="query_result",
            parsed_intent=intent.model_dump(),
            query_data={"workflows": [{"id": str(t.id), "name": t.name, "type": t.workflow_type, "category": t.category} for t in templates]},
            explanation=explanation
        )
    
    def _generate_clarification_questions(self, intent: ParsedIntent) -> List[str]:
        """生成澄清问题"""
        questions = []
        
        if not intent.analysis_type or intent.analysis_type == "Custom Analysis":
            questions.append("您想进行什么类型的分析？例如：RNA-Seq质控、差异表达分析、单细胞分析等")
        
        if not intent.data_type:
            questions.append("您的数据是什么类型？例如：RNA-Seq、ChIP-Seq、ATAC-Seq等")
        
        if not intent.expected_outputs:
            questions.append("您希望得到什么样的输出结果？例如：质控报告、差异基因列表、火山图等")
        
        return questions[:3]
    
    def _generate_match_explanation(self, intent: ParsedIntent, match: WorkflowMatch) -> str:
        """生成匹配说明"""
        explanation = f"🎯 **已识别分析类型**: {intent.analysis_type}\n\n"
        
        if match.match_score >= 0.8:
            explanation += f"✅ **高度匹配的流程**: {match.template_name}\n\n"
            explanation += f"该流程可以很好地满足您的需求。{match.description}\n\n"
        elif match.match_score >= 0.65:
            explanation += f"✓ **推荐流程**: {match.template_name}\n\n"
            explanation += f"该流程与您的需求较为匹配。{match.description}\n\n"
        else:
            explanation += f"ℹ️ **可能相关的流程**: {match.template_name}\n\n"
        
        if match.match_reason:
            explanation += f"📋 **匹配原因**: {match.match_reason}\n\n"
        
        if match.inferred_params:
            explanation += "⚙️ **推荐参数**:\n"
            for key, value in match.inferred_params.items():
                if value is not None and value != "":
                    explanation += f"- {key}: {value}\n"
        
        return explanation
    
    def _generate_code_explanation(self, intent: ParsedIntent, code_result: Dict) -> str:
        """生成代码说明"""
        explanation = f"🎯 **已识别分析类型**: {intent.analysis_type}\n\n"
        explanation += "📝 **已为您生成自定义分析代码**\n\n"
        
        if code_result.get("description"):
            explanation += f"**功能描述**: {code_result['description']}\n\n"
        
        if code_result.get("explanation"):
            explanation += f"**实现说明**: {code_result['explanation']}\n\n"
        
        explanation += "⚠️ 由于没有找到完全匹配的预置流程，我为您生成了自定义代码。\n"
        explanation += "请在执行前检查代码和参数是否符合您的需求。\n"
        
        return explanation

copilot_orchestrator = CopilotOrchestrator()
