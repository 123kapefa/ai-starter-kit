// Сборка .ai/project.yml (человекочитаемый источник) и .ai/hooks.config.json
// (то, что читают Python-хуки через stdlib json). YAML только пишем, не парсим.

function yamlList(arr) {
  return `[${(arr || []).map((x) => JSON.stringify(x)).join(', ')}]`;
}

export function buildHooksConfig(a) {
  return {
    protected_branches: a.protectedBranches || [],
    subtree_roots: a.subtreeRoots || [],
    migrations: {
      immutable: a.migrations?.immutable ?? true,
      dir_markers: a.migrations?.dir_markers || [],
      extensions: a.migrations?.extensions || [],
    },
    secrets: {
      extra_globs: a.secretsExtraGlobs || [],
    },
    format: {
      frontend_dir: a.frontendDir || '',
      eslint: !!a.eslint,
      prettier: !!a.prettier,
    },
    index: {
      tool: a.indexTool || '',
      extensions: a.indexExtensions || [],
    },
  };
}

export function buildProjectYml(a) {
  const h = buildHooksConfig(a);
  return `# Конфигурация AI-системы проекта. Единый человекочитаемый источник.
# Блок hooks: используется генератором .ai/hooks.config.json (его читают Python-хуки).
# После правок выполните: ai-starter update  (пересоберёт hooks.config.json и проверит синхрон).

project:
  name: ${JSON.stringify(a.projectName || 'project')}
  stack: ${JSON.stringify(a.stack || '')}
  tracker: ${JSON.stringify(a.tracker || '')}
  profile: ${JSON.stringify(a.profile || 'standard')}

checks:
  test: ${JSON.stringify(a.testCmd || '')}
  lint: ${JSON.stringify(a.lintCmd || '')}

mcp:
  enabled: ${yamlList(a.mcp || [])}   # по умолчанию пусто; боевой доступ включается отдельно

hooks:
  protected_branches: ${yamlList(h.protected_branches)}
  subtree_roots: ${yamlList(h.subtree_roots)}
  migrations:
    immutable: ${h.migrations.immutable}
    dir_markers: ${yamlList(h.migrations.dir_markers)}
    extensions: ${yamlList(h.migrations.extensions)}
  secrets:
    extra_globs: ${yamlList(h.secrets.extra_globs)}
  format:
    frontend_dir: ${JSON.stringify(h.format.frontend_dir)}
    eslint: ${h.format.eslint}
    prettier: ${h.format.prettier}
  index:
    tool: ${JSON.stringify(h.index.tool)}
    extensions: ${yamlList(h.index.extensions)}
`;
}
