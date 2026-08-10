#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import io
# Force UTF-8 output on Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
"""
deploy.py — Commission Manager Deploy Tool
==========================================
Sube los cambios locales a GitHub y activa el deploy en Vercel.

Uso:
    python deploy.py                    # modo interactivo
    python deploy.py -m "fix: bug X"    # con mensaje directo
    python deploy.py --version          # muestra versión actual
"""

import subprocess
import sys
import os
import json
import re
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────
REPO_DIR = os.path.dirname(os.path.abspath(__file__))
VERSION_FILE = os.path.join(REPO_DIR, 'version.json')

# ── Colores en terminal ───────────────────────────────────────────────────────
GREEN  = '\033[92m'
YELLOW = '\033[93m'
RED    = '\033[91m'
BLUE   = '\033[94m'
BOLD   = '\033[1m'
RESET  = '\033[0m'

def ok(msg):   print(f"  [OK] {msg}")
def info(msg): print(f"  --> {msg}")
def warn(msg): print(f"  [!] {msg}")
def err(msg):  print(f"  [X] {msg}")
def title(msg):print(f"\n=== {msg} ===")

# ── Version management ────────────────────────────────────────────────────────

def load_version():
    if os.path.exists(VERSION_FILE):
        with open(VERSION_FILE) as f:
            return json.load(f)
    return {"major": 1, "minor": 0, "patch": 0, "history": []}

def save_version(v):
    with open(VERSION_FILE, 'w') as f:
        json.dump(v, f, indent=2, ensure_ascii=False)

def version_str(v):
    return f"v{v['major']}.{v['minor']}.{v['patch']}"

def bump_version(v, bump_type):
    v = dict(v)
    if bump_type == 'major':
        v['major'] += 1; v['minor'] = 0; v['patch'] = 0
    elif bump_type == 'minor':
        v['minor'] += 1; v['patch'] = 0
    else:
        v['patch'] += 1
    return v

def detect_bump_type(message):
    """Detecta el tipo de bump según el prefijo del commit."""
    msg = message.lower()
    if msg.startswith('feat!') or 'breaking' in msg:
        return 'major'
    elif msg.startswith('feat'):
        return 'minor'
    else:
        return 'patch'  # fix, chore, style, refactor, docs, etc.

# ── Git helpers ───────────────────────────────────────────────────────────────

def run(cmd, capture=False):
    result = subprocess.run(
        cmd, shell=True, cwd=REPO_DIR,
        capture_output=capture, text=True
    )
    return result

def git_status():
    r = run('git status --porcelain', capture=True)
    return r.stdout.strip()

def git_current_branch():
    r = run('git branch --show-current', capture=True)
    return r.stdout.strip()

def git_last_commit():
    r = run('git log -1 --pretty="%h %s"', capture=True)
    return r.stdout.strip()

def has_changes():
    return bool(git_status())

# ── Main flow ─────────────────────────────────────────────────────────────────

def choose_commit_type():
    types = [
        ('feat',     'Nueva funcionalidad'),
        ('fix',      'Corrección de bug'),
        ('style',    'Cambios visuales / CSS'),
        ('refactor', 'Refactoring de código'),
        ('chore',    'Mantenimiento / dependencias'),
        ('docs',     'Documentación'),
    ]
    print("\n  Tipo de cambio:")
    for i, (t, desc) in enumerate(types, 1):
        print(f"    {BOLD}{i}{RESET}. {t:<10} {desc}")
    while True:
        choice = input(f"\n  Elige [1-{len(types)}]: ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(types):
            return types[int(choice) - 1][0]
        warn("Elige un número válido")

def main():
    title("═══ Commission Manager — Deploy Tool ═══")

    # Parse args
    args = sys.argv[1:]
    direct_message = None
    if '--version' in args:
        v = load_version()
        print(f"\n  Versión actual: {BOLD}{version_str(v)}{RESET}")
        if v.get('history'):
            print("  Últimos releases:")
            for h in v['history'][-5:][::-1]:
                print(f"    {h['version']} — {h['date'][:10]} — {h['message']}")
        return
    if '-m' in args:
        idx = args.index('-m')
        if idx + 1 < len(args):
            direct_message = args[idx + 1]

    # Check git repo
    if not os.path.exists(os.path.join(REPO_DIR, '.git')):
        err("No es un repositorio git. Inicializa con: git init")
        sys.exit(1)

    # Check for changes
    if not has_changes():
        warn("No hay cambios pendientes para hacer commit.")
        last = git_last_commit()
        info(f"Último commit: {last}")
        push_anyway = input("\n  ¿Hacer push del último commit de todas formas? [s/N]: ").strip().lower()
        if push_anyway != 's':
            print("  Nada que hacer.")
            return
        # Just push
        info("Haciendo push...")
        r = run('git push origin main')
        if r.returncode == 0:
            ok("Push completado — Vercel desplegará automáticamente")
        else:
            err("Push falló. Revisa tu conexión o credenciales de GitHub.")
        return

    # Show changed files
    status = git_status()
    info(f"Cambios detectados:")
    for line in status.split('\n')[:10]:
        print(f"    {line}")
    if status.count('\n') > 10:
        print(f"    ... y {status.count(chr(10)) - 10} más")

    # Build commit message
    if direct_message:
        commit_msg = direct_message
    else:
        print()
        commit_type = choose_commit_type()
        scope = input(f"  Scope opcional (ej: kanban, stickers): ").strip()
        description = input(f"  Descripción del cambio: ").strip()
        if not description:
            err("La descripción no puede estar vacía.")
            sys.exit(1)
        commit_msg = f"{commit_type}"
        if scope:
            commit_msg += f"({scope})"
        commit_msg += f": {description}"

    # Version bump
    v = load_version()
    bump_type = detect_bump_type(commit_msg)
    new_v = bump_version(v, bump_type)
    new_v_str = version_str(new_v)

    print(f"\n  Versión: {version_str(v)} → {BOLD}{GREEN}{new_v_str}{RESET}")
    print(f"  Commit:  {BOLD}{commit_msg}{RESET}")
    print(f"  Branch:  {git_current_branch()}")

    confirm = input(f"\n  ¿Confirmar y subir a GitHub? [S/n]: ").strip().lower()
    if confirm == 'n':
        print("  Cancelado.")
        return

    # Update version.json
    new_v['history'] = v.get('history', []) + [{
        'version': new_v_str,
        'date': datetime.now().isoformat(),
        'message': commit_msg,
        'bump': bump_type,
    }]
    save_version(new_v)

    # Update package.json version
    pkg_path = os.path.join(REPO_DIR, 'package.json')
    with open(pkg_path) as f:
        pkg = json.load(f)
    pkg['version'] = f"{new_v['major']}.{new_v['minor']}.{new_v['patch']}"
    with open(pkg_path, 'w') as f:
        json.dump(pkg, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print()

    # Git add
    info("Añadiendo archivos...")
    run('git add .')
    ok("git add .")

    # Git commit
    info("Haciendo commit...")
    full_msg = f"{commit_msg} [{new_v_str}]"
    r = run(f'git commit -m "{full_msg}"')
    if r.returncode != 0:
        err("Commit falló.")
        sys.exit(1)
    ok(f"Commit: {full_msg}")

    # Git tag
    tag = new_v_str
    run(f'git tag {tag}')
    ok(f"Tag: {tag}")

    # Git push
    info("Subiendo a GitHub...")
    r = run('git push origin main --tags')
    if r.returncode == 0:
        ok("Push completado")
    else:
        # Try without tags if tag push fails
        r2 = run('git push origin main')
        if r2.returncode == 0:
            ok("Push completado (sin tags)")
        else:
            err("Push falló. Asegúrate de que Git Credential Manager esté configurado.")
            err("Ejecuta: git push origin main")
            sys.exit(1)

    title("Deploy enviado")
    print(f"""
  [OK] {new_v_str} subido a GitHub
  --> Vercel desplegara automaticamente
  --> En 1-2 minutos estara en: https://commission-manager-plum.vercel.app

  Historial reciente:""")

    final_v = load_version()
    for h in final_v.get('history', [])[-3:][::-1]:
        print(f"    {GREEN}{h['version']}{RESET} — {h['message']}")
    print()


if __name__ == '__main__':
    main()
