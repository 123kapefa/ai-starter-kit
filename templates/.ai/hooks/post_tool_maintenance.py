#!/usr/bin/env python3
"""Best-effort post-edit maintenance. Читает .ai/hooks.config.json:
  format: {frontend_dir, eslint, prettier}  — eslint --fix / prettier --write
  index:  {tool, extensions}                — индексация изменённых файлов
Всё в фоне, без блокировки. Подключение: PostToolUse, matcher
"Edit|Write|MultiEdit|apply_patch". Без конфига — тихий no-op.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(
    os.environ.get("CLAUDE_PROJECT_DIR")
    or os.environ.get("CODEX_PROJECT_DIR")
    or os.getcwd()
).resolve()


def load_config() -> dict[str, Any]:
    try:
        with open(ROOT / ".ai" / "hooks.config.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


CFG = load_config()
FMT = CFG.get("format", {}) or {}
IDX = CFG.get("index", {}) or {}


def read_payload() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {"_raw": raw}
    return payload if isinstance(payload, dict) else {"payload": payload}


def walk_strings(value: Any):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from walk_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_strings(child)


def normalize_path(path_text: str) -> Path | None:
    path_text = path_text.strip().strip('"').strip("'")
    if not path_text or "://" in path_text:
        return None
    try:
        path = Path(path_text)
        if not path.is_absolute():
            path = ROOT / path
        return path.resolve()
    except (OSError, ValueError):
        return None


def collect_changed_paths(payload: dict[str, Any]) -> list[Path]:
    text = "\n".join(walk_strings(payload))
    paths: set[Path] = set()
    for env_key in ("CLAUDE_FILE_PATH", "CODEX_FILE_PATH", "FILE_PATH"):
        env_path = os.environ.get(env_key)
        if env_path:
            n = normalize_path(env_path)
            if n:
                paths.add(n)
    for match in re.finditer(r"^\*\*\* (?:Add|Update|Delete) File: (.+)$", text, re.MULTILINE):
        n = normalize_path(match.group(1))
        if n:
            paths.add(n)
    return sorted(p for p in paths if p.exists())


def run_background(command: list[str], cwd: Path) -> None:
    exe = command[0]
    if shutil.which(exe) is None and not (cwd / exe).exists():
        return
    try:
        subprocess.Popen(command, cwd=str(cwd), stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL,
                         start_new_session=True)
    except OSError:
        return


def rel_to(base: Path, paths: list[Path], suffixes: set[str]) -> list[str]:
    rels = []
    for path in paths:
        if path.suffix.lower() not in suffixes:
            continue
        try:
            rels.append(str(path.relative_to(base)))
        except ValueError:
            continue
    return rels


def maintain_frontend(paths: list[Path]) -> None:
    fdir = str(FMT.get("frontend_dir") or "").strip()
    if not fdir:
        return
    base = ROOT if fdir == "." else (ROOT / fdir)
    if not base.exists():
        return
    if FMT.get("eslint"):
        files = rel_to(base, paths, {".ts", ".tsx", ".js", ".jsx"})
        if files:
            run_background(["npx", "--no-install", "eslint", "--fix", *files], base)
    if FMT.get("prettier"):
        files = rel_to(base, paths, {".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".scss", ".md", ".yml", ".yaml"})
        if files:
            run_background(["npx", "--no-install", "prettier", "--write", *files], base)


def maintain_index(paths: list[Path]) -> None:
    tool = str(IDX.get("tool") or "").strip()
    if not tool or shutil.which(tool) is None:
        return
    exts = {str(e).lower() for e in (IDX.get("extensions") or [])}
    if not exts:
        return
    for path in paths:
        if path.suffix.lower() in exts:
            run_background([tool, "project", "index-file", str(path), str(ROOT)], ROOT)


def main() -> None:
    payload = read_payload()
    paths = collect_changed_paths(payload)
    maintain_frontend(paths)
    maintain_index(paths)
    print("{}")


if __name__ == "__main__":
    main()
