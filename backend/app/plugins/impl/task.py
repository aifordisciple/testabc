from typing import Dict, Any, List, Optional
from app.plugins.interfaces import (
    PluginInterface, 
    PluginType, 
    PluginPermission,
    PluginContext,
    ToolResult,
    ToolPlugin
)
from app.models.user import Analysis, Project, TaskChain
from sqlmodel import Session, select
import json

class TaskPluginImpl(PluginInterface):
    """Task management plugin implementation"""
    
    def __init__(self, session: Session):
        self.session = session
    
    @property
    def id(self) -> str:
        return "impl.task"
    
    @property
    def name(self) -> str:
        return "Task Management"
    
    @property
    def plugin_type(self) -> PluginType:
        return PluginType.TASK
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    @property
    def description(self) -> str:
        return "Manage analysis tasks and workflows"
    
    @property
    def permissions(self) -> List[PluginPermission]:
        return [PluginPermission.READ, PluginPermission.EXECUTE]
    
    async def initialize(self) -> None:
        pass
    
    async def shutdown(self) -> None:
        pass
    
    async def list_tasks(self, context: PluginContext, project_id: str) -> List[Dict[str, Any]]:
        if not context.user_id:
            return []
        
        project = self.session.get(Project, project_id)
        if not project or project.owner_id != context.user_id:
            return []
        
        analyses = self.session.exec(
            select(Analysis)
            .where(Analysis.project_id == project_id)
            .order_by(Analysis.created_at.desc())
            .limit(50)
        ).all()
        
        return [
            {
                "id": str(a.id),
                "workflow": a.workflow,
                "status": a.status,
                "start_time": a.start_time.isoformat() if a.start_time else None,
                "end_time": a.end_time.isoformat() if a.end_time else None,
                "params": json.loads(a.params_json) if a.params_json else {}
            }
            for a in analyses
        ]
    
    async def get_task(self, context: PluginContext, project_id: str, task_id: str) -> Optional[Dict[str, Any]]:
        project = self.session.get(Project, project_id)
        if not project or project.owner_id != context.user_id:
            return None
        
        analysis = self.session.get(Analysis, task_id)
        if not analysis or analysis.project_id != project_id:
            return None
        
        return {
            "id": str(analysis.id),
            "workflow": analysis.workflow,
            "status": analysis.status,
            "start_time": analysis.start_time.isoformat() if analysis.start_time else None,
            "end_time": analysis.end_time.isoformat() if analysis.end_time else None,
            "params": json.loads(analysis.params_json) if analysis.params_json else {},
            "work_dir": analysis.work_dir
        }
    
    async def cancel_task(self, context: PluginContext, project_id: str, task_id: str) -> bool:
        project = self.session.get(Project, project_id)
        if not project or project.owner_id != context.user_id:
            return False
        
        analysis = self.session.get(Analysis, task_id)
        if not analysis or analysis.project_id != project_id:
            return False
        
        if analysis.status in ["pending", "running"]:
            analysis.status = "cancelled"
            self.session.add(analysis)
            self.session.commit()
            return True
        
        return False
    
    async def list_chains(self, context: PluginContext, project_id: str) -> List[Dict[str, Any]]:
        if not context.user_id:
            return []
        
        project = self.session.get(Project, project_id)
        if not project or project.owner_id != context.user_id:
            return []
        
        chains = self.session.exec(
            select(TaskChain)
            .where(TaskChain.project_id == project_id)
            .order_by(TaskChain.created_at.desc())
            .limit(50)
        ).all()
        
        return [
            {
                "id": str(c.id),
                "status": c.status,
                "current_step": c.current_step,
                "total_steps": c.total_steps,
                "strategy": c.strategy,
                "created_at": c.created_at.isoformat() if c.created_at else None
            }
            for c in chains
        ]
