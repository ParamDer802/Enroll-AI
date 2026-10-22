import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'model-manifest.json'), 'utf8'));
const destination = path.join(root, 'public/vision');
await mkdir(destination, { recursive: true });
const target = path.join(destination, 'blaze_face_short_range.tflite');
let bytes;
try {
  bytes = await readFile(target);
} catch {
  const response = await fetch(manifest.url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (sha256 !== manifest.sha256)
  throw new Error(`Model checksum mismatch. Expected ${manifest.sha256}, got ${sha256}.`);
await writeFile(target, bytes);
await cp(
  path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm'),
  path.join(destination, 'wasm'),
  { recursive: true },
);
console.log(`Verified face-detection model (${bytes.length} bytes) and copied local WASM runtime.`);
