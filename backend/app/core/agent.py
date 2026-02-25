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

# 👇 新增参数: project_files
def run_copilot_planner(project_id: str, history: List[Dict[str, Any]], available_workflows: str, project_files: str) -> Dict[str, Any]:
    """
    Copilot 策略规划器 - 分析用户需求并生成执行方案
    
    Returns:
        Dict with keys: reply, plan_data
    """
    llm = get_llm()

    # 👇 优化系统提示词，注入文件上下文，并严格区分"直接回答"与"制定计划"
    system_prompt = SystemMessage(content=f"""You are Bio-Copilot, an expert bioinformatics assistant.
Your job is to listen to user, analyze their request, and PROPOSE an analysis plan.

[PROJECT CONTEXT]
The user currently has the following files in their project directory:
{project_files}

[AVAILABLE WORKFLOWS]
{available_workflows}

CRITICAL RULES:
1. GENERAL QUERIES: If user asks "what files do I have", "summarize", or general biological questions, ANSWER DIRECTLY based on [PROJECT CONTEXT]. DO NOT propose an analysis plan.
2. TOOL CALLING: You MUST use `propose_analysis_plan` tool ONLY when user explicitly asks to run pipelines, process data, or generate plots.
3. ROUTING: Prioritize using an available predefined workflow if it fits the task.
4. CUSTOM CODE: If no predefined workflow fits, select 'sandbox' method and generate comprehensive custom Python code. You MUST save plots to '/workspace' using plt.savefig() and read data from '/data'.
""")

    formatted_msgs = [system_prompt]
    for msg in history:
        if msg["role"] == "user":
            formatted_msgs.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            formatted_msgs.append(AIMessage(content=msg["content"]))

    # 定义工具：让大模型结构化地吐出方案
    propose_plan_tool = {
        "type": "function",
        "function": {
            "name": "propose_analysis_plan",
            "description": "Propose an analysis strategy to user for confirmation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "strategy": {"type": "string", "description": "Clear explanation of analysis strategy."},
                    "method": {"type": "string", "enum": ["workflow", "sandbox"], "description": "Choose 'workflow' for predefined pipelines, or 'sandbox' for custom python script."},
                    "workflow_name": {"type": "string", "description": "If method is 'workflow', name of the pipeline script (e.g., 'rnaseq_qc')."},
                    "custom_code": {"type": "string", "description": "If method is 'sandbox', complete Python code to execute."},
                    "parameters": {"type": "object", "description": "If method is 'workflow', required parameters mapped to a JSON object."}
                },
                "required": ["strategy", "method"]
            }
        }
    }

    llm_with_tools = llm.bind_tools([propose_plan_tool])
    print(f"🧠 [Agent Planner] Thinking for project {project_id}...", flush=True)
    response = llm_with_tools.invoke(formatted_msgs)

    # 如果模型决定提出分析方案
    if response.tool_calls:
        tool_call = response.tool_calls[0]
        if tool_call["name"] == "propose_analysis_plan":
            plan = tool_call["args"]
            return {
                "reply": "I have created an analysis plan for you. Please review and confirm it below.",
                "plan_data": json.dumps(plan)
            }

    # 普通对话回复
    return {
        "reply": response.content,
        "plan_data": None
    }
