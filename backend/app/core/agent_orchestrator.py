from typing import Dict, Any, List, Optional, Callable
from enum import Enum
from dataclasses import dataclass, field
import asyncio
import json

class AgentStatus(str, Enum):
    IDLE = "idle"
    THINKING = "thinking"
    WORKING = "working"
    WAITING = "waiting"
    COMPLETED = "completed"
    FAILED = "failed"

class AgentCapability(str, Enum):
    RNA_SEQ = "rna_seq"
    VARIANT_CALLING = "variant_calling"
    CHIP_SEQ = "chip_seq"
    ATAC_SEQ = "atac_seq"
    SINGLE_CELL = "single_cell"
    DATA_VISUALIZATION = "data_visualization"
    DATA_PREPROCESSING = "data_preprocessing"
    QUALITY_CONTROL = "quality_control"
    GENERAL = "general"

@dataclass
class AgentMessage:
    role: str
    content: str
    agent: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class AgentTask:
    id: str
    description: str
    required_capabilities: List[AgentCapability]
    context: Dict[str, Any]
    status: AgentStatus = AgentStatus.IDLE
    result: Optional[Any] = None
    error: Optional[str] = None

class BaseAgent:
    def __init__(
        self,
        agent_id: str,
        name: str,
        description: str,
        capabilities: List[AgentCapability],
        llm_client: Optional[Any] = None
    ):
        self.agent_id = agent_id
        self.name = name
        self.description = description
        self.capabilities = capabilities
        self.llm_client = llm_client
        self.status = AgentStatus.IDLE
        self.current_task: Optional[AgentTask] = None
    
    def can_handle(self, task: AgentTask) -> bool:
        return any(cap in task.required_capabilities for cap in self.capabilities)
    
    async def execute(self, task: AgentTask) -> Any:
        raise NotImplementedError
    
    def get_info(self) -> Dict[str, Any]:
        return {
            "id": self.agent_id,
            "name": self.name,
            "description": self.description,
            "capabilities": [c.value for c in self.capabilities],
            "status": self.status.value
        }

class RNASeqAgent(BaseAgent):
    def __init__(self, llm_client: Optional[Any] = None):
        super().__init__(
            agent_id="agent.rnaseq",
            name="RNA-Seq Analyst",
            description="Specialized in RNA sequencing data analysis including alignment, quantification, and differential expression",
            capabilities=[AgentCapability.RNA_SEQ, AgentCapability.DATA_PREPROCESSING],
            llm_client=llm_client
        )
    
    async def execute(self, task: AgentTask) -> Any:
        self.status = AgentStatus.THINKING
        # RNA-seq specific logic
        context = task.context
        workflow = context.get("workflow", "rnaseq")
        params = context.get("params", {})
        
        # Execute RNA-seq analysis
        result = {
            "agent": self.name,
            "analysis_type": "rna_seq",
            "workflow": workflow,
            "status": "ready_to_execute",
            "params": params
        }
        
        self.status = AgentStatus.COMPLETED
        return result

class VariantCallingAgent(BaseAgent):
    def __init__(self, llm_client: Optional[Any] = None):
        super().__init__(
            agent_id="agent.variant",
            name="Variant Analyst",
            description="Specialized in variant calling and SNP/indel analysis",
            capabilities=[AgentCapability.VARIANT_CALLING],
            llm_client=llm_client
        )
    
    async def execute(self, task: AgentTask) -> Any:
        self.status = AgentStatus.THINKING
        context = task.context
        
        result = {
            "agent": self.name,
            "analysis_type": "variant_calling",
            "status": "ready_to_execute"
        }
        
        self.status = AgentStatus.COMPLETED
        return result

class VisualizationAgent(BaseAgent):
    def __init__(self, llm_client: Optional[Any] = None):
        super().__init__(
            agent_id="agent.viz",
            name="Visualization Expert",
            description="Creates interactive visualizations and plots for bioinformatics data",
            capabilities=[AgentCapability.DATA_VISUALIZATION],
            llm_client=llm_client
        )
    
    async def execute(self, task: AgentTask) -> Any:
        self.status = AgentStatus.THINKING
        context = task.context
        
        result = {
            "agent": self.name,
            "analysis_type": "visualization",
            "visualization_type": context.get("viz_type", "plot"),
            "status": "ready_to_create"
        }
        
        self.status = AgentStatus.COMPLETED
        return result

class GeneralCopilotAgent(BaseAgent):
    def __init__(self, llm_client: Optional[Any] = None):
        super().__init__(
            agent_id="agent.copilot",
            name="Bio-Copilot",
            description="General purpose bioinformatics assistant that can coordinate other agents",
            capabilities=[
                AgentCapability.GENERAL,
                AgentCapability.QUALITY_CONTROL,
                AgentCapability.DATA_PREPROCESSING
            ],
            llm_client=llm_client
        )
    
    async def execute(self, task: AgentTask) -> Any:
        self.status = AgentStatus.THINKING
        
        # General purpose analysis
        result = {
            "agent": self.name,
            "analysis_type": "general",
            "response": "I'm ready to help with your bioinformatics analysis"
        }
        
        self.status = AgentStatus.COMPLETED
        return result


class AgentOrchestrator:
    def __init__(self):
        self.agents: Dict[str, BaseAgent] = {}
        self.active_tasks: Dict[str, AgentTask] = {}
    
    def register_agent(self, agent: BaseAgent) -> None:
        self.agents[agent.agent_id] = agent
    
    def get_agent(self, agent_id: str) -> Optional[BaseAgent]:
        return self.agents.get(agent_id)
    
    def find_best_agent(self, task: AgentTask) -> Optional[BaseAgent]:
        # Find agent with most matching capabilities
        best_agent = None
        max_matches = 0
        
        for agent in self.agents.values():
            if agent.can_handle(task):
                matches = sum(1 for cap in task.required_capabilities if cap in agent.capabilities)
                if matches > max_matches:
                    max_matches = matches
                    best_agent = agent
        
        return best_agent
    
    async def execute_task(self, task: AgentTask) -> Any:
        agent = self.find_best_agent(task)
        
        if not agent:
            task.status = AgentStatus.FAILED
            task.error = "No suitable agent found"
            return None
        
        task.status = AgentStatus.WORKING
        self.active_tasks[task.id] = task
        
        try:
            result = await agent.execute(task)
            task.status = AgentStatus.COMPLETED
            task.result = result
            return result
        except Exception as e:
            task.status = AgentStatus.FAILED
            task.error = str(e)
            return None
        finally:
            if task.id in self.active_tasks:
                del self.active_tasks[task.id]
    
    async def execute_multi_agent_task(
        self, 
        task: AgentTask, 
        require_agents: List[str]
    ) -> List[Any]:
        """Execute task requiring multiple agents to collaborate"""
        results = []
        
        for agent_id in require_agents:
            agent = self.agents.get(agent_id)
            if agent and agent.can_handle(task):
                task.status = AgentStatus.WORKING
                try:
                    result = await agent.execute(task)
                    results.append(result)
                except Exception as e:
                    results.append({"error": str(e)})
        
        return results
    
    def get_status(self) -> Dict[str, Any]:
        return {
            "registered_agents": [
                agent.get_info() for agent in self.agents.values()
            ],
            "active_tasks": [
                {
                    "id": t.id,
                    "description": t.description,
                    "status": t.status.value
                }
                for t in self.active_tasks.values()
            ]
        }


# Global orchestrator instance
agent_orchestrator = AgentOrchestrator()

def initialize_agents(llm_client: Optional[Any] = None):
    """Initialize all built-in agents"""
    agent_orchestrator.register_agent(GeneralCopilotAgent(llm_client))
    agent_orchestrator.register_agent(RNASeqAgent(llm_client))
    agent_orchestrator.register_agent(VariantCallingAgent(llm_client))
    agent_orchestrator.register_agent(VisualizationAgent(llm_client))
