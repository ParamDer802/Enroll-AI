import type { AppSettings } from '../../types';
export async function openCamera(settings: AppSettings) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
    throw new Error('Camera access requires HTTPS or localhost and a supported browser.');
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: settings.resolution },
        height: { ideal: Math.round((settings.resolution * 3) / 4) },
        ...(settings.cameraId
          ? { deviceId: { exact: settings.cameraId } }
          : { facingMode: 'user' }),
      },
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    throw new Error(
      (
        {
          NotAllowedError:
            'Camera permission was denied. Allow camera access in your browser settings, then retry.',
          NotFoundError: 'No camera was found. Connect a camera and retry.',
          NotReadableError:
            'The camera is unavailable or in use by another app. Close that app and retry.',
          OverconstrainedError:
            'The saved camera is unavailable. Choose another camera below or try the browser default.',
          AbortError: 'Camera startup was interrupted. Please retry.',
        } as Record<string, string>
      )[name] || 'Unable to open the camera. Check your connection and retry.',
    );
  }
}
export async function cameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
}
export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}
