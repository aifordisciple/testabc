from typing import Dict, Any, List, Optional
from app.plugins.interfaces import (
    PluginInterface, 
    PluginType, 
    PluginPermission,
    PluginContext,
    ToolResult,
    ToolPlugin,
    DataPlugin
)
from app.models.bio import WorkflowTemplate
from sqlmodel import Session, select

class BasePlugin(PluginInterface):
    def __init__(self):
        self._initialized = False
    
    @property
    def id(self) -> str:
        raise NotImplementedError
    
    @property
    def name(self) -> str:
        raise NotImplementedError
    
    @property
    def plugin_type(self) -> PluginType:
        raise NotImplementedError
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    @property
    def description(self) -> str:
        raise NotImplementedError
    
    @property
    def permissions(self) -> List[PluginPermission]:
        return []
    
    async def initialize(self) -> None:
        self._initialized = True
    
    async def shutdown(self) -> None:
        self._initialized = False


class WorkflowToolPlugin(BasePlugin, ToolPlugin):
    """Plugin for executing bioinformatics workflow tools"""
    
    def __init__(self, session: Session):
        super().__init__()
        self.session = session
    
    @property
    def id(self) -> str:
        return "builtin.workflow_tools"
    
    @property
    def name(self) -> str:
        return "Bioinformatics Workflow Tools"
    
    @property
    def plugin_type(self) -> PluginType:
        return PluginType.TOOL
    
    @property
    def description(self) -> str:
        return "Execute predefined bioinformatics analysis workflows"
    
    @property
    def permissions(self) -> List[PluginPermission]:
        return [PluginPermission.READ, PluginPermission.EXECUTE]
    
    async def execute(self, context: PluginContext, params: Dict[str, Any]) -> ToolResult:
        try:
            tool_id = params.get("tool_id")
            if not tool_id:
                return ToolResult(success=False, error="tool_id is required")
            
            template = self.session.get(WorkflowTemplate, tool_id)
            if not template:
                return ToolResult(success=False, error=f"Tool {tool_id} not found")
            
            return ToolResult(
                success=True,
                data={
                    "tool_id": str(template.id),
                    "name": template.name,
                    "type": template.workflow_type,
                    "status": "ready_to_execute"
                }
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e))
    
    def get_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "tool_id": {
                    "type": "string",
                    "description": "ID of the workflow template to execute"
                },
                "parameters": {
                    "type": "object",
                    "description": "Parameters for the workflow"
                }
            },
            "required": ["tool_id"]
        }
    
    def get_available_tools(self) -> List[Dict[str, Any]]:
        templates = self.session.exec(
            select(WorkflowTemplate).where(WorkflowTemplate.is_public == True)
        ).all()
        
        return [
            {
                "id": str(t.id),
                "name": t.name,
                "type": t.workflow_type,
                "description": t.description
            }
            for t in templates
        ]


class GEOPublicDataPlugin(BasePlugin, DataPlugin):
    """Plugin for searching GEO public datasets"""
    
    def __init__(self):
        super().__init__()
    
    @property
    def id(self) -> str:
        return "builtin.geo_search"
    
    @property
    def name(self) -> str:
        return "GEO Public Data Search"
    
    @property
    def plugin_type(self) -> PluginType:
        return PluginType.DATA
    
    @property
    def description(self) -> str:
        return "Search and retrieve GEO public datasets"
    
    @property
    def permissions(self) -> List[PluginPermission]:
        return [PluginPermission.READ]
    
    async def search(self, context: PluginContext, query: str, **kwargs) -> List[Dict[str, Any]]:
        from app.services.geo_service import geo_service
        
        try:
            results = await geo_service.search_datasets(query, limit=kwargs.get("limit", 10))
            return [
                {
                    "id": r.get("id"),
                    "title": r.get("title"),
                    "organism": r.get("organism"),
                    "samples": r.get("samples"),
                    "accession": r.get("accession")
                }
                for r in results
            ]
        except Exception as e:
            return []
    
    async def get(self, context: PluginContext, id: str) -> Optional[Dict[str, Any]]:
        from app.services.geo_service import geo_service
        
        try:
            result = await geo_service.get_dataset(id)
            return result
        except Exception:
            return None


class ProjectManagerPlugin(BasePlugin):
    """Plugin for project management"""
    
    def __init__(self):
        super().__init__()
    
    @property
    def id(self) -> str:
        return "builtin.project_manager"
    
    @property
    def name(self) -> str:
        return "Project Manager"
    
    @property
    def plugin_type(self) -> PluginType:
        return PluginType.PROJECT
    
    @property
    def description(self) -> str:
        return "Manage projects and workspaces"
    
    @property
    def permissions(self) -> List[PluginPermission]:
        return [PluginPermission.READ, PluginPermission.WRITE, PluginPermission.ADMIN]


class FileManagerPlugin(BasePlugin):
    """Plugin for file management"""
    
    def __init__(self):
        super().__init__()
    
    @property
    def id(self) -> str:
        return "builtin.file_manager"
    
    @property
    def name(self) -> str:
        return "File Manager"
    
    @property
    def plugin_type(self) -> PluginType:
        return PluginType.FILE
    
    @property
    def description(self) -> str:
        return "Upload, download, and manage files"
    
    @property
    def permissions(self) -> List[PluginPermission]:
        return [PluginPermission.READ, PluginPermission.WRITE]


class TaskManagerPlugin(BasePlugin):
    """Plugin for task management"""
    
    def __init__(self):
        super().__init__()
    
    @property
    def id(self) -> str:
        return "builtin.task_manager"
    
    @property
    def name(self) -> str:
        return "Task Manager"
    
    @property
    def plugin_type(self) -> PluginType:
        return PluginType.TASK
    
    @property
    def description(self) -> str:
        return "Manage analysis tasks and workflows"
    
    @property
    def permissions(self) -> List[PluginPermission]:
        return [PluginPermission.READ, PluginPermission.EXECUTE]


def register_builtin_plugins(manager, session: Session):
    """Register all built-in plugins"""
    manager.register_plugin(WorkflowToolPlugin(session))
    manager.register_plugin(GEOPublicDataPlugin())
    manager.register_plugin(ProjectManagerPlugin())
    manager.register_plugin(FileManagerPlugin())
    manager.register_plugin(TaskManagerPlugin())
