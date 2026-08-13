@echo off
echo Borrando configuración de la Companion App...
del "%APPDATA%\commission-manager-companion\config.json" 2>nul
if exist "%APPDATA%\commission-manager-companion\config.json" (
    echo ❌ No se pudo borrar el archivo. Cierra la companion app primero.
) else (
    echo ✅ Configuración borrada. Ahora cierra la app y vuelve a abrirla.
)
pause
