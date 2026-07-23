@echo off
chcp 65001 > nul
title Salon de Beaute

cd /d "%~dp0"

echo.
echo  ======================================
echo    Salon de Beaute - Application
echo  ======================================
echo.

:: If the app is already built, skip install+build and serve immediately
if exist "dist\index.html" goto :serve

:: ---------- Clean install ----------
echo  [1/2] Installation des dependances...
echo  (Ceci peut prendre 3 a 5 minutes la premiere fois)
echo.

:: Delete node_modules if it was copied from another PC (native binaries differ per machine)
if exist "node_modules" (
    echo  Suppression de node_modules pour une installation propre...
    rmdir /s /q "node_modules"
    echo  Fait.
    echo.
)

call npm install
if %errorlevel% neq 0 (
    echo.
    echo  ERREUR : npm install a echoue.
    echo  Verifiez que Node.js est installe : https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: ---------- Build ----------
echo.
echo  [2/2] Construction de l'application (compilation CSS + animations)...
echo.

call npm run build
if %errorlevel% neq 0 (
    echo.
    echo  ERREUR : La construction a echoue. Voir les messages ci-dessus.
    echo.
    pause
    exit /b 1
)

echo.
echo  Construction reussie !
echo.

:serve
:: ---------- Start offline server ----------
echo  Demarrage du serveur sur http://localhost:5000
echo  Fermez la fenetre du serveur pour arreter l'application.
echo.

start "Salon de Beaute - Serveur" cmd /k node scripts/offline-server.cjs

timeout /t 3 /nobreak > nul
start http://localhost:5000

exit
