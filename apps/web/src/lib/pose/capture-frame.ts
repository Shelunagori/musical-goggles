/** Shared bounded input raster for uploaded video and webcam; no encoding or storage. */
export function captureFrame(video: HTMLVideoElement): Promise<ImageBitmap> {
  const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
  return createImageBitmap(video, {
    resizeWidth: Math.max(1, Math.round(video.videoWidth * scale)),
    resizeHeight: Math.max(1, Math.round(video.videoHeight * scale)),
  });
}
