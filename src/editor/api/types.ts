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

type EaseCutSourceInputBase = {
  fileName?: string;
  id?: string;
  src: string;
};

type EaseCutTimedMediaSourceInput = EaseCutSourceInputBase & {
  durationUs?: number;
  height?: number;
  type: Exclude<VideoTimelineMediaType, 'image'>;
  waveformSrc?: string;
  width?: number;
};

type EaseCutImageSourceInput = EaseCutSourceInputBase & {
  durationUs?: number;
  height?: number;
  type: 'image';
  width?: number;
};

export type EaseCutSourceInput =
  | string
  | EaseCutTimedMediaSourceInput
  | EaseCutImageSourceInput;

export type EaseCutSourcePatch = {
  durationUs?: number;
  fileName?: string;
  height?: number;
  src?: string;
  waveformSrc?: string | null;
  width?: number;
};

export type EaseCutMediaClipInput = {
  sourceId: string;
  startUs?: number;
  trackId?: string;
};

export type EaseCutTextClipInput = {
  startUs?: number;
  text: string;
  type: 'text';
};

export type EaseCutClipInput =
  | EaseCutMediaClipInput
  | EaseCutTextClipInput;

export type EaseCutClipPatch = {
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

export type EaseCutSourceApi = {
  add(input: EaseCutSourceInput): Promise<VideoTimelineSource>;
  get(id: string): VideoTimelineSource | undefined;
  remove(id: string): void;
  update(
    id: string,
    patch: EaseCutSourcePatch,
  ): Promise<VideoTimelineSource>;
};

export type EaseCutClipApi = {
  add(input: EaseCutClipInput): Promise<TimelineClip>;
  get(id: string): TimelineClip | undefined;
  remove(id: string): void;
  update(id: string, patch: EaseCutClipPatch): Promise<TimelineClip>;
};

export type EaseCutHandle = {
  clip: EaseCutClipApi;
  source: EaseCutSourceApi;
};
