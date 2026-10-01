@echo off
chcp 65001 >nul
title Publicador Vox (deixe aberto)
cd /d "%~dp0"
if not exist "node_modules\@supabase\supabase-js" (
  echo  Instalando as bibliotecas pela primeira vez...
  call npm install --no-audit --no-fund --loglevel=error
)
rem Envia os dados da planilha para o site sempre que ela for salva.
:loop
node publicador\publicar.js
echo.
echo  O publicador parou. Reiniciando em 30 segundos (feche a janela para parar de vez)...
timeout /t 30 >nul
goto loop
