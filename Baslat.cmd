@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadı. Node.js 22.12 LTS veya daha yeni bir sürüm yükleyip tekrar deneyin.
  echo https://nodejs.org/
  pause
  exit /b 1
)

node -e "const [major,minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || major === 22 && minor >= 12 ? 0 : 1)"
if errorlevel 1 (
  echo Bu uygulama Node.js 22.12 veya daha yeni bir sürüm gerektirir.
  echo https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\vite\package.json" (
  echo İlk kullanım için bağımlılıklar kuruluyor. Bu adım internet bağlantısı gerektirir.
  call npm.cmd install
  if errorlevel 1 goto :error
)

if not exist "dist\index.html" (
  echo Kıyas hazırlanıyor...
  call npm.cmd run build
  if errorlevel 1 goto :error
)

node scripts\serve.mjs
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo Kıyas başlatılamadı. Yukarıdaki hata mesajını kontrol edin.
pause
exit /b 1
