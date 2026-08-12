// ai-starter doctor — проверка структуры .ai/ и материализации в Claude/Codex.
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { c, exists, readFileSafe, walkFiles } from './fsutil.mjs';

function hasTool(name) {
  try {
    execSync(`command -v ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function runDoctor(ctx) {
  const { cwd } = ctx;
  let fails = 0;
  let warns = 0;
  const ok = (m) => console.log(`  ${c.green('OK')}    ${m}`);
  const warn = (m) => {
    warns += 1;
    console.log(`  ${c.yellow('WARN')}  ${m}`);
  };
  const fail = (m) => {
    fails += 1;
    console.log(`  ${c.red('FAIL')}  ${m}`);
  };

  console.log(c.bold('\n🩺 ai-starter doctor') + c.dim(`  (${cwd})`));

  const aiDir = path.join(cwd, '.ai');
  if (!exists(aiDir)) {
    fail('.ai/ не найден. Запустите: ai-starter init');
    console.log(c.red('\n1 FAIL') + ' — установка не найдена.');
    process.exitCode = 1;
    return;
  }
  ok('.ai/ на месте');

  exists(path.join(aiDir, 'project.yml')) ? ok('.ai/project.yml есть') : fail('.ai/project.yml отсутствует');
  exists(path.join(aiDir, '.starter-manifest.json'))
    ? ok('манифест установки есть')
    : warn('манифест отсутствует (update не сможет сравнить)');

  // AGENTS.md и его размер
  const agents = readFileSafe(path.join(cwd, 'AGENTS.md'));
  if (agents == null) {
    fail('AGENTS.md отсутствует');
  } else {
    const n = agents.split('\n').length;
    if (n < 40 || n > 100) warn(`AGENTS.md ~${n} строк (рекомендуется 40–100)`);
    else ok(`AGENTS.md ~${n} строк`);
  }

  // Скилы и их материализация
  const skills = walkFiles(path.join(aiDir, 'skills')).filter((f) => f.endsWith('SKILL.md'));
  if (skills.length) {
    ok(`скилов установлено: ${skills.length}`);
    const homeSkills = path.join(os.homedir(), '.claude', 'skills');
    if (exists(homeSkills)) ok('~/.claude/skills существует (материализация есть)');
    else warn('~/.claude/skills нет — выполните: bash .ai/setup.sh');
  }

  // Правила и агенты
  const rules = walkFiles(path.join(aiDir, 'rules')).filter((f) => f.endsWith('.md'));
  if (rules.length) {
    exists(path.join(cwd, '.claude', 'rules'))
      ? ok(`правил: ${rules.length}, .claude/rules есть`)
      : warn(`правил: ${rules.length}, но .claude/rules нет (setup.sh)`);
  }
  const agentFiles = walkFiles(path.join(aiDir, 'agents')).filter((f) => f.endsWith('.md'));
  if (agentFiles.length) {
    exists(path.join(cwd, '.claude', 'agents'))
      ? ok(`субагентов: ${agentFiles.length}, .claude/agents есть`)
      : warn(`субагентов: ${agentFiles.length}, но .claude/agents нет (setup.sh)`);
  }

  // Хуки (safe-профиль)
  const preGuard = path.join(aiDir, 'hooks', 'pre_tool_guard.py');
  if (exists(preGuard)) {
    hasTool('python3') ? ok('python3 доступен (хуки смогут работать)') : fail('python3 не найден — хуки не запустятся');

    const cfg = readFileSafe(path.join(aiDir, 'hooks.config.json'));
    if (cfg == null) warn('.ai/hooks.config.json нет — хуки на safe-дефолтах');
    else {
      try {
        JSON.parse(cfg);
        ok('.ai/hooks.config.json валиден');
      } catch {
        fail('.ai/hooks.config.json не парсится');
      }
    }

    const settings = readFileSafe(path.join(cwd, '.claude', 'settings.json'));
    if (settings && settings.includes('pre_tool_guard')) ok('хуки подключены к Claude (.claude/settings.json)');
    else warn('хуки не подключены к Claude — иначе в Claude они молчат (setup.sh)');
  }

  const tag = fails ? c.red(`${fails} FAIL`) : warns ? c.yellow(`${warns} WARN`) : c.green('всё OK');
  console.log(`\n${c.bold('Итог:')} ${tag}`);
  if (fails) process.exitCode = 1;
}
