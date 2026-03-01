import os
import json
import re
from typing import Optional, Dict, Any
from uuid import UUID
from sqlmodel import Session
from openai import OpenAI

from app.models.user import Analysis
from app.models.bio import WorkflowTemplate


class TemplateSaver:
    def __init__(self):
        self.base_url = os.getenv("LLM_BASE_URL", "http://host.docker.internal:11434/v1")
        self.api_key = os.getenv("LLM_API_KEY", "ollama")
        self.model = os.getenv("LLM_MODEL", "qwen2.5-coder:32b")
        self.client = OpenAI(base_url=self.base_url, api_key=self.api_key)
        print(f"💾 [TemplateSaver] Initialized", flush=True)
    
    def save_from_analysis(
        self,
        analysis: Analysis,
        name: str,
        description: Optional[str],
        category: Optional[str],
        owner_id: int,
        make_public: bool,
        session: Session
    ) -> WorkflowTemplate:
        code = self._extract_code_from_analysis(analysis)
        if not code:
            raise ValueError("No executable code found in analysis")
        
        params_schema = self._generate_params_schema(code, name, description)
        
        description = description or self._generate_description(code, name)
        
        import uuid
        script_path = f"custom/{name.lower().replace(' ', '_')}_{str(uuid.uuid4())[:8]}"
        
        template = WorkflowTemplate(
            name=name,
            description=description,
            workflow_type="TOOL",
            script_path=script_path,
            params_schema=json.dumps(params_schema),
            source_code=code,
            category=category or "Custom Analysis",
            subcategory="User Created",
            is_public=False,
            created_by=owner_id
        )
        
        session.add(template)
        session.commit()
        session.refresh(template)
        
        if make_public:
            self._submit_for_review(template, session)
        
        print(f"✅ [TemplateSaver] Saved template: {name} (ID: {template.id})", flush=True)
        return template
    
    def _extract_code_from_analysis(self, analysis: Analysis) -> Optional[str]:
        if analysis.workflow == "custom_sandbox_analysis":
            work_dir = analysis.work_dir
            if work_dir:
                code_path = os.path.join(work_dir, "analysis_code.py")
                if os.path.exists(code_path):
                    with open(code_path, "r", encoding="utf-8") as f:
                        return f.read()
        
        return None
    
    def _generate_params_schema(self, code: str, name: str, description: Optional[str]) -> Dict[str, Any]:
        prompt = f"""Analyze this Python code and generate a JSON Schema for its parameters.

Code Name: {name}
Description: {description or 'N/A'}

Code:
```python
{code}
```

Task: Identify all configurable parameters in this code (file paths, thresholds, options, etc.)
Generate a JSON Schema with:
1. "properties": each parameter with type, description, and default value
2. "required": list of required parameters

Output ONLY a valid JSON object, no markdown.
"""
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a code analysis expert. Output only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=2000
            )
            
            content = response.choices[0].message.content
            json_match = re.search(r'\{[\s\S]*\}', content)
            if json_match:
                return json.loads(json_match.group())
        except Exception as e:
            print(f"⚠️ [TemplateSaver] Schema generation error: {e}", flush=True)
        
        return {
            "type": "object",
            "properties": {
                "input_file": {
                    "type": "string",
                    "description": "Input file path",
                    "default": "/data/input.csv"
                }
            },
            "required": ["input_file"]
        }
    
    def _generate_description(self, code: str, name: str) -> str:
        prompt = f"""Generate a concise description (1-2 sentences) for this analysis tool.

Tool Name: {name}

Code Preview:
```python
{code[:1500]}
```

Output ONLY the description, no extra text.
"""
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a technical writer. Be concise."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=200
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"⚠️ [TemplateSaver] Description generation error: {e}", flush=True)
            return f"Custom analysis tool: {name}"
    
    def _submit_for_review(self, template: WorkflowTemplate, session: Session):
        template.review_status = "pending"
        session.add(template)
        session.commit()
        print(f"📋 [TemplateSaver] Submitted template for review: {template.name}", flush=True)


template_saver = TemplateSaver()
