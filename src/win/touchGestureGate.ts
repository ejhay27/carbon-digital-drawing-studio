/** Latches a touch gesture into camera-only mode as soon as a second finger arrives. */
export function createTouchGestureGate() {
  const pointers = new Set<number>();
  let navigationOnly = false;

  return {
    down(pointerId: number) {
      pointers.add(pointerId);
      if (pointers.size > 1) navigationOnly = true;
      return navigationOnly;
    },
    up(pointerId: number) {
      const suppressDrawing = navigationOnly;
      pointers.delete(pointerId);
      if (pointers.size === 0) navigationOnly = false;
      return suppressDrawing;
    },
    get activePointers() { return pointers.size; },
    get isNavigationOnly() { return navigationOnly; },
  };
}
