// Профили установки: какие файлы шаблонов входят в minimal / standard / safe.
import fs from 'node:fs';
import path from 'node:path';
import { walkFiles, exists } from './fsutil.mjs';

export const PROFILES = ['minimal', 'standard', 'safe'];

export const PROFILE_INFO = {
  minimal: 'AGENTS.md, project.yml, скилы feature+fix-bug, базовые правила, setup.sh',
  standard: '+ все скилы, правила, субагенты, CONTEXT/ADR, references, MCP-доки',
  safe: '+ Python-хуки (секреты, миграции, защищённые ветки, деструктив)',
};

const MINIMAL_SKILLS = ['feature', 'fix-bug'];

export function listSkillDirs(templatesDir) {
  const skillsRoot = path.join(templatesDir, '.ai/skills');
  if (!exists(skillsRoot)) return [];
  return fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

// Возвращает [{ src (абс.), dest (относит. проекта), render, mode }].
// project.yml и hooks.config.json генерируются отдельно и здесь не участвуют.
export function resolveFiles(profile, templatesDir) {
  const T = (rel) => path.join(templatesDir, rel);
  const files = [];
  const add = (srcRel, destRel) =>
    files.push({
      src: T(srcRel),
      dest: destRel,
      render: !srcRel.endsWith('.py'),
      mode: srcRel.endsWith('.sh') ? 0o755 : undefined,
    });

  // Всегда
  add('AGENTS.md', 'AGENTS.md');
  add('.ai/setup.sh', '.ai/setup.sh');
  for (const f of walkFiles(T('.ai/rules'))) add(`.ai/rules/${f}`, `.ai/rules/${f}`);

  const chosen = profile === 'minimal' ? MINIMAL_SKILLS : listSkillDirs(templatesDir);
  for (const slug of chosen) add(`.ai/skills/${slug}/SKILL.md`, `.ai/skills/${slug}/SKILL.md`);

  if (profile !== 'minimal') {
    add('.ai/config.toml', '.ai/config.toml');
    add('CONTEXT.md', 'CONTEXT.md');
    for (const f of walkFiles(T('docs'))) add(`docs/${f}`, `docs/${f}`);
    for (const f of walkFiles(T('.ai/agents'))) add(`.ai/agents/${f}`, `.ai/agents/${f}`);
    for (const f of walkFiles(T('.ai/mcp'))) add(`.ai/mcp/${f}`, `.ai/mcp/${f}`);
    for (const f of walkFiles(T('.ai/references'))) add(`.ai/references/${f}`, `.ai/references/${f}`);
    add('.ai/vendor/.gitkeep', '.ai/vendor/.gitkeep');
  }

  if (profile === 'safe') {
    for (const f of walkFiles(T('.ai/hooks'))) add(`.ai/hooks/${f}`, `.ai/hooks/${f}`);
  }

  return files;
}
