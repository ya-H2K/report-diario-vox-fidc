@echo off
chcp 65001 >nul
title Report Vox - PRODUCAO (porta 3001)
cd /d "%~dp0"

echo.
echo  ==============================================
echo    Report Vox FIDC - modo de PRODUCAO
echo  ==============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [ERRO] Node.js nao encontrado. Instale a versao LTS em https://nodejs.org
  pause
  exit /b 1
)
if not exist "package.json" (
  echo  [ERRO] Coloque este arquivo dentro da pasta dashboard-fluxo-vox.
  pause
  exit /b 1
)
if not exist ".env" (
  echo  [ERRO] Falta o arquivo .env. Copie o .env.example para .env e preencha.
  pause
  exit /b 1
)

rem --- avisos do .env (nao impedem de ligar) ---
findstr /r /c:"^SIMULAR_AGORA=..*" ".env" >nul && (
  echo  [ATENCAO] SIMULAR_AGORA esta preenchido no .env: o site vai achar que e outro dia.
  echo            Deixe a linha vazia: SIMULAR_AGORA=
  echo.
)
findstr /r /c:"^ADMIN_SENHA=admin2027" ".env" >nul && (
  echo  [ATENCAO] A senha do admin ainda e a padrao. Troque ADMIN_SENHA no .env.
  echo.
)

echo  Instalando/atualizando bibliotecas...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo  [ERRO] Falha no npm install. Veja a mensagem acima.
  pause
  exit /b 1
)

echo.
echo  Compilando o site...
call npm run build
if errorlevel 1 (
  echo  [ERRO] Falha ao compilar. Veja a mensagem acima.
  pause
  exit /b 1
)

echo.
echo  Site no ar em http://localhost:3001  (e o endereco que o tunel da Cloudflare deve usar)
echo  Deixe esta janela aberta. Para desligar: feche a janela ou Ctrl + C.
echo.
node server/index.js

echo.
echo  Servidor encerrado.
pause
