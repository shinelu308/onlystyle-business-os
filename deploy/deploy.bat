@echo off
rem ===========================================================================
rem  ONLYSTYLE Business OS - one-click deploy launcher  (Windows)
rem  This file is intentionally ASCII-only so it never breaks on any codepage.
rem  All real work lives in deploy.cjs next to it.
rem ===========================================================================
setlocal enableextensions
title ONLYSTYLE - One-click Deploy
cd /d "%~dp0"

set "NODE_EXE="

rem --- 1) Node found on PATH -------------------------------------------------
for %%I in (node.exe) do if not defined NODE_EXE if exist "%%~$PATH:I" set "NODE_EXE=%%~$PATH:I"

rem --- 2) Common install locations -------------------------------------------
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3\node.exe" set "NODE_EXE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"
if not defined NODE_EXE if exist "E:\dev\usr\nodejs\v20.18.1\node.exe" set "NODE_EXE=E:\dev\usr\nodejs\v20.18.1\node.exe"

if not defined NODE_EXE (
  echo.
  echo   [ERROR] Node.js was not found on this computer.
  echo           Install Node.js 18 or newer from https://nodejs.org
  echo           then double-click this file again.
  echo.
  pause
  exit /b 1
)

rem --- 3) UTF-8 console so the Chinese output renders correctly -------------
chcp 65001 >nul 2>nul
cls

"%NODE_EXE%" "%~dp0deploy.cjs" %*
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" echo   [deploy exited with code %RC%]
pause
exit /b %RC%
