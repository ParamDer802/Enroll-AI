export function measureLighting(gray: Float32Array) {
  let sum = 0,
    clipped = 0;
  for (const value of gray) {
    sum += value;
    if (value < 15 || value > 245) clipped++;
  }
  return {
    brightness: gray.length ? sum / gray.length : 0,
    clipped: gray.length ? clipped / gray.length : 1,
  };
}
