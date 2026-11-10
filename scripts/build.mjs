import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
await rm(output, {recursive:true, force:true});
await mkdir(output, {recursive:true});
for (const name of ['stars-section.css', 'stars-section.js', 'zvezdach-coin.js', 'assets']) {
  await cp(resolve(root, name), resolve(output, name), {recursive:true});
}
const threeFiles = [
  'build/three.module.js',
  'examples/jsm/loaders/SVGLoader.js',
  'examples/jsm/exporters/GLTFExporter.js',
  'examples/jsm/utils/TextureUtils.js',
  'LICENSE',
];
for (const name of threeFiles) {
  const target = resolve(output, 'vendor/three', name);
  await mkdir(dirname(target), {recursive:true});
  await cp(resolve(root, 'node_modules/three', name), target);
}
const html = await readFile(resolve(root, 'index.html'), 'utf8');
await writeFile(resolve(output, 'index.html'), html.replaceAll('./node_modules/three/', './vendor/three/'));
console.log('Static block built in dist/');
