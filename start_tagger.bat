@echo off
title JTP PILOT2 - Tagger Server
color 0A
cd /d "%~dp0"

echo.
echo  ===================================================
echo   JTP PILOT2 - Servidor de Tags Local
echo   Puerto: http://localhost:5621
echo  ===================================================
echo.

:: Verificar Python
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python no encontrado.
    echo  Instala Python desde https://www.python.org/downloads/
    echo  Marca "Add Python to PATH" durante la instalacion.
    pause
    exit /b 1
)

echo  [OK] Python encontrado:
python --version

:: Crear venv si no existe
if not exist "venv" (
    echo  [SETUP] Creando entorno virtual...
    python -m venv venv
    if errorlevel 1 (
        echo  [ERROR] No se pudo crear el entorno virtual.
        pause
        exit /b 1
    )
    echo  [OK] Entorno virtual creado.
)

:: Activar venv
call venv\Scripts\activate.bat
if errorlevel 1 (
    echo  [ERROR] No se pudo activar el entorno virtual.
    pause
    exit /b 1
)
echo  [OK] Entorno virtual activado.

:: Verificar dependencias usando script externo
python check_deps.py > deps_check.tmp 2>&1
set /p DEPS_RESULT=<deps_check.tmp
del deps_check.tmp >nul 2>&1

if "%DEPS_RESULT%"=="OK" (
    echo  [OK] Dependencias ya instaladas.
    goto MODEL_CHECK
)

echo.
echo  [SETUP] Instalando dependencias (primera vez tarda 5-15 min)...
echo.
echo  [SETUP] Instalando PyTorch con CUDA 12.1 (GPU NVIDIA)...
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121 -q
if errorlevel 1 (
    echo  [SETUP] Intentando PyTorch CPU...
    pip install torch torchvision -q
)
echo  [SETUP] Instalando timm, safetensors, pillow...
pip install timm safetensors pillow -q

python check_deps.py > deps_check.tmp 2>&1
set /p DEPS_RESULT2=<deps_check.tmp
del deps_check.tmp >nul 2>&1
if not "%DEPS_RESULT2%"=="OK" (
    echo  [ERROR] Fallo instalando dependencias. Revisa tu internet.
    echo  Detalle: %DEPS_RESULT2%
    pause
    exit /b 1
)
echo  [OK] Dependencias instaladas.

:MODEL_CHECK
:: Verificar modelo
if not exist "JTP_PILOT2-e3-vit_so400m_patch14_siglip_384.safetensors" (
    echo.
    echo  [ERROR] Modelo no encontrado:
    echo    JTP_PILOT2-e3-vit_so400m_patch14_siglip_384.safetensors
    echo.
    echo  El archivo debe estar en esta misma carpeta.
    pause
    exit /b 1
)

echo  [OK] Modelo encontrado.
echo.
echo  [INFO] Cargando modelo en memoria (10-30 segundos)...
echo.
echo  ===================================================
echo   Servidor en: http://localhost:5621
echo   Deja esta ventana abierta mientras usas la app.
echo   Para detener: Ctrl+C
echo  ===================================================
echo.

python api_server.py

echo.
echo  [INFO] Servidor detenido.
pause
