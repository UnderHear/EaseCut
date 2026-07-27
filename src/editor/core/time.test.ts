import { describe, expect, it } from 'vitest';

import {
  MICROSECONDS_PER_SECOND,
  isValidTimeUs,
  frameIndexToTimeUs,
  millisecondsToMicroseconds,
  microsecondsToMilliseconds,
  microsecondsToSeconds,
  normalizeTimeUs,
  secondsToMicroseconds,
  timeUsToFrameIndex,
} from './time';

describe('整数微秒时间工具', () => {
  it('在浏览器秒数边界进行唯一的四舍五入换算', () => {
    expect(secondsToMicroseconds(12.345_678_4)).toBe(12_345_678);
    expect(secondsToMicroseconds(12.345_678_5)).toBe(12_345_679);
    expect(microsecondsToSeconds(12_345_678)).toBe(12.345_678);
    expect(MICROSECONDS_PER_SECOND).toBe(1_000_000);
  });

  it('在后端契约边界把微秒四舍五入为毫秒', () => {
    expect(microsecondsToMilliseconds(1_234_499)).toBe(1_234);
    expect(microsecondsToMilliseconds(1_234_500)).toBe(1_235);
    expect(millisecondsToMicroseconds(1_234.5)).toBe(1_234_500);
  });

  it('规范化计算产生的亚微秒值且保留长时间线精度', () => {
    const tenHoursUs = 10 * 60 * 60 * MICROSECONDS_PER_SECOND;

    expect(normalizeTimeUs(tenHoursUs + 0.49)).toBe(36_000_000_000);
    expect(normalizeTimeUs(tenHoursUs + 0.5)).toBe(36_000_000_001);
    expect(
      secondsToMicroseconds(microsecondsToSeconds(tenHoursUs + 123_456)),
    ).toBe(tenHoursUs + 123_456);
  });

  it('拒绝负数、非有限值和超出安全整数范围的时间', () => {
    expect(isValidTimeUs(0)).toBe(true);
    expect(isValidTimeUs(1.5)).toBe(false);
    expect(() => normalizeTimeUs(-0.1)).toThrow(RangeError);
    expect(() => secondsToMicroseconds(Number.NaN)).toThrow(TypeError);
    expect(() => microsecondsToSeconds(1.5)).toThrow(RangeError);
    expect(() => microsecondsToMilliseconds(Number.MAX_SAFE_INTEGER + 1))
      .toThrow(RangeError);
  });

  it('以有理帧率从绝对帧序号计算时间，不累计浮点误差', () => {
    const frameRate = { denominator: 1_001, numerator: 30_000 };

    expect(frameIndexToTimeUs(30_000, frameRate)).toBe(1_001_000_000);
    expect(timeUsToFrameIndex(1_001_000_000, frameRate)).toBe(30_000);
  });
});
