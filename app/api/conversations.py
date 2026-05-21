from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import aiosqlite

from app.db.database import get_db
from app.api.auth import verify_token, extract_token_from_header

router = APIRouter(prefix="/api/conversations", tags=["conversations"])

class ConversationCreate(BaseModel):
    title: str

class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    pinned: Optional[bool] = None

class MessageCreate(BaseModel):
    role: str
    content: str

class ConversationResponse(BaseModel):
    id: int
    title: str
    pinned: bool
    created_at: str
    updated_at: str
    messages: List[dict] = []

@router.get("")
async def list_conversations(
    authorization: Optional[str] = Header(None),
    db: aiosqlite.Connection = Depends(get_db)
):
    token = extract_token_from_header(authorization)
    user_id = verify_token(token) if token else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    cursor = await db.execute(
        """SELECT id, title, pinned, created_at, updated_at
           FROM conversations
           WHERE user_id = ?
           ORDER BY pinned DESC, updated_at DESC""",
        (user_id,)
    )
    rows = await cursor.fetchall()

    return [
        {
            "id": row[0],
            "title": row[1],
            "pinned": bool(row[2]),
            "created_at": row[3],
            "updated_at": row[4]
        }
        for row in rows
    ]

@router.post("")
async def create_conversation(
    conv: ConversationCreate,
    authorization: Optional[str] = Header(None),
    db: aiosqlite.Connection = Depends(get_db)
):
    token = extract_token_from_header(authorization)
    user_id = verify_token(token) if token else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    cursor = await db.execute(
        "INSERT INTO conversations (user_id, title) VALUES (?, ?)",
        (user_id, conv.title)
    )
    await db.commit()
    conv_id = cursor.lastrowid

    return {
        "id": conv_id,
        "title": conv.title,
        "pinned": False,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "messages": []
    }

@router.get("/{conv_id}")
async def get_conversation(
    conv_id: int,
    authorization: Optional[str] = Header(None),
    db: aiosqlite.Connection = Depends(get_db)
):
    token = extract_token_from_header(authorization)
    user_id = verify_token(token) if token else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    cursor = await db.execute(
        """SELECT id, title, pinned, created_at, updated_at
           FROM conversations
           WHERE id = ? AND user_id = ?""",
        (conv_id, user_id)
    )
    row = await cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg_cursor = await db.execute(
        """SELECT id, role, content, created_at
           FROM messages
           WHERE conversation_id = ?
           ORDER BY created_at ASC""",
        (conv_id,)
    )
    msg_rows = await msg_cursor.fetchall()

    return {
        "id": row[0],
        "title": row[1],
        "pinned": bool(row[2]),
        "created_at": row[3],
        "updated_at": row[4],
        "messages": [
            {
                "id": mr[0],
                "role": mr[1],
                "content": mr[2],
                "created_at": mr[3]
            }
            for mr in msg_rows
        ]
    }

@router.put("/{conv_id}")
async def update_conversation(
    conv_id: int,
    update: ConversationUpdate,
    authorization: Optional[str] = Header(None),
    db: aiosqlite.Connection = Depends(get_db)
):
    token = extract_token_from_header(authorization)
    user_id = verify_token(token) if token else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    cursor = await db.execute(
        "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
        (conv_id, user_id)
    )
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Conversation not found")

    if update.title is not None:
        await db.execute(
            "UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (update.title, conv_id)
        )

    if update.pinned is not None:
        await db.execute(
            "UPDATE conversations SET pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (1 if update.pinned else 0, conv_id)
        )

    await db.commit()
    return {"message": "Updated successfully"}

@router.delete("/{conv_id}")
async def delete_conversation(
    conv_id: int,
    authorization: Optional[str] = Header(None),
    db: aiosqlite.Connection = Depends(get_db)
):
    token = extract_token_from_header(authorization)
    user_id = verify_token(token) if token else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    cursor = await db.execute(
        "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
        (conv_id, user_id)
    )
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Conversation not found")

    await db.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
    await db.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
    await db.commit()

    return {"message": "Deleted successfully"}

@router.post("/{conv_id}/messages")
async def add_message(
    conv_id: int,
    msg: MessageCreate,
    authorization: Optional[str] = Header(None),
    db: aiosqlite.Connection = Depends(get_db)
):
    token = extract_token_from_header(authorization)
    user_id = verify_token(token) if token else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    cursor = await db.execute(
        "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
        (conv_id, user_id)
    )
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Conversation not found")

    cursor = await db.execute(
        "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)",
        (conv_id, msg.role, msg.content)
    )
    await db.execute(
        "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (conv_id,)
    )
    await db.commit()

    return {
        "id": cursor.lastrowid,
        "role": msg.role,
        "content": msg.content,
        "created_at": datetime.now().isoformat()
    }

@router.delete("/{conv_id}/messages/{msg_id}")
async def delete_message(
    conv_id: int,
    msg_id: int,
    authorization: Optional[str] = Header(None),
    db: aiosqlite.Connection = Depends(get_db)
):
    token = extract_token_from_header(authorization)
    user_id = verify_token(token) if token else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    cursor = await db.execute(
        "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
        (conv_id, user_id)
    )
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Conversation not found")

    await db.execute(
        "DELETE FROM messages WHERE id = ? AND conversation_id = ?",
        (msg_id, conv_id)
    )
    await db.execute(
        "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (conv_id,)
    )
    await db.commit()

    return {"message": "Deleted successfully"}
