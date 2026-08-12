// Авто-детект проекта: стек, папки, миграции, фронт, индексатор. Только stdlib.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { exists, readFileSafe } from './fsutil.mjs';

const IGNORE_DIRS = new Set(['.git', 'node_modules', '.ai', '.claude', 'dist', 'build', 'bin', 'obj', '.venv', 'venv']);

function topDirs(cwd) {
  try {
    return fs
      .readdirSync(cwd, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !IGNORE_DIRS.has(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function hasAny(cwd, patterns) {
  // Плоская проверка на верхнем уровне + один уровень вложенности.
  const roots = [cwd, ...topDirs(cwd).map((d) => path.join(cwd, d))];
  for (const root of roots) {
    let names;
    try {
      names = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const name of names) {
      if (patterns.some((p) => (p instanceof RegExp ? p.test(name) : name === p))) return true;
    }
  }
  return false;
}

function detectStack(cwd) {
  const parts = [];
  if (hasAny(cwd, [/\.csproj$/, /\.sln$/])) parts.push('.NET');
  if (exists(path.join(cwd, 'go.mod'))) parts.push('Go');
  if (exists(path.join(cwd, 'manage.py'))) parts.push('Django');
  if (exists(path.join(cwd, 'Gemfile'))) parts.push('Rails');
  if (hasAny(cwd, ['pom.xml', 'build.gradle'])) parts.push('Java');
  const pkg = readFileSafe(path.join(cwd, 'package.json'));
  if (pkg) {
    if (/react|vite|next|vue|svelte/i.test(pkg)) parts.push('React/JS frontend');
    else parts.push('Node.js');
  }
  if (exists(path.join(cwd, 'pyproject.toml')) || exists(path.join(cwd, 'requirements.txt'))) {
    if (!parts.includes('Django')) parts.push('Python');
  }
  return parts.join(' + ');
}

function detectFrontend(cwd) {
  const candidates = ['frontend', 'web', 'client', 'ui', 'app'];
  const dirs = topDirs(cwd);
  let dir = null;
  for (const cand of candidates) {
    if (dirs.includes(cand) && exists(path.join(cwd, cand, 'package.json'))) {
      dir = cand;
      break;
    }
  }
  if (!dir && exists(path.join(cwd, 'package.json')) && dirs.length === 0) dir = '.';
  const formatters = { eslint: false, prettier: false };
  if (dir) {
    const pkg = readFileSafe(path.join(cwd, dir === '.' ? '' : dir, 'package.json')) || '';
    formatters.eslint = /"eslint"/.test(pkg);
    formatters.prettier = /"prettier"/.test(pkg);
  }
  return { dir, formatters };
}

function detectMigrations(cwd, stack) {
  if (/\.NET/.test(stack)) return { dir_markers: ['Migrations'], extensions: ['.cs'] };
  if (/Django|Python/.test(stack)) return { dir_markers: ['migrations', 'versions'], extensions: ['.py'] };
  if (/Rails/.test(stack)) return { dir_markers: ['migrate'], extensions: ['.rb'] };
  if (exists(path.join(cwd, 'prisma'))) return { dir_markers: ['migrations'], extensions: ['.sql'] };
  return { dir_markers: [], extensions: [] };
}

function detectTool(name) {
  try {
    execSync(`command -v ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function detectBranches(cwd) {
  try {
    const out = execSync('git branch --format=%(refname:short)', { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const protectedBranches = [];
    for (const b of ['main', 'master', 'dev', 'develop', 'staging']) {
      if (out.includes(b)) protectedBranches.push(b);
    }
    if (protectedBranches.length) return protectedBranches;
  } catch {
    /* not a git repo */
  }
  return ['main', 'master'];
}

export function detectProject(cwd) {
  const isGit = exists(path.join(cwd, '.git'));
  const dirs = topDirs(cwd);
  const entries = (() => {
    try {
      return fs.readdirSync(cwd).filter((n) => n !== '.git');
    } catch {
      return [];
    }
  })();
  const stack = detectStack(cwd) || 'неизвестно';
  const frontend = detectFrontend(cwd);
  return {
    isGit,
    isEmpty: entries.length === 0,
    isExisting: entries.length > 0,
    stack,
    topDirs: dirs,
    frontend,
    migrations: detectMigrations(cwd, stack),
    indexTool: detectTool('serena') ? 'serena' : '',
    protectedBranches: detectBranches(cwd),
  };
}
