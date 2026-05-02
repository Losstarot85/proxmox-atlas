from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import (
    create_user,
    delete_user,
    list_users,
    require_role,
    reset_user_password,
)

router = APIRouter(prefix="/users", tags=["users"])

admin_only = require_role("admin")


class UserCreate(BaseModel):
    username: str
    password: str
    role: str  # admin, editor, viewer, demo


class PasswordReset(BaseModel):
    new_password: str


@router.get("")
async def get_users(user: dict = Depends(admin_only)):
    """List all users (admin only)."""
    return {"users": list_users()}


@router.post("")
async def add_user(data: UserCreate, user: dict = Depends(admin_only)):
    """Create a new user (admin only)."""
    if len(data.username) < 2:
        raise HTTPException(status_code=400, detail="Username must be at least 2 characters")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if data.role not in ("admin", "editor", "viewer", "demo"):
        raise HTTPException(status_code=400, detail="Invalid role. Must be: admin, editor, viewer, or demo")

    success = create_user(data.username, data.password, data.role)
    if not success:
        raise HTTPException(status_code=409, detail=f"User '{data.username}' already exists")

    return {"status": "created", "username": data.username, "role": data.role}


@router.delete("/{username}")
async def remove_user(username: str, user: dict = Depends(admin_only)):
    """Delete a user (admin only). Cannot delete admin."""
    if username == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete the admin account")

    success = delete_user(username)
    if not success:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")

    return {"status": "deleted", "username": username}


@router.post("/{username}/reset-password")
async def reset_password(username: str, data: PasswordReset, user: dict = Depends(admin_only)):
    """Reset a user's password (admin only). Forces password change on next login."""
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    success = reset_user_password(username, data.new_password)
    if not success:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")

    return {"status": "password_reset", "username": username}
