import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
function crc(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type),
    size = Buffer.alloc(4),
    check = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  check.writeUInt32BE(crc(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, check]);
}
for (const size of [192, 512]) {
  const data = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = (x / size) * 512,
        py = (y / size) * 512;
      const bracket =
        ((Math.abs(px - 140) < 12 || Math.abs(px - 372) < 12) &&
          ((py > 140 && py < 208) || (py > 304 && py < 372))) ||
        ((Math.abs(py - 140) < 12 || Math.abs(py - 372) < 12) &&
          ((px > 140 && px < 208) || (px > 304 && px < 372)));
      const head = Math.abs(Math.hypot(px - 256, py - 235) - 43) < 12;
      const shoulders = px > 190 && px < 322 && Math.abs(py - (292 + (px - 256) ** 2 * 0.007)) < 12;
      const color = bracket || head || shoulders ? [185, 229, 188] : [16, 43, 40],
        i = y * (size * 4 + 1) + 1 + x * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  await writeFile(
    new URL(`../public/icon-${size}.png`, import.meta.url),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(data)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
console.log('Generated install icons.');
