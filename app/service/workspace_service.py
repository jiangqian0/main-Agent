from typing import List, Dict, Optional
from pathlib import Path
from datetime import datetime
from app.core.config import settings


class WorkspaceService:
    def __init__(self):
        self.workspace_dir = Path(settings.workspace_dir)
        self.workspace_dir.mkdir(parents=True, exist_ok=True)

    def _safe_path(self, file_path: str) -> Path:
        """Resolve and validate path is within workspace"""
        # Handle file:// URLs (common in browsers)
        if file_path.startswith("file://"):
            file_path = file_path[7:]
        if file_path.startswith("workspace/") or file_path.startswith("workspace\\"):
            file_path = file_path[10:]
        if Path(file_path).is_absolute():
            path = Path(file_path)
        else:
            path = self.workspace_dir / file_path
        resolved = path.resolve()
        if not str(resolved).startswith(str(self.workspace_dir.resolve())):
            raise ValueError(f"Path outside workspace: {file_path}")
        return resolved

    def list_files(self) -> List[Dict]:
        """列出工作区所有文件"""
        files = []
        try:
            if self.workspace_dir.exists():
                for path in sorted(self.workspace_dir.rglob("*")):
                    if path.is_file():
                        rel = str(path.relative_to(self.workspace_dir))
                        files.append({
                            "name": path.name,
                            "path": rel,
                            "size": path.stat().st_size,
                            "modified": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
                        })
        except Exception as e:
            print(f"Error listing files: {e}")
        return files

    def read_file(self, file_path: str) -> Optional[str]:
        """读取文件内容"""
        try:
            path = self._safe_path(file_path)
            if not path.exists():
                return None
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception:
            return None

    def write_file(self, file_path: str, content: str, append: bool = False) -> None:
        """写入文件"""
        path = self._safe_path(file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        mode = "a" if append else "w"
        with open(path, mode, encoding="utf-8") as f:
            f.write(content)

    def delete_file(self, file_path: str) -> bool:
        """删除文件"""
        try:
            path = self._safe_path(file_path)
            if path.exists() and path.is_file():
                path.unlink()
                return True
            return False
        except Exception:
            return False

    def save_uploaded_file(self, file, dest_path: str = None) -> str:
        """保存上传的文件"""
        import tempfile
        import shutil
        import os

        filename = Path(file.filename).name
        content = file.file.read()

        # 如果指定了目标路径，使用它
        if dest_path:
            target_path = self._safe_path(dest_path)
            target_path.parent.mkdir(parents=True, exist_ok=True)
            with open(target_path, "wb") as f:
                f.write(content if isinstance(content, bytes) else content.encode("utf-8"))
            return str(target_path.relative_to(self.workspace_dir))

        # 默认保存到工作区根目录
        workspace_path = self.workspace_dir / filename
        workspace_path.parent.mkdir(parents=True, exist_ok=True)
        with open(workspace_path, "wb") as f:
            f.write(content if isinstance(content, bytes) else content.encode("utf-8"))

        return str(workspace_path.relative_to(self.workspace_dir))
