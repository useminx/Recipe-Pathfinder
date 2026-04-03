import { afterEach, describe, expect, it, vi } from 'vitest';
import { COPY_TOAST_DURATION_MS, getCopyToastStyle, rescheduleDismissTimer } from '../src/copyToast';

describe('rescheduleDismissTimer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses a 2 second toast duration', () => {
    expect(COPY_TOAST_DURATION_MS).toBe(2000);
  });

  it('derives the css animation duration from the same toast constant', () => {
    expect(getCopyToastStyle()).toEqual({ animationDuration: '2000ms' });
  });

  it('resets the dismiss timer when copy is triggered again before the toast expires', () => {
    vi.useFakeTimers();
    let dismissCount = 0;

    let timer = rescheduleDismissTimer(null, () => {
      dismissCount += 1;
    });

    vi.advanceTimersByTime(COPY_TOAST_DURATION_MS - 1000);
    timer = rescheduleDismissTimer(timer, () => {
      dismissCount += 1;
    });

    vi.advanceTimersByTime(1500);
    expect(dismissCount).toBe(0);

    vi.advanceTimersByTime(1500);
    expect(dismissCount).toBe(1);
  });
});
