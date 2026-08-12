#!/usr/bin/env python3
"""Pre-tool guardrails — cross-tool (Claude Code + Codex).

Читает настройки из .ai/hooks.config.json (stdlib json, без YAML-зависимостей).
Без конфига работает generic-защита: деструктив, force-push, ветки main/master,
запись .env/ключей. Project-specific проверки (поддеревья, миграции, доп. секреты)
включаются конфигом.

Подключение:
  .claude/settings.json -> hooks.PreToolUse (matcher "Edit|Write|MultiEdit|Bash")
  .ai/hooks.json        -> hooks.PreToolUse (Codex)
exit(2) = блокировать действие.
"""

from __future__ import annotations

import fnmatch
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(
    os.environ.get("CLAUDE_PROJECT_DIR")
    or os.environ.get("CODEX_PROJECT_DIR")
    or os.getcwd()
).resolve()

DEFAULTS = {
    "protected_branches": ["main", "master"],
    "subtree_roots": [],
    "migrations": {"immutable": True, "dir_markers": [], "extensions": []},
    "secrets": {"extra_globs": []},
}


def load_config() -> dict[str, Any]:
    try:
        with open(ROOT / ".ai" / "hooks.config.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


CFG = load_config()


def cfg_get(key: str) -> Any:
    return CFG.get(key, DEFAULTS.get(key))


def read_payload() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {"_raw": raw}
    return payload if isinstance(payload, dict) else {"payload": payload}


def as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=True)
    except TypeError:
        return str(value)


def walk_strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from walk_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_strings(child)


def payload_text(payload: dict[str, Any]) -> str:
    return "\n".join([as_text(payload), *walk_strings(payload)])


def walk_path_values(value: Any) -> Iterable[str]:
    path_keys = {"path", "file", "filepath", "file_path", "filename"}
    if isinstance(value, dict):
        for key, child in value.items():
            nk = str(key).lower()
            if isinstance(child, str) and (nk in path_keys or nk.endswith("path")):
                yield child
            else:
                yield from walk_path_values(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_path_values(child)


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


def extract_paths(payload: dict[str, Any], text: str) -> set[Path]:
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
    for value in walk_path_values(payload):
        if "\n" in value or len(value) > 300:
            continue
        n = normalize_path(value)
        if n and ROOT in (n, *n.parents):
            paths.add(n)
    return paths


# --- Проверки ---------------------------------------------------------------

def _alt(names: list[str]) -> str:
    return "|".join(re.escape(n) for n in names if n)


def blocks_destructive_command(text: str) -> str | None:
    checks = [
        (r"\bgit\s+reset\s+--hard\b", "Refusing destructive git reset."),
        (r"\bgit\s+clean\b(?=[^\n]*-[^\n]*f)(?=[^\n]*-[^\n]*d)", "Refusing destructive git clean."),
        (r"\bgit\s+push\b[^\n]*\s--force(?:-with-lease)?\b", "Refusing force push."),
        (r"\bdocker\s+compose\s+down\b[^\n]*\s-v\b", "Refusing docker compose down -v (deletes volumes)."),
        (r"\bdocker\s+volume\s+(?:rm|prune)\b", "Refusing docker volume deletion."),
        (r"\bdocker\s+system\s+prune\b[^\n]*--volumes\b", "Refusing docker system prune --volumes."),
        (r"\brm\s+-[^\n]*r[^\n]*f[^\n]*\s+(?:/|\*|\.|\.\/|~|\$HOME)(?:\s|$)", "Refusing broad rm -rf."),
    ]
    roots = [str(r) for r in (cfg_get("subtree_roots") or [])]
    if roots:
        alt = _alt(roots)
        checks += [
            (rf"\brm\s+-[^\n]*r[^\n]*f[^\n]*\s+(?:{alt})(?:\s|/|$)", "Refusing rm -rf of a protected subtree root."),
            (rf"\bgit\s+checkout\s+--\s+(?:\.|{alt})\b", "Refusing destructive git checkout of a subtree."),
            (rf"\bgit\s+restore\b[^\n]*\b(?:\.|{alt})\b", "Refusing broad git restore of a subtree."),
        ]
    for pattern, reason in checks:
        if re.search(pattern, text):
            return reason
    return None


def blocks_protected_branch_push(text: str) -> str | None:
    if os.environ.get("CODEX_ALLOW_MAIN_PUSH") == "1":
        return None
    branches = [str(b) for b in (cfg_get("protected_branches") or [])]
    if not branches:
        return None
    alt = _alt(branches)
    reason = "Protected branch: do not push directly. Merge through a PR."
    for pattern in (
        rf"\bgit\s+push\b[^\n]*?\s(?:{alt})(?:\s|$)",
        rf"\bgit\s+push\b[^\n]*?:(?:{alt})(?:\s|$)",
    ):
        if re.search(pattern, text):
            return reason
    return None


def _is_migration(path: Path, mig: dict[str, Any]) -> bool:
    exts = [str(e) for e in (mig.get("extensions") or [])]
    markers = set(str(m) for m in (mig.get("dir_markers") or []))
    if not exts or not markers:
        return False
    if path.suffix not in exts:
        return False
    return bool(markers & set(path.parts))


def blocks_existing_migration_edit(text: str, paths: set[Path]) -> str | None:
    mig = cfg_get("migrations") or {}
    if not mig.get("immutable", True):
        return None
    reason = "Existing migrations are immutable. Add a new migration instead."
    for match in re.finditer(r"^\*\*\* (Update|Delete) File: (.+)$", text, re.MULTILINE):
        n = normalize_path(match.group(2))
        if n and _is_migration(n, mig):
            return reason
    for path in paths:
        if _is_migration(path, mig) and path.exists():
            return reason
    return None


def _is_secret_file(path: Path, extra_globs: list[str]) -> bool:
    name = path.name.lower()
    allowed = (".example", ".sample", ".template", ".dist")
    if name.startswith(".env") and not name.endswith(allowed):
        return True
    if path.suffix.lower() in {".pem", ".key", ".pfx", ".p12"} and not name.endswith(".pub"):
        return True
    for glob in extra_globs:
        if fnmatch.fnmatch(path.name, glob):
            return True
    return False


def blocks_secret_write(text: str, paths: set[Path]) -> str | None:
    extra = [str(g) for g in ((cfg_get("secrets") or {}).get("extra_globs") or [])]
    for path in paths:
        if _is_secret_file(path, extra):
            try:
                disp = path.relative_to(ROOT)
            except ValueError:
                disp = path
            return f"Refusing to write likely secret/local config file: {disp}"
    return None


def block(reason: str) -> None:
    print(json.dumps({"decision": "block", "reason": reason}))
    sys.exit(2)


def main() -> None:
    payload = read_payload()
    text = payload_text(payload)
    paths = extract_paths(payload, text)
    for check in (
        lambda: blocks_destructive_command(text),
        lambda: blocks_protected_branch_push(text),
        lambda: blocks_existing_migration_edit(text, paths),
        lambda: blocks_secret_write(text, paths),
    ):
        reason = check()
        if reason:
            block(reason)
    print("{}")
    sys.exit(0)


if __name__ == "__main__":
    main()
