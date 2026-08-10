"""
Launcher — Estudio de Comisiones
Inicia el proxy de Taskade (node server.js) y el dev server de Vite (npm run dev).
Presiona ENTER para cerrar todo y terminar las sesiones en localhost.
"""

import subprocess
import sys
import os
import signal
import time
import webbrowser

# ── Configuración ──────────────────────────────────────────────────────────────
WORK_DIR = os.path.dirname(os.path.abspath(__file__))
APP_URL   = "http://localhost:5174"

PROXY_CMD = ["node", "server.js"]
DEV_CMD   = ["npm", "run", "dev"]

# En Windows los comandos npm necesitan el shell
USE_SHELL = sys.platform == "win32"

# ── Colores ANSI ────────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def banner():
    print(f"""
{CYAN}{BOLD}╔══════════════════════════════════════════╗
║   🎨  Estudio de Comisiones — Launcher   ║
╚══════════════════════════════════════════╝{RESET}
""")

def start_process(cmd, label):
    """Inicia un subproceso y retorna el objeto Popen."""
    print(f"  {GREEN}▶{RESET} Iniciando {BOLD}{label}{RESET}...")
    proc = subprocess.Popen(
        cmd,
        cwd=WORK_DIR,
        shell=USE_SHELL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    return proc

def wait_for_ready(proc, keyword, timeout=20):
    """Lee stdout hasta encontrar keyword o timeout."""
    start = time.time()
    while time.time() - start < timeout:
        line = proc.stdout.readline()
        if not line:
            break
        print(f"    {YELLOW}│{RESET} {line.rstrip()}")
        if keyword.lower() in line.lower():
            return True
    return False

def kill_proc(proc, label):
    """Termina un proceso de forma limpia."""
    if proc and proc.poll() is None:
        print(f"  {RED}■{RESET} Deteniendo {label}...")
        try:
            if sys.platform == "win32":
                subprocess.call(
                    ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            else:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except Exception:
            proc.kill()

def main():
    banner()

    proxy_proc = None
    dev_proc   = None

    try:
        # 1. Proxy Taskade
        proxy_proc = start_process(PROXY_CMD, "Proxy Taskade  (puerto 3001)")
        wait_for_ready(proxy_proc, "corriendo", timeout=8)
        print(f"  {GREEN}✓{RESET} Proxy listo en {CYAN}http://localhost:3001{RESET}\n")

        # 2. Vite dev server
        dev_proc = start_process(DEV_CMD, "Vite dev server (puerto 5174)")
        wait_for_ready(dev_proc, "localhost", timeout=20)
        print(f"  {GREEN}✓{RESET} App lista en   {CYAN}{APP_URL}{RESET}\n")

        # 3. Abrir navegador
        time.sleep(0.8)
        webbrowser.open(APP_URL)
        print(f"{CYAN}{'─'*46}{RESET}")
        print(f"  {BOLD}Presiona ENTER para cerrar todo y salir.{RESET}")
        print(f"{CYAN}{'─'*46}{RESET}\n")

        input()  # ← espera ENTER

    except KeyboardInterrupt:
        print(f"\n  {YELLOW}Interrumpido con Ctrl+C{RESET}")

    finally:
        print(f"\n{YELLOW}Cerrando servidores...{RESET}")
        kill_proc(dev_proc,   "Vite dev server")
        kill_proc(proxy_proc, "Proxy Taskade")
        print(f"{GREEN}Todo detenido. ¡Hasta pronto! 🎨{RESET}\n")

if __name__ == "__main__":
    main()
