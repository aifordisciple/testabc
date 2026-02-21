import os
from typing import TypedDict, Annotated, Sequence, List, Dict, Any
import operator

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END

from app.services.sandbox import sandbox_service

# ==========================================
# 1. 定义状态机中的 State (引入 operator.add 解决状态合并)
# ==========================================
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    project_id: str
    extracted_files: Annotated[List[Dict[str, Any]], operator.add]
    iterations: int  # 记录当前思考循环的次数

# ==========================================
# 2. 初始化带 Tool Calling 的 LLM
# ==========================================
def get_llm():
    return ChatOpenAI(
        model=os.getenv("LLM_MODEL", "qwen2.5-coder:32b"),
        base_url=os.getenv("LLM_BASE_URL", "http://host.docker.internal:11434/v1"),
        api_key=os.getenv("LLM_API_KEY", "ollama"),
        temperature=0.1
    )

sandbox_tool = {
    "type": "function",
    "function": {
        "name": "execute_python_sandbox",
        "description": "Execute Python code in a secure sandbox. Used for reading project files and analyzing data.",
        "parameters": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "Python code to execute. Read inputs from '/data'. Save generated plots to '/workspace'. Example: import os; print(os.listdir('/data'))"
                }
            },
            "required": ["code"]
        }
    }
}

# ==========================================
# 3. 定义图的节点 (Nodes)
# ==========================================
def agent_node(state: AgentState):
    llm = get_llm()
    iterations = state.get("iterations", 0)
    
    # 强化版的 System Prompt，加入防御性指令
    system_prompt = SystemMessage(content=f"""You are Bio-Copilot, an expert bioinformatics AI assistant.
You have access to a secure Python sandbox tool `execute_python_sandbox`.
- User's project data is located in `/data` (Read-Only).
- Output files must be saved to `/workspace`.

CRITICAL RULES:
1. You are currently on iteration {iterations} of maximum 3.
2. If the user asks what files are in the project, write code `import os; print(os.listdir('/data'))` and call the tool.
3. ONCE YOU RECEIVE THE TOOL EXECUTION RESULT, YOU MUST OUTPUT A FINAL CONVERSATIONAL RESPONSE TO THE USER. DO NOT CALL THE TOOL AGAIN.
4. If the tool returns a 'Sandbox system error' or 'docker: not found', APOLOGIZE to the user and STOP. DO NOT RETRY your code.
""")
    
    llm_with_tools = llm.bind_tools([sandbox_tool])
    
    print(f"\n🧠 [Agent Node] Invoking LLM (Iteration {iterations})...", flush=True)
    response = llm_with_tools.invoke([system_prompt] + list(state["messages"]))
    
    if response.tool_calls:
        print(f"   => LLM decided to call tool: {response.tool_calls[0]['name']}", flush=True)
    else:
        print(f"   => LLM provided final conversational answer.", flush=True)
        
    # 将新消息返回，并增加迭代次数
    return {"messages": [response], "iterations": iterations + 1}

def execute_node(state: AgentState):
    last_message = state["messages"][-1]
    project_id = state["project_id"]
    
    tool_outputs = []
    new_extracted_files = []
    
    for tool_call in last_message.tool_calls:
        if tool_call["name"] == "execute_python_sandbox":
            code = tool_call["args"].get("code", "")
            
            print(f"\n{'='*20} 🛠️ SANDBOX EXECUTION {'='*20}", flush=True)
            print(f"Executing Code:\n{code}", flush=True)
            
            # 自动注入上下文代码
            setup_code = "import os\nimport pandas as pd\nimport matplotlib.pyplot as plt\nDATA_DIR = '/data'\nWORK_DIR = '/workspace'\nos.chdir(WORK_DIR)\n\n"
            final_code = setup_code + code
            
            # 调用沙箱
            res = sandbox_service.execute_python(project_id, final_code)
            
            # 在后端日志中打印沙箱的真实输出，便于我们 Debug
            print(f"SUCCESS: {res['success']}", flush=True)
            if res['stdout']: print(f"STDOUT:\n{res['stdout'].strip()}", flush=True)
            if res['stderr']: print(f"STDERR:\n{res['stderr'].strip()}", flush=True)
            print(f"{'='*61}\n", flush=True)
            
            # 格式化执行结果供 LLM 阅读
            content = f"Execution Success: {res['success']}\n"
            if res['stdout']: content += f"Stdout: {res['stdout'][:2000]}\n"
            if res['stderr']: content += f"Stderr: {res['stderr'][:2000]}\n"
            
            if res['files']:
                content += f"Generated Files: {[f['name'] for f in res['files']]}\n"
                new_extracted_files.extend(res['files'])
                
            tool_outputs.append(ToolMessage(
                content=content,
                tool_call_id=tool_call["id"]
            ))
            
    return {"messages": tool_outputs, "extracted_files": new_extracted_files}

def should_continue(state: AgentState):
    """决定是继续执行代码，还是结束对话返回给用户"""
    last_message = state["messages"][-1]
    iterations = state.get("iterations", 0)
    
    if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
        # 如果大模型死循环，强制在 3 次迭代后切断
        if iterations >= 3:
            print("🛑 [Router] Max iterations reached. Forcing Agent to STOP.", flush=True)
            return END
        print("➡️ [Router] Tool calls detected. Routing to Sandbox Executor.", flush=True)
        return "execute"
        
    print("✅ [Router] No tool calls detected. Routing to END.", flush=True)
    return END

# ==========================================
# 4. 构建并编译 LangGraph
# ==========================================
workflow = StateGraph(AgentState)
workflow.add_node("agent", agent_node)
workflow.add_node("execute", execute_node)

workflow.set_entry_point("agent")
workflow.add_conditional_edges("agent", should_continue, {"execute": "execute", END: END})
workflow.add_edge("execute", "agent")

copilot_app = workflow.compile()

# ==========================================
# 5. 暴露给外部调用的主函数
# ==========================================
def run_copilot_agent(project_id: str, history: List[Dict[str, str]]) -> Dict[str, Any]:
    formatted_msgs = []
    for msg in history:
        if msg["role"] == "user":
            formatted_msgs.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            formatted_msgs.append(AIMessage(content=msg["content"]))
            
    initial_state = {
        "messages": formatted_msgs,
        "project_id": project_id,
        "extracted_files": [],
        "iterations": 0
    }
    
    print(f"\n🎬 [Copilot Agent] Starting session for project {project_id}...", flush=True)
    
    # 增加 LangGraph 原生安全底线，防止无限递归
    final_state = copilot_app.invoke(initial_state, {"recursion_limit": 10})
    
    last_msg = final_state["messages"][-1].content
    files = final_state.get("extracted_files", [])
    
    print(f"🏁 [Copilot Agent] Session finished. Extracted {len(files)} files.", flush=True)
    
    return {
        "reply": last_msg,
        "files": files
    }