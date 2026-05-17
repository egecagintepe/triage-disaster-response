"""Application configuration loaded from environment variables."""

import os
from dotenv import load_dotenv

load_dotenv()

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/triage.db")

# Security
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# External APIs
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
AFAD_API_URL = os.getenv("AFAD_API_URL", "https://api.afad.gov.tr/v1")

# CORS
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
