import os
import json
from typing import List, Dict, Any
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_openai import ChatOpenAI

def get_llm():
    return ChatOpenAI(
        model=os.getenv("LLM_MODEL", "qwen2.5-coder:32b"),
        base_url=os.getenv("LLM_BASE_URL", "http://host.docker.internal:11434/v1"),
        api_key=os.getenv("LLM_API_KEY", "ollama"),
        temperature=0.1
    )

def run_copilot_planner(project_id: str, history: List[Dict[str, Any]], available_workflows: str, project_files: str) -> Dict[str, Any]:
    llm = get_llm()

    system_prompt = SystemMessage(content=f"""You are Bio-Copilot, an expert bioinformatics routing and planning assistant.
Your job is to listen to the user, analyze their request, and PROPOSE an analysis plan.

[PROJECT CONTEXT]
The user currently has the following files in their project directory:
{project_files}

[AVAILABLE PREDEFINED WORKFLOWS & TOOLS]
{available_workflows if available_workflows.strip() else "No predefined workflows available."}

CRITICAL RULES:
1. GENERAL QUERIES: If the user asks "what files do I have" or general biology questions, ANSWER DIRECTLY based on the [PROJECT CONTEXT]. DO NOT propose a plan.
2. TOOL CALLING: Use `propose_analysis_plan` ONLY when the user asks to run pipelines, process data, or generate plots.
3. ROUTING PRIORITY (CRITICAL): 
   - Check the [AVAILABLE PREDEFINED WORKFLOWS & TOOLS] carefully.
   - If AND ONLY IF the user's request matches a tool perfectly, set 'method' to 'workflow' and set 'workflow_name' to the EXACT name from the list.
4. CUSTOM CODE (FALLBACK): 
   - If there is NO matching tool in the list, YOU MUST set 'method' to 'sandbox' and write custom Python code.
   - DO NOT set 'method' to 'workflow' if you cannot find a match.
   - NEVER output 'None' or 'null' for workflow_name.
   - When using 'sandbox', read data from '/data' and save plots to '/workspace/result.png'.
""")

    formatted_msgs = [system_prompt]
    for msg in history:
        if msg["role"] == "user":
            formatted_msgs.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            formatted_msgs.append(AIMessage(content=msg["content"]))

    propose_plan_tool = {
        "type": "function",
        "function": {
            "name": "propose_analysis_plan",
            "description": "Propose an analysis strategy to the user for confirmation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "strategy": {"type": "string", "description": "Clear explanation of the strategy."},
                    "method": {"type": "string", "enum": ["workflow", "sandbox"], "description": "Use 'workflow' for existing tools/pipelines, 'sandbox' for custom code."},
                    "workflow_name": {"type": "string", "description": "If workflow, the exact name of the script/tool. Cannot be None."},
                    "custom_code": {"type": "string", "description": "If sandbox, the complete Python code to execute."},
                    "parameters": {"type": "object", "description": "If workflow, parameters matching the tool's schema."}
                },
                "required": ["strategy", "method"]
            }
        }
    }

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