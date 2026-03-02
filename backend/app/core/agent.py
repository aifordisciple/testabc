import os
import json
import re
from typing import List, Dict, Any, AsyncGenerator
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_openai import ChatOpenAI
from sqlmodel import Session

from app.core.intent_parser import IntentParser, intent_parser
from app.services.workflow_matcher import workflow_matcher, WorkflowMatch

HIGH_CONFIDENCE_THRESHOLD = 0.75
MEDIUM_CONFIDENCE_THRESHOLD = 0.50
MAX_TOOL_OPTIONS = 3

# 快速分析关键词 - 用于跳过意图解析
ANALYSIS_KEYWORDS = [
    "分析", "绘制", "计算", "统计", "处理", "运行", "执行",
    "画图", "图表", "bar图", "折线图", "散点图", "热图", "火山图",
    "differential", "expression", "qc", "quality", "align", "mapping",
    "analyze", "plot", "chart", "run", "execute", "calculate",
    "差异", "表达", "质控", "比对", "聚类", "降维", "pca", "tsne"
]

def _is_likely_analysis_request(message: str) -> bool:
    """快速检测是否可能是分析请求（跳过LLM意图解析）"""
    msg_lower = message.lower()
    return any(kw in msg_lower for kw in ANALYSIS_KEYWORDS)
def get_llm():
    """获取 LangChain ChatOpenAI 客户端 (向后兼容函数)"""
    from app.core.llm import get_llm_client
    return get_llm_client().chat
    model = os.getenv("LLM_MODEL", "glm-5")
    base_url = os.getenv("LLM_BASE_URL", "http://host.docker.internal:11434/v1")
    api_key = os.getenv("LLM_API_KEY", "ollama")
    
    print(f"[get_llm] 初始化 LLM - model: {model}, base_url: {base_url}", flush=True)
    
    return ChatOpenAI(
        model=model,
        base_url=base_url,
        api_key=api_key,
        temperature=0.1
    )

def _build_system_prompt(available_workflows: str, project_files: str, matched_tools_info: str = "") -> SystemMessage:
    tools_hint = ""
    if matched_tools_info:
        tools_hint = f"""

[MATCHED TOOLS - HIGH PRIORITY]
{matched_tools_info}

IMPORTANT: The above tools have been automatically matched to the user's request. 
You should recommend using these existing tools instead of writing custom code when appropriate.
"""
    
    return SystemMessage(content=f"""You are Bio-Copilot, an intelligent bioinformatics assistant. 

[YOUR CURRENT PROJECT FILES (Mounted in /data - READ ONLY)]
{project_files}

[AVAILABLE TOOLS & PIPELINES]
{available_workflows if available_workflows.strip() else "None"}
{tools_hint}

CRITICAL RULES YOU MUST FOLLOW:
1. KNOW YOUR FILES: You ALREADY know what files the user has because they are listed above. Just ANSWER DIRECTLY based on the list above.
2. NEVER ASK THE USER TO RUN CODE: You are an autonomous agent. If data needs to be processed, analyzed, or plotted, YOU MUST use tools.
3. ROUTING PRIORITY: When the user asks to analyze data, ALWAYS check if there are MATCHED TOOLS above. If tools are matched with high confidence (score >= 0.75), use `recommend_existing_tool` to recommend them.
4. SANDBOX FALLBACK: Only use `propose_analysis_plan` with method='sandbox' when no suitable existing tool is found.
5. SANDBOX PATHS - VERY IMPORTANT:
   - /data is READ-ONLY mount for input files
   - /workspace is WRITABLE directory for output files
   - NEVER write output files to /data (it will cause "Read-only file system" error)
   - Example: df.to_csv('/workspace/output.csv') ✓  NOT df.to_csv('/data/output.csv') ✗
6. MULTI-STEP TASKS: For complex tasks requiring multiple steps, use `propose_multi_step_plan`.
7. SIMPLE TASKS: For single-step tasks, use `recommend_existing_tool` (if tools matched) or `propose_analysis_plan` (if no tools matched).
8. VISUALIZATION: For plotting and visualization tasks, prefer R with ggplot2 when the user asks for charts, plots, or visualizations. R is better suited for statistical graphics.
9. R CODE PATTERN: When generating R code for the sandbox, use R syntax: `<-` for assignment (not `=`), `library(pkg)` to load packages, and save plots to `/workspace/` directory using e.g., `ggsave("/workspace/plot.png", plot)`.
""")

def _format_messages(system_prompt: SystemMessage, history: List[Dict[str, Any]]) -> List:
    formatted_msgs = [system_prompt]
    for msg in history:
        if msg["role"] == "user":
            formatted_msgs.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            formatted_msgs.append(AIMessage(content=msg["content"]))
    return formatted_msgs

def _format_matched_tools_for_prompt(matched_tools: List[WorkflowMatch]) -> str:
    if not matched_tools:
        return ""
    
    lines = []
    for i, tool in enumerate(matched_tools, 1):
        lines.append(f"{i}. **{tool.template_name}** (ID: {tool.template_id})")
        lines.append(f"   - Type: {tool.workflow_type}")
        lines.append(f"   - Match Score: {tool.match_score:.0%}")
        lines.append(f"   - Reason: {tool.match_reason}")
        if tool.description:
            lines.append(f"   - Description: {tool.description[:100]}...")
        lines.append("")
    
    return "\n".join(lines)

def _get_recommend_tool_tool():
    return {
        "type": "function",
        "function": {
            "name": "recommend_existing_tool",
            "description": "Recommend an existing tool/pipeline that matches the user's request. Use this when a suitable tool is found with high confidence (score >= 0.75).",
            "parameters": {
                "type": "object",
                "properties": {
                    "strategy": {"type": "string", "description": "Explanation of why this tool is recommended."},
                    "tool_name": {"type": "string", "description": "Name of the recommended tool."},
                    "tool_id": {"type": "string", "description": "ID of the recommended tool."},
                    "match_score": {"type": "number", "description": "Match score (0-1)."},
                    "suggested_params": {"type": "object", "description": "Suggested parameter values."}
                },
                "required": ["strategy", "tool_name", "tool_id", "match_score"]
            }
        }
    }

def _get_present_choices_tool():
    return {
        "type": "function",
        "function": {
            "name": "present_tool_choices",
            "description": "Present multiple tool options to the user when there are several potential matches. Use this when there are multiple tools with moderate match scores (0.50-0.75).",
            "parameters": {
                "type": "object",
                "properties": {
                    "strategy": {"type": "string", "description": "Explanation of the options presented."},
                    "custom_code_option": {"type": "boolean", "description": "Whether to also offer custom code option.", "default": True}
                },
                "required": ["strategy"]
            }
        }
    }

def _get_single_step_tool():
    return {
        "type": "function",
        "function": {
            "name": "propose_analysis_plan",
            "description": "Propose a SINGLE-STEP analysis strategy with custom code. Use this when no suitable existing tool is found.",
            "parameters": {
                "type": "object",
                "properties": {
                    "strategy": {"type": "string", "description": "Clear explanation of the strategy."},
                    "method": {"type": "string", "enum": ["sandbox"], "description": "Always use 'sandbox' for custom code."},
                    "custom_code": {"type": "string", "description": "Complete Python code. INPUT: read from '/data'. OUTPUT: save to '/workspace' (NOT /data!). Example: df.to_csv('/workspace/output.csv')"}
                },
                "required": ["strategy", "method", "custom_code"]
            }
        }
    }

def _get_multi_step_tool():
    return {
        "type": "function",
        "function": {
            "name": "propose_multi_step_plan",
            "description": "Propose a MULTI-STEP analysis chain. Use this for complex tasks that require sequential operations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "strategy": {"type": "string", "description": "Overall strategy explanation."},
                    "steps": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "step": {"type": "integer", "description": "Step number (1, 2, 3...)"},
                                "action": {"type": "string", "description": "Brief action name"},
                                "code": {"type": "string", "description": "Python code. Read from '/data', save to '/workspace'."},
                                "expected_output": {"type": "string", "description": "What this step will produce"}
                            },
                            "required": ["step", "action", "code", "expected_output"]
                        }
                    }
                },
                "required": ["strategy", "steps"]
            }
        }
    }

def run_copilot_planner_with_matching(
    project_id: str, 
    history: List[Dict[str, Any]], 
    available_workflows: str, 
    project_files: str,
    db_session: Session
) -> Dict[str, Any]:
    print(f"[Agent] 开始处理 project_id: {project_id}", flush=True)
    
    last_user_msg = None
    for msg in reversed(history):
        if msg["role"] == "user":
            last_user_msg = msg["content"]
            break
    
    if not last_user_msg:
        print(f"[Agent] 未找到用户消息，使用默认 planner", flush=True)
        return run_copilot_planner(project_id, history, available_workflows, project_files)
    
    print(f"[Agent] 用户消息: {last_user_msg[:100]}...", flush=True)
    
    # 快速路径: 如果消息明显是分析请求，跳过LLM意图解析
    if _is_likely_analysis_request(last_user_msg):
        print(f"⚡ [Agent] 快速路径: 检测到分析关键词，跳过意图解析", flush=True)
        from app.core.intent_parser import ParsedIntent
        intent = ParsedIntent(
            intent_type="analysis",
            analysis_type="Custom Analysis",
            keywords=last_user_msg.split()[:5],
            confidence=0.9,
            raw_description=last_user_msg
        )
    else:
        intent = intent_parser.parse(last_user_msg)
    print(f"[Agent] 意图类型: {intent.intent_type}", flush=True)
    
    if intent.intent_type != "analysis":
        print(f"[Agent] 非分析意图，使用默认 planner", flush=True)
        return run_copilot_planner(project_id, history, available_workflows, project_files)
    
    matched_tools = workflow_matcher.match(intent, db_session, top_k=MAX_TOOL_OPTIONS)
    print(f"[Agent] 匹配到的工具数: {len(matched_tools)}", flush=True)
    
    if not matched_tools:
        print(f"[Agent] 无匹配工具，使用默认 planner", flush=True)
        return run_copilot_planner(project_id, history, available_workflows, project_files)
    
    best_match = matched_tools[0]
    print(f"[Agent] 最佳匹配: {best_match.template_name} (score: {best_match.match_score:.2f})", flush=True)
    
    # 超高置信度快速路径: 直接返回推荐，跳过第二次LLM调用
    if best_match.match_score >= 0.85:
        print(f"⚡ [Agent] 超高置信度快速路径: {best_match.template_name} ({best_match.match_score:.0%})", flush=True)
        return {
            "reply": f"I found a highly matching tool for your request: **{best_match.template_name}**. Please review and confirm.",
            "plan_data": json.dumps({
                "type": "tool_recommendation",
                "matched_tools": [{
                    "tool_id": str(best_match.template_id),
                    "tool_name": best_match.template_name,
                    "match_score": best_match.match_score,
                    "match_reason": best_match.match_reason,
                    "workflow_type": best_match.workflow_type,
                    "description": best_match.description,
                    "params_schema": best_match.params_schema,
                    "inferred_params": best_match.inferred_params
                }]
            }),
            "plan_type": "tool_recommendation"
        }
    
    if best_match.match_score >= HIGH_CONFIDENCE_THRESHOLD:
        matched_tools_info = _format_matched_tools_for_prompt([best_match])
        llm = get_llm()
        system_prompt = _build_system_prompt(available_workflows, project_files, matched_tools_info)
        formatted_msgs = _format_messages(system_prompt, history)
        
        recommend_tool = _get_recommend_tool_tool()
        llm_with_tools = llm.bind_tools([recommend_tool])
        
        print(f"🧠 [Agent] High confidence match: {best_match.template_name} ({best_match.match_score:.0%})", flush=True)
        
        response = llm_with_tools.invoke(formatted_msgs)
        
        if response.tool_calls:
            tool_call = response.tool_calls[0]
            if tool_call["name"] == "recommend_existing_tool":
                args = tool_call["args"]
                args["matched_tools"] = [{
                    "tool_id": str(best_match.template_id),
                    "tool_name": best_match.template_name,
                    "match_score": best_match.match_score,
                    "match_reason": best_match.match_reason,
                    "workflow_type": best_match.workflow_type,
                    "description": best_match.description,
                    "params_schema": best_match.params_schema,
                    "inferred_params": best_match.inferred_params
                }]
                return {
                    "reply": "I found a highly matching tool for your request. Please review and confirm.",
                    "plan_data": json.dumps({"type": "tool_recommendation", **args}),
                    "plan_type": "tool_recommendation"
                }
        
    elif best_match.match_score >= MEDIUM_CONFIDENCE_THRESHOLD:
        matched_tools_info = _format_matched_tools_for_prompt(matched_tools)
        llm = get_llm()
        system_prompt = _build_system_prompt(available_workflows, project_files, matched_tools_info)
        formatted_msgs = _format_messages(system_prompt, history)
        
        present_choices = _get_present_choices_tool()
        llm_with_tools = llm.bind_tools([present_choices])
        
        print(f"🧠 [Agent] Medium confidence matches: {len(matched_tools)} tools", flush=True)
        
        response = llm_with_tools.invoke(formatted_msgs)
        
        tools_data = [{
            "tool_id": str(t.template_id),
            "tool_name": t.template_name,
            "match_score": t.match_score,
            "match_reason": t.match_reason,
            "workflow_type": t.workflow_type,
            "description": t.description,
            "params_schema": t.params_schema,
            "inferred_params": t.inferred_params
        } for t in matched_tools]
        
        if response.tool_calls:
            tool_call = response.tool_calls[0]
            if tool_call["name"] == "present_tool_choices":
                args = tool_call["args"]
                args["matched_tools"] = tools_data
                return {
                    "reply": "I found several tools that might help. Please choose one or select custom code.",
                    "plan_data": json.dumps({"type": "tool_choice", **args}),
                    "plan_type": "tool_choice"
                }
        
        return {
            "reply": "I found several tools that might help. Please choose one or select custom code.",
            "plan_data": json.dumps({"type": "tool_choice", "strategy": "Multiple tools available", "matched_tools": tools_data}),
            "plan_type": "tool_choice"
        }
    
    return run_copilot_planner(project_id, history, available_workflows, project_files)

def run_copilot_planner(project_id: str, history: List[Dict[str, Any]], available_workflows: str, project_files: str) -> Dict[str, Any]:
    print(f"[Agent Planner] 开始 - project_id: {project_id}", flush=True)
    print(f"[Agent Planner] 历史消息数: {len(history)}", flush=True)
    
    llm = get_llm()
    print(f"[Agent Planner] LLM 已初始化", flush=True)
    
    system_prompt = _build_system_prompt(available_workflows, project_files)
    formatted_msgs = _format_messages(system_prompt, history)
    
    single_step_tool = _get_single_step_tool()
    multi_step_tool = _get_multi_step_tool()
    
    llm_with_tools = llm.bind_tools([single_step_tool, multi_step_tool])
    print(f"[Agent Planner] 开始调用 LLM...", flush=True)
    
    try:
        response = llm_with_tools.invoke(formatted_msgs)
        print(f"[Agent Planner] LLM 调用完成", flush=True)
    except Exception as e:
        print(f"[Agent Planner] LLM 调用失败: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return {
            "reply": f"抱歉，AI 服务暂时不可用: {str(e)}",
            "plan_data": None,
            "plan_type": None
        }

    if response.tool_calls:
        tool_call = response.tool_calls[0]
        tool_name = tool_call["name"]
        print(f"[Agent Planner] 工具调用: {tool_name}", flush=True)
        
        if tool_name == "propose_analysis_plan":
            plan = tool_call["args"]
            return {
                "reply": "I have created an analysis plan for you. Please review and confirm it below.",
                "plan_data": json.dumps({"type": "single", **plan}),
                "plan_type": "single"
            }
        
        elif tool_name == "propose_multi_step_plan":
            plan = tool_call["args"]
            total_steps = len(plan.get("steps", []))
            return {
                "reply": f"I have created a **multi-step analysis plan** with {total_steps} steps. Please review and confirm it below.",
                "plan_data": json.dumps({"type": "multi", **plan}),
                "plan_type": "multi"
            }

    print(f"[Agent Planner] 无工具调用，返回纯文本", flush=True)
    return {
        "reply": response.content,
        "plan_data": None,
        "plan_type": None
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
    
    single_step_tool = _get_single_step_tool()
    multi_step_tool = _get_multi_step_tool()
    
    llm_with_tools = llm.bind_tools([single_step_tool, multi_step_tool])
    print(f"🧠 [Agent Planner] Streaming for project {project_id}...", flush=True)
    
    full_content = ""
    plan_data = None
    plan_type = None
    
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
                tool_name = tool_call["name"]
                
                if tool_name == "propose_analysis_plan":
                    plan = tool_call["args"]
                    plan_data = json.dumps({"type": "single", **plan})
                    plan_type = "single"
                    yield {
                        "type": "plan",
                        "plan_data": plan_data,
                        "plan_type": plan_type
                    }
                    
                elif tool_name == "propose_multi_step_plan":
                    plan = tool_call["args"]
                    plan_data = json.dumps({"type": "multi", **plan})
                    plan_type = "multi"
                    yield {
                        "type": "plan",
                        "plan_data": plan_data,
                        "plan_type": plan_type
                    }
        
        if not full_content and plan_data:
            if plan_type == "multi":
                steps_count = len(json.loads(plan_data).get("steps", []))
                full_content = f"I have created a **multi-step analysis plan** with {steps_count} steps. Please review and confirm it below."
            else:
                full_content = "I have created an analysis plan for you. Please review and confirm it below."
        
        yield {
            "type": "done",
            "full_content": full_content,
            "plan_data": plan_data,
            "plan_type": plan_type
        }
        
    except Exception as e:
        print(f"❌ [Agent Planner] Stream error: {e}", flush=True)
        yield {
            "type": "error",
            "message": str(e)
        }

async def analyze_error_and_fix(
    original_code: str,
    error_message: str,
    stdout: str,
    data_context: str,
    retry_count: int,
    max_retries: int = 3
) -> Dict[str, Any]:
    llm = get_llm()
    
    prompt = f"""You are a Python debugging expert. A code execution failed.

## Original Code:
```python
{original_code}
```

## Error Message:
```
{error_message[:2000]}
```

## Standard Output:
```
{stdout[:1000]}
```

## Available Data Context:
{data_context}

## Retry Count: {retry_count}/{max_retries}

Analyze the error and provide a fix. Output ONLY a JSON object with this structure:
{{
    "analysis": "Brief explanation of what went wrong",
    "fix_description": "What was changed to fix it",
    "fixed_code": "The corrected Python code"
}}

CRITICAL RULES:
1. The fixed_code must be COMPLETE and RUNNABLE Python code
2. Do NOT use any undefined variables
3. Read data from '/data' directory
4. Save outputs to '/workspace' directory
5. Handle edge cases (missing files, empty data, etc.)
6. Add proper error handling with try/except blocks
"""

    try:
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        content = response.content
        
        json_match = re.search(r'\{[\s\S]*\}', content)
        if json_match:
            result = json.loads(json_match.group())
        else:
            code_match = re.search(r'```python\s*([\s\S]*?)\s*```', content)
            if code_match:
                fixed_code = code_match.group(1).strip()
            else:
                fixed_code = original_code
            result = {
                "analysis": "Could not parse structured response",
                "fix_description": "Applied general fixes",
                "fixed_code": fixed_code
            }
        
        if not result.get("fixed_code"):
            code_match = re.search(r'```python\s*([\s\S]*?)\s*```', content)
            if code_match:
                result["fixed_code"] = code_match.group(1).strip()
            else:
                result["fixed_code"] = original_code
        
        print(f"🔧 [Error Fix] Retry {retry_count}/{max_retries}: {result.get('analysis', 'Unknown error')[:100]}", flush=True)
        return result
        
    except Exception as e:
        print(f"❌ [Error Fix] Failed to analyze: {e}", flush=True)
        return {
            "analysis": f"LLM analysis failed: {str(e)}",
            "fix_description": "Returning original code",
            "fixed_code": original_code
        }

def extract_code_from_response(response_text: str) -> str:
    code_match = re.search(r'```python\s*([\s\S]*?)\s*```', response_text)
    if code_match:
        return code_match.group(1).strip()
    
    json_match = re.search(r'"fixed_code":\s*"([\s\S]*?)"', response_text)
    if json_match:
        return json_match.group(1).replace('\\n', '\n').replace('\\"', '"')
    
    return response_text
