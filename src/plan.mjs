// Вычисление и отрисовка плана файлов. Существующие файлы не перетираются молча.
import path from 'node:path';
import { c, exists, readFileSafe, renderTemplate } from './fsutil.mjs';

// files: [{src, dest, render, mode}], vars — для подстановки в шаблоны.
// extra: [{dest, content, mode}] — сгенерированные файлы (project.yml и т.п.).
export function computePlan(files, projectDir, vars, extra = []) {
  const entries = [];
  for (const f of files) {
    const raw = readFileSafe(f.src);
    if (raw == null) continue; // отсутствующий шаблон пропускаем молча
    const content = f.render ? renderTemplate(raw, vars) : raw;
    entries.push({
      dest: f.dest,
      content,
      mode: f.mode,
      status: exists(path.join(projectDir, f.dest)) ? 'exists' : 'create',
    });
  }
  for (const e of extra) {
    entries.push({
      dest: e.dest,
      content: e.content,
      mode: e.mode,
      status: exists(path.join(projectDir, e.dest)) ? 'exists' : 'create',
    });
  }
  return { entries };
}

export function renderPlan(plan) {
  const create = plan.entries.filter((e) => e.status === 'create');
  const skip = plan.entries.filter((e) => e.status === 'exists');
  const lines = [];
  lines.push(c.bold('\nПлан изменений (ничего ещё не записано):'));
  if (create.length) {
    for (const e of create) lines.push(`  ${c.green('СОЗДАТЬ')}  ${e.dest}`);
  }
  if (skip.length) {
    lines.push(c.dim(`\n  Пропущено (уже существует, не трогаю):`));
    for (const e of skip) lines.push(c.dim(`  ПРОПУСК   ${e.dest}`));
  }
  lines.push(
    `\n${c.bold('Итого:')} создать ${c.green(create.length)}, пропустить ${c.dim(skip.length)}.`,
  );
  return lines.join('\n');
}

export function countCreate(plan) {
  return plan.entries.filter((e) => e.status === 'create').length;
}
