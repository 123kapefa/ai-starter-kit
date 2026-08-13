// Кросс-платформенная материализация канона .ai/ в нативные форматы
// Claude Code и Codex. Работает на Windows / macOS / Linux (без bash).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { c, exists, ensureDir, readFileSafe, writeFileEnsured } from './fsutil.mjs';

const isWin = process.platform === 'win32';
const ok = (m) => console.log(`  ${c.green('✓')} ${m}`);
const dim = (m) => console.log(`  ${c.dim(m)}`);
const warn = (m) => console.log(`  ${c.yellow('!')} ${m}`);

function copyDir(src, dst) {
  ensureDir(dst);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// Симлинк директории; на Windows — junction (не требует прав администратора).
// Если симлинк недоступен — откатываемся на копирование.
function linkDir(src, dst) {
  try {
    if (exists(dst)) fs.rmSync(dst, { recursive: true, force: true });
    fs.symlinkSync(src, dst, isWin ? 'junction' : 'dir');
    return 'link';
  } catch {
    try {
      if (exists(dst)) fs.rmSync(dst, { recursive: true, force: true });
      copyDir(src, dst);
      return 'copy';
    } catch {
      return 'fail';
    }
  }
}

function linkSkills(skillsRoot, home) {
  ensureDir(home);
  let linked = 0;
  let copied = 0;
  for (const name of fs.readdirSync(skillsRoot)) {
    const src = path.join(skillsRoot, name);
    if (!fs.statSync(src).isDirectory()) continue;
    const res = linkDir(src, path.join(home, name));
    if (res === 'link') linked += 1;
    else if (res === 'copy') copied += 1;
  }
  const note = copied ? ` (${linked} симлинков, ${copied} копий)` : '';
  ok(`скилов: ${linked + copied} → ${home}${note}`);
}

function copyMdInto(srcDir, dstDir, label) {
  if (!exists(srcDir)) return;
  ensureDir(dstDir);
  let n = 0;
  for (const name of fs.readdirSync(srcDir)) {
    if (!name.endsWith('.md')) continue;
    fs.copyFileSync(path.join(srcDir, name), path.join(dstDir, name));
    n += 1;
  }
  if (n) ok(`${label}: ${n} → ${path.basename(path.dirname(dstDir))}/${path.basename(dstDir)}`);
}

function wireHooks(ai, cwd) {
  const src = path.join(ai, 'hooks', 'settings.hooks.json');
  if (!exists(src)) return;
  let block;
  try {
    block = JSON.parse(readFileSafe(src) || '{}');
  } catch {
    warn('.ai/hooks/settings.hooks.json не парсится — хуки не подключены');
    return;
  }
  const dst = path.join(cwd, '.claude', 'settings.json');
  let data = {};
  if (exists(dst)) {
    try {
      data = JSON.parse(readFileSafe(dst) || '{}');
    } catch {
      data = {};
    }
  }
  data.hooks = block.hooks || {};
  writeFileEnsured(dst, JSON.stringify(data, null, 2) + '\n');
  ok('хуки → .claude/settings.json');
}

export function runSetup(ctx) {
  const { cwd } = ctx;
  const ai = path.join(cwd, '.ai');
  if (!exists(ai)) {
    console.log(c.red('.ai/ не найден. Сначала: ai-starter init'));
    process.exitCode = 1;
    return;
  }

  console.log(c.bold('\n🔗 materialize .ai/ → Claude Code + Codex') + c.dim(`  (${cwd})`));

  const skillsRoot = path.join(ai, 'skills');
  if (exists(skillsRoot)) {
    linkSkills(skillsRoot, path.join(os.homedir(), '.claude', 'skills'));
    linkSkills(skillsRoot, path.join(os.homedir(), '.codex', 'skills'));
  }

  copyMdInto(path.join(ai, 'agents'), path.join(cwd, '.claude', 'agents'), 'субагентов');
  copyMdInto(path.join(ai, 'rules'), path.join(cwd, '.claude', 'rules'), 'правил');
  wireHooks(ai, cwd);

  if (exists(path.join(ai, 'mcp'))) dim('MCP по умолчанию выключены (см. .ai/mcp/, включать отдельно)');

  console.log(c.bold('\nГотово.') + ' Проверка: ' + c.cyan('ai-starter doctor'));
}
