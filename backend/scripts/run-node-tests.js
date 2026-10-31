import { readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collect(path) : [path];
  });
}
const files = collect('tests').filter(path => path.endsWith('.test.js') &&
  !/^notification.*\.test\.js$/.test(basename(path))).sort();
if (files.length === 0) throw new Error('No core backend tests found');
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
