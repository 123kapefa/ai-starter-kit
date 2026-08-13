// Стеки: варианты интерактивного выбора + вывод конфигурации из выбранного стека.

export const BACKENDS = [
  { key: 'dotnet', label: '.NET (C#)' },
  { key: 'node', label: 'Node.js' },
  { key: 'django', label: 'Python — Django' },
  { key: 'fastapi', label: 'Python — FastAPI / Flask' },
  { key: 'go', label: 'Go' },
  { key: 'rails', label: 'Ruby on Rails' },
  { key: 'java', label: 'Java (Spring)' },
  { key: 'other', label: 'Другой / нет' },
];

export const FRONTENDS = [
  { key: 'react', label: 'React (Vite / Next)' },
  { key: 'vue', label: 'Vue (Nuxt)' },
  { key: 'svelte', label: 'Svelte(Kit)' },
  { key: 'angular', label: 'Angular' },
  { key: 'other', label: 'Другой / нет' },
];

const BE = {
  dotnet: { name: '.NET', test: 'dotnet test', lint: 'dotnet build', mig: { dir: ['Migrations'], ext: ['.cs'] }, secrets: ['appsettings.*.json', 'secrets.json'], ext: ['.cs'] },
  node: { name: 'Node.js', test: 'npm test', lint: 'npm run lint', mig: null, secrets: [], ext: ['.ts', '.js'] },
  django: { name: 'Django', test: 'python manage.py test', lint: '', mig: { dir: ['migrations'], ext: ['.py'] }, secrets: [], ext: ['.py'] },
  fastapi: { name: 'FastAPI/Flask', test: 'pytest', lint: '', mig: { dir: ['versions'], ext: ['.py'] }, secrets: [], ext: ['.py'] },
  go: { name: 'Go', test: 'go test ./...', lint: 'go build ./...', mig: null, secrets: [], ext: ['.go'] },
  rails: { name: 'Rails', test: 'bin/rails test', lint: '', mig: { dir: ['migrate'], ext: ['.rb'] }, secrets: [], ext: ['.rb'] },
  java: { name: 'Java/Spring', test: './gradlew test', lint: './gradlew build', mig: { dir: ['migration'], ext: ['.sql'] }, secrets: [], ext: ['.java'] },
  other: { name: '', test: '', lint: '', mig: null, secrets: [], ext: [] },
};

const FE = {
  react: { name: 'React', ext: ['.ts', '.tsx', '.js', '.jsx'] },
  vue: { name: 'Vue', ext: ['.ts', '.js', '.vue'] },
  svelte: { name: 'Svelte', ext: ['.ts', '.js', '.svelte'] },
  angular: { name: 'Angular', ext: ['.ts', '.html'] },
  other: { name: '', ext: [] },
};

// Из выбранных стеков (+ данные детекта) выводит полную конфигурацию.
export function deriveConfig(beKey, feKey, ctx = {}) {
  const be = BE[beKey] || BE.other;
  const fe = FE[feKey] || FE.other;

  const beName = beKey === 'other' ? (ctx.backendName || '') : be.name;
  const feName = feKey === 'other' ? (ctx.frontendName || '') : fe.name;
  const stack = [beName, feName].filter(Boolean).join(' + ') || 'неизвестно';

  let mig = be.mig;
  if (beKey === 'node' && ctx.hasPrisma) mig = { dir: ['migrations'], ext: ['.sql'] };
  const migrations = mig
    ? { immutable: true, dir_markers: mig.dir, extensions: mig.ext }
    : { immutable: false, dir_markers: [], extensions: [] };

  const hasFront = feKey !== 'other' || Boolean(ctx.frontendDir);
  const frontendDir = ctx.frontendDir || (feKey !== 'other' ? 'frontend' : '');
  const eslint = hasFront;
  const prettier = hasFront;

  const lintCmd = be.lint || (hasFront ? 'npm run lint' : '');
  const indexExtensions = [...new Set([...be.ext, ...fe.ext])];

  return {
    stack,
    testCmd: be.test,
    lintCmd,
    migrations,
    secretsExtraGlobs: [...be.secrets],
    indexExtensions,
    frontendDir,
    eslint,
    prettier,
    protectedBranches: ctx.protectedBranches || ['main', 'master'],
    subtreeRoots: ctx.subtreeRoots || [],
  };
}
