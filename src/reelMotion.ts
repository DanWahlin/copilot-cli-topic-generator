export type ReelMotionSegment = {
  index: number;
  offset: number;
  durationMs: number;
  easing: string;
};

type SmoothSpinTimelineOptions = {
  itemCount: number;
  itemHeight: number;
  centerOffset: number;
  landingIndex?: number;
  startIndex?: number;
};

const FAST_STEP_MS = 38;
const SLOWDOWN_STEP_MS = 140;
const APPROACH_STEP_MS = 220;
const OVERSHOOT_STEP_MS = 180;
const SNAP_BACK_STEP_MS = 260;
const DECELERATION_START = 0.68;
const OVERSHOOT_RATIO = 0.22;

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function timelineIndexes(startIndex: number, targetIndex: number, lastIndex: number): number[] {
  const indexes = [startIndex];
  let index = startIndex;

  do {
    index = (index + 1) % (lastIndex + 1);
    indexes.push(index);
  } while (index !== targetIndex);

  return indexes;
}

export function buildSmoothSpinTimeline({ itemCount, itemHeight, centerOffset, landingIndex = 0, startIndex }: SmoothSpinTimelineOptions): ReelMotionSegment[] {
  if (itemCount <= 0) return [];
  if (itemCount === 1) {
    return [{ index: 0, offset: centerOffset, durationMs: 0, easing: 'linear' }];
  }

  const lastIndex = itemCount - 1;
  const targetIndex = Math.max(0, Math.min(lastIndex, landingIndex));
  const resolvedStartIndex = startIndex === undefined
    ? (targetIndex === lastIndex ? 0 : lastIndex)
    : Math.max(0, Math.min(lastIndex, startIndex));
  const indexes = timelineIndexes(resolvedStartIndex, targetIndex, lastIndex);
  const steps = indexes.length - 1;
  const targetOffset = centerOffset - targetIndex * itemHeight;
  const overshootOffset = targetOffset + itemHeight * OVERSHOOT_RATIO;

  const approachSegments = indexes.map((index, step): ReelMotionSegment => {
    const progress = steps === 0 ? 1 : step / steps;
    const decelerationProgress = Math.max(0, (progress - DECELERATION_START) / (1 - DECELERATION_START));
    const easedDeceleration = easeOutCubic(decelerationProgress);
    const durationMs = Math.round(FAST_STEP_MS + easedDeceleration * (SLOWDOWN_STEP_MS - FAST_STEP_MS));
    const isFinalApproach = step === steps;

    return {
      index,
      offset: centerOffset - index * itemHeight,
      durationMs: isFinalApproach ? APPROACH_STEP_MS : durationMs,
      easing: isFinalApproach ? 'cubic-bezier(.18, .72, .2, 1)' : 'linear',
    };
  });

  return [
    ...approachSegments,
    {
      index: targetIndex,
      offset: overshootOffset,
      durationMs: OVERSHOOT_STEP_MS,
      easing: 'cubic-bezier(.16, .84, .25, 1)',
    },
    {
      index: targetIndex,
      offset: targetOffset,
      durationMs: SNAP_BACK_STEP_MS,
      easing: 'cubic-bezier(.2, 1.35, .35, 1)',
    },
  ];
}
