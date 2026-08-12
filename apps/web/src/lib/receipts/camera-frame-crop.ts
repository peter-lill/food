export type Rectangle = { left: number; top: number; width: number; height: number };

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
