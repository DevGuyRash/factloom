@echo off
rem The repository's tools on Windows: resumes help lists every command. Needs Node.js 22.18 or later.
setlocal
set "DIR=%~dp0"
where node >nul 2>nul || (echo Node.js is not installed: get version 22.18 or later from https://nodejs.org 1>&2 & exit /b 1)
if not exist "%DIR%tools\node_modules" (
  echo First run: installing the tools' dependencies... 1>&2
  pushd "%DIR%tools" && call npm ci --no-audit --no-fund 1>&2 && popd || (echo npm ci failed 1>&2 & exit /b 1)
)
node "%DIR%tools\src\cli.ts" %*
