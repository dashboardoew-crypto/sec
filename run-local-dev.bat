@echo off
title Watchroom Security ERP - Dev Mode
cd /d "%~dp0"
echo ========================================================
echo Starting Watchroom Security Operations ERP in Dev Mode...
echo Backend API URL: http://localhost:5000
echo Frontend Dev URL: http://localhost:3000
echo ========================================================
node scripts\dev-local.mjs --dev
pause

