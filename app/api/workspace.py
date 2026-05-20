from fastapi import APIRouter, HTTPException, File, UploadFile
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from app.service.workspace_service import WorkspaceService
from app.core.schemas import FileInfo

router = APIRouter()


class FileCreateRequest(BaseModel):
    path: str = ""
    content: str = ""


class FileUpdateRequest(BaseModel):
    content: str = ""


@router.get("/files", response_model=List[FileInfo])
async def get_workspace_files():
    try:
        service = WorkspaceService()
        return service.list_files()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/{file_path:path}")
async def get_file_content(file_path: str):
    try:
        service = WorkspaceService()
        content = service.read_file(file_path)
        if content is None:
            raise HTTPException(status_code=404, detail="File not found")
        return {"content": content}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/files")
async def create_file(data: FileCreateRequest):
    try:
        service = WorkspaceService()
        service.write_file(data.path, data.content)
        return {"message": "File created successfully", "path": data.path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/files/{file_path:path}")
async def update_file(file_path: str, data: FileUpdateRequest):
    try:
        service = WorkspaceService()
        service.write_file(file_path, data.content, append=False)
        return {"message": "File updated successfully", "path": file_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/files/{file_path:path}")
async def delete_file(file_path: str):
    try:
        service = WorkspaceService()
        deleted = service.delete_file(file_path)
        if not deleted:
            raise HTTPException(status_code=404, detail="File not found")
        return {"message": "File deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload")
async def upload_file(file: UploadFile = File(...), path: str = None):
    try:
        service = WorkspaceService()
        result = service.save_uploaded_file(file, path)
        return {"message": "File uploaded successfully", "path": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
