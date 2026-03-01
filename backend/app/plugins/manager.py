from typing import Dict, List, Optional, Type, Any
import logging
from app.plugins.interfaces import (
    PluginInterface, 
    PluginType, 
    PluginPermission,
    PluginContext,
    PluginHook,
    ToolPlugin,
    DataPlugin,
    ProjectPlugin,
    FilePlugin
)

logger = logging.getLogger(__name__)

class PluginRegistry:
    _instance: Optional['PluginRegistry'] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._plugins: Dict[str, PluginInterface] = {}
        self._hooks: Dict[PluginHook, List[str]] = {hook: [] for hook in PluginHook}
        self._initialized = True
        logger.info("PluginRegistry initialized")
    
    def register(self, plugin: PluginInterface) -> None:
        if plugin.id in self._plugins:
            logger.warning(f"Plugin {plugin.id} already registered, overwriting")
        self._plugins[plugin.id] = plugin
        logger.info(f"Registered plugin: {plugin.id} ({plugin.plugin_type})")
    
    def unregister(self, plugin_id: str) -> None:
        if plugin_id in self._plugins:
            self._plugins.pop(plugin_id)
            logger.info(f"Unregistered plugin: {plugin_id}")
    
    def get(self, plugin_id: str) -> Optional[PluginInterface]:
        return self._plugins.get(plugin_id)
    
    def get_by_type(self, plugin_type: PluginType) -> List[PluginInterface]:
        return [p for p in self._plugins.values() if p.plugin_type == plugin_type]
    
    def get_all(self) -> List[PluginInterface]:
        return list(self._plugins.values())
    
    def register_hook(self, plugin_id: str, hook: PluginHook) -> None:
        if plugin_id not in self._plugins:
            raise ValueError(f"Plugin {plugin_id} not registered")
        if hook not in self._hooks:
            self._hooks[hook] = []
        if plugin_id not in self._hooks[hook]:
            self._hooks[hook].append(plugin_id)
    
    def get_hook_plugins(self, hook: PluginHook) -> List[PluginInterface]:
        plugin_ids = self._hooks.get(hook, [])
        return [self._plugins[pid] for pid in plugin_ids if pid in self._plugins]
    
    async def initialize_all(self) -> None:
        for plugin in self._plugins.values():
            try:
                await plugin.initialize()
                logger.info(f"Initialized plugin: {plugin.id}")
            except Exception as e:
                logger.error(f"Failed to initialize plugin {plugin.id}: {e}")
    
    async def shutdown_all(self) -> None:
        for plugin in self._plugins.values():
            try:
                await plugin.shutdown()
                logger.info(f"Shutdown plugin: {plugin.id}")
            except Exception as e:
                logger.error(f"Failed to shutdown plugin {plugin.id}: {e}")


class PluginManager:
    def __init__(self):
        self._registry = PluginRegistry()
    
    @property
    def registry(self) -> PluginRegistry:
        return self._registry
    
    def register_plugin(self, plugin: PluginInterface) -> None:
        self._registry.register(plugin)
    
    def get_plugin(self, plugin_id: str) -> Optional[PluginInterface]:
        return self._registry.get(plugin_id)
    
    def get_tools(self) -> List[ToolPlugin]:
        return [p for p in self._registry.get_by_type(PluginType.TOOL) if isinstance(p, ToolPlugin)]
    
    def get_data_sources(self) -> List[DataPlugin]:
        return [p for p in self._registry.get_by_type(PluginType.DATA) if isinstance(p, DataPlugin)]
    
    def get_projects(self) -> List[ProjectPlugin]:
        return [p for p in self._registry.get_by_type(PluginType.PROJECT) if isinstance(p, ProjectPlugin)]
    
    def get_files(self) -> List[FilePlugin]:
        return [p for p in self._registry.get_by_type(PluginType.FILE) if isinstance(p, FilePlugin)]
    
    def get_all(self) -> List[PluginInterface]:
        return self._registry.get_all()
    
    async def initialize(self) -> None:
        await self._registry.initialize_all()
    
    async def shutdown(self) -> None:
        await self._registry.shutdown_all()


plugin_manager = PluginManager()
