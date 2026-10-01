@echo off
chcp 65001 >nul
title Configurar o site online - Vox FIDC
cd /d "%~dp0"

echo.
echo  ==============================================
echo    Configurar o site online (Supabase + GitHub)
echo  ==============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [ERRO] Node.js nao encontrado. Instale a versao LTS em https://nodejs.org
  pause
  exit /b 1
)
where git >nul 2>nul
if errorlevel 1 (
  echo  [ERRO] Git nao encontrado. Instale em https://git-scm.com e rode de novo.
  pause
  exit /b 1
)

echo  Instalando/atualizando as bibliotecas (pode levar 1 minuto)...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  echo  [ERRO] Falhou o npm install. Confira a internet e rode de novo.
  pause
  exit /b 1
)

node publicador\configurar.js
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
rem Arquivo que manda o GitHub montar e publicar o site a cada envio (GitHub Actions)
if not exist ".github\workflows" mkdir ".github\workflows"
copy /y "publicador\github-pages.yml" ".github\workflows\pages.yml" >nul
echo  Agora vou mandar o site para o GitHub...
call "%~dp0enviar-site-github.bat" sem-pausa
echo.
echo  Pronto. Pode fechar esta janela e seguir o guia.
pause
