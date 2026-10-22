import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const temp = path.resolve('.local', `test-temp-${process.pid}`);
await mkdir(temp, { recursive: true });
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run'], {
  stdio: 'inherit',
  env: { ...process.env, TEMP: temp, TMP: temp },
});
process.exit(result.status ?? 1);
