import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { meta } from '../plugin.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['plugin.js', 'README.md', 'README.zh-CN.md', 'CHANGELOG.md', 'CHANGELOG.zh-CN.md'];
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
const name = `beeuni-newapi-plugin-${meta.version}.tar.gz`;
execFileSync('tar', ['-czf', `dist/${name}`, ...files], { cwd: root });
const bytes = await readFile(new URL(`../dist/${name}`, import.meta.url));
await writeFile(new URL('../dist/SHA256SUMS', import.meta.url), `${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`);
console.log(`Created dist/${name}. Install plugin.js in New API and configure your Beeuni key and project.`);
