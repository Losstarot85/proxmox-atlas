from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import authenticate, change_password, create_token, get_current_user
from config import is_demo_mode

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/demo-status")
async def demo_status():
    """Public endpoint: tells the frontend whether demo mode is available."""
    return {"demo_available": is_demo_mode()}


@router.post("/demo")
async def demo_login():
    """Public endpoint: instant login as demo user with read-only access.
    Only available when DEMO_MODE is enabled."""
    if not is_demo_mode():
        return {"error": "Demo mode is not enabled on this instance"}

    token = create_token("demo")
    return {
        "token": token,
        "username": "demo",
        "role": "demo",
        "must_change_password": False,
    }


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.post("/login")
async def login(data: LoginRequest):
    """Authenticate user and return JWT token with role.

    Returns HTTP 200 for both success and failure to avoid Firefox blocking
    401 response bodies on self-signed certificates. The `error` field
    distinguishes success from failure.
    """
    result = authenticate(data.username, data.password)
    if result is None:
        return {"error": "Invalid credentials"}

    token = create_token(result["username"])
    return {
        "token": token,
        "username": result["username"],
        "role": result["role"],
        "must_change_password": result["must_change_password"],
    }


@router.post("/change-password")
async def change_pw(data: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    """Change the current user's password. Requires valid Bearer token."""
    username = user["username"]
    role = user["role"]

    # Demo users cannot change passwords
    if role == "demo":
        raise HTTPException(status_code=403, detail="Demo users cannot change passwords")

    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    success = change_password(username, data.old_password, data.new_password)
    if not success:
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    # Issue a fresh token after password change
    new_token = create_token(username)
    return {"message": "Password changed successfully", "token": new_token}
