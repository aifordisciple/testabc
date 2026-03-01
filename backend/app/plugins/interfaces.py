from typing import Protocol, Dict, Any, List, Optional
from abc import abstractmethod
from enum import Enum

class PluginType(str, Enum):
    PROJECT = "project"
    FILE = "file"
    TASK = "task"
    WORKFLOW = "workflow"
    TOOL = "tool"
    DATA = "data"
    COPILOT = "copilot"

class PluginPermission(str, Enum):
    READ = "read"
    WRITE = "write"
    EXECUTE = "execute"
    ADMIN = "admin"

class PluginInterface(Protocol):
    @property
    def id(self) -> str:
        """Unique plugin identifier"""
        ...
    
    @property
    def name(self) -> str:
        """Human-readable plugin name"""
        ...
    
    @property
    def plugin_type(self) -> PluginType:
        """Plugin type"""
        ...
    
    @property
    def version(self) -> str:
        """Plugin version"""
        ...
    
    @property
    def description(self) -> str:
        """Plugin description"""
        ...
    
    @property
    def permissions(self) -> List[PluginPermission]:
        """Required permissions"""
        ...
    
    async def initialize(self) -> None:
        """Initialize plugin"""
        ...
    
    async def shutdown(self) -> None:
        """Cleanup on shutdown"""
        ...

class PluginHook(str, Enum):
    BEFORE_REQUEST = "before_request"
    AFTER_REQUEST = "after_request"
    ON_STARTUP = "on_startup"
    ON_SHUTDOWN = "on_shutdown"
    BEFORE_EXECUTE = "before_execute"
    AFTER_EXECUTE = "after_execute"

class PluginContext:
    def __init__(self, user_id: Optional[int] = None, project_id: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None):
        self.user_id = user_id
        self.project_id = project_id
        self.metadata = metadata or {}
    
    def has_permission(self, permission: PluginPermission) -> bool:
        return permission in self.metadata.get("permissions", [])

class ToolResult:
    def __init__(self, success: bool, data: Any = None, error: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None):
        self.success = success
        self.data = data
        self.error = error
        self.metadata = metadata or {}

class ToolPlugin(Protocol):
    @property
    def id(self) -> str: ...
    @property
    def name(self) -> str: ...
    @property
    def plugin_type(self) -> PluginType: ...
    @property
    def version(self) -> str: ...
    @property
    def description(self) -> str: ...
    @property
    def permissions(self) -> List[PluginPermission]: ...
    
    @abstractmethod
    async def execute(self, context: PluginContext, params: Dict[str, Any]) -> ToolResult:
        """Execute the tool with given parameters"""
        ...
    
    @abstractmethod
    def get_schema(self) -> Dict[str, Any]:
        """Return JSON schema for parameters"""
        ...

class DataPlugin(Protocol):
    @property
    def id(self) -> str: ...
    @property
    def name(self) -> str: ...
    @property
    def plugin_type(self) -> PluginType: ...
    @property
    def version(self) -> str: ...
    @property
    def description(self) -> str: ...
    @property
    def permissions(self) -> List[PluginPermission]: ...
    
    @abstractmethod
    async def search(self, context: PluginContext, query: str, **kwargs) -> List[Dict[str, Any]]:
        """Search data"""
        ...
    
    @abstractmethod
    async def get(self, context: PluginContext, id: str) -> Optional[Dict[str, Any]]:
        """Get data by ID"""
        ...

class ProjectPlugin(Protocol):
    @property
    def id(self) -> str: ...
    @property
    def name(self) -> str: ...
    @property
    def plugin_type(self) -> PluginType: ...
    @property
    def version(self) -> str: ...
    @property
    def description(self) -> str: ...
    @property
    def permissions(self) -> List[PluginPermission]: ...
    
    @abstractmethod
    async def list_projects(self, context: PluginContext) -> List[Dict[str, Any]]:
        """List projects"""
        ...
    
    @abstractmethod
    async def create_project(self, context: PluginContext, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new project"""
        ...

class FilePlugin(Protocol):
    @property
    def id(self) -> str: ...
    @property
    def name(self) -> str: ...
    @property
    def plugin_type(self) -> PluginType: ...
    @property
    def version(self) -> str: ...
    @property
    def description(self) -> str: ...
    @property
    def permissions(self) -> List[PluginPermission]: ...
    
    @abstractmethod
    async def list_files(self, context: PluginContext, project_id: str) -> List[Dict[str, Any]]:
        """List files in project"""
        ...
    
    @abstractmethod
    async def upload_file(self, context: PluginContext, project_id: str, file_data: bytes, filename: str) -> Dict[str, Any]:
        """Upload file"""
        ...
