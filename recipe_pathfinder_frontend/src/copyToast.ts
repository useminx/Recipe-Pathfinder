export const COPY_TOAST_DURATION_MS = 2000;

export function getCopyToastStyle(): { animationDuration: string } {
  return {
    animationDuration: `${COPY_TOAST_DURATION_MS}ms`,
  };
}

export function rescheduleDismissTimer(
  existingTimer: ReturnType<typeof setTimeout> | null,
  onDismiss: () => void,
  durationMs: number = COPY_TOAST_DURATION_MS,
): ReturnType<typeof setTimeout> {
  if (existingTimer !== null) {
    clearTimeout(existingTimer);
  }

  return setTimeout(onDismiss, durationMs);
}
