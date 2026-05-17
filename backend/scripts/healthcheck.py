"""TRIAGE — System Health Check

Verifies:
  1. SQLite database integrity (PRAGMA integrity_check)
  2. Required .env variables exist
  3. FastAPI routing tree is valid (imports all routers)
  4. Critical service modules importable
  5. Table row counts

Usage:
    cd backend
    python ../scripts/healthcheck.py
"""

import sys
import os
import sqlite3

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

PASS = '[OK]'
FAIL = '[FAIL]'
WARN = '[WARN]'


def section(title):
    print(f'\n{"="*50}')
    print(f'  {title}')
    print(f'{"="*50}')


def check_env():
    section('1. Environment Variables')
    env_path = os.path.join(os.path.dirname(__file__), '..', 'backend', '.env')

    if not os.path.exists(env_path):
        print(f'  {FAIL} .env file not found at {env_path}')
        return False

    with open(env_path, 'r') as f:
        content = f.read()

    required = ['GEMINI_API_KEY', 'SECRET_KEY', 'DATABASE_URL', 'CORS_ORIGINS']
    all_ok = True
    for var in required:
        if var in content:
            # Check if it has a real value (not empty or placeholder)
            for line in content.split('\n'):
                if line.startswith(var + '='):
                    value = line.split('=', 1)[1].strip()
                    if value and value not in ('', 'your_gemini_api_key_here'):
                        print(f'  {PASS} {var} = {value[:20]}{"..." if len(value) > 20 else ""}')
                    else:
                        print(f'  {WARN} {var} is empty or placeholder')
                    break
        else:
            print(f'  {FAIL} {var} missing from .env')
            all_ok = False
    return all_ok


def check_database():
    section('2. SQLite Database Integrity')
    db_path = os.path.join(os.path.dirname(__file__), '..', 'backend', 'data', 'triage.db')

    if not os.path.exists(db_path):
        print(f'  {WARN} Database not found at {db_path}')
        print(f'  {WARN} Will be created on first server start')
        return True

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Integrity check
        result = cursor.execute('PRAGMA integrity_check').fetchone()
        if result[0] == 'ok':
            print(f'  {PASS} PRAGMA integrity_check = ok')
        else:
            print(f'  {FAIL} integrity_check returned: {result[0]}')
            return False

        # WAL mode check
        journal = cursor.execute('PRAGMA journal_mode').fetchone()
        print(f'  {PASS} journal_mode = {journal[0]}')

        # Table counts
        tables = ['teams', 'tasks', 'zones', 'system_events']
        for table in tables:
            try:
                count = cursor.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
                print(f'  {PASS} {table}: {count} rows')
            except sqlite3.OperationalError:
                print(f'  {WARN} Table "{table}" not found (will be created on start)')

        conn.close()
        return True
    except Exception as e:
        print(f'  {FAIL} Database error: {e}')
        return False


def check_imports():
    section('3. Service Module Imports')
    modules = [
        ('config', 'Configuration'),
        ('database', 'Database engine'),
        ('auth', 'JWT authentication'),
        ('routes.auth', 'Auth routes'),
        ('routes.tasks', 'Task routes'),
        ('routes.teams', 'Team routes'),
        ('routes.zones', 'Zone routes'),
        ('routes.admin', 'Admin routes'),
        ('services.afad_client', 'Kandilli API client'),
        ('services.ai_engine', 'Gemini AI engine'),
        ('services.task_generator', 'Task generator'),
        ('services.dispatcher', 'Auto-dispatcher'),
        ('services.sync_service', 'Sync service'),
        ('managers.websocket', 'WebSocket manager'),
        ('middleware.rate_limit', 'Rate limiter'),
    ]

    all_ok = True
    for mod, desc in modules:
        try:
            __import__(mod)
            print(f'  {PASS} {desc} ({mod})')
        except Exception as e:
            print(f'  {FAIL} {desc} ({mod}): {e}')
            all_ok = False
    return all_ok


def check_routes():
    section('4. FastAPI Route Tree')
    try:
        from main import app
        routes = []
        for route in app.routes:
            if hasattr(route, 'methods') and hasattr(route, 'path'):
                for method in route.methods:
                    if method in ('GET', 'POST', 'PATCH', 'PUT', 'DELETE'):
                        routes.append(f'{method:6s} {route.path}')

        routes.sort()
        for r in routes:
            print(f'  {PASS} {r}')

        print(f'\n  Total endpoints: {len(routes)}')

        # Check critical endpoints exist
        critical = ['/api/v1/auth/register-device', '/api/v1/auth/refresh',
                     '/api/v1/tasks', '/api/v1/admin/run-ai-analysis']
        for ep in critical:
            found = any(ep in r for r in routes)
            if not found:
                print(f'  {FAIL} Critical endpoint missing: {ep}')
                return False

        return True
    except Exception as e:
        print(f'  {FAIL} Could not build route tree: {e}')
        return False


def check_frontend():
    section('5. Frontend Build Readiness')
    base = os.path.join(os.path.dirname(__file__), '..')

    for app_name in ['admin', 'field']:
        app_dir = os.path.join(base, 'frontend', app_name)
        pkg = os.path.join(app_dir, 'package.json')
        node_mods = os.path.join(app_dir, 'node_modules')
        vite_cfg = os.path.join(app_dir, 'vite.config.ts')

        if os.path.exists(pkg):
            print(f'  {PASS} {app_name}/package.json exists')
        else:
            print(f'  {FAIL} {app_name}/package.json missing')

        if os.path.exists(node_mods):
            print(f'  {PASS} {app_name}/node_modules installed')
        else:
            print(f'  {WARN} {app_name}/node_modules missing (run npm install)')

        if os.path.exists(vite_cfg):
            print(f'  {PASS} {app_name}/vite.config.ts exists')

    return True


def main():
    print('=' * 50)
    print('  TRIAGE — System Health Check')
    print('=' * 50)

    results = []
    results.append(('ENV', check_env()))
    results.append(('DB', check_database()))
    results.append(('Imports', check_imports()))
    results.append(('Routes', check_routes()))
    results.append(('Frontend', check_frontend()))

    section('SUMMARY')
    all_pass = True
    for name, ok in results:
        status = PASS if ok else FAIL
        print(f'  {status} {name}')
        if not ok:
            all_pass = False

    if all_pass:
        print(f'\n  ALL CHECKS PASSED. System ready.')
    else:
        print(f'\n  SOME CHECKS FAILED. Review above.')

    return 0 if all_pass else 1


if __name__ == '__main__':
    sys.exit(main())
