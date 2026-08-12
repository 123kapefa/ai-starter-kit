#!/usr/bin/env python3
"""Best-effort Stop-hook maintenance: полная переиндексация репо индексатором
из .ai/hooks.config.json (index.tool). Подключение: Stop hook. No-op без tool.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
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


def main() -> None:
    idx = (load_config().get("index") or {})
    tool = str(idx.get("tool") or "").strip()
    if tool and shutil.which(tool) is not None:
        try:
            subprocess.Popen([tool, "project", "index", str(ROOT)], cwd=str(ROOT),
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             stdin=subprocess.DEVNULL, start_new_session=True)
        except OSError:
            pass
    print(json.dumps({}))


if __name__ == "__main__":
    main()
