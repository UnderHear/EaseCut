import type { TimelineClip, TimelineMediaType } from '../core/model';

export const getTimelineClipLabel = (clip: TimelineClip) =>
  clip.type === 'text' ? clip.text : clip.name;

export const formatTimelineMediaType = (type: TimelineMediaType) =>
  type === 'video' ? '视频' : type === 'image' ? '图片' : '音频';
