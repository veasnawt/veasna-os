/** Square source region, constrained to the image even at its edges. */
export function profilePictureCrop(
  width: number,
  height: number,
  zoom: number,
  center: { x: number; y: number },
) {
  const side = Math.min(width, height) / Math.max(1, Math.min(4, zoom));
  const x = Math.max(side / 2, Math.min(width - side / 2, center.x * width));
  const y = Math.max(side / 2, Math.min(height - side / 2, center.y * height));
  return {
    left: x - side / 2,
    top: y - side / 2,
    side,
    center: { x: x / width, y: y / height },
  };
}
