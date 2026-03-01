"""
Phase 4: Enhanced ReAct Agent with Tool Use
Using LangGraph for state-based agent execution
"""

import os
import json
from typing import List, Dict, Any, Optional, Annotated, TypedDict
from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from sqlmodel import Session, select

from app.core.db import get_session
from app.models.user import User, Project
from app.models.bio import WorkflowTemplate


def get_llm():
    """获取 LangChain ChatOpenAI 客户端 (向后兼容函数)"""
    from app.core.llm import get_llm_client
    return get_llm_client().chat
    """Get LLM client with tool calling support"""
    model = os.getenv("LLM_MODEL", "qwen2.5-coder:32b")
    base_url = os.getenv("LLM_BASE_URL", "http://host.docker.internal:11434/v1")
    api_key = os.getenv("LLM_API_KEY", "ollama")
    
    return ChatOpenAI(
        model=model,
        base_url=base_url,
        api_key=api_key,
        temperature=0.1
    )


# ================================
# Tool Definitions
# ================================

@tool
def search_pubmed(query: str, max_results: int = 5) -> str:
    """Search PubMed database for biomedical literature.
    
    Args:
        query: Search query (e.g., 'RNA-seq analysis methods')
        max_results: Maximum number of results to return (default 5)
    
    Returns:
        JSON string with search results
    """
    # Placeholder - in production, integrate with PubMed API
    return json.dumps({
        "status": "not_implemented",
        "message": "PubMed search requires API integration",
        "query": query
    })


@tool
def search_geo(query: str, max_results: int = 5) -> str:
    """Search GEO database for gene expression datasets.
    
    Args:
        query: Search query (e.g., 'breast cancer microarray')
        max_results: Maximum number of results to return
    
    Returns:
        JSON string with dataset information
    """
    # Placeholder - in production, integrate with GEO API
    return json.dumps({
        "status": "not_implemented",
        "message": "GEO search requires API integration",
        "query": query
    })


@tool
def run_bioinformatics_workflow(workflow_name: str, parameters: Dict[str, Any]) -> str:
    """Execute a bioinformatics workflow/pipeline.
    
    Args:
        workflow_name: Name of the workflow to run
        parameters: Dictionary of workflow parameters
    
    Returns:
        Execution result
    """
    return json.dumps({
        "status": "queued",
        "workflow": workflow_name,
        "message": "Workflow submitted for execution"
    })


@tool
def read_file(file_path: str) -> str:
    """Read content from a file in the project workspace.
    
    Args:
        file_path: Path to file relative to workspace
    
    Returns:
        File content as string
    """
    import os
    workspace = os.getenv("WORKSPACE_DIR", "/workspace")
    full_path = os.path.join(workspace, file_path)
    
    if not os.path.exists(full_path):
        return f"Error: File not found: {file_path}"
    
    try:
        with open(full_path, 'r') as f:
            content = f.read(10000)  # Limit to 10k chars
            return content
    except Exception as e:
        return f"Error reading file: {str(e)}"


@tool
def write_file(file_path: str, content: str) -> str:
    """Write content to a file in the workspace.
    
    Args:
        file_path: Path to file relative to workspace
        content: Content to write
    
    Returns:
        Success/error message
    """
    import os
    workspace = os.getenv("WORKSPACE_DIR", "/workspace")
    full_path = os.path.join(workspace, file_path)
    
    try:
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w') as f:
            f.write(content)
        return f"Success: Written to {file_path}"
    except Exception as e:
        return f"Error writing file: {str(e)}"


@tool
def execute_code(code: str, timeout: int = 60) -> str:
    """Execute Python code in sandbox environment.
    
    Args:
        code: Python code to execute
        timeout: Execution timeout in seconds
    
    Returns:
        Execution result
    """
    return json.dumps({
        "status": "queued",
        "message": "Code submitted for execution",
        "code_preview": code[:200]
    })


# Available tools list
AVAILABLE_TOOLS = [
    search_pubmed,
    search_geo,
    run_bioinformatics_workflow,
    read_file,
    write_file,
    execute_code
]


# ================================
# ReAct Agent State
# ================================

class AgentState(TypedDict):
    """State for ReAct agent"""
    messages: List[Any]  # Chat messages
    tools_called: List[Dict[str, Any]]  # History of tool calls
    final_response: Optional[str]  # Final response to user
    iteration: int  # Current iteration


def create_react_agent():
    """Create a ReAct agent using LangGraph"""
    
    llm = get_llm()
    
    # Bind tools to LLM
    llm_with_tools = llm.bind_tools(AVAILABLE_TOOLS)
    
    def should_continue(state: AgentState) -> bool:
        """Determine if agent should continue or end"""
        messages = state["messages"]
        last_message = messages[-1]
        
        # Check if last message has tool calls
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            return "continue"
        
        # Check for too many iterations
        if state["iteration"] >= 5:
            return "end"
        
        return "end"
    
    def call_model(state: AgentState):
        """Call the LLM with current messages"""
        response = llm_with_tools.invoke(state["messages"])
        return {"messages": [response], "iteration": state["iteration"] + 1}
    
    def execute_tool(state: AgentState):
        """Execute tools from last message"""
        messages = state["messages"]
        last_message = messages[-1]
        
        tool_results = []
        
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            for tool_call in last_message.tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call.get("args", {})
                
                # Find matching tool
                for t in AVAILABLE_TOOLS:
                    if t.name == tool_name:
                        try:
                            result = t.invoke(tool_args)
                            tool_results.append({
                                "tool": tool_name,
                                "result": str(result)
                            })
                            # Add tool result as message
                            messages.append(
                                HumanMessage(content=f"Tool {tool_name} result: {result}")
                            )
                        except Exception as e:
                            tool_results.append({
                                "tool": tool_name,
                                "error": str(e)
                            })
                        break
        
        return {
            "tools_called": state["tools_called"] + tool_results,
            "messages": messages
        }
    
    def generate_response(state: AgentState):
        """Generate final response from messages"""
        messages = state["messages"]
        
        # Get last assistant message
        for msg in reversed(messages):
            if isinstance(msg, AIMessage) and not hasattr(msg, "tool_calls"):
                return {"final_response": msg.content}
        
        return {"final_response": "I have completed the analysis."}
    
    # Build graph
    workflow = StateGraph(AgentState)
    
    workflow.add_node("agent", call_model)
    workflow.add_node("tools", execute_tool)
    workflow.add_node("respond", generate_response)
    
    workflow.set_entry_point("agent")
    
    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {
            "continue": "tools",
            "end": "respond"
        }
    )
    
    workflow.add_edge("tools", "agent")
    workflow.add_edge("respond", END)
    
    return workflow.compile()


# ================================
# Main Agent Function
# ================================

def run_react_agent(
    user_message: str,
    history: List[Dict[str, Any]],
    project_files: str = "",
    available_workflows: str = ""
) -> Dict[str, Any]:
    """
    Run the ReAct agent with tool use capabilities.
    
    Args:
        user_message: Current user message
        history: Chat history
        project_files: List of project files
        available_workflows: Available workflows
    
    Returns:
        Dict with response and any tool execution info
    """
    print(f"[ReAct Agent] Processing: {user_message[:50]}...", flush=True)
    
    # Build system prompt
    system_prompt = f"""You are Bio-Copilot, an advanced bioinformatics AI assistant with tool access.

AVAILABLE TOOLS:
1. search_pubmed - Search biomedical literature
2. search_geo - Search gene expression datasets  
3. run_bioinformatics_workflow - Execute workflows
4. read_file - Read files from workspace
5. write_file - Write files to workspace
6. execute_code - Execute Python code

PROJECT FILES:
{project_files or "None"}

AVAILABLE WORKFLOWS:
{available_workflows or "None"}

INSTRUCTIONS:
- Use tools when needed to answer user questions
- Read from /data for input files, write to /workspace for outputs
- Present results clearly to the user
- If you need to run analysis, use the appropriate tool
"""
    
    # Build messages
    messages = [SystemMessage(content=system_prompt)]
    for msg in history:
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            messages.append(AIMessage(content=msg["content"]))
    
    messages.append(HumanMessage(content=user_message))
    
    # Create and run agent
    try:
        agent = create_react_agent()
        
        initial_state: AgentState = {
            "messages": messages,
            "tools_called": [],
            "final_response": None,
            "iteration": 0
        }
        
        result = agent.invoke(initial_state)
        
        return {
            "reply": result.get("final_response", "Completed."),
            "plan_data": None,
            "plan_type": "react",
            "tools_used": result.get("tools_called", [])
        }
        
    except Exception as e:
        print(f"[ReAct Agent] Error: {e}", flush=True)
        return {
            "reply": f"I encountered an error: {str(e)}",
            "plan_data": None,
            "plan_type": "error",
            "tools_used": []
        }


# ================================
# MCP Support (Placeholder)
# ================================

class MCPServerConfig(BaseModel):
    """MCP Server configuration"""
    name: str
    command: str
    args: List[str] = []
    env: Dict[str, str] = {}


# MCP server management (placeholder for future implementation)
async def list_mcp_servers() -> List[Dict[str, Any]]:
    """List configured MCP servers"""
    return []


async def add_mcp_server(config: MCPServerConfig) -> Dict[str, Any]:
    """Add MCP server configuration"""
    return {"status": "not_implemented", "message": "MCP server management coming soon"}


async def remove_mcp_server(name: str) -> Dict[str, Any]:
    """Remove MCP server"""
    return {"status": "not_implemented"}
