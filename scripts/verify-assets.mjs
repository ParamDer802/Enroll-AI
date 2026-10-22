import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(
  await readFile(new URL('../model-manifest.json', import.meta.url), 'utf8'),
);
try {
  const bytes = await readFile(
    new URL('../public/vision/blaze_face_short_range.tflite', import.meta.url),
  );
  if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256)
    throw new Error('Model checksum does not match.');
  for (const name of [
    'vision_wasm_internal.js',
    'vision_wasm_internal.wasm',
    'vision_wasm_nosimd_internal.js',
    'vision_wasm_nosimd_internal.wasm',
  ])
    await access(new URL(`../public/vision/wasm/${name}`, import.meta.url));
  for (const size of [192, 512])
    await access(new URL(`../public/icon-${size}.png`, import.meta.url));
  console.log('Offline model, WASM and install icons verified.');
} catch (e) {
  console.error(
    'Offline assets are missing or invalid. Run npm run setup:vision and node scripts/create-icons.mjs.',
    e.message,
  );
  process.exit(1);
}
