# AI Starter Kit

Установщик AI-конфигурации проекта: **один канон `.ai/`** (skills, rules, hooks, subagents, MCP) с материализацией в **Claude Code** и **Codex**. Собран по методичке из Obsidian-вейлта `Obsidian/AI`.

## Установка (доступ по запросу)

Репозиторий **приватный** — доступ выдаётся точечно. Одобренный человек (добавлен в Collaborators) ставит установщик под своим GitHub-доступом. Глобально — так появляется короткая команда `ai-starter`:

```bash
npm install -g git+ssh://git@github.com/123kapefa/ai-starter-kit.git
```

Затем в корне своего проекта:

```bash
ai-starter init
```

Опросник (с авто-детектом стека) → покажет план → создаст `.ai/` и `AGENTS.md` только после подтверждения. Подключить к Claude Code / Codex и проверить:

```bash
bash .ai/setup.sh
```

```bash
ai-starter doctor
```

Разово, без глобальной установки:

```bash
npx git+ssh://git@github.com/123kapefa/ai-starter-kit.git init
```

> Требуется **Node ≥ 18** (CLI) и **Python 3** (хуки профиля `safe`). Нужен SSH-ключ, привязанный к GitHub. Публичная форма `npx github:123kapefa/…` для приватного репо **не работает** — используйте `git+ssh://` выше.

### Выдать доступ (владельцу репозитория)

На каждый запрос: GitHub → репозиторий → **Settings → Collaborators → Add people** → username. Отозвать доступ — убрать оттуда (человек больше не поставит и не обновит).

### Без доступа к GitHub — tarball

Можно вообще не давать доступ к репозиторию: `npm pack` и отправить `.tgz` только одобренным. Получатель ставит из файла:

```bash
npm install -g ./ai-starter-kit-0.1.0.tgz
```

### Коллеге на том же проекте кит не нужен

Если `.ai/` уже закоммичен в репозиторий проекта, достаточно `git pull && bash .ai/setup.sh`.

## Команды

| Команда | Что делает |
|---|---|
| `ai-starter init` | Опросник с авто-детектом стека → показывает план → пишет `.ai/`, `AGENTS.md`, `project.yml` только после подтверждения. Существующие файлы не трогает. |
| `ai-starter doctor` | Проверяет структуру `.ai/`, подключение хуков к Claude, материализацию скилов/правил/агентов, наличие `python3`. |
| `ai-starter update` | Приносит изменения шаблонов (diff), не перетирая локальные правки. |
| `bash .ai/setup.sh` | Материализует `.ai/` → `.claude/` + `~/.claude/skills` + `~/.codex/skills`. |

## Две установки

- **В репозиторий** (`init`) — `AGENTS.md`, `.ai/…` в Git, общее для команды.
- **На машину** (`setup.sh`) — симлинки скилов, `.claude/settings.json` (хуки), `.claude/agents`, `.claude/rules`; локально у каждого.

`.ai/` — единственный источник правды; `.claude/` **генерируется**, руками не редактируется.

## Профили

- **minimal** — `AGENTS.md`, `project.yml`, скилы `feature`+`fix-bug`, базовые правила, `setup.sh`.
- **standard** — + все 17 скилов, 6 правил, 8 субагентов, `CONTEXT.md`/ADR, references, MCP-доки.
- **safe** — + Python-хуки (секреты, миграции, защищённые ветки, деструктив).

## Хуки (safe)

Python-гарды на чистой stdlib (работают и в Claude, и в Codex). Project-specific настройки (ветки, поддеревья, стиль миграций, секрет-файлы, форматтеры, индексатор) собираются опросником `init` и живут в `.ai/hooks.config.json`. Без конфига действует generic-защита (деструктив, force-push, `.env`/ключи, `main`/`master`).

## Требования

- Node.js ≥ 18 (CLI, без внешних зависимостей).
- Python 3 (для хуков профиля `safe`).
- macOS / Linux. На Windows `init`/`doctor`/`update` работают, но `bash .ai/setup.sh` (bash + симлинки) — через WSL или Git Bash.
