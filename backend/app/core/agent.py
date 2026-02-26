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

    # 👇 明确定义双模态，终结乱发 Plan 的情况
    system_prompt = SystemMessage(content=f"""You are Bio-Copilot, an intelligent bioinformatics assistant. You operate in TWO modes:

[PROJECT FILES]
{project_files}

[AVAILABLE TOOLS & PIPELINES]
{available_workflows if available_workflows.strip() else "None"}

CRITICAL RULES:
1. CHAT MODE (DEFAULT): If the user asks "What files do I have?", "List my files", "Summarize", or asks biology questions, YOU MUST ANSWER DIRECTLY with a text message based on the [PROJECT FILES]. DO NOT call the propose_analysis_plan tool!
2. PLANNER MODE: ONLY use the `propose_analysis_plan` tool when the user EXPLICITLY asks to analyze data, plot a graph, or run a pipeline.
3. ROUTING PRIORITY: If you are in PLANNER MODE, check [AVAILABLE TOOLS & PIPELINES]. If the user's request matches a tool exactly, set 'method' to 'workflow' and use its EXACT name.
4. SANDBOX FALLBACK: If NO existing tool/pipeline matches the request, set 'method' to 'sandbox' and write Python code. NEVER output 'None' or 'null' for workflow_name.
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
            "description": "Propose an analysis strategy ONLY when user explicitly asks to run code or analyze data.",
            "parameters": {
                "type": "object",
                "properties": {
                    "strategy": {"type": "string", "description": "Clear explanation of the strategy."},
                    "method": {"type": "string", "enum": ["workflow", "sandbox"], "description": "Use 'workflow' for existing tools, 'sandbox' for custom code."},
                    "workflow_name": {"type": "string", "description": "Exact name of the script/tool. Cannot be None."},
                    "custom_code": {"type": "string", "description": "If sandbox, complete Python code. Read from '/data', save plots to '/workspace/result.png'."},
                    "parameters": {"type": "object", "description": "If workflow, required parameters mapped to a JSON object."}
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