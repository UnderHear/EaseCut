import { describe, expect, it } from 'vitest';

import {
  detectImageFileFormat,
  inferMediaTypeFromExtension,
  inferMediaTypeFromUrl,
} from './media-file-format';
import {
  getUrlFileExtension,
  getUrlFileName,
  isHttpUrl,
  tryParseUrl,
} from './url';

describe('URL and media file helpers', () => {
  it('parses absolute and relative URLs without throwing', () => {
    expect(tryParseUrl('not a url')).toBeNull();
    expect(tryParseUrl('/media/demo.mp4', 'https://example.com/app/')).toEqual(
      new URL('https://example.com/media/demo.mp4'),
    );
    expect(isHttpUrl(new URL('https://example.com/demo.mp4'))).toBe(true);
    expect(isHttpUrl(new URL('file:///demo.mp4'))).toBe(false);
  });

  it('extracts decoded file names and normalized extensions', () => {
    const url = new URL('https://example.com/%E7%A4%BA%E4%BE%8B.MP4?token=1');
    expect(getUrlFileName(url)).toBe('示例.MP4');
    expect(getUrlFileExtension(url)).toBe('mp4');
    expect(getUrlFileExtension(new URL('https://example.com/media/'))).toBeNull();
  });

  it('infers media types from supported extensions', () => {
    expect(inferMediaTypeFromExtension('.MP4')).toBe('video');
    expect(inferMediaTypeFromExtension('wav')).toBe('audio');
    expect(inferMediaTypeFromExtension('jpeg')).toBe('image');
    expect(inferMediaTypeFromExtension('txt')).toBeNull();
    expect(inferMediaTypeFromUrl(new URL('https://example.com/demo.webm'))).toBe(
      'video',
    );
  });

  it('detects PNG and JPEG signatures', () => {
    expect(
      detectImageFileFormat(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('png');
    expect(detectImageFileFormat(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(
      'jpeg',
    );
    expect(detectImageFileFormat(new Uint8Array([0x47, 0x49, 0x46]))).toBeNull();
  });
});
