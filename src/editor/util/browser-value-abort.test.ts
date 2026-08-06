import { describe, expect, it } from 'vitest';

import { createAbortError, isAbortError } from './abort-error';
import { isJsdomEnvironment, shouldIgnoreShortcutTarget } from './browser';
import { areStringRecordsEqual, isRecord } from './value';

describe('browser, value, and error helpers', () => {
  it('identifies editable and interactive shortcut targets', () => {
    const button = document.createElement('button');
    const icon = document.createElement('span');
    const plain = document.createElement('div');
    button.append(icon);

    expect(shouldIgnoreShortcutTarget(icon)).toBe(true);
    expect(shouldIgnoreShortcutTarget(plain)).toBe(false);
    expect(isJsdomEnvironment()).toBe(true);
  });

  it('recognizes records and compares string records by value', () => {
    expect(isRecord({ key: 'value' })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(areStringRecordsEqual({ a: '1' }, { a: '1' })).toBe(true);
    expect(areStringRecordsEqual({ a: '1' }, { a: '2' })).toBe(false);
  });

  it('creates and recognizes abort errors', () => {
    const error = createAbortError('已取消');
    expect(error.message).toBe('已取消');
    expect(isAbortError(error)).toBe(true);
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
    expect(isAbortError(new Error('失败'))).toBe(false);
  });
});
