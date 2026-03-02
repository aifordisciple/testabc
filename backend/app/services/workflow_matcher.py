import os
import json
import re
from typing import List, Dict, Any, Optional
from uuid import UUID
from pydantic import BaseModel, Field
from sqlmodel import Session, select, or_
from openai import OpenAI

from app.models.bio import WorkflowTemplate
from app.core.intent_parser import ParsedIntent

class WorkflowMatch(BaseModel):
    """匹配到的流程"""
    template_id: UUID = Field(..., description="流程模板ID")
    template_name: str = Field(..., description="流程名称")
    description: str = Field(default="", description="流程描述")
    workflow_type: str = Field(default="PIPELINE", description="流程类型")
    match_score: float = Field(..., ge=0.0, le=1.0, description="匹配度 0-1")
    match_reason: str = Field(default="", description="匹配原因说明")
    inferred_params: Dict[str, Any] = Field(default_factory=dict, description="推断的参数")
    params_schema: Dict[str, Any] = Field(default_factory=dict, description="参数定义")
    source_code: Optional[str] = Field(default=None, description="流程源代码")

class WorkflowMatcher:
    """
    流程匹配服务
    使用混合匹配策略找到最适合用户需求的流程模板
    """
    
    TYPE_MAPPINGS = {
        "RNA-Seq QC": ["rnaseq_qc", "fastqc", "quality control", "质控", "质量控制"],
        "RNA-Seq Differential Expression": ["differential", "差异表达", "degs", "deseq", "edger"],
        "scRNA-Seq Analysis": ["scrnaseq", "single cell", "单细胞", "seurat", "scanpy"],
        "ChIP-Seq Peak Calling": ["chipseq", "peak calling", "macs", "chip-seq"],
        "ATAC-Seq Analysis": ["atacseq", "atac-seq", "chromatin accessibility"],
        "Variant Calling": ["variant", "gatk", "snv", "cnv", "突变检测", "变异检测"],
        "Genome Assembly": ["assembly", "组装", "denovo"],
        "Proteomics Analysis": ["proteomics", "蛋白质组", "mass spec"],
        "Methylation Analysis": ["methylation", "甲基化", "bisulfite"],
        "Copy Number Variation": ["cnv", "copy number", "拷贝数"],
        "Gene Set Enrichment": ["enrichment", "go", "kegg", "富集分析"],
        "Pathway Analysis": ["pathway", "通路分析"],
    }
    
    
    def __init__(self):
        # Use unified llm_client singleton
        from app.core.llm import get_llm_client
        
        client = get_llm_client()
        self.base_url = client.config.base_url
        self.api_key = client.config.api_key
        self.model = client.config.model
        self.embed_model = client.config.embed_model
        
        # Use singleton's embed client
        self.embed_client = client.embed_client

    
    def get_embedding(self, text: str) -> List[float]:
        """获取文本的向量嵌入"""
        try:
            response = self.embed_client.embeddings.create(
                input=text.replace("\n", " "),
                model=self.embed_model
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"⚠️ [WorkflowMatcher] Embedding error: {e}", flush=True)
            return []
    
    def match(
        self,
        intent: ParsedIntent,
        session: Session,
        top_k: int = 3
    ) -> List[WorkflowMatch]:
        """
        匹配最适合的流程模板
        
        Args:
            intent: 解析后的用户意图
            session: 数据库会话
            top_k: 返回前K个匹配结果
            
        Returns:
            List[WorkflowMatch]: 匹配结果列表，按分数降序排列
        """
        print(f"🔍 [WorkflowMatcher] Matching for: {intent.analysis_type}", flush=True)
        
        templates = session.exec(
            select(WorkflowTemplate).where(WorkflowTemplate.is_public == True)
        ).all()
        
        if not templates:
            print("⚠️ [WorkflowMatcher] No templates found in database", flush=True)
            return []
        
        scored_matches = []
        
        # 预处理: 收集有embedding的模板
        templates_with_embedding = {t.id: t.embedding for t in templates if t.embedding}
        
        # 预计算查询向量 (避免循环中重复调用)
        query_vec = None
        if templates_with_embedding:
            query_text = f"{intent.analysis_type} {' '.join(intent.keywords)}"
            query_vec = self.get_embedding(query_text)
        
        for template in templates:
            base_score, reason = self._calculate_match_score(intent, template)
            
            # 向量相似度加分 (使用预计算的向量)
            vector_boost = 0.0
            if query_vec and template.id in templates_with_embedding:
                vec = templates_with_embedding[template.id]
                if vec:
                    sim = self._cosine_similarity_with_vec(query_vec, vec)
                    if sim > 0.5:
                        vector_boost = min(0.3, (sim - 0.5) * 0.6)
                        reason = f"{reason} | 向量:{sim:.2f}" if reason else f"向量相似度:{sim:.2f}"
            
            total_score = base_score + vector_boost
            
            if total_score > 0.3:
                scored_matches.append((template, total_score, reason))
        
        scored_matches.sort(key=lambda x: x[1], reverse=True)
        
        results = []
        for template, score, reason in scored_matches[:top_k]:
            inferred_params = self._infer_parameters(intent, template)
            
            params_schema = {}
            if template.params_schema:
                try:
                    params_schema = json.loads(template.params_schema)
                except:
                    pass
            
            results.append(WorkflowMatch(
                template_id=template.id,
                template_name=template.name,
                description=template.description or "",
                workflow_type=template.workflow_type,
                match_score=round(score, 3),
                match_reason=reason,
                inferred_params=inferred_params,
                params_schema=params_schema,
                source_code=template.source_code
            ))
        
        print(f"✅ [WorkflowMatcher] Found {len(results)} matches", flush=True)
        for r in results:
            print(f"   - {r.template_name}: {r.match_score:.2%}", flush=True)
        
        return results
    
    def _calculate_match_score(
        self,
        intent: ParsedIntent,
        template: WorkflowTemplate
    ) -> tuple[float, str]:
        """
        计算综合匹配分数
        
        Returns:
            tuple[float, str]: (匹配分数, 匹配原因)
        """
        scores = []
        reasons = []
        
        type_score, type_reason = self._type_matching_score(intent, template)
        scores.append(type_score * 0.4)
        if type_reason:
            reasons.append(type_reason)
        
        keyword_score, keyword_reason = self._keyword_matching_score(intent, template)
        scores.append(keyword_score * 0.3)
        if keyword_reason:
            reasons.append(keyword_reason)
        
        category_score, category_reason = self._category_matching_score(intent, template)
        scores.append(category_score * 0.2)
        if category_reason:
            reasons.append(category_reason)
        
        name_score, name_reason = self._name_matching_score(intent, template)
        scores.append(name_score * 0.1)
        if name_reason:
            reasons.append(name_reason)
        
        total_score = sum(scores)
        reason = "; ".join(reasons) if reasons else "基础匹配"
        
        return total_score, reason
    
    def _type_matching_score(
        self,
        intent: ParsedIntent,
        template: WorkflowTemplate
    ) -> tuple[float, str]:
        """分析类型匹配评分"""
        analysis_type = intent.analysis_type.lower()
        template_name = template.name.lower()
        template_desc = (template.description or "").lower()
        script_path = (template.script_path or "").lower()
        
        if analysis_type in self.TYPE_MAPPINGS:
            keywords = self.TYPE_MAPPINGS[analysis_type]
            for kw in keywords:
                if kw.lower() in template_name or kw.lower() in template_desc or kw.lower() in script_path:
                    return 1.0, f"分析类型匹配: {intent.analysis_type}"
        
        type_keywords = intent.analysis_type.lower().replace("-", " ").replace("_", " ").split()
        for kw in type_keywords:
            if len(kw) > 2 and kw in template_name:
                return 0.7, f"类型关键词匹配: {kw}"
        
        return 0.0, ""
    
    def _keyword_matching_score(
        self,
        intent: ParsedIntent,
        template: WorkflowTemplate
    ) -> tuple[float, str]:
        """关键词匹配评分"""
        if not intent.keywords:
            return 0.0, ""
        
        template_text = f"{template.name} {template.description or ''} {template.script_path or ''}".lower()
        
        matched_keywords = []
        for kw in intent.keywords:
            if kw.lower() in template_text:
                matched_keywords.append(kw)
        
        if matched_keywords:
            score = len(matched_keywords) / len(intent.keywords)
            return min(score, 1.0), f"关键词匹配: {', '.join(matched_keywords[:3])}"
        
        return 0.0, ""
    
    def _category_matching_score(
        self,
        intent: ParsedIntent,
        template: WorkflowTemplate
    ) -> tuple[float, str]:
        """分类匹配评分"""
        analysis_type = intent.analysis_type.lower()
        category = (template.category or "").lower()
        subcategory = (template.subcategory or "").lower()
        
        type_category_map = {
            "qc": ["quality control", "质控", "qc"],
            "differential": ["differential", "差异"],
            "analysis": ["analysis", "分析"],
        }
        
        for type_kw, category_kws in type_category_map.items():
            if type_kw in analysis_type:
                for cat_kw in category_kws:
                    if cat_kw in category or cat_kw in subcategory:
                        return 0.8, f"分类匹配: {template.category}"
        
        return 0.0, ""
    
    def _name_matching_score(
        self,
        intent: ParsedIntent,
        template: WorkflowTemplate
    ) -> tuple[float, str]:
        """名称直接匹配评分"""
        analysis_type = intent.analysis_type.lower()
        template_name = template.name.lower()
        
        type_words = set(re.findall(r'\w+', analysis_type))
        name_words = set(re.findall(r'\w+', template_name))
        
        common_words = type_words & name_words
        if common_words:
            score = len(common_words) / max(len(type_words), 1)
            return score, f"名称匹配"
        
        return 0.0, ""
    
    def _infer_parameters(
        self,
        intent: ParsedIntent,
        template: WorkflowTemplate
    ) -> Dict[str, Any]:
        """
        从用户意图推断流程参数
        """
        params = {}
        
        if not template.params_schema:
            return params
        
        try:
            schema = json.loads(template.params_schema)
            properties = schema.get("properties", {})
            
            for param_name, param_def in properties.items():
                param_type = param_def.get("type", "string")
                default_val = param_def.get("default")
                
                if param_type == "boolean":
                    for kw in ["skip", "不", "no", "disable"]:
                        if kw in param_name.lower() or kw in str(default_val).lower():
                            params[param_name] = False
                            break
                
                elif param_type == "string":
                    if default_val is not None:
                        params[param_name] = default_val
                
                elif param_type in ["integer", "number"]:
                    if default_val is not None:
                        params[param_name] = default_val
            
            for output in intent.expected_outputs:
                if "skip" in output.lower():
                    for param_name in properties:
                        if "skip" in param_name.lower():
                            params[param_name] = True
                            
        except Exception as e:
            print(f"⚠️ [WorkflowMatcher] Parameter inference error: {e}", flush=True)
        
        return params
    
    def infer_parameters_with_llm(
        self,
        intent: ParsedIntent,
        template: WorkflowTemplate,
        available_samples: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """
        使用 LLM 智能推断参数
        """
        if not template.params_schema:
            return {}
        
        try:
            schema = json.loads(template.params_schema)
        except:
            return {}
        
        import instructor
        client = instructor.from_openai(
            OpenAI(base_url=self.base_url, api_key=self.api_key),
            mode=instructor.Mode.JSON
        )
        
        class ParameterInference(BaseModel):
            parameters: Dict[str, Any] = Field(default_factory=dict, description="推断的参数值")
            reasoning: str = Field(default="", description="推断理由")
        
        context = f"""
用户需求: {intent.raw_description}
分析类型: {intent.analysis_type}
期望输出: {intent.expected_outputs}
物种: {intent.organism or '未指定'}

流程模板: {template.name}
流程描述: {template.description or '无'}

参数定义 (JSON Schema):
{json.dumps(schema, ensure_ascii=False, indent=2)}
"""
        
        if available_samples:
            context += f"\n可用样本数量: {len(available_samples)}\n"
        
        try:
            result = client.chat.completions.create(
                model=self.model,
                response_model=ParameterInference,
                messages=[
                    {"role": "system", "content": "你是一个生物信息学参数配置专家。根据用户需求推断最合适的参数值。"},
                    {"role": "user", "content": context}
                ],
                temperature=0.1,
                max_retries=2
            )
            
            print(f"🧠 [WorkflowMatcher] LLM inferred params: {result.parameters}", flush=True)
            return result.parameters
            
        except Exception as e:
            print(f"⚠️ [WorkflowMatcher] LLM inference error: {e}", flush=True)
            return self._infer_parameters(intent, template)
    
    def _cosine_similarity(self, text: str, embedding: List[float]) -> float:
        """计算文本与向量的余弦相似度"""
        if not embedding:
            return 0.0
        try:
            vec = self.get_embedding(text)
            if not vec:
                return 0.0
            dot = sum(a * b for a, b in zip(vec, embedding))
            norm1 = sum(a * a for a in vec) ** 0.5
            norm2 = sum(b * b for b in embedding) ** 0.5
            if norm1 == 0 or norm2 == 0:
                return 0.0
            return dot / (norm1 * norm2)
        except Exception as e:
            print(f"⚠️ Vector similarity error: {e}", flush=True)
            return 0.0
    
    def _cosine_similarity_with_vec(self, vec1: List[float], vec2: List[float]) -> float:
        """计算两个预计算向量之间的余弦相似度"""
        if not vec1 or not vec2:
            return 0.0
        try:
            dot = sum(a * b for a, b in zip(vec1, vec2))
            norm1 = sum(a * a for a in vec1) ** 0.5
            norm2 = sum(b * b for b in vec2) ** 0.5
            if norm1 == 0 or norm2 == 0:
                return 0.0
            return dot / (norm1 * norm2)
        except Exception as e:
            print(f"⚠️ Vector similarity error: {e}", flush=True)
            return 0.0
workflow_matcher = WorkflowMatcher()

workflow_matcher = WorkflowMatcher()
