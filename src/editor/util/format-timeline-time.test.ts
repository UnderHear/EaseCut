import { describe, expect, it } from 'vitest';

import { secondsToMicroseconds } from '../core/time';
import {
  formatTimelineDateTime,
  formatTimelineRulerTime,
  formatTimelineSeconds,
  formatTimelineTime,
} from './format-timeline-time';

describe('formatTimelineTime', () => {
  it('formats minutes, seconds, and centiseconds', () => {
    expect(formatTimelineTime(0)).toBe('00:00:00');
    expect(formatTimelineTime(secondsToMicroseconds(9))).toBe('00:09:00');
    expect(formatTimelineTime(secondsToMicroseconds(9.12))).toBe('00:09:12');
    expect(formatTimelineTime(secondsToMicroseconds(62.03))).toBe('01:02:03');
    expect(formatTimelineTime(secondsToMicroseconds(6_001.99))).toBe(
      '100:01:99',
    );
  });

  it('truncates centiseconds without carrying into the next second', () => {
    expect(formatTimelineTime(secondsToMicroseconds(9.999))).toBe('00:09:99');
    expect(formatTimelineTime(secondsToMicroseconds(10))).toBe('00:10:00');
  });

  it('treats negative and non-finite values as zero', () => {
    expect(formatTimelineTime(-10_000)).toBe('00:00:00');
    expect(formatTimelineTime(Number.NaN)).toBe('00:00:00');
    expect(formatTimelineTime(Number.POSITIVE_INFINITY)).toBe('00:00:00');
    expect(formatTimelineTime(Number.NEGATIVE_INFINITY)).toBe('00:00:00');
  });
});

describe('formatTimelineSeconds', () => {
  it('formats microseconds as seconds with a configurable precision', () => {
    expect(formatTimelineSeconds(secondsToMicroseconds(1.236))).toBe(
      '1.24 秒',
    );
    expect(formatTimelineSeconds(secondsToMicroseconds(1.236), 1)).toBe(
      '1.2 秒',
    );
  });
});

describe('formatTimelineRulerTime', () => {
  it('formats ruler labels with hours only when needed', () => {
    expect(formatTimelineRulerTime(0)).toBe('00:00');
    expect(formatTimelineRulerTime(secondsToMicroseconds(62))).toBe('01:02');
    expect(formatTimelineRulerTime(secondsToMicroseconds(3_661))).toBe(
      '1:01:01',
    );
  });
});

describe('formatTimelineDateTime', () => {
  it('formats microseconds as an ISO duration for time elements', () => {
    expect(formatTimelineDateTime(0)).toBe('PT0S');
    expect(formatTimelineDateTime(secondsToMicroseconds(3.999))).toBe(
      'PT3.999S',
    );
  });
});
