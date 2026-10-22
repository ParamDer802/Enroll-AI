import { describe, it, expect } from 'vitest';
import { laplacianVariance } from '../vision/blurDetector';
import { StabilityDetector } from '../vision/stabilityDetector';
import { QualityEngine } from '../vision/qualityEngine';
import { defaults } from '../database/db';
const face = { x: 0.35, y: 0.25, width: 0.3, height: 0.4, roll: 0 };
function pixels(dark = false) {
  const data = new Uint8ClampedArray(40 * 40 * 4);
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 40; x++) {
      const i = (y * 40 + x) * 4,
        v = dark ? 5 : (x + y) % 2 ? 160 : 90;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  return { data, width: 40, height: 40, colorSpace: 'srgb' } as ImageData;
}
describe('actual image quality heuristics', () => {
  it('flat images have no Laplacian variance', () =>
    expect(laplacianVariance(new Float32Array(100).fill(80), 10, 10)).toBe(0));
  it('never accepts absent or multiple faces', () => {
    const engine = new QualityEngine();
    expect(engine.evaluate([], pixels(), defaults, 100).ready).toBe(false);
    expect(engine.evaluate([face, face], pixels(), defaults, 100).faceCount).toBe(2);
  });
  it('requires sustained stable measurements', () => {
    const engine = new QualityEngine();
    expect(engine.evaluate([face], pixels(), defaults, 100).ready).toBe(false);
    let result;
    for (let time = 225; time <= 2225; time += 125)
      result = engine.evaluate([face], pixels(), defaults, time);
    expect(result?.ready).toBe(true);
  });
  it('rejects darkness, tilt, off-center and small faces', () => {
    const e = new QualityEngine();
    expect(e.evaluate([face], pixels(true), defaults, 100).lightingValid).toBe(false);
    expect(e.evaluate([{ ...face, roll: 35 }], pixels(), defaults, 100).headAngleValid).toBe(false);
    expect(e.evaluate([{ ...face, x: 0 }], pixels(), defaults, 100).faceCentered).toBe(false);
    expect(e.evaluate([{ ...face, height: 0.05 }], pixels(), defaults, 100).faceSizeValid).toBe(
      false,
    );
  });
  it('resets stability for motion, bad quality and stale data', () => {
    const s = new StabilityDetector();
    s.update(face, true, 100, 0.03);
    expect(s.update(face, true, 300, 0.03)).toBe(200);
    expect(s.update({ ...face, x: 0.45 }, true, 400, 0.03)).toBe(0);
    s.update(face, false, 500, 0.03);
    expect(s.update(face, true, 600, 0.03)).toBe(0);
    expect(s.update(face, true, 1400, 0.03)).toBe(0);
  });
});
