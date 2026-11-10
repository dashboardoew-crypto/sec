@echo off
title Watchroom Security ERP - Local Server
cd /d "%~dp0"
echo ========================================================
echo Starting Watchroom Security Operations ERP...
echo App will be available at: http://localhost:5000
echo ========================================================
node scripts\dev-local.mjs
pause

