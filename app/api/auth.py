import hashlib
import base64
import time
from fastapi import APIRouter, Depends, HTTPException, Response, Header
from pydantic import BaseModel
from typing import Optional
import aiosqlite

from app.db.database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


class UserConfigUpdate(BaseModel):
    api_key: Optional[str] = None
    api_base_url: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    theme: Optional[str] = None


class UserConfigResponse(BaseModel):
    api_key: Optional[str] = None
    api_base_url: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    theme: Optional[str] = None

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def create_token(user_id: int) -> str:
    payload = f"{user_id}:{int(time.time())}"
    return base64.b64encode(payload.encode()).decode()

def verify_token(token: str) -> Optional[int]:
    try:
        decoded = base64.b64decode(token.encode()).decode()
        user_id, timestamp = decoded.split(":")
        return int(user_id)
    except:
        return None

def extract_token_from_header(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    if authorization.startswith("Bearer "):
        return authorization[7:]
    return authorization

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str

@router.post("/register")
async def register(req: RegisterRequest, db: aiosqlite.Connection = Depends(get_db)):
    if len(req.username) < 2 or len(req.username) > 20:
        raise HTTPException(status_code=400, detail="Username must be 2-20 characters")
    if not req.username.replace('_', '').replace('-', '').isalnum():
        raise HTTPException(status_code=400, detail="Username can only contain letters, numbers, _ and -")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    password_hash = hash_password(req.password)

    try:
        cursor = await db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (req.username, password_hash)
        )
        await db.commit()
        user_id = cursor.lastrowid

        token = create_token(user_id)
        response = Response()
        response.set_cookie(
            key="auth_token",
            value=token,
            httponly=True,
            samesite="lax",
            max_age=7*24*60*60
        )
        return {"id": user_id, "username": req.username, "token": token}
    except aiosqlite.IntegrityError:
        raise HTTPException(status_code=400, detail="Username already exists")

@router.post("/login")
async def login(req: LoginRequest, db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (req.username,)
    )
    row = await cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Account not found. Please register first.")

    password_hash = hash_password(req.password)
    if row[2] != password_hash:
        raise HTTPException(status_code=401, detail="Invalid password")

    user_id = row[0]
    token = create_token(user_id)

    response = Response()
    response.set_cookie(
        key="auth_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=7*24*60*60
    )
    return {"id": user_id, "username": row[1], "token": token}

@router.post("/logout")
async def logout():
    response = Response()
    response.delete_cookie(key="auth_token")
    return {"message": "Logged out successfully"}

@router.get("/me")
async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: aiosqlite.Connection = Depends(get_db)
):
    token = extract_token_from_header(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    cursor = await db.execute(
        "SELECT id, username FROM users WHERE id = ?",
        (user_id,)
    )
    row = await cursor.fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="User not found")

    return {"id": row[0], "username": row[1]}


@router.get("/config", response_model=UserConfigResponse)
async def get_user_config(
    authorization: Optional[str] = Header(None),
    db: aiosqlite.Connection = Depends(get_db)
):
    """获取当前用户的API配置"""
    token = extract_token_from_header(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    cursor = await db.execute(
        """SELECT api_key, api_base_url, model, temperature, max_tokens, theme
           FROM users WHERE id = ?""",
        (user_id,)
    )
    row = await cursor.fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="User not found")

    return UserConfigResponse(
        api_key=row[0],
        api_base_url=row[1],
        model=row[2],
        temperature=row[3],
        max_tokens=row[4],
        theme=row[5]
    )


@router.put("/config")
async def update_user_config(
    config: UserConfigUpdate,
    authorization: Optional[str] = Header(None),
    db: aiosqlite.Connection = Depends(get_db)
):
    """更新当前用户的API配置"""
    token = extract_token_from_header(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    updates = []
    values = []

    if config.api_key is not None:
        updates.append("api_key = ?")
        values.append(config.api_key if config.api_key.strip() else None)
    if config.api_base_url is not None:
        updates.append("api_base_url = ?")
        values.append(config.api_base_url if config.api_base_url.strip() else None)
    if config.model is not None:
        updates.append("model = ?")
        values.append(config.model)
    if config.temperature is not None:
        updates.append("temperature = ?")
        values.append(config.temperature)
    if config.max_tokens is not None:
        updates.append("max_tokens = ?")
        values.append(config.max_tokens)
    if config.theme is not None:
        updates.append("theme = ?")
        values.append(config.theme)

    if not updates:
        raise HTTPException(status_code=400, detail="No config to update")

    values.append(user_id)
    query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
    await db.execute(query, values)
    await db.commit()

    return {"message": "Config updated successfully"}


async def get_current_user_id(auth_token: Optional[str] = None) -> int:
    if not auth_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = verify_token(auth_token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    return user_id


async def get_user_config_by_id(user_id: int, db: aiosqlite.Connection) -> dict:
    """根据用户ID获取用户配置"""
    cursor = await db.execute(
        """SELECT api_key, api_base_url, model, temperature, max_tokens, theme
           FROM users WHERE id = ?""",
        (user_id,)
    )
    row = await cursor.fetchone()

    if not row:
        return {}

    return {
        "api_key": row[0],
        "api_base_url": row[1],
        "model": row[2],
        "temperature": row[3],
        "max_tokens": row[4],
        "theme": row[5]
    }
