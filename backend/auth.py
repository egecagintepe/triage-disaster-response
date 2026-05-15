"""JWT token utilities for device authentication."""

from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES

security = HTTPBearer(auto_error=False)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token.

    Args:
        data: Payload to encode (should include 'sub' for device_id).
        expires_delta: Custom expiration time. Defaults to ACCESS_TOKEN_EXPIRE_MINUTES.

    Returns:
        Encoded JWT string.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token.

    Raises:
        HTTPException 401 if token is invalid or expired.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token geçersiz veya süresi dolmuş",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_device(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """FastAPI dependency: extract and validate the current device from JWT.

    Returns a dict with at least: {"device_id": str, "role": str}

    NOTE: This is a soft dependency — if no token is provided, returns None.
    Use `require_auth` for endpoints that MUST have authentication.
    """
    if credentials is None:
        return None
    payload = decode_token(credentials.credentials)
    device_id = payload.get("sub")
    if device_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token geçersiz: device_id bulunamadı",
        )
    return {
        "device_id": device_id,
        "role": payload.get("role", "field_worker"),
        "device_name": payload.get("device_name", ""),
    }


async def require_auth(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """FastAPI dependency: REQUIRE valid authentication.

    Unlike get_current_device, this raises 401 if no token is provided.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await get_current_device(credentials)
