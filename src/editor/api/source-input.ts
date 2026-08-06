import type { VideoTimelineMediaMetadata, VideoTimelineSource } from '../types';
import { isValidTimeUs } from '../core/time';
import { getNextNumberedId } from '../util/id';
import { inferMediaTypeFromUrl } from '../util/media-file-format';
import { isPositiveFiniteNumber } from '../util/number';
import { getUrlFileExtension, getUrlFileName, tryParseUrl } from '../util/url';
import { VideoTimelineEditorApiError } from './errors';
import type { VideoTimelineSourceInput } from './types';

const isPositiveTimeUs = (value: number | undefined) =>
  typeof value === 'number' && isValidTimeUs(value) && value > 0;

const parseSourceUrl = (src: string) => {
  const url = tryParseUrl(src, window.location.href);
  if (!url) {
    throw new VideoTimelineEditorApiError(
      'SOURCE_INVALID',
      '素材地址无效。',
    );
  }
  return url;
};

export const detectSourceType = (src: string) => {
  const url = parseSourceUrl(src);
  const extension = getUrlFileExtension(url);

  if (!extension) {
    throw new VideoTimelineEditorApiError(
      'SOURCE_INVALID',
      '无法从素材地址识别媒体类型，请显式提供 type。',
    );
  }
  const type = inferMediaTypeFromUrl(url);
  if (type) return type;

  throw new VideoTimelineEditorApiError(
    'SOURCE_INVALID',
    `不支持的素材文件后缀：.${extension}。`,
  );
};

const getSourceFileName = (src: string, type: VideoTimelineSource['type']) => {
  const url = parseSourceUrl(src);
  const fileName = getUrlFileName(url);
  if (fileName) return fileName;
  return type === 'audio' ? '在线音频' : type === 'image' ? '在线图片' : '在线视频';
};

const getNextSourceId = (sources: readonly VideoTimelineSource[]) =>
  getNextNumberedId(sources.map((source) => source.id), 'source');

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
        isPositiveFiniteNumber(source.height) &&
        isPositiveFiniteNumber(source.width)
      : isPositiveTimeUs(source.durationUs) &&
        isPositiveFiniteNumber(source.height) &&
        isPositiveFiniteNumber(source.width);

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
    ...(!isPositiveFiniteNumber(source.height) &&
    isPositiveFiniteNumber(metadata.height)
      ? { height: metadata.height }
      : {}),
    ...(!isPositiveFiniteNumber(source.width) &&
    isPositiveFiniteNumber(metadata.width)
      ? { width: metadata.width }
      : {}),
  };
};
