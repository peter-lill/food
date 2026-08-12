export type Rectangle = { left: number; top: number; width: number; height: number };

export function projectCropToImage(crop: Rectangle, sourceSize: { width: number; height: number }, imageSize: { width: number; height: number }) {
  if (sourceSize.width <= 0 || sourceSize.height <= 0 || imageSize.width <= 0 || imageSize.height <= 0) return null;
  // A still photo commonly uses the sensor's full 4:3 area while the preview is
  // a centred 16:9 crop. Map through that cover crop instead of stretching it.
  const previewScale = Math.max(sourceSize.width / imageSize.width, sourceSize.height / imageSize.height);
  const hiddenLeft = (imageSize.width * previewScale - sourceSize.width) / 2;
  const hiddenTop = (imageSize.height * previewScale - sourceSize.height) / 2;
  const projected = {
    left: (crop.left + hiddenLeft) / previewScale,
    top: (crop.top + hiddenTop) / previewScale,
    width: crop.width / previewScale,
    height: crop.height / previewScale,
  };
  return projected.left >= 0 && projected.top >= 0
    && projected.left + projected.width <= imageSize.width + 1
    && projected.top + projected.height <= imageSize.height + 1
    ? projected
    : null;
}

export function visibleFrameSourceCrop(
  videoSize: { width: number; height: number },
  videoBounds: Rectangle,
  frameBounds: Rectangle,
) {
  if (videoSize.width <= 0 || videoSize.height <= 0 || videoBounds.width <= 0 || videoBounds.height <= 0) {
    return null;
  }

  // The preview uses object-fit: cover. Reproduce that crop in sensor pixels so
  // the captured file contains exactly the receipt guide the user composed.
  const scale = Math.max(videoBounds.width / videoSize.width, videoBounds.height / videoSize.height);
  const renderedWidth = videoSize.width * scale;
  const renderedHeight = videoSize.height * scale;
  const hiddenLeft = (renderedWidth - videoBounds.width) / 2;
  const hiddenTop = (renderedHeight - videoBounds.height) / 2;
  const sourceLeft = (frameBounds.left - videoBounds.left + hiddenLeft) / scale;
  const sourceTop = (frameBounds.top - videoBounds.top + hiddenTop) / scale;

  const left = Math.max(0, Math.min(videoSize.width, sourceLeft));
  const top = Math.max(0, Math.min(videoSize.height, sourceTop));
  const right = Math.max(left, Math.min(videoSize.width, sourceLeft + frameBounds.width / scale));
  const bottom = Math.max(top, Math.min(videoSize.height, sourceTop + frameBounds.height / scale));
  if (right - left < 1 || bottom - top < 1) return null;

  return { left, top, width: right - left, height: bottom - top };
}
