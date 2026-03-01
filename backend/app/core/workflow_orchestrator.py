from typing import Dict, Any, List, Optional, Callable
from enum import Enum
from dataclasses import dataclass, field
import json
import uuid
from datetime import datetime

class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"

class StepType(str, Enum):
    WORKFLOW = "workflow"
    TOOL = "tool"
    DATA_FETCH = "data_fetch"
    TRANSFORM = "transform"
    VISUALIZE = "visualize"
    CONDITION = "condition"
    LOOP = "loop"

@dataclass
class WorkflowStep:
    id: str
    name: str
    step_type: StepType
    config: Dict[str, Any]
    depends_on: List[str] = field(default_factory=list)
    status: StepStatus = StepStatus.PENDING
    result: Optional[Any] = None
    error: Optional[str] = None

@dataclass
class OrchestratedWorkflow:
    id: str
    name: str
    description: str
    steps: List[WorkflowStep]
    created_at: datetime
    status: str = "pending"
    results: Dict[str, Any] = field(default_factory=dict)

class WorkflowOrchestrator:
    def __init__(self):
        self.workflows: Dict[str, OrchestratedWorkflow] = {}
    
    def create_workflow(
        self,
        name: str,
        description: str,
        steps_config: List[Dict[str, Any]]
    ) -> OrchestratedWorkflow:
        """Create a new orchestrated workflow from step configurations"""
        workflow_id = str(uuid.uuid4())
        
        steps = []
        for step_cfg in steps_config:
            step = WorkflowStep(
                id=step_cfg.get("id", str(uuid.uuid4())),
                name=step_cfg.get("name", "Unnamed Step"),
                step_type=StepType(step_cfg.get("type", "tool")),
                config=step_cfg.get("config", {}),
                depends_on=step_cfg.get("depends_on", [])
            )
            steps.append(step)
        
        workflow = OrchestratedWorkflow(
            id=workflow_id,
            name=name,
            description=description,
            steps=steps,
            created_at=datetime.utcnow()
        )
        
        self.workflows[workflow_id] = workflow
        return workflow
    
    def get_workflow(self, workflow_id: str) -> Optional[OrchestratedWorkflow]:
        return self.workflows.get(workflow_id)
    
    def _can_run_step(self, step: WorkflowStep, completed: set) -> bool:
        """Check if all dependencies are completed"""
        return all(dep_id in completed for dep_id in step.depends_on)
    
    def _get_ready_steps(
        self, 
        steps: List[WorkflowStep], 
        completed: set
    ) -> List[WorkflowStep]:
        """Get all steps that can run now"""
        return [
            step for step in steps
            if step.status == StepStatus.PENDING 
            and self._can_run_step(step, completed)
        ]
    
    async def execute_workflow(
        self,
        workflow_id: str,
        executor: Callable[[WorkflowStep], Any]
    ) -> Dict[str, Any]:
        """Execute workflow with given executor function"""
        workflow = self.workflows.get(workflow_id)
        if not workflow:
            return {"error": "Workflow not found"}
        
        workflow.status = "running"
        completed = set()
        failed = False
        
        while True:
            ready_steps = self._get_ready_steps(workflow.steps, completed)
            
            if not ready_steps:
                # Check if we're done
                if len(completed) == len(workflow.steps):
                    workflow.status = "completed"
                    break
                elif failed:
                    workflow.status = "failed"
                    break
                else:
                    # Deadlock - steps pending but none can run
                    break
            
            # Execute ready steps
            for step in ready_steps:
                step.status = StepStatus.RUNNING
                
                try:
                    # Gather results from dependencies
                    context = {
                        dep_id: workflow.steps[int(dep_id) if dep_id.isdigit() else 0].result
                        for dep_id in step.depends_on
                    }
                    
                    result = await executor(step, context)
                    step.result = result
                    step.status = StepStatus.COMPLETED
                    completed.add(step.id)
                    workflow.results[step.id] = result
                    
                except Exception as e:
                    step.status = StepStatus.FAILED
                    step.error = str(e)
                    failed = True
                    break
        
        return {
            "workflow_id": workflow_id,
            "status": workflow.status,
            "results": workflow.results,
            "steps": [
                {
                    "id": s.id,
                    "name": s.name,
                    "status": s.status.value,
                    "error": s.error
                }
                for s in workflow.steps
            ]
        }
    
    def list_workflows(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": w.id,
                "name": w.name,
                "description": w.description,
                "status": w.status,
                "step_count": len(w.steps),
                "created_at": w.created_at.isoformat()
            }
            for w in self.workflows.values()
        ]
    
    def delete_workflow(self, workflow_id: str) -> bool:
        if workflow_id in self.workflows:
            del self.workflows[workflow_id]
            return True
        return False


# Global orchestrator
workflow_orchestrator = WorkflowOrchestrator()

def create_rnaseq_workflow(sample_config: Dict[str, Any]) -> OrchestratedWorkflow:
    """Helper to create a standard RNA-seq analysis workflow"""
    steps = [
        {
            "id": "qc",
            "name": "Quality Control",
            "type": StepType.WORKFLOW,
            "config": {"workflow": "rnaseq_qc", "params": {}},
            "depends_on": []
        },
        {
            "id": "alignment",
            "name": "Sequence Alignment",
            "type": StepType.WORKFLOW,
            "config": {"workflow": "star_alignment", "params": {}},
            "depends_on": ["qc"]
        },
        {
            "id": "quantification",
            "name": "Gene Quantification",
            "type": StepType.WORKFLOW,
            "config": {"workflow": "featurecounts", "params": {}},
            "depends_on": ["alignment"]
        },
        {
            "id": "de_analysis",
            "name": "Differential Expression",
            "type": StepType.WORKFLOW,
            "config": {"workflow": "deseq2", "params": {}},
            "depends_on": ["quantification"]
        },
        {
            "id": "visualization",
            "name": "Generate Reports",
            "type": StepType.VISUALIZE,
            "config": {"plots": ["heatmap", "volcano", "pca"]},
            "depends_on": ["de_analysis"]
        }
    ]
    
    return workflow_orchestrator.create_workflow(
        name="RNA-Seq Analysis Pipeline",
        description="Complete RNA-seq analysis from QC to differential expression",
        steps_config=steps
    )
