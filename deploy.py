#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
deploy.py -- Sube los commits locales a GitHub y activa el deploy en Vercel.
NO hace commit. Solo push de lo que ya esta guardado con save.py.

Uso:
    python deploy.py            # sube la version actual a GitHub
    python deploy.py --dry-run  # muestra que se subira sin hacerlo
    python deploy.py --log      # muestra commits pendientes de subir
"""

import subprocess
import sys
import os
import json
import io

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

REPO_DIR = os.path.dirname(os.path.abspath(__file__))
VERSION_FILE = os.path.join(REPO_DIR, 'version.json')

def ok(msg):    print(f"  [OK] {msg}")
def info(msg):  print(f"  --> {msg}")
def warn(msg):  print(f"  [!]  {msg}")
def err(msg):   print(f"  [X]  {msg}")
def title(msg): print(f"\n{'='*50}\n  {msg}\n{'='*50}")
def sep():      print(f"  {'-'*40}")

def run(cmd, capture=False):
    return subprocess.run(cmd, shell=True, cwd=REPO_DIR, capture_output=capture, text=True, encoding='utf-8', errors='replace')

def load_version():
    if os.path.exists(VERSION_FILE):
        with open(VERSION_FILE, encoding='utf-8') as f:
            return json.load(f)
    return {"major": 1, "minor": 0, "patch": 0, "history": []}

def version_str(v):
    return f"v{v['major']}.{v['minor']}.{v['patch']}"

def git_branch():
    r = run('git branch --show-current', capture=True)
    return r.stdout.strip()

def git_unpushed():
    """Commits locales que aun no estan en GitHub."""
    r = run('git log origin/main..HEAD --oneline', capture=True)
    return r.stdout.strip()

def git_status():
    r = run('git status --porcelain', capture=True)
    return r.stdout.strip()

def main():
    args = sys.argv[1:]
    dry_run = '--dry-run' in args
    show_log = '--log' in args

    title("Commission Manager -- Deploy a GitHub / Vercel")

    # Check git repo
    if not os.path.exists(os.path.join(REPO_DIR, '.git')):
        err("No es un repositorio git.")
        sys.exit(1)

    v = load_version()
    branch = git_branch()
    unpushed = git_unpushed()
    pending_changes = git_status()

    print(f"\n  Version local:  {version_str(v)}")
    print(f"  Branch:         {branch}")

    # Warn about uncommitted changes
    if pending_changes:
        warn("Tienes cambios sin commitear:")
        for line in pending_changes.split('\n')[:5]:
            print(f"       {line}")
        print(f"\n  Ejecuta primero: python save.py")
        print(f"  Luego vuelve a:  python deploy.py\n")
        return

    # Show unpushed commits
    if not unpushed:
        warn("No hay commits nuevos para subir a GitHub.")
        print(f"\n  GitHub ya tiene la version mas reciente.")
        print(f"  Para hacer cambios: python save.py\n")
        return

    print(f"\n  Commits que se subiran a GitHub:")
    for line in unpushed.split('\n'):
        print(f"    {line}")

    if show_log:
        print()
        return

    sep()

    if dry_run:
        print(f"\n  [DRY RUN] Se haria push de los commits de arriba.")
        print(f"  Para ejecutar de verdad: python deploy.py\n")
        return

    # Confirm
    print(f"\n  Esto subira {len(unpushed.split(chr(10)))} commit(s) a GitHub.")
    print(f"  Vercel desplegara automaticamente despues del push.")
    confirm = input("\n  Subir a GitHub y activar deploy? [S/n]: ").strip().lower()
    if confirm == 'n':
        print("  Cancelado.\n")
        return

    print()

    # Push
    info("Subiendo a GitHub...")
    r = run('git push origin main')

    if r.returncode == 0:
        ok("Push completado exitosamente")
    else:
        # Check if it was a partial success (PowerShell exit code issue)
        check = run('git log origin/main..HEAD --oneline', capture=True)
        if not check.stdout.strip():
            ok("Push completado (origin actualizado)")
        else:
            err("Push fallo. Verifica tu conexion y credenciales.")
            err("Ejecuta manualmente: git push origin main")
            sys.exit(1)

    # Push tags if any
    run('git push origin --tags')

    print(f"""
  [OK] {version_str(v)} publicado en GitHub
  --> Vercel desplegara automaticamente en 1-2 minutos
  --> URL: https://commission-manager-plum.vercel.app

  Para ver el historial: python save.py --version
  Para guardar cambios:  python save.py
""")

if __name__ == '__main__':
    main()
