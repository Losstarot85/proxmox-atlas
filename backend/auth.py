"""
Authentication module for Proxmox Atlas.
Handles JWT token creation/validation and bcrypt password hashing.
Persists credentials in auth.json alongside settings.json and clusters.json.
"""

import json
import os
import time
import uuid

import bcrypt
import jwt

from logger import get_logger

log = get_logger("auth")

DATA_DIR = os.environ.get("DATA_DIR", os.path.dirname(__file__))
AUTH_FILE = os.path.join(DATA_DIR, "auth.json")
TOKEN_EXPIRY_HOURS = 24

# In-memory auth state (loaded from auth.json)
_auth_data = {}


def init_auth():
    """Initialize auth system. Creates default admin user on first deploy."""
    global _auth_data

    if os.path.exists(AUTH_FILE):
        try:
            with open(AUTH_FILE) as f:
                _auth_data = json.load(f)
            log.info("auth_loaded", file=AUTH_FILE)
            return
        except (json.JSONDecodeError, Exception) as e:
            log.warning("auth_file_corrupted", error=str(e))

    # First deploy: create admin with default password
    _auth_data = {
        "username": "admin",
        "password_hash": hash_password("admin"),
        "must_change_password": True,
        "jwt_secret": str(uuid.uuid4())
    }
    _save_auth()
    log.info("auth_default_user_created", username="admin")


def _save_auth():
    """Persist auth data to disk."""
    try:
        with open(AUTH_FILE, "w") as f:
            json.dump(_auth_data, f, indent=2)
    except Exception as e:
        log.error("auth_save_failed", error=str(e))


def hash_password(plain: str) -> str:
    """Generate bcrypt hash from plaintext password."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify plaintext password against bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(username: str) -> str:
    """Create a signed JWT token with expiration."""
    payload = {
        "sub": username,
        "iat": int(time.time()),
        "exp": int(time.time()) + (TOKEN_EXPIRY_HOURS * 3600)
    }
    return jwt.encode(payload, _auth_data["jwt_secret"], algorithm="HS256")


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token. Raises on invalid/expired."""
    return jwt.decode(token, _auth_data["jwt_secret"], algorithms=["HS256"])


def authenticate(username: str, password: str) -> dict | None:
    """Verify credentials. Returns auth info dict or None."""
    if username != _auth_data.get("username"):
        return None
    if not verify_password(password, _auth_data["password_hash"]):
        return None
    return {
        "username": _auth_data["username"],
        "must_change_password": _auth_data.get("must_change_password", False)
    }


def change_password(old_password: str, new_password: str) -> bool:
    """Change admin password. Returns True on success."""
    if not verify_password(old_password, _auth_data["password_hash"]):
        return False
    _auth_data["password_hash"] = hash_password(new_password)
    _auth_data["must_change_password"] = False
    _save_auth()
    log.info("password_changed", username="admin")
    return True


def get_auth_data() -> dict:
    """Read-only access to auth state."""
    return _auth_data


# --- FastAPI Dependency ---

from fastapi import HTTPException, Request


async def get_current_user(request: Request) -> str:
    """FastAPI dependency: extract and validate JWT from Authorization header."""
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = auth_header[7:]  # Strip "Bearer "

    try:
        payload = decode_token(token)
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired") from None
    except (jwt.InvalidTokenError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid token") from None
