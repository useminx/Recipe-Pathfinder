@echo off
chcp 65001 >nul
echo ===================================================
echo [Recipe Pathfinder] 正在启动本地接口服务器...
echo ===================================================
cd /d "%~dp0recipe_pathfinder_backend"
python -m uvicorn recipe_pathfinder_backend.server:app --host 127.0.0.1 --port 8000 --reload
pause
