import os
import json
from typing import Optional, List
from pydantic import BaseModel, Field
from openai import OpenAI
import instructor

class ParsedIntent(BaseModel):
    """解析后的用户意图"""
    intent_type: str = Field(
        default="analysis",
        description="意图类型: 'analysis' (分析任务) 或 'query' (信息查询)"
    )
    analysis_type: str = Field(
        default="",
        description="分析类型，当 intent_type='analysis' 时有效"
    )
    query_target: Optional[str] = Field(
        None,
        description="查询目标: 'files' (文件列表), 'samples' (样本信息), 'analyses' (分析任务), 'workflow' (流程信息)"
    )
    keywords: List[str] = Field(
        default_factory=list,
        description="从需求中提取的关键词列表"
    )
    organism: Optional[str] = Field(
        None,
        description="物种信息"
    )
    expected_outputs: List[str] = Field(
        default_factory=list,
        description="期望的输出类型"
    )
    data_type: Optional[str] = Field(
        None,
        description="数据类型"
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="解析置信度，0-1之间"
    )
    raw_description: str = Field(
        ...,
        description="用户原始输入的描述"
    )
    additional_requirements: Optional[str] = Field(
        None,
        description="用户提到的额外要求或约束条件"
    )

class IntentParser:
    """
    使用 LLM 结构化解析用户需求
    将自然语言转换为结构化的意图
    """
    
    ANALYSIS_TYPES = [
        "RNA-Seq QC",
        "RNA-Seq Differential Expression",
        "scRNA-Seq Analysis",
        "ChIP-Seq Peak Calling",
        "ATAC-Seq Analysis",
        "Variant Calling",
        "Genome Assembly",
        "Proteomics Analysis",
        "Methylation Analysis",
        "Copy Number Variation",
        "Gene Set Enrichment",
        "Pathway Analysis",
        "Custom Analysis"
    ]
    
    QUERY_TARGETS = ["files", "samples", "analyses", "workflow", "project_info"]
    
    OUTPUT_TYPES = [
        "volcano_plot", "heatmap", "gene_list", "qc_report",
        "alignment", "peak_file", "variant_file", "expression_matrix",
        "pca_plot", "umap_plot", "cluster_plot", "pathway_diagram",
        "go_enrichment", "kegg_pathway", "survival_curve", "correlation_plot"
    ]
    
    QUERY_KEYWORDS = {
        "files": ["文件", "file", "有哪些文件", "文件列表", "上传了什么", "数据文件", "fastq", "bam"],
        "samples": ["样本", "sample", "有哪些样本", "样本表", "sample sheet"],
        "analyses": ["分析", "analysis", "任务", "task", "运行了什么", "分析记录", "分析历史"],
        "workflow": ["流程", "workflow", "pipeline", "有哪些流程", "可用流程", "模板"],
    }
    
    def __init__(self):
        # Use unified llm_client singleton
        from app.core.llm import llm_client
        
        self.client = llm_client.instructor_client
        self.raw_client = llm_client.raw_client
        self.model = llm_client.config.model
        self.base_url = llm_client.config.base_url
        self.api_key = llm_client.config.api_key

    
    def _detect_query_intent(self, user_input: str) -> Optional[str]:
        """快速检测是否为查询意图"""
        user_input_lower = user_input.lower()
        
        for target, keywords in self.QUERY_KEYWORDS.items():
            for kw in keywords:
                if kw.lower() in user_input_lower:
                    if any(q_word in user_input_lower for q_word in ["有", "什么", "哪些", "列出", "显示", "查看", "what", "list", "show", "tell"]):
                        return target
        
        return None
    
    def parse(self, user_input: str) -> ParsedIntent:
        """
        解析用户输入的需求
        """
        query_target = self._detect_query_intent(user_input)
        
        if query_target:
            print(f"🔍 [IntentParser] Detected query intent: {query_target}", flush=True)
            return ParsedIntent(
                intent_type="query",
                query_target=query_target,
                keywords=[query_target],
                confidence=0.9,
                raw_description=user_input
            )
        
        system_prompt = f"""你是一个生物信息学分析需求解析专家。
你的任务是将用户的自然语言描述转换为结构化的分析意图。

首先判断用户的意图类型:
- 'analysis': 用户想要执行分析任务（如质控、差异表达、聚类等）
- 'query': 用户想要查询信息（如文件列表、样本信息、分析记录等）

如果意图是 'query'，需要指定 query_target:
- 'files': 查询文件列表
- 'samples': 查询样本信息
- 'analyses': 查询分析任务
- 'workflow': 查询可用流程

如果意图是 'analysis'，分析类型必须是以下之一:
{json.dumps(self.ANALYSIS_TYPES, ensure_ascii=False, indent=2)}

解析规则:
1. intent_type: 首先判断是分析任务还是信息查询
2. query_target: 如果是查询，指定查询目标
3. analysis_type: 如果是分析，根据描述匹配类型
4. keywords: 提取关键术语
5. confidence: 根据描述清晰程度给出置信度

注意:
- 如果用户只是询问项目信息（如"有哪些文件"），intent_type 应为 'query'
- 只有明确要执行分析时，intent_type 才是 'analysis'
"""

        user_prompt = f"""请解析以下用户的生物信息学需求:

用户输入:
"{user_input}"

请返回结构化的意图。"""

        try:
            print(f"🔍 [IntentParser] Parsing: {user_input[:100]}...", flush=True)
            
            intent = self.client.chat.completions.create(
                model=self.model,
                response_model=ParsedIntent,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                max_retries=2
            )
            
            intent.raw_description = user_input
            
            print(f"✅ [IntentParser] Parsed successfully:", flush=True)
            print(f"   Intent Type: {intent.intent_type}", flush=True)
            if intent.intent_type == "query":
                print(f"   Query Target: {intent.query_target}", flush=True)
            else:
                print(f"   Analysis Type: {intent.analysis_type}", flush=True)
            print(f"   Confidence: {intent.confidence}", flush=True)
            
            return intent
            
        except Exception as e:
            print(f"❌ [IntentParser] Error: {e}", flush=True)
            
            if query_target:
                return ParsedIntent(
                    intent_type="query",
                    query_target=query_target,
                    keywords=[query_target],
                    confidence=0.8,
                    raw_description=user_input
                )
            
            return ParsedIntent(
                intent_type="analysis",
                analysis_type="Custom Analysis",
                keywords=["custom"],
                confidence=0.0,
                raw_description=user_input,
                expected_outputs=[]
            )
    
    def get_embedding(self, text: str) -> List[float]:
        """获取文本的向量嵌入 (使用统一客户端)"""
        try:
            from app.core.llm import get_llm_client
            return get_llm_client().get_embedding(text)
        except Exception as e:
            print(f"⚠️ [IntentParser] Embedding error: {e}", flush=True)
            return []
        """获取文本的向量嵌入"""
        embed_base_url = os.getenv("EMBED_BASE_URL", self.base_url)
        embed_api_key = os.getenv("EMBED_API_KEY", self.api_key)
        embed_model = os.getenv("EMBEDDING_MODEL", "nomic-embed-text:latest")
        
        try:
            embed_client = OpenAI(base_url=embed_base_url, api_key=embed_api_key)
            response = embed_client.embeddings.create(
                input=text.replace("\n", " "),
                model=embed_model
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"⚠️ [IntentParser] Embedding error: {e}", flush=True)
            return []

intent_parser = IntentParser()
