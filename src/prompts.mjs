// Интерактивные промпты поверх readline. Только stdlib.
// Строки буферизуются в очередь: последовательные вопросы работают и в интерактиве,
// и при piped-вводе (без потери строк). На EOF неотвеченные вопросы берут default.
import readline from 'node:readline';
import { c } from './fsutil.mjs';

export function createPrompter() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const queue = [];
  let pending = null;
  let closed = false;

  rl.on('line', (line) => {
    if (pending) {
      const resolve = pending;
      pending = null;
      resolve(line);
    } else {
      queue.push(line);
    }
  });
  rl.on('close', () => {
    closed = true;
    if (pending) {
      const resolve = pending;
      pending = null;
      resolve('');
    }
  });

  // Печатает подсказку и ждёт следующую строку ввода (или '' на EOF).
  const question = (text) =>
    new Promise((resolve) => {
      process.stdout.write(text);
      if (queue.length) resolve(queue.shift());
      else if (closed) resolve('');
      else pending = resolve;
    });

  return {
    async ask(text, def = '') {
      const hint = def ? c.dim(` [${def}]`) : '';
      const a = (await question(`${c.cyan('?')} ${text}${hint} `)).trim();
      return a || def;
    },

    async confirm(text, def = true) {
      const hint = def ? '[Y/n]' : '[y/N]';
      const a = (await question(`${c.cyan('?')} ${text} ${c.dim(hint)} `)).trim().toLowerCase();
      if (!a) return def;
      return a === 'y' || a === 'yes' || a === 'д' || a === 'да';
    },

    async choice(text, options, defIndex = 0) {
      console.log(`${c.cyan('?')} ${text}`);
      options.forEach((o, i) => {
        const mark = i === defIndex ? c.green('●') : c.dim('○');
        console.log(`  ${mark} ${c.bold(String(i + 1))}. ${o.label}`);
      });
      const a = (await question(`  ${c.dim(`номер [${defIndex + 1}]`)} `)).trim();
      const idx = a ? Number.parseInt(a, 10) - 1 : defIndex;
      const chosen = options[idx] ?? options[defIndex];
      return chosen.value;
    },

    async multiSelect(text, options, defValues = []) {
      console.log(`${c.cyan('?')} ${text} ${c.dim('(номера через запятую, пусто — ничего)')}`);
      options.forEach((o, i) => {
        const on = defValues.includes(o.value) ? c.green('◉') : c.dim('◯');
        console.log(`  ${on} ${c.bold(String(i + 1))}. ${o.label}`);
      });
      const a = (await question('  выбор: ')).trim();
      if (!a) return [];
      const picked = a
        .split(/[,\s]+/)
        .map((n) => Number.parseInt(n, 10) - 1)
        .filter((i) => i >= 0 && i < options.length)
        .map((i) => options[i].value);
      return [...new Set(picked)];
    },

    close() {
      rl.close();
    },
  };
}
