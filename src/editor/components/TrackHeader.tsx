import {
  Music2,
  PictureInPicture2,
  SquarePlay,
  Volume2,
  VolumeX,
} from 'lucide-react';

import { getTimelineTrackHeight } from '../core/timeline-layout';
import {
  MAIN_VIDEO_TRACK_ID,
  NEW_AUDIO_TRACK_DROP_ID,
  NEW_VIDEO_TRACK_DROP_ID,
} from '../store/timeline-store';
import type { TimelineTrack } from '../types';

type TrackHeaderProps = {
  onToggleTrackMute: (trackId: string) => void;
  rulerHeight: number;
  tracks: TimelineTrack[];
};

export function TrackHeader({
  onToggleTrackMute,
  rulerHeight,
  tracks,
}: TrackHeaderProps) {
  return (
    <div className='oc-track-headers'>
      <div className='oc-track-headers__ruler-space' style={{ height: rulerHeight }} />
      {tracks.map((track) => {
        const isVideo = track.type === 'video';
        const TrackIcon = isVideo
          ? track.id === MAIN_VIDEO_TRACK_ID
            ? SquarePlay
            : PictureInPicture2
          : Music2;
        const isMuted = track.volume === 0;
        const isPendingTrack = isVideo
          ? track.id === NEW_VIDEO_TRACK_DROP_ID
          : track.id === NEW_AUDIO_TRACK_DROP_ID;
        const actionLabel = isPendingTrack
          ? '临时轨道不可静音'
          : isMuted
            ? '取消静音'
            : '静音';

        return (
          <div
            key={track.id}
            className='oc-track-header'
            style={{ height: getTimelineTrackHeight(track) }}
          >
            <span aria-label={track.name} className='oc-track-header__icon' role='img'>
              <TrackIcon aria-hidden='true' size={16} strokeWidth={1.75} />
            </span>
            <button
              aria-label={`${track.name}${isMuted ? '取消静音' : '静音'}`}
              aria-pressed={isMuted}
              className={`oc-icon-button oc-track-header__mute${isMuted ? ' oc-is-active' : ''}`}
              disabled={isPendingTrack}
              onClick={() => onToggleTrackMute(track.id)}
              title={actionLabel}
              type='button'
            >
              {isMuted ? (
                <VolumeX aria-hidden='true' size={16} strokeWidth={1.75} />
              ) : (
                <Volume2 aria-hidden='true' size={16} strokeWidth={1.75} />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
