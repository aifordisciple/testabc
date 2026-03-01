from fastapi import APIRouter, Depends
from typing import List, Dict, Any
from app.plugins import plugin_manager
from app.plugins.interfaces import PluginType
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter()

@router.get("/plugins")
def list_plugins(
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """List all available plugins"""
    plugins = plugin_manager.get_all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "type": p.plugin_type.value,
            "version": p.version,
            "description": p.description,
            "permissions": [perm.value for perm in p.permissions]
        }
        for p in plugins
    ]

@router.get("/plugins/{plugin_id}")
def get_plugin(
    plugin_id: str,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get plugin details"""
    plugin = plugin_manager.get_plugin(plugin_id)
    if not plugin:
        return {"error": "Plugin not found"}
    
    return {
        "id": plugin.id,
        "name": plugin.name,
        "type": plugin.plugin_type.value,
        "version": plugin.version,
        "description": plugin.description,
        "permissions": [perm.value for perm in plugin.permissions]
    }

@router.get("/plugins/type/{plugin_type}")
def get_plugins_by_type(
    plugin_type: str,
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get plugins by type"""
    try:
        ptype = PluginType(plugin_type)
    except ValueError:
        return {"error": "Invalid plugin type"}
    
    plugins = plugin_manager.registry.get_by_type(ptype)
    return [
        {
            "id": p.id,
            "name": p.name,
            "type": p.plugin_type.value,
            "version": p.version,
            "description": p.description
        }
        for p in plugins
    ]

@router.get("/tools")
def list_tools(
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """List all available tools"""
    tools = plugin_manager.get_tools()
    result = []
    for tool in tools:
        item = {
            "id": tool.id,
            "name": tool.name,
            "description": tool.description,
            "schema": tool.get_schema()
        }
        if hasattr(tool, "get_available_tools"):
            item["available_tools"] = tool.get_available_tools()
        result.append(item)
    return result
