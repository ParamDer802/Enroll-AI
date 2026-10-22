export function luminance(data: Uint8ClampedArray): Float32Array {
  const gray = new Float32Array(data.length / 4);
  for (let i = 0; i < gray.length; i++)
    gray[i] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
  return gray;
}
export function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  let sum = 0,
    squares = 0,
    count = 0;
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x,
        value = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i];
      sum += value;
      squares += value * value;
      count++;
    }
  return count ? Math.max(0, squares / count - (sum / count) ** 2) : 0;
}
