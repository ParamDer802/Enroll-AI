import type { Face } from '../types';
export class StabilityDetector {
  private anchor: Face | null = null;
  private since = 0;
  private last = 0;
  reset() {
    this.anchor = null;
    this.since = 0;
    this.last = 0;
  }
  update(face: Face | undefined, valid: boolean, time: number, tolerance: number): number {
    if (!face || !valid) {
      this.reset();
      return 0;
    }
    const a = this.anchor;
    if (
      !a ||
      time - this.last > 500 ||
      Math.hypot(face.x - a.x, face.y - a.y) > tolerance ||
      Math.abs(face.width - a.width) > tolerance ||
      Math.abs(face.height - a.height) > tolerance
    ) {
      this.anchor = { ...face };
      this.since = time;
    }
    this.last = time;
    return time - this.since;
  }
}
