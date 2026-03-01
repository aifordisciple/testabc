from fastapi import APIRouter, Depends
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter()

# Initialize orchestrators
from app.core.agent_orchestrator import agent_orchestrator, initialize_agents, AgentCapability, AgentTask
from app.core.workflow_orchestrator import workflow_orchestrator, create_rnaseq_workflow

# Initialize on module load
initialize_agents(None)

class ExecuteAgentRequest(BaseModel):
    task_description: str
    capabilities: List[str]
    context: Dict[str, Any] = {}

class CreateWorkflowRequest(BaseModel):
    name: str
    description: str
    steps: List[Dict[str, Any]]

class ExecuteWorkflowRequest(BaseModel):
    workflow_id: str

@router.get("/agents/status")
def get_agents_status(
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get status of all agents"""
    return agent_orchestrator.get_status()

@router.get("/agents")
def list_agents(
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """List all available agents"""
    return [
        agent.get_info()
        for agent in agent_orchestrator.agents.values()
    ]

@router.post("/agents/execute")
async def execute_agent_task(
    request: ExecuteAgentRequest,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Execute a task with the best matching agent"""
    task = AgentTask(
        id=str(uuid.uuid4()),
        description=request.task_description,
        required_capabilities=[AgentCapability(c) for c in request.capabilities],
        context=request.context
    )
    
    result = await agent_orchestrator.execute_task(task)
    
    return {
        "task_id": task.id,
        "status": task.status.value,
        "result": result,
        "error": task.error
    }

@router.get("/workflows")
def list_workflows(
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """List all orchestrated workflows"""
    return workflow_orchestrator.list_workflows()

@router.post("/workflows")
def create_workflow(
    request: CreateWorkflowRequest,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Create a new orchestrated workflow"""
    import uuid
    workflow = workflow_orchestrator.create_workflow(
        name=request.name,
        description=request.description,
        steps_config=request.steps
    )
    
    return {
        "id": workflow.id,
        "name": workflow.name,
        "description": workflow.description,
        "step_count": len(workflow.steps),
        "created_at": workflow.created_at.isoformat()
    }

@router.get("/workflows/{workflow_id}")
def get_workflow(
    workflow_id: str,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get workflow details"""
    workflow = workflow_orchestrator.get_workflow(workflow_id)
    if not workflow:
        return {"error": "Workflow not found"}
    
    return {
        "id": workflow.id,
        "name": workflow.name,
        "description": workflow.description,
        "status": workflow.status,
        "steps": [
            {
                "id": s.id,
                "name": s.name,
                "type": s.step_type.value,
                "status": s.status.value,
                "depends_on": s.depends_on
            }
            for s in workflow.steps
        ],
        "results": workflow.results
    }

@router.post("/workflows/{workflow_id}/execute")
async def execute_workflow(
    workflow_id: str,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Execute an orchestrated workflow"""
    async def step_executor(step, context):
        # This would integrate with actual workflow execution
        return {
            "step_id": step.id,
            "status": "executed",
            "context": context
        }
    
    result = await workflow_orchestrator.execute_workflow(workflow_id, step_executor)
    return result

@router.delete("/workflows/{workflow_id}")
def delete_workflow(
    workflow_id: str,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Delete a workflow"""
    success = workflow_orchestrator.delete_workflow(workflow_id)
    return {"success": success}

@router.post("/workflows/templates/rnaseq")
def create_rnaseq_template(
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Create a standard RNA-seq workflow template"""
    workflow = create_rnaseq_workflow({})
    
    return {
        "id": workflow.id,
        "name": workflow.name,
        "description": workflow.description,
        "steps": [
            {
                "id": s.id,
                "name": s.name,
                "type": s.step_type.value,
                "depends_on": s.depends_on
            }
            for s in workflow.steps
        ]
    }

import uuid
