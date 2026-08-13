// ai-starter init — выбор стека (бэк+фронт) → вывод конфигурации → сводка → запись.
import path from 'node:path';
import { c, exists, writeFileEnsured, sha256 } from './fsutil.mjs';
import { createPrompter } from './prompts.mjs';
import { runSetup } from './setup.mjs';
import { detectProject } from './detect.mjs';
import { resolveFiles, PROFILES, PROFILE_INFO } from './profiles.mjs';
import { buildProjectYml, buildHooksConfig } from './projectyml.mjs';
import { computePlan, renderPlan, countCreate } from './plan.mjs';
import { BACKENDS, FRONTENDS, deriveConfig } from './stacks.mjs';

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

function labelOf(list, key) {
  return (list.find((o) => o.key === key) || {}).label || key;
}

function printSummary(a) {
  const row = (k, v) => console.log(`  ${c.dim(k.padEnd(19))}${v}`);
  const mig = a.migrations.immutable
    ? `immutable · ${(a.migrations.dir_markers || []).join('/')}/*${(a.migrations.extensions || []).join(',')}`
    : c.dim('не защищаются');
  const fmt = a.frontendDir
    ? `${a.frontendDir} · ${[a.eslint && 'eslint', a.prettier && 'prettier'].filter(Boolean).join(' + ') || '—'}`
    : c.dim('выкл');
  console.log(c.bold(`\nКонфигурация (стек: ${a.stack}):`));
  row('тесты:', a.testCmd || c.dim('—'));
  row('линт / сборка:', a.lintCmd || c.dim('—'));
  row('защищённые ветки:', (a.protectedBranches || []).join(', ') || c.dim('—'));
  row('поддеревья:', (a.subtreeRoots || []).join(', ') || c.dim('—'));
  row('миграции:', mig);
  row('секреты:', ['.env*', '*.pem', '*.key', ...(a.secretsExtraGlobs || [])].join(', '));
  row('индекс:', a.indexTool ? `${a.indexTool} · ${(a.indexExtensions || []).join(' ')}` : c.dim('выкл'));
  row('формат фронта:', fmt);
  row('трекер:', a.tracker || c.dim('не задан'));
  row('профиль:', a.profile);
  row('MCP:', (a.mcp || []).join(', ') || c.dim('нет'));
}

async function editField(p, a) {
  const FIELDS = [
    { key: 'tracker', label: 'Трекер задач', type: 'text' },
    { key: 'testCmd', label: 'Команда тестов', type: 'text' },
    { key: 'lintCmd', label: 'Команда линта/сборки', type: 'text' },
    { key: 'protectedBranches', label: 'Защищённые ветки', type: 'list' },
    { key: 'subtreeRoots', label: 'Поддеревья под защитой', type: 'list' },
    { key: 'secretsExtraGlobs', label: 'Доп. секрет-файлы', type: 'list' },
    { key: 'migImmutable', label: 'Защищать миграции (вкл/выкл)', type: 'toggle' },
    { key: '__done', label: '← готово', type: 'done' },
  ];
  const key = await p.select('Что поправить?', FIELDS.map((f) => ({ label: f.label, value: f.key })), FIELDS.length - 1);
  const f = FIELDS.find((x) => x.key === key);
  if (!f || f.type === 'done') return;
  if (f.type === 'text') a[f.key] = await p.ask(f.label, a[f.key] || '');
  else if (f.type === 'list') a[f.key] = parseList(await p.ask(`${f.label} (через запятую)`, (a[f.key] || []).join(', ')));
  else if (f.type === 'toggle') a.migrations.immutable = await p.confirm('Защищать существующие миграции?', a.migrations.immutable);
}

export async function runInit(ctx) {
  const { cwd, templatesDir, version } = ctx;
  const d = detectProject(cwd);

  console.log(c.bold('\n🚀 ai-starter init') + c.dim(`  (${cwd})`));
  console.log(c.dim('Собираю AI-конфигурацию проекта. Ничего не запишу без подтверждения.'));
  const detBits = [];
  if (d.backend) detBits.push(labelOf(BACKENDS, d.backend));
  if (d.frontendFw) detBits.push(labelOf(FRONTENDS, d.frontendFw));
  if (detBits.length) console.log(`${c.dim('Обнаружено:')} ${detBits.join(', ')}`);
  console.log('');

  const p = createPrompter();
  try {
    const beDefault = Math.max(0, BACKENDS.findIndex((o) => o.key === d.backend));
    const backendKey = await p.select('Бэкенд-стек', BACKENDS.map((o) => ({ label: o.label, value: o.key })), beDefault, {
      hint: 'основной язык/фреймворк бэкенда — из него выводим тесты, миграции, секреты',
    });
    let backendName = '';
    if (backendKey === 'other') backendName = await p.ask('Название бэкенда (пусто — нет бэкенда)', '');

    const feDefault = Math.max(0, FRONTENDS.findIndex((o) => o.key === d.frontendFw));
    const frontendKey = await p.select('Фронтенд-стек', FRONTENDS.map((o) => ({ label: o.label, value: o.key })), feDefault, {
      hint: 'фреймворк фронта — для форматирования и индекса',
    });
    let frontendName = '';
    if (frontendKey === 'other') frontendName = await p.ask('Название фронта (пусто — нет фронта)', '');

    const profile = await p.select(
      'Профиль установки',
      PROFILES.map((n) => ({ label: `${n} — ${PROFILE_INFO[n]}`, value: n })),
      1,
      { hint: 'minimal ⊂ standard ⊂ safe; поднять уровень можно позже через update' },
    );

    const mcpDefault = d.indexTool === 'serena' ? ['serena'] : [];
    const mcp = await p.multiSelect(
      'Какие MCP-серверы включить',
      MCP_SERVERS.map((s) => ({ label: `${s} — ${MCP_HINT[s]}`, value: s })),
      mcpDefault,
      { hint: 'serena — локальная навигация по коду (безопасно); остальные — по потребности' },
    );

    // Вывод конфигурации из стека
    const derived = deriveConfig(backendKey, frontendKey, {
      backendName,
      frontendName,
      hasPrisma: d.hasPrisma,
      frontendDir: d.frontend.dir,
      protectedBranches: d.protectedBranches,
      subtreeRoots: d.topDirs,
    });

    const answers = {
      projectName: path.basename(cwd),
      tracker: '',
      profile,
      mcp,
      ...derived,
    };
    answers.indexTool = mcp.includes('serena') ? 'serena' : '';
    if (!answers.indexTool) answers.indexExtensions = [];

    // Сводка + правка отдельных пунктов
    let confirmed = false;
    while (!confirmed) {
      printSummary(answers);
      confirmed = await p.confirm('\nВсё верно?', true, { hint: 'n — поправить пункт' });
      if (!confirmed) await editField(p, answers);
    }

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

    let written = 0;
    const manifest = { generator: 'ai-starter-kit', version, profile: answers.profile, files: {} };
    for (const e of plan.entries) {
      manifest.files[e.dest] = sha256(e.content);
      if (e.status !== 'create') continue;
      writeFileEnsured(path.join(cwd, e.dest), e.content, { mode: e.mode });
      written += 1;
    }
    writeFileEnsured(path.join(cwd, '.ai/.starter-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(c.green(`\n✓ Записано файлов: ${written}.`));

    const doSetup = await p.confirm('Подключить к Claude Code / Codex сейчас?', false, {
      hint: 'материализует .ai/ в .claude/ и ~/.claude/skills — кросс-платформенно (без bash)',
    });
    if (doSetup) {
      try {
        runSetup(ctx);
      } catch (e) {
        console.log(c.yellow(`Не удалось материализовать: ${e?.message || e}. Позже: ai-starter setup`));
      }
    } else {
      console.log(c.dim('Пропущено. Позже: ai-starter setup'));
    }

    console.log(c.bold('\nГотово. Проверьте установку: ') + c.cyan('ai-starter doctor'));
  } finally {
    p.close();
  }
}
