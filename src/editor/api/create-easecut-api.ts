import {
  isTimelineMediaClip,
  isTimelineTextClip,
  isTimelineTimedMediaClip,
  isTimelineVisualMediaClip,
  getTimelineTrackTypeForClipType,
  type TimelineClip,
} from '../core/model';
import { isValidClipSpeed } from '../core/clip-speed';
import {
  DEFAULT_TIMELINE_TEXT_FONT_SIZE,
  DEFAULT_TIMELINE_TEXT_FONT_TYPE,
  isTimelineTextFontType,
} from '../core/text-fonts';
import type { UpdateTimelineClipParams } from '../core/timeline-commands';
import { isValidTimeUs } from '../core/time';
import type { MediaRuntime } from '../media';
import type { TimelineStoreApi } from '../store/timeline-store';
import type { VideoTimelineSource } from '../types';
import { EaseCutApiError } from './errors';
import {
  createSourceCandidate,
  hasCompleteSourceMetadata,
  mergeSourceMetadata,
} from './source-input';
import {
  addSourceSnapshot,
  getSourceRevision,
  getSourceSnapshot,
  getSourceSnapshots,
  removeSourceSnapshot,
  updateSourceSnapshot,
  type VideoTimelineSourceStoreApi,
} from './source-store';
import type {
  EaseCutClipInput,
  EaseCutClipPatch,
  EaseCutHandle,
  EaseCutSourcePatch,
} from './types';

type CreateEaseCutApiParams = {
  mediaRuntime: MediaRuntime;
  sourceStore: VideoTimelineSourceStoreApi;
  timelineStore: TimelineStoreApi;
};

const cloneClip = (clip: TimelineClip): TimelineClip =>
  isTimelineTextClip(clip)
    ? {
        ...clip,
        layoutSize: { ...clip.layoutSize },
        position: { ...clip.position },
      }
    : { ...clip, transform: { ...clip.transform } };

const clipError = (message: string) =>
  new EaseCutApiError('CLIP_INVALID', message);

const duplicateSourceError = (id: string) =>
  new EaseCutApiError(
    'SOURCE_ALREADY_EXISTS',
    `素材 ID 已存在：${id}。`,
  );

const sourceConflictError = (id: string) =>
  new EaseCutApiError(
    'SOURCE_CONFLICT',
    `素材 ${id} 在更新期间已发生变化。`,
  );

const getClip = (timelineStore: TimelineStoreApi, id: string) =>
  timelineStore
    .getState()
    .clips.find((candidate) => candidate.id === id);

const requireClip = (timelineStore: TimelineStoreApi, id: string) => {
  const clip = getClip(timelineStore, id);
  if (!clip) {
    throw new EaseCutApiError(
      'CLIP_NOT_FOUND',
      `找不到片段：${id}。`,
    );
  }
  return clip;
};

const requireSource = (sourceStore: VideoTimelineSourceStoreApi, id: string) => {
  const source = getSourceSnapshot(sourceStore, id);
  if (!source) {
    throw new EaseCutApiError(
      'SOURCE_NOT_FOUND',
      `找不到素材：${id}。`,
    );
  }
  return source;
};

const resolveSource = async (
  mediaRuntime: MediaRuntime,
  source: VideoTimelineSource,
) => {
  if (hasCompleteSourceMetadata(source)) return source;

  let metadata;
  try {
    metadata = await mediaRuntime.getMetadata(source);
  } catch (error) {
    throw new EaseCutApiError(
      'SOURCE_INVALID',
      error instanceof Error ? error.message : '素材元数据加载失败。',
    );
  }
  const resolved = mergeSourceMetadata(source, metadata);
  if (!hasCompleteSourceMetadata(resolved)) {
    throw new EaseCutApiError(
      'SOURCE_INVALID',
      '素材缺少有效的时长或尺寸信息。',
    );
  }
  return resolved;
};

const createUpdatedSource = (
  current: VideoTimelineSource,
  patch: EaseCutSourcePatch,
  sources: readonly VideoTimelineSource[],
) => {
  const src = patch.src?.trim() ?? current.src;
  const srcChanged = src !== current.src;
  const input = {
    id: current.id,
    type: current.type,
    src,
    ...(patch.fileName !== undefined
      ? { fileName: patch.fileName }
      : srcChanged
        ? {}
        : { fileName: current.fileName }),
    ...(patch.durationUs !== undefined
      ? { durationUs: patch.durationUs }
      : !srcChanged && current.durationUs !== undefined
        ? { durationUs: current.durationUs }
        : {}),
    ...(patch.height !== undefined
      ? { height: patch.height }
      : !srcChanged && current.height !== undefined
        ? { height: current.height }
        : {}),
    ...(patch.width !== undefined
      ? { width: patch.width }
      : !srcChanged && current.width !== undefined
        ? { width: current.width }
        : {}),
    ...(current.type !== 'image' && patch.waveformSrc !== null
      ? patch.waveformSrc !== undefined
        ? { waveformSrc: patch.waveformSrc }
        : !srcChanged && current.waveformSrc
          ? { waveformSrc: current.waveformSrc }
          : {}
      : {}),
  };
  return createSourceCandidate(input, sources);
};

const assertTime = (value: number | undefined, name: string) => {
  if (value !== undefined && !isValidTimeUs(value)) {
    throw clipError(`${name} 必须是非负安全整数。`);
  }
};

const assertFinitePoint = (
  point: { x: number; y: number } | undefined,
  name: string,
) => {
  if (
    point &&
    (!Number.isFinite(point.x) || !Number.isFinite(point.y))
  ) {
    throw clipError(`${name} 坐标必须是有限数字。`);
  }
};

const assertClipPatch = (
  timelineStore: TimelineStoreApi,
  clip: TimelineClip,
  patch: EaseCutClipPatch,
) => {
  assertTime(patch.startUs, 'startUs');
  assertTime(patch.endUs, 'endUs');
  assertTime(patch.trimStartUs, 'trimStartUs');
  assertTime(patch.trimEndUs, 'trimEndUs');
  assertFinitePoint(patch.position, 'position');
  assertFinitePoint(patch.transform, 'transform');

  if (patch.trackId !== undefined) {
    const track = timelineStore
      .getState()
      .tracks.find((candidate) => candidate.id === patch.trackId);
    if (
      !track ||
      track.type !== getTimelineTrackTypeForClipType(clip.type)
    ) {
      throw clipError(`轨道 ${patch.trackId} 不存在或不接受该片段类型。`);
    }
  }
  if (
    patch.transform &&
    (!Number.isFinite(patch.transform.width) ||
      !Number.isFinite(patch.transform.height) ||
      patch.transform.width <= 0 ||
      patch.transform.height <= 0)
  ) {
    throw clipError('transform 的宽高必须是大于 0 的有限数字。');
  }
  if (patch.endUs !== undefined) {
    const startUs = patch.startUs ?? clip.startUs;
    if (patch.endUs <= startUs) {
      throw clipError('endUs 必须大于片段开始时间。');
    }
  }

  if (isTimelineTextClip(clip)) {
    if (
      patch.speed !== undefined ||
      patch.transform !== undefined ||
      patch.trimEndUs !== undefined ||
      patch.trimStartUs !== undefined ||
      patch.volume !== undefined
    ) {
      throw clipError('文字片段不支持媒体片段属性。');
    }
    const text = patch.text?.trim();
    if (text !== undefined && (text === '' || /[\r\n]/.test(text))) {
      throw clipError('文字内容不能为空或包含换行。');
    }
    if (
      patch.fontSize !== undefined &&
      (!Number.isInteger(patch.fontSize) || patch.fontSize <= 0)
    ) {
      throw clipError('fontSize 必须是正整数。');
    }
    if (
      patch.fontType !== undefined &&
      !isTimelineTextFontType(patch.fontType)
    ) {
      throw clipError(`不支持的字体类型：${patch.fontType}。`);
    }
    if (
      patch.fontColor !== undefined &&
      !/^#[\dA-F]{8}$/i.test(patch.fontColor)
    ) {
      throw clipError('fontColor 必须使用 #RRGGBBAA 格式。');
    }
    return;
  }

  if (
    patch.bold !== undefined ||
    patch.fontColor !== undefined ||
    patch.fontSize !== undefined ||
    patch.fontType !== undefined ||
    patch.italic !== undefined ||
    patch.position !== undefined ||
    patch.text !== undefined ||
    patch.underline !== undefined
  ) {
    throw clipError('媒体片段不支持文字片段属性。');
  }
  if (!isTimelineTimedMediaClip(clip)) {
    if (
      patch.speed !== undefined ||
      patch.trimEndUs !== undefined ||
      patch.trimStartUs !== undefined ||
      patch.volume !== undefined
    ) {
      throw clipError('图片片段不支持音视频片段属性。');
    }
    return;
  }
  if (patch.speed !== undefined && !isValidClipSpeed(patch.speed)) {
    throw clipError('speed 必须在 0.1 到 4 之间。');
  }
  if (
    patch.volume !== undefined &&
    (!Number.isFinite(patch.volume) ||
      patch.volume < 0 ||
      patch.volume > 1)
  ) {
    throw clipError('volume 必须在 0 到 1 之间。');
  }
  if (patch.transform !== undefined && !isTimelineVisualMediaClip(clip)) {
    throw clipError('音频片段不支持 transform。');
  }
};

const hasTextLayoutChange = (patch: EaseCutClipPatch) =>
  patch.bold !== undefined ||
  patch.fontSize !== undefined ||
  patch.fontType !== undefined ||
  patch.italic !== undefined ||
  patch.text !== undefined;

const createClipApi = (
  mediaRuntime: MediaRuntime,
  sourceStore: VideoTimelineSourceStoreApi,
  timelineStore: TimelineStoreApi,
): EaseCutHandle['clip'] => ({
  async add(input: EaseCutClipInput) {
    const state = timelineStore.getState();
    const startUs = input.startUs ?? state.currentTimeUs;
    assertTime(startUs, 'startUs');

    let clipId: string | null;
    if ('sourceId' in input) {
      const source = requireSource(sourceStore, input.sourceId);
      if (!hasCompleteSourceMetadata(source)) {
        throw new EaseCutApiError(
          'SOURCE_INVALID',
          `素材 ${source.id} 的元数据尚未就绪。`,
        );
      }
      clipId = state.addMediaClip({
        source,
        startUs,
        ...(input.trackId ? { trackId: input.trackId } : {}),
      });
      timelineStore
        .getState()
        .refreshSources(getSourceSnapshots(sourceStore));
    } else {
      const text = input.text.trim();
      if (text === '' || /[\r\n]/.test(text)) {
        throw clipError('文字内容不能为空或包含换行。');
      }
      const layoutSize = await mediaRuntime.measureTextLayout({
        bold: false,
        fontSize: DEFAULT_TIMELINE_TEXT_FONT_SIZE,
        fontType: DEFAULT_TIMELINE_TEXT_FONT_TYPE,
        italic: false,
        text,
      });
      clipId = timelineStore.getState().addTextClip({
        layoutSize,
        startUs,
        text,
      });
    }
    if (!clipId) throw clipError('无法在指定位置添加片段。');
    return cloneClip(requireClip(timelineStore, clipId));
  },

  get(id) {
    const clip = getClip(timelineStore, id);
    return clip ? cloneClip(clip) : undefined;
  },

  remove(id) {
    requireClip(timelineStore, id);
    if (!timelineStore.getState().removeClip(id)) {
      throw clipError(`无法删除片段：${id}。`);
    }
    timelineStore
      .getState()
      .refreshSources(getSourceSnapshots(sourceStore));
  },

  async update(id, patch) {
    const clip = requireClip(timelineStore, id);
    assertClipPatch(timelineStore, clip, patch);
    const command: UpdateTimelineClipParams = { clipId: id, ...patch };
    if (isTimelineTextClip(clip) && hasTextLayoutChange(patch)) {
      command.layoutSize = await mediaRuntime.measureTextLayout({
        bold: patch.bold ?? clip.bold,
        fontSize: patch.fontSize ?? clip.fontSize,
        fontType: patch.fontType ?? clip.fontType,
        italic: patch.italic ?? clip.italic,
        text: patch.text?.trim() ?? clip.text,
      });
    }
    timelineStore.getState().updateClip(command);
    return cloneClip(requireClip(timelineStore, id));
  },
});

const createSourceApi = (
  mediaRuntime: MediaRuntime,
  sourceStore: VideoTimelineSourceStoreApi,
  timelineStore: TimelineStoreApi,
): EaseCutHandle['source'] => ({
  async add(input) {
    const sources = getSourceSnapshots(sourceStore);
    const candidate = createSourceCandidate(input, sources);
    if (sources.some((source) => source.id === candidate.id)) {
      throw duplicateSourceError(candidate.id);
    }
    let source = await resolveSource(mediaRuntime, candidate);
    const currentSources = getSourceSnapshots(sourceStore);
    if (currentSources.some((current) => current.id === source.id)) {
      const hasExplicitId =
        typeof input !== 'string' && Boolean(input.id?.trim());
      if (hasExplicitId) throw duplicateSourceError(source.id);
      source = createSourceCandidate(
        { ...source, id: undefined },
        currentSources,
      );
    }
    addSourceSnapshot(sourceStore, source);
    timelineStore.getState().refreshSources(getSourceSnapshots(sourceStore));
    return { ...source };
  },

  get(id) {
    return getSourceSnapshot(sourceStore, id);
  },

  remove(id) {
    requireSource(sourceStore, id);
    if (
      timelineStore
        .getState()
        .clips.some(
          (clip) => isTimelineMediaClip(clip) && clip.sourceId === id,
        )
    ) {
      throw new EaseCutApiError(
        'SOURCE_IN_USE',
        `素材 ${id} 仍被片段引用，请先删除相关片段。`,
      );
    }
    timelineStore.getState().discardSourceFromHistory(id);
    removeSourceSnapshot(sourceStore, id);
    timelineStore.getState().refreshSources(getSourceSnapshots(sourceStore));
  },

  async update(id, patch) {
    const current = requireSource(sourceStore, id);
    const sourceRevision = getSourceRevision(sourceStore, id);
    const sources = getSourceSnapshots(sourceStore);
    const candidate = createUpdatedSource(current, patch, sources);
    const source = await resolveSource(mediaRuntime, candidate);
    requireSource(sourceStore, id);
    if (getSourceRevision(sourceStore, id) !== sourceRevision) {
      throw sourceConflictError(id);
    }
    updateSourceSnapshot(sourceStore, source);
    timelineStore.getState().refreshSources(getSourceSnapshots(sourceStore));
    return { ...source };
  },
});

export const createEaseCutApi = ({
  mediaRuntime,
  sourceStore,
  timelineStore,
}: CreateEaseCutApiParams): EaseCutHandle => ({
  clip: createClipApi(mediaRuntime, sourceStore, timelineStore),
  source: createSourceApi(mediaRuntime, sourceStore, timelineStore),
});
