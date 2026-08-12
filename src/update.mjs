// ai-starter update — принести изменения шаблонов, не перетирая локальные правки.
import path from 'node:path';
import { c, exists, readFileSafe, writeFileEnsured, renderTemplate, sha256 } from './fsutil.mjs';
import { createPrompter } from './prompts.mjs';
import { resolveFiles } from './profiles.mjs';

// Файлы, принадлежащие проекту, — update их не трогает.
const OWNED = new Set(['AGENTS.md', 'CONTEXT.md', '.ai/project.yml', '.ai/hooks.config.json']);
const isOwned = (dest) => OWNED.has(dest) || dest.startsWith('docs/');

export async function runUpdate(ctx) {
  const { cwd, templatesDir, version } = ctx;
  console.log(c.bold('\n⤴️  ai-starter update') + c.dim(`  (${cwd})`));

  if (!exists(path.join(cwd, '.ai'))) {
    console.log(c.red('.ai/ не найден. Сначала: ai-starter init'));
    process.exitCode = 1;
    return;
  }

  const manifestRaw = readFileSafe(path.join(cwd, '.ai/.starter-manifest.json'));
  const manifest = manifestRaw ? JSON.parse(manifestRaw) : { files: {}, profile: 'standard' };
  const profile = manifest.profile || 'standard';

  const files = resolveFiles(profile, templatesDir).filter((f) => !isOwned(f.dest));

  const newFiles = [];
  const upstream = []; // шаблон изменился, локальных правок нет — безопасно
  const conflicts = []; // локально изменён И шаблон изменился

  for (const f of files) {
    const raw = readFileSafe(f.src);
    if (raw == null) continue;
    const tpl = f.render ? renderTemplate(raw, {}) : raw;
    const tplHash = sha256(tpl);
    const projPath = path.join(cwd, f.dest);
    const installed = readFileSafe(projPath);

    if (installed == null) {
      newFiles.push({ ...f, content: tpl, tplHash });
      continue;
    }
    const instHash = sha256(installed);
    if (instHash === tplHash) continue; // установленный уже равен шаблону

    const manHash = manifest.files?.[f.dest];
    if (manHash && manHash === tplHash) continue; // шаблон не менялся с установки — разница чисто локальная
    if (manHash && manHash === instHash) upstream.push({ ...f, content: tpl, tplHash });
    else conflicts.push({ ...f, content: tpl, tplHash });
  }

  const applicable = [...newFiles, ...upstream];
  if (!applicable.length && !conflicts.length) {
    console.log(c.green('\nВсё актуально — обновлять нечего.'));
    return;
  }

  if (newFiles.length) {
    console.log(c.bold('\nНовые файлы:'));
    for (const f of newFiles) console.log(`  ${c.green('NEW')}     ${f.dest}`);
  }
  if (upstream.length) {
    console.log(c.bold('\nОбновления сверху (локальных правок нет):'));
    for (const f of upstream) console.log(`  ${c.blue('UPDATE')}  ${f.dest}`);
  }
  if (conflicts.length) {
    console.log(c.bold('\nЛокально изменены (не трогаю автоматически):'));
    for (const f of conflicts) console.log(`  ${c.yellow('LOCAL')}   ${f.dest}`);
  }

  if (applicable.length) {
    const p = createPrompter();
    let go;
    try {
      go = await p.confirm(`\nПрименить ${applicable.length} (NEW+UPDATE)?`, false);
    } finally {
      p.close();
    }
    if (go) {
      for (const f of applicable) {
        writeFileEnsured(path.join(cwd, f.dest), f.content, { mode: f.mode });
        if (manifest.files) manifest.files[f.dest] = f.tplHash;
      }
      manifest.version = version;
      writeFileEnsured(
        path.join(cwd, '.ai/.starter-manifest.json'),
        JSON.stringify(manifest, null, 2) + '\n',
      );
      console.log(c.green(`\n✓ Применено: ${applicable.length}.`));
    } else {
      console.log(c.dim('Отменено. Ничего не записано.'));
    }
  }

  if (conflicts.length) {
    console.log(
      c.dim(
        `\n${conflicts.length} файл(ов) с локальными правками пропущены. Сравните вручную и перенесите нужное из templates/.`,
      ),
    );
  }
}
