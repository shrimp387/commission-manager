@echo off
title JTP PILOT2 — Tagger Server
color 0A
cd /d "%~dp0"

echo.
echo  ===================================================
echo   JTP PILOT2 — Servidor de Tags Local
echo   Puerto: http://localhost:5621
echo  ===================================================
echo.

:: Verificar que Python existe
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python no encontrado.
    echo  Instala Python desde https://www.python.org/downloads/
    echo  Asegurate de marcar "Add Python to PATH" durante la instalacion.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo  [OK] %%v encontrado

:: Crear venv si no existe
if not exist "venv\" (
    echo  [SETUP] Creando entorno virtual...
    python -m venv venv
    if errorlevel 1 (
        echo  [ERROR] No se pudo crear el entorno virtual.
        pause
        exit /b 1
    )
    echo  [OK] Entorno virtual creado.
    echo.
)

:: Activar venv
call venv\Scripts\activate.bat
echo  [OK] Entorno virtual activado.

:: Verificar si las dependencias ya estan instaladas
python -c "import timm, safetensors, torch, torchvision, PIL" >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [SETUP] Instalando dependencias (primera vez puede tardar 5-15 min)...
    echo.

    :: Intentar instalar PyTorch con CUDA 12.1 (para GPU NVIDIA)
    echo  [SETUP] Intentando PyTorch con CUDA (GPU)...
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121 -q
    
    :: Verificar si torch con CUDA funciono
    python -c "import torch" >nul 2>&1
    if errorlevel 1 (
        echo  [SETUP] CUDA no disponible. Instalando PyTorch CPU...
        pip install torch torchvision -q
    ) else (
        python -c "import torch; cuda=torch.cuda.is_available(); print('[OK] PyTorch instalado - CUDA:', cuda)"
    )

    echo  [SETUP] Instalando timm, safetensors, pillow...
    pip install timm safetensors pillow -q
    
    :: Verificar instalacion final
    python -c "import timm, safetensors, torch, torchvision, PIL" >nul 2>&1
    if errorlevel 1 (
        echo  [ERROR] Error instalando dependencias. Revisa tu conexion a internet.
        pause
        exit /b 1
    )
    echo  [OK] Dependencias instaladas correctamente.
    echo.
) else (
    echo  [OK] Dependencias ya instaladas.
)

:: Verificar que el modelo existe
if not exist "JTP_PILOT2-e3-vit_so400m_patch14_siglip_384.safetensors" (
    echo.
    echo  [ERROR] Archivo del modelo no encontrado:
    echo    JTP_PILOT2-e3-vit_so400m_patch14_siglip_384.safetensors
    echo.
    echo  Asegurate de que el archivo esta en esta carpeta:
    echo    %~dp0
    pause
    exit /b 1
)

echo  [OK] Modelo encontrado.
echo.
echo  [INFO] Cargando modelo en memoria (puede tardar 10-30 segundos)...
echo.
echo  ===================================================
echo   Servidor corriendo en: http://localhost:5621
echo   Endpoints:
echo     GET  /health   verificar estado
echo     POST /predict  generar tags
echo.
echo   Deja esta ventana abierta mientras usas la app.
echo   Para detener: Ctrl+C o cierra esta ventana.
echo  ===================================================
echo.

python api_server.py

echo.
echo  [INFO] Servidor detenido.
pause
