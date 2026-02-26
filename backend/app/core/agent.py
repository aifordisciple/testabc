import os
import json
from typing import List, Dict, Any, AsyncGenerator
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_openai import ChatOpenAI

def get_llm():
    return ChatOpenAI(
        model=os.getenv("LLM_MODEL", "glm-5"),
        base_url=os.getenv("LLM_BASE_URL", "http://host.docker.internal:11434/v1"),
        api_key=os.getenv("LLM_API_KEY", "ollama"),
        temperature=0.1
    )

def _build_system_prompt(available_workflows: str, project_files: str) -> SystemMessage:
    return SystemMessage(content=f"""You are Bio-Copilot, an intelligent bioinformatics assistant. 

[YOUR CURRENT PROJECT FILES (Mounted in /data)]
{project_files}

[AVAILABLE TOOLS & PIPELINES]
{available_workflows if available_workflows.strip() else "None"}

CRITICAL RULES YOU MUST FOLLOW:
1. KNOW YOUR FILES: You ALREADY know what files the user has because they are listed above in [YOUR CURRENT PROJECT FILES]. If the user asks "What files do I have" or "Find the sample file", DO NOT write code to scan directories. Just ANSWER DIRECTLY based on the list above.
2. NEVER ASK THE USER TO RUN CODE: You are an autonomous agent. If data needs to be processed, analyzed, or plotted, YOU MUST use the `propose_analysis_plan` tool (with method 'sandbox'). NEVER output Python code in plain text and ask the user to "please run this code". You do the running!
3. ROUTING PRIORITY: When the user asks to analyze data, check [AVAILABLE TOOLS & PIPELINES]. If a predefined tool fits perfectly, call `propose_analysis_plan` with method='workflow'.
4. SANDBOX FALLBACK: If no tool fits, call `propose_analysis_plan` with method='sandbox' and write the Python code yourself.
5. SANDBOX PATHS: Always read input files from the `/data` directory. Always save your output plots/results to the `/workspace` directory (e.g., `/workspace/result.png`).
""")

def _format_messages(system_prompt: SystemMessage, history: List[Dict[str, Any]]) -> List:
    formatted_msgs = [system_prompt]
    for msg in history:
        if msg["role"] == "user":
            formatted_msgs.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            formatted_msgs.append(AIMessage(content=msg["content"]))
    return formatted_msgs

def _get_propose_plan_tool():
    return {
        "type": "function",
        "function": {
            "name": "propose_analysis_plan",
            "description": "Propose an analysis strategy ONLY when user explicitly asks to run code or analyze data.",
            "parameters": {
                "type": "object",
                "properties": {
                    "strategy": {"type": "string", "description": "Clear explanation of the strategy."},
                    "method": {"type": "string", "enum": ["workflow", "sandbox"], "description": "Use 'workflow' for existing tools, 'sandbox' for custom code."},
                    "workflow_name": {"type": "string", "description": "Exact name of the script/tool. Cannot be None."},
                    "custom_code": {"type": "string", "description": "If sandbox, complete Python code. Read from '/data', save to '/workspace'."},
                    "parameters": {"type": "object", "description": "If workflow, required parameters mapped to a JSON object."}
                },
                "required": ["strategy", "method"]
            }
        }
    }

def run_copilot_planner(project_id: str, history: List[Dict[str, Any]], available_workflows: str, project_files: str) -> Dict[str, Any]:
    llm = get_llm()
    system_prompt = _build_system_prompt(available_workflows, project_files)
    formatted_msgs = _format_messages(system_prompt, history)
    propose_plan_tool = _get_propose_plan_tool()

    llm_with_tools = llm.bind_tools([propose_plan_tool])
    print(f"🧠 [Agent Planner] Thinking for project {project_id}...", flush=True)
    
    response = llm_with_tools.invoke(formatted_msgs)

    if response.tool_calls:
        tool_call = response.tool_calls[0]
        if tool_call["name"] == "propose_analysis_plan":
            plan = tool_call["args"]
            return {
                "reply": "I have created an analysis plan for you. Please review and confirm it below.",
                "plan_data": json.dumps(plan)
            }

    return {
        "reply": response.content,
        "plan_data": None
    }

async def run_copilot_planner_stream(
    project_id: str, 
    history: List[Dict[str, Any]], 
    available_workflows: str, 
    project_files: str
) -> AsyncGenerator[Dict[str, Any], None]:
    llm = get_llm()
    system_prompt = _build_system_prompt(available_workflows, project_files)
    formatted_msgs = _format_messages(system_prompt, history)
    propose_plan_tool = _get_propose_plan_tool()

    llm_with_tools = llm.bind_tools([propose_plan_tool])
    print(f"🧠 [Agent Planner] Streaming for project {project_id}...", flush=True)
    
    full_content = ""
    plan_data = None
    
    try:
        async for chunk in llm_with_tools.astream(formatted_msgs):
            if chunk.content:
                full_content += chunk.content
                yield {
                    "type": "token",
                    "content": chunk.content
                }
            
            if hasattr(chunk, 'tool_calls') and chunk.tool_calls:
                tool_call = chunk.tool_calls[0]
                if tool_call["name"] == "propose_analysis_plan":
                    plan_data = tool_call["args"]
                    yield {
                        "type": "plan",
                        "plan_data": json.dumps(plan_data)
                    }
        
        if not full_content and plan_data:
            full_content = "I have created an analysis plan for you. Please review and confirm it below."
        
        yield {
            "type": "done",
            "full_content": full_content,
            "plan_data": json.dumps(plan_data) if plan_data else None
        }
        
    except Exception as e:
        print(f"❌ [Agent Planner] Stream error: {e}", flush=True)
        yield {
            "type": "error",
            "message": str(e)
        }
