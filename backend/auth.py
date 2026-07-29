"""
Authentication module for Proxmox Atlas.
Multi-user support with role-based access control (admin, editor, viewer, demo).
Handles JWT token creation/validation and bcrypt password hashing.
Persists credentials in auth.json alongside settings.json and clusters.json.
"""

import json
import os
import time
import uuid
from datetime import UTC, datetime

import bcrypt
import jwt

from logger import get_logger

log = get_logger("auth")

DATA_DIR = os.environ.get("DATA_DIR", os.path.dirname(__file__))
AUTH_FILE = os.path.join(DATA_DIR, "auth.json")
TOKEN_EXPIRY_HOURS = 24

VALID_ROLES = ("admin", "editor", "viewer", "demo")

# In-memory auth state (loaded from auth.json)
_auth_data = {}


# ──────────────────────────────────────────────────────────────────────
# Initialization & Persistence
# ──────────────────────────────────────────────────────────────────────


def init_auth():
    """Initialize auth system. Auto-migrates old single-user format.
    Creates default admin user on first deploy.
    Auto-creates demo user when DEMO_MODE is active."""
    global _auth_data

    if os.path.exists(AUTH_FILE):
        try:
            with open(AUTH_FILE) as f:
                raw = json.load(f)

            # Auto-migrate old single-user format → multi-user
            if "username" in raw and "users" not in raw:
                log.info("auth_migrating_to_multi_user")
                _auth_data = {
                    "jwt_secret": raw.get("jwt_secret", str(uuid.uuid4())),
                    "users": {
                        raw["username"]: {
                            "password_hash": raw["password_hash"],
                            "role": "admin",
                            "must_change_password": raw.get("must_change_password", False),
                            "created_at": datetime.now(UTC).isoformat(),
                        }
                    },
                }
                _save_auth()
                log.info("auth_migration_complete", users=list(_auth_data["users"].keys()))
                _ensure_demo_user()
                return

            _auth_data = raw
            log.info("auth_loaded", file=AUTH_FILE, users=list(_auth_data.get("users", {}).keys()))
            _ensure_demo_user()
            return
        except (json.JSONDecodeError, Exception) as e:
            log.warning("auth_file_corrupted", error=str(e))

    # First deploy: create admin with default password
    _auth_data = {
        "jwt_secret": str(uuid.uuid4()),
        "users": {
            "admin": {
                "password_hash": hash_password("admin"),
                "role": "admin",
                "must_change_password": True,
                "created_at": datetime.now(UTC).isoformat(),
            }
        },
    }
    _save_auth()
    log.info("auth_default_user_created", username="admin")
    _ensure_demo_user()


def _ensure_demo_user():
    """Auto-create demo user if DEMO_MODE is active and user doesn't exist."""
    from config import is_demo_mode

    if not is_demo_mode():
        return

    users = _auth_data.get("users", {})
    if "demo" not in users:
        users["demo"] = {
            "password_hash": hash_password("demo"),
            "role": "demo",
            "must_change_password": False,
            "created_at": datetime.now(UTC).isoformat(),
        }
        _save_auth()
        log.info("demo_user_auto_created")



def _save_auth():
    """Persist auth data to disk."""
    try:
        with open(AUTH_FILE, "w") as f:
            json.dump(_auth_data, f, indent=2)
    except Exception as e:
        log.error("auth_save_failed", error=str(e))


# ──────────────────────────────────────────────────────────────────────
# Password Hashing
# ──────────────────────────────────────────────────────────────────────


def hash_password(plain: str) -> str:
    """Generate bcrypt hash from plaintext password."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify plaintext password against bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ──────────────────────────────────────────────────────────────────────
# Token Management
# ──────────────────────────────────────────────────────────────────────


def create_token(username: str) -> str:
    """Create a signed JWT token with expiration. Embeds role in payload."""
    user = _auth_data["users"].get(username, {})
    payload = {
        "sub": username,
        "role": user.get("role", "viewer"),
        "iat": int(time.time()),
        "exp": int(time.time()) + (TOKEN_EXPIRY_HOURS * 3600),
    }
    return jwt.encode(payload, _auth_data["jwt_secret"], algorithm="HS256")


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token. Raises on invalid/expired."""
    return jwt.decode(token, _auth_data["jwt_secret"], algorithms=["HS256"])


# ──────────────────────────────────────────────────────────────────────
# Authentication & Password Change
# ──────────────────────────────────────────────────────────────────────


def authenticate(username: str, password: str) -> dict | None:
    """Verify credentials. Returns auth info dict or None."""
    users = _auth_data.get("users", {})
    user = users.get(username)
    if user is None:
        return None
    if not verify_password(password, user["password_hash"]):
        return None
    return {
        "username": username,
        "role": user["role"],
        "must_change_password": user.get("must_change_password", False),
    }


def change_password(username: str, old_password: str, new_password: str) -> bool:
    """Change a user's own password. Requires correct old_password. Returns True on success."""
    users = _auth_data.get("users", {})
    user = users.get(username)
    if user is None:
        return False
    if not verify_password(old_password, user["password_hash"]):
        return False
    user["password_hash"] = hash_password(new_password)
    user["must_change_password"] = False
    _save_auth()
    log.info("password_changed", username=username)
    return True


# ──────────────────────────────────────────────────────────────────────
# User Management (admin-only operations)
# ──────────────────────────────────────────────────────────────────────


def list_users() -> list[dict]:
    """Return list of users with safe fields (no password hashes)."""
    users = _auth_data.get("users", {})
    return [
        {
            "username": uname,
            "role": u["role"],
            "must_change_password": u.get("must_change_password", False),
            "created_at": u.get("created_at", ""),
        }
        for uname, u in users.items()
    ]


def create_user(username: str, password: str, role: str) -> bool:
    """Create a new user. Returns True on success, False if user already exists."""
    if role not in VALID_ROLES:
        return False
    users = _auth_data.get("users", {})
    if username in users:
        return False
    users[username] = {
        "password_hash": hash_password(password),
        "role": role,
        "must_change_password": role != "demo",
        "created_at": datetime.now(UTC).isoformat(),
    }
    _save_auth()
    log.info("user_created", username=username, role=role)
    return True


def delete_user(username: str) -> bool:
    """Delete a user. Cannot delete admin. Returns True on success."""
    if username == "admin":
        return False
    users = _auth_data.get("users", {})
    if username not in users:
        return False
    del users[username]
    _save_auth()
    log.info("user_deleted", username=username)
    return True


def reset_user_password(username: str, new_password: str) -> bool:
    """Admin-only: reset a user's password and force password change on next login."""
    users = _auth_data.get("users", {})
    user = users.get(username)
    if user is None:
        return False
    user["password_hash"] = hash_password(new_password)
    user["must_change_password"] = True
    _save_auth()
    log.info("password_reset_by_admin", username=username)
    return True


def get_auth_data() -> dict:
    """Read-only access to auth state."""
    return _auth_data


# ──────────────────────────────────────────────────────────────────────
# FastAPI Dependencies
# ──────────────────────────────────────────────────────────────────────

from fastapi import Depends, HTTPException, Request


async def get_current_user(request: Request) -> dict:
    """FastAPI dependency: extract and validate JWT from Authorization header.
    Returns dict with 'username' and 'role' keys."""
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = auth_header[7:]  # Strip "Bearer "

    try:
        payload = decode_token(token)
        return {"username": payload["sub"], "role": payload.get("role", "viewer")}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired") from None
    except (jwt.InvalidTokenError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid token") from None


def require_role(*allowed_roles):
    """FastAPI dependency factory: ensures the current user has one of the allowed roles."""

    async def _check(user: dict = Depends(get_current_user)):
        if user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return _check
