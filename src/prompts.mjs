// Интерактивные промпты. Только stdlib.
// TTY: стрелки/пробел (raw-mode). Не-TTY (piped/CI): текстовый ввод из очереди строк.
import readline from 'node:readline';
import { c } from './fsutil.mjs';

const isTTY = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

export function createPrompter() {
  return isTTY() ? interactivePrompter() : linePrompter();
}

// ─── Интерактивный режим (TTY) ──────────────────────────────────────────────

function hintLine(hint) {
  if (hint) process.stdout.write(`${c.dim('  ' + hint)}\n`);
}

function ttyAsk(text, def, hint) {
  return new Promise((resolve) => {
    hintLine(hint);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const label = def ? `${c.cyan('?')} ${text} ${c.dim(`[${def}]`)} ` : `${c.cyan('?')} ${text} `;
    rl.question(label, (a) => {
      rl.close();
      resolve((a && a.trim()) || def);
    });
  });
}

function ttyConfirm(text, def, hint) {
  return new Promise((resolve) => {
    hintLine(hint);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const h = def ? '[Y/n]' : '[y/N]';
    rl.question(`${c.cyan('?')} ${text} ${c.dim(h)} `, (a) => {
      rl.close();
      a = (a || '').trim().toLowerCase();
      resolve(a ? a === 'y' || a === 'yes' || a === 'д' || a === 'да' : def);
    });
  });
}

// Общий raw-mode селектор: multi=false — radio (enter), multi=true — checkbox (пробел).
function rawSelect({ title, hint, options, multi, defIndex = 0, defValues = [] }) {
  return new Promise((resolve) => {
    let idx = defIndex;
    const selected = new Set();
    if (multi) options.forEach((o, i) => { if (defValues.includes(o.value)) selected.add(i); });

    const rl = readline.createInterface({ input: process.stdin, escapeCodeTimeout: 50 });
    readline.emitKeypressEvents(process.stdin, rl);
    const wasRaw = Boolean(process.stdin.isRaw);
    if (process.stdin.setRawMode) process.stdin.setRawMode(true);

    process.stdout.write(`${c.cyan('?')} ${c.bold(title)}\n`);
    if (hint) process.stdout.write(`${c.dim('  ' + hint)}\n`);
    process.stdout.write(
      `${c.dim(multi ? '  ↑/↓ — двигаться, пробел — отметить, a — все, enter — готово' : '  ↑/↓ — двигаться, enter — выбрать')}\n`,
    );

    const n = options.length;
    const draw = (redraw) => {
      if (redraw) process.stdout.write(`\x1b[${n}A`);
      options.forEach((o, i) => {
        const ptr = i === idx ? c.cyan('❯') : ' ';
        const box = multi ? (selected.has(i) ? `${c.green('◉')} ` : `${c.dim('◯')} `) : '';
        const label = i === idx ? c.cyan(o.label) : o.label;
        process.stdout.write(`\x1b[2K${ptr} ${box}${label}\n`);
      });
    };
    draw(false);

    function finish() {
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.setRawMode) process.stdin.setRawMode(wasRaw);
      rl.close();
    }
    const onKey = (str, key) => {
      if (!key) return;
      if (key.ctrl && key.name === 'c') {
        finish();
        process.stdout.write('\n');
        process.exit(130);
      } else if (key.name === 'up' || key.name === 'k') {
        idx = (idx - 1 + n) % n;
      } else if (key.name === 'down' || key.name === 'j') {
        idx = (idx + 1) % n;
      } else if (multi && (key.name === 'space' || str === ' ')) {
        selected.has(idx) ? selected.delete(idx) : selected.add(idx);
      } else if (multi && key.name === 'a') {
        if (selected.size === n) selected.clear();
        else options.forEach((_, i) => selected.add(i));
      } else if (key.name === 'return') {
        finish();
        resolve(multi ? [...selected].sort((a, b) => a - b).map((i) => options[i].value) : options[idx].value);
        return;
      }
      draw(true);
    };
    process.stdin.on('keypress', onKey);
  });
}

function interactivePrompter() {
  return {
    ask: (text, def = '', { hint } = {}) => ttyAsk(text, def, hint),
    confirm: (text, def = true, { hint } = {}) => ttyConfirm(text, def, hint),
    select: (text, options, defIndex = 0, { hint } = {}) =>
      rawSelect({ title: text, hint, options, multi: false, defIndex }),
    multiSelect: (text, options, defValues = [], { hint } = {}) =>
      rawSelect({ title: text, hint, options, multi: true, defValues }),
    close() {},
  };
}

// ─── Текстовый режим (piped / не-TTY) ───────────────────────────────────────

function linePrompter() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const queue = [];
  let pending = null;
  let closed = false;

  rl.on('line', (line) => {
    if (pending) {
      const resolve = pending;
      pending = null;
      resolve(line);
    } else queue.push(line);
  });
  rl.on('close', () => {
    closed = true;
    if (pending) {
      const resolve = pending;
      pending = null;
      resolve('');
    }
  });

  const question = (text) =>
    new Promise((resolve) => {
      process.stdout.write(text);
      if (queue.length) resolve(queue.shift());
      else if (closed) resolve('');
      else pending = resolve;
    });
  const hint = (h) => h && process.stdout.write(`${c.dim('  ' + h)}\n`);

  return {
    async ask(text, def = '', opts = {}) {
      hint(opts.hint);
      const h = def ? c.dim(` [${def}]`) : '';
      const a = (await question(`${c.cyan('?')} ${text}${h} `)).trim();
      return a || def;
    },
    async confirm(text, def = true, opts = {}) {
      hint(opts.hint);
      const h = def ? '[Y/n]' : '[y/N]';
      const a = (await question(`${c.cyan('?')} ${text} ${c.dim(h)} `)).trim().toLowerCase();
      if (!a) return def;
      return a === 'y' || a === 'yes' || a === 'д' || a === 'да';
    },
    async select(text, options, defIndex = 0, opts = {}) {
      hint(opts.hint);
      console.log(`${c.cyan('?')} ${text}`);
      options.forEach((o, i) => {
        const mark = i === defIndex ? c.green('●') : c.dim('○');
        console.log(`  ${mark} ${c.bold(String(i + 1))}. ${o.label}`);
      });
      const a = (await question(`  ${c.dim(`номер [${defIndex + 1}]`)} `)).trim();
      const idx = a ? Number.parseInt(a, 10) - 1 : defIndex;
      return (options[idx] ?? options[defIndex]).value;
    },
    async multiSelect(text, options, defValues = [], opts = {}) {
      hint(opts.hint);
      console.log(`${c.cyan('?')} ${text} ${c.dim('(номера через запятую, пусто — ничего)')}`);
      options.forEach((o, i) => {
        const on = defValues.includes(o.value) ? c.green('◉') : c.dim('◯');
        console.log(`  ${on} ${c.bold(String(i + 1))}. ${o.label}`);
      });
      const a = (await question('  выбор: ')).trim();
      if (!a) return [];
      const picked = a
        .split(/[,\s]+/)
        .map((x) => Number.parseInt(x, 10) - 1)
        .filter((i) => i >= 0 && i < options.length)
        .map((i) => options[i].value);
      return [...new Set(picked)];
    },
    close() {
      rl.close();
    },
  };
}
