import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Camadas: original, hand-drawn vector geometry. This is the source of truth
// for the interface mark, outlined lettering and all platform icon exports.
const root = fileURLToPath(new URL('../', import.meta.url));
const tokens = await readFile(path.join(root, 'src/tokens.css'), 'utf8');
const color = name => {
  const value = tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  if (!value) throw new Error(`Missing theme color: ${name}`);
  return value;
};
const palette = { orange: color('accent'), ink: color('ink-1'), tile: color('paper-0'), edge: color('key-edge'), light: color('key-top'), paper: color('key-bottom') };

function roundedPolygon(points, radius = 3) {
  const corners = points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const towards = other => {
      const length = Math.hypot(other[0] - point[0], other[1] - point[1]);
      const distance = Math.min(radius, length / 2);
      return point.map((coordinate, axis) => coordinate + (other[axis] - coordinate) * distance / length).join(' ');
    };
    return { before: towards(previous), point: point.join(' '), after: towards(next) };
  });
  return corners.map((corner, index) => `${index ? 'L' : 'M'}${corner.before}Q${corner.point} ${corner.after}`).join('') + 'Z';
}

const mark = [
  [[8, 0], [96, 0], [96, 28], [70, 28], [70, 18], [8, 18]],
  [[0, 26], [58, 26], [58, 38], [96, 38], [96, 56], [42, 56], [42, 44], [0, 44]],
  [[4, 52], [30, 52], [30, 64], [90, 64], [90, 80], [4, 80]],
].map(points => `<path d="${roundedPolygon(points)}"/>`).join('');

// Bespoke monospaced lowercase lettering, drawn as vector strokes (no <text>,
// font embedding or runtime font dependency). Each letter has a 28-unit advance.
const glyphs = {
  m: 'M3 28V8H9Q13 8 13 12V28M13 12Q13 8 17 8H19Q23 8 23 12V28',
  e: 'M22 28H8Q3 28 3 23V13Q3 8 8 8H18Q23 8 23 13V18H3',
  t: 'M10 2V23Q10 28 15 28H23M3 8H23',
  a: 'M4 8H18Q23 8 23 13V28H8Q3 28 3 23V22Q3 17 8 17H23',
  l: 'M6 0H13V28M4 28H23',
  b: 'M3 0V28H18Q23 28 23 23V13Q23 8 18 8H8Q3 8 3 13',
  o: 'M8 8H18Q23 8 23 13V23Q23 28 18 28H8Q3 28 3 23V13Q3 8 8 8Z',
  r: 'M4 28V8M4 14Q4 8 10 8H17Q23 8 23 14',
  d: 'M23 0V28H8Q3 28 3 23V13Q3 8 8 8H18Q23 8 23 13',
};
const lettering = [...'metalboard'].map((letter, index) => `<path transform="translate(${index * 28} 0)" d="${glyphs[letter]}"/>`).join('');
const wordmark = `<g fill="none" stroke="currentColor" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="square">${lettering}</g>`;
const svg = (viewBox, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
const icon = svg('0 0 512 512', `<defs><linearGradient id="chassis" x2="0" y2="1"><stop stop-color="${palette.light}"/><stop offset="1" stop-color="${palette.paper}"/></linearGradient></defs><rect x="32" y="36" width="448" height="444" rx="100" fill="${palette.edge}"/><rect x="32" y="32" width="448" height="440" rx="100" fill="url(#chassis)"/><rect x="33" y="33" width="446" height="438" rx="99" fill="none" stroke="${palette.light}" stroke-width="2"/><g transform="translate(136 152) scale(2.5)" fill="${palette.orange}">${mark}</g>`, 'Metalboard');
const files = {
  'public/brand/mark.svg': svg('0 0 96 80', `<g fill="currentColor">${mark}</g>`, 'Metalboard — Camadas'),
  'public/brand/wordmark.svg': svg('0 0 280 36', `<g transform="translate(0 4)">${wordmark}</g>`, 'metalboard'),
  'public/brand/logo.svg': svg('0 0 808 96', `<g transform="translate(0 8)" fill="${palette.orange}">${mark}</g><g transform="translate(136 17) scale(2.4)" color="${palette.ink}">${wordmark}</g>`, 'Metalboard'),
  'public/brand/logo-mono.svg': svg('0 0 808 96', `<g transform="translate(0 8)" fill="currentColor">${mark}</g><g transform="translate(136 17) scale(2.4)">${wordmark}</g>`, 'Metalboard'),
  'public/brand/app-icon.svg': icon,
  'src-tauri/app-icon.svg': icon,
  // Flat, full-bleed favicon with enlarged clear space between the modules.
  'public/favicon.svg': svg('0 0 32 32', `<rect width="32" height="32" rx="7" fill="${palette.tile}"/><g transform="translate(4 6) scale(.25)" fill="${palette.orange}">${mark}</g>`, 'Metalboard'),
};
for (const [file, contents] of Object.entries(files)) {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), contents);
}
console.log(`Generated ${Object.keys(files).length} Camadas SVG assets from theme tokens.`);
