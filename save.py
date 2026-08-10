#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
save.py -- Guarda los cambios localmente con version semantica.
NO hace push a GitHub. Solo commit local.

Uso:
    python save.py                  # modo interactivo
    python save.py -m "fix: texto"  # con mensaje directo
    python save.py --version        # muestra historial
    python save.py --status         # muestra cambios pendientes
"""

import subprocess
import sys
import os
import json
import io
from datetime import datetime

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

def save_version(v):
    with open(VERSION_FILE, 'w', encoding='utf-8') as f:
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

def detect_bump(message):
    msg = message.lower()
    if msg.startswith('feat!') or 'breaking' in msg:
        return 'major'
    elif msg.startswith('feat'):
        return 'minor'
    return 'patch'

def git_status():
    r = run('git status --porcelain', capture=True)
    return r.stdout.strip()

def git_branch():
    r = run('git branch --show-current', capture=True)
    return r.stdout.strip()

def git_log(n=5):
    r = run(f'git log --oneline -{n}', capture=True)
    return r.stdout.strip()

def main():
    args = sys.argv[1:]

    # -- version flag
    if '--version' in args:
        v = load_version()
        title(f"Commission Manager {version_str(v)}")
        print(f"\n  Version actual: {version_str(v)}\n")
        history = v.get('history', [])
        if history:
            print("  Historial:")
            for h in reversed(history[-10:]):
                date = h['date'][:10]
                print(f"    {h['version']}  {date}  [{h['bump']}]  {h['message']}")
        else:
            print("  Sin historial aun.")
        print()
        return

    # -- status flag
    if '--status' in args:
        title("Estado actual")
        status = git_status()
        branch = git_branch()
        print(f"\n  Branch: {branch}")
        if status:
            print(f"\n  Cambios pendientes:")
            for line in status.split('\n'):
                print(f"    {line}")
        else:
            print("\n  Sin cambios pendientes.")
        print(f"\n  Commits recientes:")
        for line in git_log().split('\n'):
            print(f"    {line}")
        print()
        return

    title("Guardar version local")

    # Check git repo
    if not os.path.exists(os.path.join(REPO_DIR, '.git')):
        err("No es un repositorio git.")
        sys.exit(1)

    # Check for changes
    status = git_status()
    if not status:
        warn("No hay cambios pendientes.")
        print(f"\n  Commits recientes:")
        for line in git_log(3).split('\n'):
            print(f"    {line}")
        print(f"\n  Para subir a GitHub ejecuta: python deploy.py")
        return

    # Show changed files
    print(f"\n  Branch: {git_branch()}")
    print(f"\n  Cambios detectados:")
    lines = status.split('\n')
    for line in lines[:12]:
        print(f"    {line}")
    if len(lines) > 12:
        print(f"    ... y {len(lines)-12} mas")

    # Build commit message
    direct_message = None
    if '-m' in args:
        idx = args.index('-m')
        if idx + 1 < len(args):
            direct_message = args[idx + 1]

    if direct_message:
        commit_msg = direct_message
    else:
        sep()
        print("\n  Tipo de cambio:")
        types = [
            ('feat',     'Nueva funcionalidad'),
            ('fix',      'Correccion de bug'),
            ('style',    'Cambios visuales / CSS'),
            ('refactor', 'Refactoring'),
            ('chore',    'Mantenimiento'),
            ('docs',     'Documentacion'),
        ]
        for i, (t, d) in enumerate(types, 1):
            print(f"    {i}. {t:<12} {d}")

        while True:
            choice = input(f"\n  Tipo [1-{len(types)}]: ").strip()
            if choice.isdigit() and 1 <= int(choice) <= len(types):
                commit_type = types[int(choice)-1][0]
                break
            warn("Elige un numero valido")

        scope = input("  Scope (opcional, ej: kanban): ").strip()
        description = input("  Descripcion: ").strip()
        if not description:
            err("La descripcion no puede estar vacia.")
            sys.exit(1)

        commit_msg = commit_type
        if scope:
            commit_msg += f"({scope})"
        commit_msg += f": {description}"

    # Version bump
    v = load_version()
    bump_type = detect_bump(commit_msg)
    new_v = bump_version(v, bump_type)
    new_v_str = version_str(new_v)

    sep()
    print(f"\n  Version:  {version_str(v)}  ->  {new_v_str}  ({bump_type})")
    print(f"  Commit:   {commit_msg}")
    print(f"  Branch:   {git_branch()}\n")

    confirm = input("  Guardar localmente? [S/n]: ").strip().lower()
    if confirm == 'n':
        print("  Cancelado.\n")
        return

    # Update version.json
    new_v['history'] = v.get('history', []) + [{
        'version': new_v_str,
        'date': datetime.now().isoformat(),
        'message': commit_msg,
        'bump': bump_type,
    }]
    save_version(new_v)

    # Update package.json
    pkg_path = os.path.join(REPO_DIR, 'package.json')
    with open(pkg_path, encoding='utf-8') as f:
        pkg = json.load(f)
    pkg['version'] = f"{new_v['major']}.{new_v['minor']}.{new_v['patch']}"
    with open(pkg_path, 'w', encoding='utf-8') as f:
        json.dump(pkg, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print()
    info("Agregando archivos...")
    run('git add .')
    ok("git add .")

    full_msg = f"{commit_msg} [{new_v_str}]"
    info("Haciendo commit...")
    r = run(f'git commit -m "{full_msg}"')
    if r.returncode != 0:
        err("Commit fallo.")
        sys.exit(1)
    ok(f"Commit: {full_msg}")

    sep()
    print(f"""
  [OK] Guardado localmente como {new_v_str}
  [!]  NO se subio a GitHub todavia.

  Cuando estes listo para publicar ejecuta:
       python deploy.py

  Para ver el estado:
       python save.py --status
""")

if __name__ == '__main__':
    main()
