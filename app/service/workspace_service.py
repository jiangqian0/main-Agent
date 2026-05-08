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

    def save_uploaded_file(self, file) -> str:
        """保存上传的文件"""
        filename = Path(file.filename).name
        content = file.file.read()
        if isinstance(content, bytes):
            content = content.decode("utf-8", errors="replace")
        path = self.workspace_dir / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return str(path.relative_to(self.workspace_dir))
