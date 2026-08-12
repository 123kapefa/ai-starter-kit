// Утилиты файловой системы, вывода и хеширования. Только stdlib.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const noColor = process.env.NO_COLOR != null || !process.stdout.isTTY;
const wrap = (code) => (s) => (noColor ? String(s) : `[${code}m${s}[0m`);

export const c = {
  bold: wrap('1'),
  dim: wrap('2'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
};

export function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function readFileSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeFileEnsured(p, content, { mode } = {}) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content);
  if (mode != null) fs.chmodSync(p, mode);
}

// Рекурсивный список файлов внутри dir, пути — относительно dir (posix-разделители).
export function walkFiles(dir) {
  const out = [];
  if (!exists(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else out.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  }
  return out.sort();
}

// Подстановка {{key}} → value. Незаданные ключи оставляются как есть.
export function renderTemplate(text, vars) {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m,
  );
}
