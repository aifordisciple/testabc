from typing import Dict, Any, List, Optional
from datetime import datetime
from app.plugins.interfaces import (
    PluginInterface, 
    PluginType, 
    PluginPermission,
    PluginContext,
    ToolResult,
    ProjectPlugin as IProjectPlugin
)
from app.models.user import Project
from sqlmodel import Session, select

class ProjectPluginImpl(IProjectPlugin):
    """Project management plugin implementation"""
    
    def __init__(self, session: Session):
        self.session = session
    
    @property
    def id(self) -> str:
        return "impl.project"
    
    @property
    def name(self) -> str:
        return "Project Management"
    
    @property
    def plugin_type(self) -> PluginType:
        return PluginType.PROJECT
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    @property
    def description(self) -> str:
        return "Full-featured project management with CRUD operations"
    
    @property
    def permissions(self) -> List[PluginPermission]:
        return [PluginPermission.READ, PluginPermission.WRITE, PluginPermission.ADMIN]
    
    async def initialize(self) -> None:
        pass
    
    async def shutdown(self) -> None:
        pass
    
    async def list_projects(self, context: PluginContext) -> List[Dict[str, Any]]:
        if not context.user_id:
            return []
        
        projects = self.session.exec(
            select(Project)
            .where(Project.owner_id == context.user_id)
            .order_by(Project.created_at.desc())
        ).all()
        
        return [
            {
                "id": str(p.id),
                "name": p.name,
                "description": p.description,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None
            }
            for p in projects
        ]
    
    async def create_project(self, context: PluginContext, data: Dict[str, Any]) -> Dict[str, Any]:
        if not context.user_id:
            raise ValueError("User ID required")
        
        project = Project(
            name=data.get("name", "Untitled Project"),
            description=data.get("description", ""),
            owner_id=context.user_id
        )
        
        self.session.add(project)
        self.session.commit()
        self.session.refresh(project)
        
        return {
            "id": str(project.id),
            "name": project.name,
            "description": project.description,
            "created_at": project.created_at.isoformat() if project.created_at else None
        }
    
    async def get_project(self, context: PluginContext, project_id: str) -> Optional[Dict[str, Any]]:
        project = self.session.get(Project, project_id)
        if not project or project.owner_id != context.user_id:
            return None
        
        return {
            "id": str(project.id),
            "name": project.name,
            "description": project.description,
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "updated_at": project.updated_at.isoformat() if project.updated_at else None
        }
    
    async def update_project(self, context: PluginContext, project_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        project = self.session.get(Project, project_id)
        if not project or project.owner_id != context.user_id:
            return None
        
        if "name" in data:
            project.name = data["name"]
        if "description" in data:
            project.description = data["description"]
        
        project.updated_at = datetime.utcnow()
        
        self.session.add(project)
        self.session.commit()
        self.session.refresh(project)
        
        return {
            "id": str(project.id),
            "name": project.name,
            "description": project.description,
            "updated_at": project.updated_at.isoformat() if project.updated_at else None
        }
    
    async def delete_project(self, context: PluginContext, project_id: str) -> bool:
        project = self.session.get(Project, project_id)
        if not project or project.owner_id != context.user_id:
            return False
        
        self.session.delete(project)
        self.session.commit()
        
        return True
