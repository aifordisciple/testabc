from typing import Dict, Any, List, Optional
import os
import uuid
from app.plugins.interfaces import (
    PluginInterface, 
    PluginType, 
    PluginPermission,
    PluginContext,
    ToolResult,
    FilePlugin as IFilePlugin
)
from app.models.user import File, Project, ProjectFileLink
from sqlmodel import Session, select

class FilePluginImpl(IFilePlugin):
    """File management plugin implementation"""
    
    def __init__(self, session: Session, base_path: str = "/data"):
        self.session = session
        self.base_path = base_path
    
    @property
    def id(self) -> str:
        return "impl.file"
    
    @property
    def name(self) -> str:
        return "File Management"
    
    @property
    def plugin_type(self) -> PluginType:
        return PluginType.FILE
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    @property
    def description(self) -> str:
        return "Full-featured file management with upload/download/preview"
    
    @property
    def permissions(self) -> List[PluginPermission]:
        return [PluginPermission.READ, PluginPermission.WRITE]
    
    async def initialize(self) -> None:
        os.makedirs(self.base_path, exist_ok=True)
    
    async def shutdown(self) -> None:
        pass
    
    async def list_files(self, context: PluginContext, project_id: str) -> List[Dict[str, Any]]:
        if not context.user_id:
            return []
        
        project = self.session.get(Project, project_id)
        if not project or project.owner_id != context.user_id:
            return []
        
        files = self.session.exec(
            select(File)
            .join(ProjectFileLink, File.id == ProjectFileLink.file_id)
            .where(ProjectFileLink.project_id == project_id)
            .order_by(File.created_at.desc())
        ).all()
        
        return [
            {
                "id": str(f.id),
                "filename": f.filename,
                "size": f.size,
                "content_type": f.content_type,
                "created_at": f.created_at.isoformat() if f.created_at else None
            }
            for f in files
        ]
    
    async def upload_file(self, context: PluginContext, project_id: str, file_data: bytes, filename: str) -> Dict[str, Any]:
        project = self.session.get(Project, project_id)
        if not project or project.owner_id != context.user_id:
            raise ValueError("Project not found or access denied")
        
        file_id = str(uuid.uuid4())
        file_path = os.path.join(self.base_path, project_id, filename)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        with open(file_path, "wb") as f:
            f.write(file_data)
        
        file_record = File(
            filename=filename,
            file_path=file_path,
            size=len(file_data),
            content_type=self._get_content_type(filename)
        )
        
        self.session.add(file_record)
        self.session.commit()
        self.session.refresh(file_record)
        
        link = ProjectFileLink(project_id=project_id, file_id=file_record.id)
        self.session.add(link)
        self.session.commit()
        
        return {
            "id": str(file_record.id),
            "filename": file_record.filename,
            "size": file_record.size,
            "content_type": file_record.content_type
        }
    
    async def delete_file(self, context: PluginContext, project_id: str, file_id: str) -> bool:
        project = self.session.get(Project, project_id)
        if not project or project.owner_id != context.user_id:
            return False
        
        file = self.session.get(File, file_id)
        if not file:
            return False
        
        if os.path.exists(file.file_path):
            os.remove(file.file_path)
        
        link = self.session.exec(
            select(ProjectFileLink).where(
                ProjectFileLink.project_id == project_id,
                ProjectFileLink.file_id == file_id
            )
        ).first()
        
        if link:
            self.session.delete(link)
        
        self.session.delete(file)
        self.session.commit()
        
        return True
    
    async def get_file_info(self, context: PluginContext, project_id: str, file_id: str) -> Optional[Dict[str, Any]]:
        project = self.session.get(Project, project_id)
        if not project or project.owner_id != context.user_id:
            return None
        
        file = self.session.get(File, file_id)
        if not file:
            return None
        
        return {
            "id": str(file.id),
            "filename": file.filename,
            "size": file.size,
            "content_type": file.content_type,
            "created_at": file.created_at.isoformat() if file.created_at else None
        }
    
    def _get_content_type(self, filename: str) -> str:
        ext = os.path.splitext(filename)[1].lower()
        content_types = {
            ".fastq": "application/fastq",
            ".fq": "application/fastq",
            ".fastq.gz": "application/gzip",
            ".fq.gz": "application/gzip",
            ".bam": "application/bam",
            ".sam": "application/sam",
            ".vcf": "application/vcf",
            ".bed": "application/bed",
            ".fasta": "application/fasta",
            ".fa": "application/fasta",
            ".csv": "text/csv",
            ".tsv": "text/tab-separated-values",
            ".txt": "text/plain",
            ".json": "application/json",
            ".html": "text/html",
        }
        return content_types.get(ext, "application/octet-stream")
