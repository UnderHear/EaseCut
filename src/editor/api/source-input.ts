import type { VideoTimelineMediaMetadata, VideoTimelineSource } from '../types';
import { isValidTimeUs } from '../core/time';
import { VideoTimelineEditorApiError } from './errors';
import type { VideoTimelineSourceInput } from './types';

const VIDEO_FILE_EXTENSIONS = new Set([
  '3g2',
  '3gp',
  'avi',
  'm2ts',
  'm4v',
  'mkv',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'm3u8',
  'ogv',
  'ts',
  'webm',
]);

const AUDIO_FILE_EXTENSIONS = new Set([
  'aac',
  'aif',
  'aiff',
  'flac',
  'm4a',
  'mp3',
  'oga',
  'ogg',
  'opus',
  'wav',
  'weba',
  'wma',
]);

const IMAGE_FILE_EXTENSIONS = new Set(['jpeg', 'jpg', 'png']);

const isPositiveNumber = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isPositiveTimeUs = (value: number | undefined) =>
  typeof value === 'number' && isValidTimeUs(value) && value > 0;

const parseSourceUrl = (src: string) => {
  try {
    return new URL(src, window.location.href);
  } catch {
    throw new VideoTimelineEditorApiError(
      'SOURCE_INVALID',
      '素材地址无效。',
    );
  }
};

export const detectSourceType = (src: string) => {
  const url = parseSourceUrl(src);
  const fileName = url.pathname.split('/').at(-1)?.toLowerCase() ?? '';
  const extension = fileName.match(/\.([a-z0-9]+)$/)?.[1];

  if (!extension) {
    throw new VideoTimelineEditorApiError(
      'SOURCE_INVALID',
      '无法从素材地址识别媒体类型，请显式提供 type。',
    );
  }
  if (VIDEO_FILE_EXTENSIONS.has(extension)) return 'video' as const;
  if (AUDIO_FILE_EXTENSIONS.has(extension)) return 'audio' as const;
  if (IMAGE_FILE_EXTENSIONS.has(extension)) return 'image' as const;

  throw new VideoTimelineEditorApiError(
    'SOURCE_INVALID',
    `不支持的素材文件后缀：.${extension}。`,
  );
};

const getSourceFileName = (src: string, type: VideoTimelineSource['type']) => {
  const url = parseSourceUrl(src);
  const fileName = url.pathname.split('/').filter(Boolean).at(-1);
  if (fileName) return decodeURIComponent(fileName);
  return type === 'audio' ? '在线音频' : type === 'image' ? '在线图片' : '在线视频';
};

const getNextSourceId = (sources: readonly VideoTimelineSource[]) => {
  const ids = new Set(sources.map((source) => source.id));
  let index = 1;
  while (ids.has(`source-${index}`)) index += 1;
  return `source-${index}`;
};

export const createSourceCandidate = (
  input: VideoTimelineSourceInput,
  sources: readonly VideoTimelineSource[],
): VideoTimelineSource => {
  if (typeof input === 'string') {
    const src = input.trim();
    if (!src) {
      throw new VideoTimelineEditorApiError(
        'SOURCE_INVALID',
        '素材地址不能为空。',
      );
    }
    const type = detectSourceType(src);
    return {
      fileName: getSourceFileName(src, type),
      id: getNextSourceId(sources),
      src,
      type,
    };
  }

  const src = input.src.trim();
  if (!src) {
    throw new VideoTimelineEditorApiError(
      'SOURCE_INVALID',
      '素材地址不能为空。',
    );
  }
  return {
    ...input,
    fileName: input.fileName?.trim() || getSourceFileName(src, input.type),
    id: input.id?.trim() || getNextSourceId(sources),
    src,
  };
};

export const hasCompleteSourceMetadata = (source: VideoTimelineSource) =>
  source.type === 'audio'
    ? isPositiveTimeUs(source.durationUs)
    : source.type === 'image'
      ? (source.durationUs === undefined ||
          isPositiveTimeUs(source.durationUs)) &&
        isPositiveNumber(source.height) &&
        isPositiveNumber(source.width)
      : isPositiveTimeUs(source.durationUs) &&
        isPositiveNumber(source.height) &&
        isPositiveNumber(source.width);

export const mergeSourceMetadata = (
  source: VideoTimelineSource,
  metadata: VideoTimelineMediaMetadata | null,
): VideoTimelineSource => {
  if (!metadata) return { ...source };
  return {
    ...source,
    ...(!isPositiveTimeUs(source.durationUs) &&
    isPositiveTimeUs(metadata.durationUs)
      ? { durationUs: metadata.durationUs }
      : {}),
    ...(!isPositiveNumber(source.height) && isPositiveNumber(metadata.height)
      ? { height: metadata.height }
      : {}),
    ...(!isPositiveNumber(source.width) && isPositiveNumber(metadata.width)
      ? { width: metadata.width }
      : {}),
  };
};
