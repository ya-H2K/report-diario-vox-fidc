@echo off
chcp 65001 >nul
title Dashboard Fluxo Operacional Vox
cd /d "%~dp0"

rem --- 0. Acha a pasta do projeto ------------------------------------------
rem Funciona com o .bat dentro da pasta do projeto ou ao lado dela.
if not exist "package.json" (
  if exist "dashboard-fluxo-vox\package.json" (
    cd /d "%~dp0dashboard-fluxo-vox"
  ) else if exist "dashboard-fluxo-vox\dashboard-fluxo-vox\package.json" (
    cd /d "%~dp0dashboard-fluxo-vox\dashboard-fluxo-vox"
  ) else (
    echo.
    echo  [ERRO] Nao encontrei os arquivos do projeto.
    echo         Pasta atual: %CD%
    echo.
    if exist "dashboard-fluxo-vox.zip" (
      echo         O zip ainda nao foi extraido. Clique com o botao direito em
      echo         dashboard-fluxo-vox.zip, escolha "Extrair tudo" e rode este arquivo de novo.
    ) else (
      echo         Coloque este .bat dentro da pasta dashboard-fluxo-vox,
      echo         a mesma que tem o arquivo package.json e a pasta server.
    )
    echo.
    pause
    exit /b 1
  )
)
if not exist "server\index.js" (
  echo  [ERRO] A pasta %CD% tem package.json, mas falta a pasta server.
  echo         Extraia o zip de novo, completo.
  pause
  exit /b 1
)
echo  Pasta do projeto: %CD%

echo.
echo  ==============================================
echo    Dashboard do Fluxo Operacional - Vox FIDC
echo  ==============================================
echo.

rem --- 1. Node instalado? -------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo  [ERRO] Node.js nao encontrado.
  echo         Instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
  echo         Se acabou de instalar, reinicie o computador ou abra uma nova sessao.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo  Node.js %%v encontrado.

rem --- 2. Arquivo .env ------------------------------------------------------
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo.
  echo  Primeira execucao: criei o arquivo .env.
  echo  Ele vai abrir no Bloco de Notas. Confira o caminho da planilha
  echo  na linha PLANILHA_PATH, salve e FECHE o Bloco de Notas para continuar.
  echo.
  notepad ".env"
)

rem --- 3. Planilha acessivel? (so avisa, nao bloqueia) ----------------------
set "PLANILHA="
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
  if /i "%%a"=="PLANILHA_PATH" set "PLANILHA=%%b"
)
if defined PLANILHA (
  if not exist "%PLANILHA%" (
    echo.
    echo  [AVISO] Nao encontrei a planilha em:
    echo          %PLANILHA%
    echo          Confira se o drive H: esta conectado ou corrija o PLANILHA_PATH no .env.
    echo          O dashboard vai abrir, mas mostrara um aviso ate a planilha ser encontrada.
  )
)

rem --- 4. Bibliotecas (so na primeira vez) ----------------------------------
if not exist "node_modules\.bin\vite.cmd" (
  echo.
  echo  Instalando as bibliotecas pela primeira vez. Isso leva 1 a 2 minutos...
  call npm install
)
rem Confere de verdade: o npm nem sempre devolve o codigo de erro para o .bat.
if not exist "node_modules\.bin\vite.cmd" (
  echo.
  echo  [ERRO] As bibliotecas nao foram instaladas. Veja a mensagem acima.
  echo         Em rede corporativa, pode ser bloqueio de proxy: fale com o TI
  echo         para liberar o endereco registry.npmjs.org.
  echo.
  pause
  exit /b 1
)

rem --- 5. Inicia servidor + interface e abre o navegador --------------------
echo.
echo  Iniciando... o navegador vai abrir sozinho em http://localhost:5173
echo  Deixe esta janela aberta enquanto usa o dashboard.
echo  Para desligar: feche esta janela ou aperte Ctrl + C.
echo.
call npx concurrently -k -n api,web -c blue,green "node server/index.js" "vite --open"

echo.
echo  Dashboard encerrado.
pause
