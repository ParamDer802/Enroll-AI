export async function captureJpeg(video: HTMLVideoElement, quality: number): Promise<Blob> {
  if (video.readyState < 2 || !video.videoWidth)
    throw new Error('Camera frame is not available. Retry camera.');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image processing is unavailable.');
  ctx.drawImage(video, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('JPEG encoding failed.'))),
      'image/jpeg',
      quality,
    ),
  );
  const image = await createImageBitmap(blob);
  if (!image.width || !image.height) throw new Error('The JPEG could not be decoded.');
  image.close();
  return blob;
}
