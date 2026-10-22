import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import type { Face } from '../types';
export class PhotoFaceDetector {
  private detector: FaceDetector | null = null;
  async initialize() {
    const files = await FilesetResolver.forVisionTasks('/vision/wasm');
    this.detector = await FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/vision/blaze_face_short_range.tflite', delegate: 'CPU' },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.65,
    });
  }
  detect(frame: HTMLCanvasElement, time: number): Face[] {
    if (!this.detector) throw new Error('Face detection is not ready. Retry initialization.');
    return this.detector.detectForVideo(frame, time).detections.flatMap((d) => {
      const b = d.boundingBox;
      if (!b) return [];
      const eyes = d.keypoints.slice(0, 2);
      let roll: number | null = null;
      if (eyes.length === 2) {
        const angle =
          (Math.atan2(
            (eyes[1].y - eyes[0].y) * frame.height,
            (eyes[1].x - eyes[0].x) * frame.width,
          ) *
            180) /
          Math.PI;
        roll = Math.min(Math.abs(angle), 180 - Math.abs(angle));
      }
      return [
        {
          x: b.originX / frame.width,
          y: b.originY / frame.height,
          width: b.width / frame.width,
          height: b.height / frame.height,
          roll,
        },
      ];
    });
  }
  close() {
    this.detector?.close();
    this.detector = null;
  }
}
