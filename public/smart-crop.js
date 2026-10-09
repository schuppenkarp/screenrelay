// Normalized bounding box enclosing every important subject, text and logo.
export function validCropFocus(value) {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(Number.isFinite) &&
    value[0] >= 0 &&
    value[1] >= 0 &&
    value[2] > 0 &&
    value[3] > 0 &&
    value[0] + value[2] <= 1 &&
    value[1] + value[3] <= 1
  );
}

// Cover only if at least 80% of the photo and the full protected area remain.
export function smartCropPosition(focus, imageWidth, imageHeight, boxWidth, boxHeight) {
  if (
    !validCropFocus(focus) ||
    ![imageWidth, imageHeight, boxWidth, boxHeight].every((n) => Number.isFinite(n) && n > 0)
  )
    return null;
  const imageRatio = imageWidth / imageHeight,
    boxRatio = boxWidth / boxHeight;
  const width = Math.min(1, boxRatio / imageRatio),
    height = Math.min(1, imageRatio / boxRatio);
  if (width * height < 0.8) return null;
  const left = Math.max(0, focus[0] - 0.03),
    top = Math.max(0, focus[1] - 0.03);
  const right = Math.min(1, focus[0] + focus[2] + 0.03),
    bottom = Math.min(1, focus[1] + focus[3] + 0.03);
  if (right - left > width || bottom - top > height) return null;
  const x = Math.max(0, right - width, Math.min(left, 1 - width, (left + right - width) / 2));
  const y = Math.max(0, bottom - height, Math.min(top, 1 - height, (top + bottom - height) / 2));
  return {
    x: width >= 1 ? 50 : (100 * x) / (1 - width),
    y: height >= 1 ? 50 : (100 * y) / (1 - height),
  };
}
