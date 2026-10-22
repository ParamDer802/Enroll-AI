import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const url = 'https://storage.googleapis.com/mediapipe-assets/portrait.jpg';
const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (
  createHash('sha256').update(bytes).digest('hex') !==
  'a6f11efaa834706db23f275b6115058fa87fc7f14362681e6abe14e82749de3e'
)
  throw new Error('Test fixture checksum mismatch.');
await mkdir('.local/fixtures', { recursive: true });
await writeFile('.local/fixtures/portrait.jpg', bytes);
console.log('Downloaded the official MediaPipe public portrait to ignored test-only storage.');
