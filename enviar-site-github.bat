@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Envia o codigo do site para o GitHub. O GitHub Actions compila e publica sozinho
rem em 1 a 3 minutos. O arquivo .env (com a chave secreta) NUNCA vai junto.
git add -A
git commit -m "Atualiza o site online" >nul 2>nul
git push
if errorlevel 1 (
  echo.
  echo  [ERRO] O git push falhou. Se abriu uma janela pedindo login do GitHub, faca o login
  echo         e rode este arquivo de novo: enviar-site-github.bat
) else (
  echo.
  echo  [OK] Codigo enviado. Em 1 a 3 minutos o site estara atualizado.
)
if not "%~1"=="sem-pausa" pause
