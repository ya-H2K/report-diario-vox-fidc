@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Cria um atalho na pasta "Inicializar" do Windows: o publicador liga sozinho
rem (minimizado) sempre que voce entrar no computador.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Publicador Vox.lnk'); $s.TargetPath='%~dp0iniciar-publicador.bat'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
if errorlevel 1 (
  echo  [ERRO] Nao consegui criar o atalho.
) else (
  echo  [OK] Pronto: o publicador vai ligar sozinho quando voce entrar no Windows.
  echo       Para desligar isso: Win+R, digite shell:startup e apague "Publicador Vox".
)
pause
