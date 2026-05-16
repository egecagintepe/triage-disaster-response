from routes.auth import router as auth_router
from routes.tasks import router as tasks_router
from routes.teams import router as teams_router
from routes.zones import router as zones_router
from routes.admin import router as admin_router

__all__ = ["auth_router", "tasks_router", "teams_router", "zones_router", "admin_router"]

