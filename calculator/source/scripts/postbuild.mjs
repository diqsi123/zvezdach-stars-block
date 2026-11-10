/**
 * Сборка рассчитана на открытие двойным кликом (file://).
 * Vite всегда помечает входной скрипт как ES-модуль, а модули браузер по
 * file:// не грузит из-за CORS — страница остаётся пустой. Бандл собран в
 * формате iife, поэтому тег можно сделать обычным.
 */
import fs from 'node:fs';
import path from 'node:path';

// каталог сборки приходит аргументом: версий две, dist у каждой свой
const outDir = process.argv[2] ?? 'dist';
const file = path.resolve(outDir, 'index.html');
let html = fs.readFileSync(file, 'utf8');
const before = html;

html = html.replace(/<script\s+type="module"\s+crossorigin\s+src=/g, '<script defer src=');
html = html.replace(/<script\s+type="module"\s+src=/g, '<script defer src=');

if (html === before) {
  console.warn(`postbuild: тег скрипта не найден — проверьте ${outDir}/index.html`);
} else {
  fs.writeFileSync(file, html);
  console.log(`postbuild: ${outDir} — скрипт переведён в классический (работает по file://)`);
}
