import type { TimelineMediaType } from '../core/model';
import { getUrlFileExtension } from './url';

const VIDEO_FILE_EXTENSIONS = new Set([
  '3g2', '3gp', 'avi', 'm2ts', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg',
  'm3u8', 'ogv', 'ts', 'webm',
]);
const AUDIO_FILE_EXTENSIONS = new Set([
  'aac', 'aif', 'aiff', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav',
  'weba', 'wma',
]);
const IMAGE_FILE_EXTENSIONS = new Set(['jpeg', 'jpg', 'png']);

export type DetectedImageFileFormat = 'jpeg' | 'png';

export const inferMediaTypeFromExtension = (
  extension: string,
): TimelineMediaType | null => {
  const normalizedExtension = extension.toLowerCase().replace(/^\./, '');
  if (VIDEO_FILE_EXTENSIONS.has(normalizedExtension)) return 'video';
  if (AUDIO_FILE_EXTENSIONS.has(normalizedExtension)) return 'audio';
  if (IMAGE_FILE_EXTENSIONS.has(normalizedExtension)) return 'image';
  return null;
};

export const inferMediaTypeFromUrl = (url: URL) => {
  const extension = getUrlFileExtension(url);
  return extension ? inferMediaTypeFromExtension(extension) : null;
};

export const detectImageFileFormat = (
  header: Uint8Array,
): DetectedImageFileFormat | null => {
  const isPng =
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a;
  if (isPng) return 'png';

  return header.length >= 3 &&
    header[0] === 0xff &&
    header[1] === 0xd8 &&
    header[2] === 0xff
    ? 'jpeg'
    : null;
};
