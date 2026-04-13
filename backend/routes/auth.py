from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from auth import authenticate, create_token, change_password, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.post("/login")
async def login(data: LoginRequest):
    """Authenticate user and return JWT token."""
    result = authenticate(data.username, data.password)
    if result is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(result["username"])
    return {
        "token": token,
        "must_change_password": result["must_change_password"]
    }


@router.post("/change-password")
async def change_pw(data: ChangePasswordRequest, user: str = Depends(get_current_user)):
    """Change the admin password. Requires valid Bearer token."""
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    success = change_password(data.old_password, data.new_password)
    if not success:
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    # Issue a fresh token after password change
    new_token = create_token(user)
    return {"message": "Password changed successfully", "token": new_token}
