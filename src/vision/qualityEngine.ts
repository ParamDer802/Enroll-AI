import type { AppSettings, Face, QualityMetrics } from '../types';
import { luminance, laplacianVariance } from './blurDetector';
import { measureLighting } from './lightingDetector';
import { StabilityDetector } from './stabilityDetector';
export class QualityEngine {
  private stability = new StabilityDetector();
  reset() {
    this.stability.reset();
  }
  evaluate(
    faces: Face[],
    pixels: ImageData,
    settings: AppSettings,
    time: number,
    analysisMs = 0,
  ): QualityMetrics {
    const face = faces.length === 1 ? faces[0] : undefined;
    const gray = luminance(pixels.data),
      light = measureLighting(gray),
      sharpness = laplacianVariance(gray, pixels.width, pixels.height);
    const faceCentered =
      !!face &&
      Math.abs(face.x + face.width / 2 - 0.5) <= settings.centerTolerance &&
      Math.abs(face.y + face.height / 2 - 0.45) <= settings.centerTolerance;
    const faceSizeValid =
      !!face && face.height >= settings.faceSizeMin && face.height <= settings.faceSizeMax;
    const headAngleValid = !!face && face.roll !== null && face.roll <= settings.headAngleMax;
    const lightingValid =
      light.brightness >= settings.lightingMin &&
      light.brightness <= settings.lightingMax &&
      light.clipped < 0.35;
    const sharpnessValid = sharpness >= settings.blurThreshold;
    const valid =
      faces.length === 1 &&
      faceCentered &&
      faceSizeValid &&
      headAngleValid &&
      lightingValid &&
      sharpnessValid;
    const stabilityMs = this.stability.update(face, valid, time, settings.movementTolerance),
      stable = valid && stabilityMs >= settings.stabilityMs;
    const message = !faces.length
      ? 'Position yourself in the camera'
      : faces.length > 1
        ? 'Only one student should be visible'
        : !faceCentered
          ? 'Center your face in the guide'
          : !faceSizeValid
            ? face!.height < settings.faceSizeMin
              ? 'Move a little closer'
              : 'Move slightly back'
            : !headAngleValid
              ? 'Keep your head straight'
              : !lightingValid
                ? light.brightness < settings.lightingMin
                  ? 'Move to a brighter area'
                  : 'Use softer, even lighting'
                : !sharpnessValid
                  ? 'Image is blurry. Hold still or adjust focus'
                  : !stable
                    ? 'Hold still…'
                    : 'Photo quality ready';
    return {
      faceDetected: faces.length > 0,
      faceCount: faces.length,
      faceCentered,
      faceSizeValid,
      headAngleValid,
      lightingValid,
      sharpnessValid,
      stable,
      ready: valid && stable,
      brightness: light.brightness,
      sharpness,
      stabilityMs,
      message,
      face,
      analysisMs,
    };
  }
}
