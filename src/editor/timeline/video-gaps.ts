import { roundTimelineTime } from '../core/timeline-math';
import type { TimelineClip } from '../types';

export type VideoGap = {
  end: number;
  start: number;
};

export const getVideoGaps = (clips: TimelineClip[]): VideoGap[] => {
  const videoRanges = clips
    .filter((clip) => clip.type === 'video')
    .map((clip) => ({
      end: roundTimelineTime(clip.start + clip.duration),
      start: roundTimelineTime(clip.start),
    }))
    .sort((left, right) => left.start - right.start || left.end - right.end);

  if (videoRanges.length === 0) return [];

  const gaps: VideoGap[] = [];
  let coveredUntil = 0;

  for (const range of videoRanges) {
    if (range.start > coveredUntil) {
      gaps.push({ end: range.start, start: coveredUntil });
    }
    coveredUntil = Math.max(coveredUntil, range.end);
  }

  return gaps;
};
