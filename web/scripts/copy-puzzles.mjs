// Copy the authoritative puzzle definitions from ../puzzles into public/ for the build.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(web, '..', 'puzzles');
const target = join(web, 'public', 'puzzles');

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(join(source, 'index.json'), join(target, 'index.json'));
let count = 0;
for (const entry of readdirSync(source, { withFileTypes: true })) {
  const file = join(source, entry.name, 'puzzle.json');
  if (entry.isDirectory() && existsSync(file)) {
    mkdirSync(join(target, entry.name), { recursive: true });
    cpSync(file, join(target, entry.name, 'puzzle.json'));
    count++;
  }
}
console.log(`copied ${count} puzzle definitions to public/puzzles`);
