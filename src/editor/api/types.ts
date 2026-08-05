import type {
  TimelineClip,
  TimelineClipPosition,
  TimelineClipSpeed,
  TimelineClipTransform,
  TimelineClipVolume,
} from '../core/model';
import type { TimelineTextFontType } from '../core/text-fonts';
import type {
  VideoTimelineMediaType,
  VideoTimelineSource,
} from '../types';

type VideoTimelineSourceInputBase = {
  fileName?: string;
  id?: string;
  src: string;
};

type VideoTimelineTimedMediaSourceInput = VideoTimelineSourceInputBase & {
  durationUs?: number;
  height?: number;
  type: Exclude<VideoTimelineMediaType, 'image'>;
  waveformSrc?: string;
  width?: number;
};

type VideoTimelineImageSourceInput = VideoTimelineSourceInputBase & {
  durationUs?: number;
  height?: number;
  type: 'image';
  width?: number;
};

export type VideoTimelineSourceInput =
  | string
  | VideoTimelineTimedMediaSourceInput
  | VideoTimelineImageSourceInput;

export type VideoTimelineSourcePatch = {
  durationUs?: number;
  fileName?: string;
  height?: number;
  src?: string;
  waveformSrc?: string | null;
  width?: number;
};

export type VideoTimelineMediaClipInput = {
  sourceId: string;
  startUs?: number;
  trackId?: string;
};

export type VideoTimelineTextClipInput = {
  startUs?: number;
  text: string;
  type: 'text';
};

export type VideoTimelineClipInput =
  | VideoTimelineMediaClipInput
  | VideoTimelineTextClipInput;

export type VideoTimelineClipPatch = {
  bold?: boolean;
  endUs?: number;
  fontColor?: string;
  fontSize?: number;
  fontType?: TimelineTextFontType;
  hidden?: boolean;
  italic?: boolean;
  position?: TimelineClipPosition;
  speed?: TimelineClipSpeed;
  startUs?: number;
  text?: string;
  trackId?: string;
  transform?: TimelineClipTransform;
  trimEndUs?: number;
  trimStartUs?: number;
  underline?: boolean;
  volume?: TimelineClipVolume;
};

export type VideoTimelineSourceApi = {
  add(input: VideoTimelineSourceInput): Promise<VideoTimelineSource>;
  get(id: string): VideoTimelineSource | undefined;
  remove(id: string): void;
  update(
    id: string,
    patch: VideoTimelineSourcePatch,
  ): Promise<VideoTimelineSource>;
};

export type VideoTimelineClipApi = {
  add(input: VideoTimelineClipInput): Promise<TimelineClip>;
  get(id: string): TimelineClip | undefined;
  remove(id: string): void;
  update(id: string, patch: VideoTimelineClipPatch): Promise<TimelineClip>;
};

export type VideoTimelineEditorHandle = {
  clip: VideoTimelineClipApi;
  source: VideoTimelineSourceApi;
};
