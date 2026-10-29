@echo off
rem Abre Dasharr en modo desarrollo con los ultimos cambios de la rama dev.
rem Los cambios de pantallas se ven al momento; los de Rust recompilan solos al guardar.
setlocal
cd /d "%~dp0.."

where git >nul 2>nul || (echo Falta Git. Instala: winget install Git.Git & pause & exit /b 1)
where npm >nul 2>nul || (echo Falta Node.js. Instala: winget install OpenJS.NodeJS.LTS & pause & exit /b 1)
where cargo >nul 2>nul || (echo Falta Rust. Instala: winget install Rustlang.Rustup & pause & exit /b 1)

echo Descargando los ultimos cambios...
git fetch origin dev && git checkout dev && git pull --ff-only origin dev || (echo No se pudieron bajar los cambios. & pause & exit /b 1)

echo Instalando dependencias (solo tarda la primera vez)...
call npm install --no-audit --no-fund || (pause & exit /b 1)

echo Abriendo Dasharr (la primera compilacion tarda unos minutos)...
call npm run tauri dev
pause
