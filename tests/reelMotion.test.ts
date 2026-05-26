import { describe, expect, it } from 'vitest';
import { buildSmoothSpinTimeline, type ReelMotionSegment } from '../src/reelMotion';

function assertTopToBottomOffsets(segments: ReelMotionSegment[]) {
  for (let index = 1; index < segments.length - 2; index += 1) {
    expect(segments[index].offset).toBeGreaterThanOrEqual(segments[index - 1].offset);
  }
}

describe('smooth reel motion timeline', () => {
  it('starts fast, decelerates into the selected command, and lands on the exact final offset', () => {
    const segments = buildSmoothSpinTimeline({
      itemCount: 12,
      itemHeight: 96,
      centerOffset: 96,
      startIndex: 11,
      landingIndex: 0,
    });

    expect(segments.length).toBe(4);
    expect(segments[0]).toMatchObject({ index: 11, offset: 96 - 11 * 96, durationMs: 38, easing: 'linear' });
    expect(segments.at(-1)).toMatchObject({
      index: 0,
      offset: 96,
      easing: 'cubic-bezier(.2, 1.35, .35, 1)',
    });

    assertTopToBottomOffsets(segments);

    const durations = segments.map((segment) => segment.durationMs);
    expect(durations.at(-1)).toBeGreaterThan(durations[0]);
    expect(durations.at(-3)).toBeGreaterThan(durations[0]);
    expect(durations.at(-2)).toBeGreaterThan(durations[0]);
  });

  it('overshoots below the selected row and snaps back to center for a slot-machine stop', () => {
    const segments = buildSmoothSpinTimeline({ itemCount: 12, itemHeight: 96, centerOffset: 96, landingIndex: 3 });
    const finalOffset = 96 - 3 * 96;
    const overshoot = segments.at(-2)!;
    const settle = segments.at(-1)!;

    expect(overshoot.index).toBe(3);
    expect(overshoot.offset).toBeGreaterThan(finalOffset);
    expect(overshoot.offset - finalOffset).toBeLessThan(96);
    expect(overshoot.easing).toBe('cubic-bezier(.16, .84, .25, 1)');
    expect(settle).toMatchObject({
      index: 3,
      offset: finalOffset,
      easing: 'cubic-bezier(.2, 1.35, .35, 1)',
    });
  });

  it('handles a single settled item without adding a fake hop', () => {
    expect(buildSmoothSpinTimeline({ itemCount: 1, itemHeight: 96, centerOffset: 96 })).toEqual([
      { index: 0, offset: 96, durationMs: 0, easing: 'linear' },
    ]);
  });

  it('can start from the previous settled index and still move upward into the next landing item', () => {
    const segments = buildSmoothSpinTimeline({
      itemCount: 12,
      itemHeight: 96,
      centerOffset: 96,
      startIndex: 4,
      landingIndex: 9,
    });

    expect(segments[0]).toMatchObject({ index: 4, offset: 96 - 4 * 96 });
    expect(segments.at(-1)).toMatchObject({ index: 9, offset: 96 - 9 * 96 });
    expect(segments.slice(0, -2).map((segment) => segment.index)).toEqual([4, 5, 6, 7, 8, 9]);
  });

  it('wraps around the circular reel instead of reversing direction when the target is before the start', () => {
    const segments = buildSmoothSpinTimeline({
      itemCount: 6,
      itemHeight: 96,
      centerOffset: 96,
      startIndex: 4,
      landingIndex: 2,
    });

    expect(segments.slice(0, -2).map((segment) => segment.index)).toEqual([4, 5, 0, 1, 2]);
    expect(segments.at(-1)).toMatchObject({ index: 2, offset: 96 - 2 * 96 });
  });

  it('can settle on early, middle, or late positions in the reel', () => {
    const early = buildSmoothSpinTimeline({ itemCount: 21, itemHeight: 96, centerOffset: 96, landingIndex: 3 });
    const middle = buildSmoothSpinTimeline({ itemCount: 21, itemHeight: 96, centerOffset: 96, landingIndex: 10 });
    const late = buildSmoothSpinTimeline({ itemCount: 21, itemHeight: 96, centerOffset: 96, landingIndex: 20 });

    expect(early.at(-1)).toMatchObject({ index: 3, offset: 96 - 3 * 96 });
    expect(middle.at(-1)).toMatchObject({ index: 10, offset: 96 - 10 * 96 });
    expect(late.at(-1)).toMatchObject({ index: 20, offset: 96 - 20 * 96 });
    expect(early[0].index).toBe(20);
    expect(middle[0].index).toBe(20);
    expect(late[0].index).toBe(0);
  });
});
