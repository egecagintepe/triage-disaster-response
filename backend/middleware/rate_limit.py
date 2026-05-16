"""Rate limiting middleware for FastAPI.

Simple in-memory rate limiter using sliding window counters.
No external dependencies (no Redis/slowapi).

Protects critical endpoints:
  - /api/v1/auth/*        → 10 req/min per IP
  - /api/v1/admin/*       → 5 req/min per IP  (AI analysis is expensive)
"""

import time
from collections import defaultdict
from typing import Dict, Tuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding window rate limiter keyed by client IP + path prefix."""

    # (max_requests, window_seconds) per path prefix
    RATE_LIMITS: Dict[str, Tuple[int, int]] = {
        "/api/v1/auth/": (10, 60),      # 10 req/min for auth
        "/api/v1/admin/": (5, 60),       # 5 req/min for admin/AI
    }

    def __init__(self, app):
        super().__init__(app)
        # {(ip, prefix): [(timestamp, ...),]}
        self._requests: Dict[Tuple[str, str], list] = defaultdict(list)

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP, respecting X-Forwarded-For behind Nginx."""
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _get_rate_limit(self, path: str) -> Tuple[int, int] | None:
        """Match path to rate limit config."""
        for prefix, limit in self.RATE_LIMITS.items():
            if path.startswith(prefix):
                return limit
        return None

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        limit = self._get_rate_limit(path)

        if limit is None:
            # No rate limit for this path
            return await call_next(request)

        max_requests, window_seconds = limit
        client_ip = self._get_client_ip(request)
        key = (client_ip, path.split("/")[4] if len(path.split("/")) > 4 else "")

        now = time.time()
        window_start = now - window_seconds

        # Clean old entries
        self._requests[key] = [
            ts for ts in self._requests[key] if ts > window_start
        ]

        if len(self._requests[key]) >= max_requests:
            retry_after = int(self._requests[key][0] + window_seconds - now) + 1
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Çok fazla istek. Lütfen bekleyin.",
                    "retry_after_seconds": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )

        self._requests[key].append(now)
        return await call_next(request)
