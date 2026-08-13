#!/usr/bin/env node
// ai-starter — установщик AI-конфигурации проекта. Роутер команд.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSafe, c } from '../src/fsutil.mjs';
import { runInit } from '../src/init.mjs';
import { runDoctor } from '../src/doctor.mjs';
import { runUpdate } from '../src/update.mjs';
import { runSetup } from '../src/setup.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');
const templatesDir = path.join(pkgRoot, 'templates');
const pkg = JSON.parse(readFileSafe(path.join(pkgRoot, 'package.json')) || '{}');

const HELP = `${c.bold('ai-starter')} — установщик AI-конфигурации проекта (${pkg.version || '0.0.0'})

${c.bold('Использование:')}
  ai-starter init      опросник → каркас .ai/ + AGENTS.md (в репозиторий)
  ai-starter setup     материализовать .ai/ в Claude Code / Codex (кросс-платформенно)
  ai-starter doctor    проверить структуру и материализацию
  ai-starter update    принести изменения шаблонов (не трогая локальные правки)

${c.bold('Флаги:')}
  -h, --help           показать эту справку
  -v, --version        версия

После init выполните ${c.cyan('ai-starter setup')} — подключение к Claude Code / Codex («на машину»).`;

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const ctx = { cwd: process.cwd(), pkgRoot, templatesDir, version: pkg.version || '0.0.0' };

  if (cmd === '-v' || cmd === '--version') {
    console.log(pkg.version || '0.0.0');
    return;
  }
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    console.log(HELP);
    return;
  }

  switch (cmd) {
    case 'init':
      await runInit(ctx);
      break;
    case 'setup':
      runSetup(ctx);
      break;
    case 'doctor':
      runDoctor(ctx);
      break;
    case 'update':
      await runUpdate(ctx);
      break;
    default:
      console.log(c.red(`Неизвестная команда: ${cmd}`));
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(c.red('Ошибка: ') + (err?.stack || err));
  process.exitCode = 1;
});
