'use strict';
// Static WCAG contrast audit for Jo⚡Go Metric Master's palette.
// Computes every (foreground, background) pair that appears in the CSS
// as `color: X` with a `background: Y` in the same rule, resolving vars.
const fs = require('fs');

const css = fs.readFileSync(__dirname + '/../css/styles.css', 'utf8');

// ---- palette (must match :root in styles.css) ----
// palette is read from :root so this tool can never drift from the CSS
const vars = {};
(function () {
  const root = css.slice(css.indexOf(':root') + 5, css.indexOf('}', css.indexOf(':root')));
  const re = /(--[\w-]+):\s*#([0-9a-fA-F]{6})/g;
  let m;
  while ((m = re.exec(root))) vars[m[1]] = '#' + m[2];
})();

function resolve(v) {
  v = v.trim();
  const m = v.match(/^var\((--[\w-]+)\)$/);
  if (m && vars[m[1]]) return vars[m[1]];
  const m2 = v.match(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
  if (m2) return v;
  return null;
}

function rgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
}

function lum(hex) {
  return rgb(hex).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
}

function ratio(a, b) {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ---- find rules with both color: and background: ----
const rules = [];
const re = /([^{}]+)\{([^{}]*)\}/g;
let m;
while ((m = re.exec(css))) {
  const sel = m[1].trim();
  const body = m[2];
  const c = body.match(/(?:^|[;{])\s*color:\s*([^;]+);/);
  const bg = body.match(/(?:^|[;{])\s*background(?:-color)?:\s*([^;]+);/);
  if (c && bg) rules.push({ sel, fg: c[1].trim(), bg: bg[1].trim(), body });
}

const problems = [];
const seen = new Set();
for (const r of rules) {
  const fg = resolve(r.fg);
  const bg = resolve(r.bg);
  if (!fg || !bg) continue;
  const key = fg + '|' + bg;
  if (seen.has(key)) continue;
  seen.add(key);
  const rt = ratio(fg, bg);
  const big = /font-size:\s*(1\.[3-9]\d*|2[\d.]+)rem|font-weight:\s*(8|9)\d\d/.test(r.body);
  const limit = big ? 3 : 4.5;
  problems.push({ sel: r.sel, fg, bg, ratio: +rt.toFixed(2), limit, pass: rt >= limit, big });
}

problems.sort((a, b) => a.ratio - b.ratio);
let fails = 0;
for (const p of problems) {
  const mark = p.pass ? '  ' : 'X ';
  if (!p.pass) fails++;
  console.log(mark + p.ratio.toFixed(2) + ':1  ' + (p.pass ? 'ok ' : 'LOW') + '  ' + p.fg + ' on ' + p.bg + '   ' + p.sel + (p.big ? '  [large/bold]' : ''));
}
console.log('\n' + problems.length + ' unique (fg,bg) pairs, ' + fails + ' below threshold');
process.exit(fails ? 1 : 0);
