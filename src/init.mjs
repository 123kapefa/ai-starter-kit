// ai-starter init — опросник (детект + подтверждение), план, безопасная запись.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { c, exists, writeFileEnsured, sha256 } from './fsutil.mjs';
import { createPrompter } from './prompts.mjs';
import { detectProject } from './detect.mjs';
import { resolveFiles, PROFILES, PROFILE_INFO } from './profiles.mjs';
import { buildProjectYml, buildHooksConfig } from './projectyml.mjs';
import { computePlan, renderPlan, countCreate } from './plan.mjs';

const MCP_SERVERS = ['serena', 'postgres', 'redis', 'grafana', 'admin'];
const MCP_HINT = {
  serena: 'навигация по коду',
  postgres: 'диагностика БД',
  redis: 'кэш и очереди',
  grafana: 'логи и метрики',
  admin: 'доменные операции через admin API',
};

function parseList(str) {
  return (str || '')
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function guessTest(stack, cwd) {
  if (/\.NET/.test(stack)) return 'dotnet test';
  if (exists(path.join(cwd, 'package.json'))) return 'npm test';
  if (/Django|Python/.test(stack)) return 'pytest';
  if (/Go/.test(stack)) return 'go test ./...';
  return '';
}

export async function runInit(ctx) {
  const { cwd, templatesDir, version } = ctx;
  const d = detectProject(cwd);

  console.log(c.bold('\n🚀 ai-starter init') + c.dim(`  (${cwd})`));
  console.log(c.dim('Собираю AI-конфигурацию проекта. Ничего не запишу без подтверждения.\n'));
  console.log(`${c.dim('Обнаружено:')} стек ${c.cyan(d.stack)}`);
  if (d.topDirs.length) console.log(`${c.dim('Папки верхнего уровня:')} ${d.topDirs.join(', ')}`);
  console.log('');

  const p = createPrompter();
  try {
    const answers = {};
    answers.projectName = await p.ask('Имя проекта', path.basename(cwd), {
      hint: 'как проект будет назван в AGENTS.md',
    });
    answers.stack = await p.ask('Стек', d.stack === 'неизвестно' ? '' : d.stack, {
      hint: 'напр. «.NET + React»; влияет на детект миграций и подсказки по умолчанию',
    });
    answers.tracker = await p.ask('Трекер задач', '', {
      hint: 'напр. GitHub Projects, Linear — попадёт в AGENTS.md и docs/agents',
    });

    answers.protectedBranches = parseList(
      await p.ask('Защищённые ветки', d.protectedBranches.join(', '), {
        hint: 'прямой push в них заблокирует хук; через запятую',
      }),
    );
    answers.subtreeRoots = parseList(
      await p.ask('Поддеревья под защитой', d.topDirs.join(', '), {
        hint: 'корни, которые нельзя снести rm -rf / git checkout; напр. backend, frontend',
      }),
    );

    const migImmutable = await p.confirm('Защищать существующие миграции от правки?', d.migrations.extensions.length > 0, {
      hint: 'хук запретит правку уже применённых миграций — изменения только новой миграцией',
    });
    answers.migrations = { immutable: migImmutable, dir_markers: [], extensions: [] };
    if (migImmutable) {
      answers.migrations.dir_markers = parseList(
        await p.ask('Папки миграций (маркеры пути)', d.migrations.dir_markers.join(', '), {
          hint: 'сегмент пути папки миграций — EF: Migrations, Django/Alembic: migrations или versions',
        }),
      );
      answers.migrations.extensions = parseList(
        await p.ask('Расширения файлов миграций', d.migrations.extensions.join(', '), {
          hint: 'тип файлов миграций — EF: .cs, Python: .py, Rails: .rb',
        }),
      );
    }

    const defSecrets = /\.NET/.test(d.stack) ? 'appsettings.*.json, secrets.json' : '';
    answers.secretsExtraGlobs = parseList(
      await p.ask('Доп. секрет-файлы', defSecrets, {
        hint: 'globs, запрет записи — плюс к .env/*.pem/*.key; напр. appsettings.*.json',
      }),
    );

    answers.testCmd = await p.ask('Команда тестов', guessTest(d.stack, cwd), {
      hint: 'чем прогонять тесты — попадёт в AGENTS.md; напр. dotnet test, npm test',
    });
    answers.lintCmd = await p.ask('Команда линта/сборки', d.frontend.dir ? 'npm run lint' : '', {
      hint: 'напр. npm run lint, dotnet build',
    });

    answers.frontendDir = await p.ask('Папка фронтенда (пусто — нет)', d.frontend.dir || '', {
      hint: 'для авто-форматирования после правок фронта; пусто — выключено',
    });
    if (answers.frontendDir) {
      answers.eslint = await p.confirm('eslint --fix после правок фронта?', d.frontend.formatters.eslint);
      answers.prettier = await p.confirm('prettier --write после правок?', d.frontend.formatters.prettier);
    }

    answers.indexTool = await p.ask('Индексатор кода (пусто — нет)', d.indexTool, {
      hint: 'семантический индекс кода; напр. serena — ускоряет навигацию агента',
    });
    answers.indexExtensions = answers.indexTool
      ? parseList(await p.ask('Расширения для индексации', '.cs, .ts, .tsx, .js, .jsx'))
      : [];

    answers.mcp = await p.multiSelect(
      'Какие MCP-серверы включить',
      MCP_SERVERS.map((s) => ({ label: `${s} — ${MCP_HINT[s]}`, value: s })),
      [],
      { hint: 'доступ к внешним системам; по умолчанию — ничего (безопасно)' },
    );

    answers.profile = await p.select(
      'Профиль установки',
      PROFILES.map((n) => ({ label: `${n} — ${PROFILE_INFO[n]}`, value: n })),
      1,
      { hint: 'minimal ⊂ standard ⊂ safe; поднять уровень можно позже через update' },
    );

    // Сборка списка файлов и генерируемого контента
    const files = resolveFiles(answers.profile, templatesDir);
    const extra = [{ dest: '.ai/project.yml', content: buildProjectYml(answers) }];
    if (answers.profile === 'safe') {
      extra.push({
        dest: '.ai/hooks.config.json',
        content: JSON.stringify(buildHooksConfig(answers), null, 2) + '\n',
      });
    }

    const vars = {
      project_name: answers.projectName,
      stack: answers.stack || 'неизвестно',
      tracker: answers.tracker || '—',
      test_cmd: answers.testCmd || '<команда тестов>',
      lint_cmd: answers.lintCmd || '<команда линта/сборки>',
      frontend_dir: answers.frontendDir || 'frontend',
      protected_branches: (answers.protectedBranches || []).join(', ') || 'main',
    };

    const plan = computePlan(files, cwd, vars, extra);
    console.log(renderPlan(plan));

    if (countCreate(plan) === 0) {
      console.log(c.yellow('\nНечего создавать — всё уже на месте. Обновление: ai-starter update'));
      return;
    }

    const go = await p.confirm('\nПрименить?', false);
    if (!go) {
      console.log(c.dim('Отменено. Ничего не записано.'));
      return;
    }

    // Запись только новых файлов; существующие не трогаем
    let written = 0;
    const manifest = { generator: 'ai-starter-kit', version, profile: answers.profile, files: {} };
    for (const e of plan.entries) {
      manifest.files[e.dest] = sha256(e.content);
      if (e.status !== 'create') continue;
      writeFileEnsured(path.join(cwd, e.dest), e.content, { mode: e.mode });
      written += 1;
    }
    writeFileEnsured(
      path.join(cwd, '.ai/.starter-manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    );
    console.log(c.green(`\n✓ Записано файлов: ${written}.`));

    // Предложить материализацию «на машину»
    if (exists(path.join(cwd, '.ai/setup.sh'))) {
      const runSetup = await p.confirm('Запустить bash .ai/setup.sh (подключить к Claude Code / Codex)?', false);
      if (runSetup) {
        try {
          console.log(c.dim('\n$ bash .ai/setup.sh'));
          execFileSync('bash', ['.ai/setup.sh'], { cwd, stdio: 'inherit' });
        } catch {
          console.log(c.yellow('setup.sh завершился с ошибкой — запустите вручную: bash .ai/setup.sh'));
        }
      } else {
        console.log(c.dim('Пропущено. Позже: bash .ai/setup.sh'));
      }
    }

    console.log(c.bold('\nГотово. Проверьте установку: ') + c.cyan('ai-starter doctor'));
  } finally {
    p.close();
  }
}
