import { useEffect, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';
import { Group, Image as KonvaImage, Line, Rect, Text } from 'react-konva';

import {
  useAudioWaveformSamples,
  useFramePreviewUrls,
} from '../media';
import type { TimelineClip, TimelineClipTrimEdge } from '../types';

type ClipNodeProps = {
  clip: TimelineClip;
  dragBoundFunc: (position: Konva.Vector2d) => Konva.Vector2d;
  height: number;
  isDragging: boolean;
  isSelected: boolean;
  onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove: (event: Konva.KonvaEventObject<DragEvent>) => void;
  onDragStart: (event: Konva.KonvaEventObject<DragEvent>) => void;
  onCursorChange: (source: ClipCursorSource, cursor: TimelineCursor) => void;
  onSelect: (clipId: string) => void;
  onTrackVolumeChange?: (volume: number) => void;
  onTrackVolumeCommit?: (previousVolume: number, volume: number) => void;
  onTrimDragEnd: (
    edge: TimelineClipTrimEdge,
    event: Konva.KonvaEventObject<DragEvent>,
  ) => void;
  onTrimDragMove: (
    edge: TimelineClipTrimEdge,
    event: Konva.KonvaEventObject<DragEvent>,
  ) => void;
  onTrimDragStart: (
    edge: TimelineClipTrimEdge,
    event: Konva.KonvaEventObject<DragEvent>,
  ) => void;
  trackVolume?: number;
  width: number;
  x: number;
  y: number;
};

const FRAME_PREVIEW_WIDTH = 96;
const TRIM_HANDLE_WIDTH = 6;
const TRIM_HANDLE_HIT_WIDTH = 12;
const TRIM_HANDLE_INSET_Y = 8;
const TRIM_RESTORE_EPSILON_SECONDS = 0.001;
const CLIP_CORNER_RADIUS = 6;
const CLIP_STROKE = 'rgb(255 255 255 / 18%)';
const SELECTED_CLIP_STROKE = '#ffffff';
const TRIM_RESTORE_MARKER_FILL = '#ef4444';
const TRIM_RESTORE_MARKER_HEIGHT = 10;
const TRIM_RESTORE_MARKER_WIDTH = 2;
const AUDIO_CLIP_FILL = '#122235';
const AUDIO_WAVEFORM_FILL = '#2499e8';
const AUDIO_VOLUME_LINE_IDLE = 'rgb(255 255 255 / 30%)';
const AUDIO_VOLUME_LINE_ACTIVE = '#5ebcff';
const AUDIO_VOLUME_LINE_TOP = 10;
const AUDIO_VOLUME_LINE_BOTTOM = 8;
const AUDIO_VOLUME_LINE_HIT_HEIGHT = 14;
const ignoreTrackVolumeChange = () => undefined;

type TimelineCursor =
  'default' | 'ew-resize' | 'grabbing' | 'ns-resize' | 'pointer';
type ClipCursorSource = 'clip' | 'clip-drag' | 'trim' | 'volume';

const clipRoundedRectPath = (
  ctx: Konva.Context,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const cornerRadius = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + cornerRadius, y);
  ctx.lineTo(x + width - cornerRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + cornerRadius);
  ctx.lineTo(x + width, y + height - cornerRadius);
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - cornerRadius,
    y + height,
  );
  ctx.lineTo(x + cornerRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - cornerRadius);
  ctx.lineTo(x, y + cornerRadius);
  ctx.quadraticCurveTo(x, y, x + cornerRadius, y);
  ctx.closePath();
};

const getAudioVolumeLineY = (volume: number, height: number) => {
  const lineRange = Math.max(
    1,
    height - AUDIO_VOLUME_LINE_TOP - AUDIO_VOLUME_LINE_BOTTOM,
  );
  return (
    AUDIO_VOLUME_LINE_TOP + (1 - Math.min(1, Math.max(0, volume))) * lineRange
  );
};

const getAudioVolumeAtY = (y: number, height: number) => {
  const lineRange = Math.max(
    1,
    height - AUDIO_VOLUME_LINE_TOP - AUDIO_VOLUME_LINE_BOTTOM,
  );
  return Math.min(1, Math.max(0, 1 - (y - AUDIO_VOLUME_LINE_TOP) / lineRange));
};

const getAudioLabelWidth = (name: string, clipWidth: number) => {
  const textWidth = Array.from(name).reduce(
    (width, character) =>
      width + ((character.codePointAt(0) ?? 0) <= 0xff ? 7 : 12),
    0,
  );

  return Math.max(0, Math.min(clipWidth - 8, textWidth + 18));
};

const useTimelineImages = (srcs: readonly (string | null)[]) => {
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());
  const [loadedImage, setLoadedImage] = useState<{
    images: (HTMLImageElement | null)[];
    srcKey: string;
  } | null>(null);
  const srcKey = [srcs.length, ...srcs.map((src) => src ?? '')].join('\n');

  useEffect(() => {
    const nextSrcs = srcKey.split('\n').slice(1);
    if (nextSrcs.length === 0) {
      return undefined;
    }

    const imageCache = imageCacheRef.current;
    const nextImages = nextSrcs.map((src) =>
      src ? (imageCache.get(src) ?? null) : null,
    );
    setLoadedImage({ images: [...nextImages], srcKey });

    const pendingImages = nextSrcs.flatMap((src, index) => {
      if (!src || imageCache.has(src)) return [];

      const nextImage = new Image();
      nextImage.crossOrigin = 'anonymous';
      nextImage.onload = () => {
        imageCache.set(src, nextImage);
        nextImages[index] = nextImage;
        setLoadedImage({ images: [...nextImages], srcKey });
      };
      nextImage.onerror = () => {
        setLoadedImage({ images: [...nextImages], srcKey });
      };
      nextImage.src = src;

      return [nextImage];
    });

    return () => {
      pendingImages.forEach((image) => {
        image.onload = null;
        image.onerror = null;
      });
    };
  }, [srcKey]);

  if (!loadedImage || loadedImage.srcKey !== srcKey) {
    return [];
  }

  return loadedImage.images;
};

export function ClipNode({
  clip,
  dragBoundFunc,
  height,
  isDragging,
  isSelected,
  onDragEnd,
  onDragMove,
  onDragStart,
  onCursorChange,
  onSelect,
  onTrackVolumeChange = ignoreTrackVolumeChange,
  onTrackVolumeCommit = ignoreTrackVolumeChange,
  onTrimDragEnd,
  onTrimDragMove,
  onTrimDragStart,
  trackVolume = 1,
  width,
  x,
  y,
}: ClipNodeProps) {
  const pixelsPerSecond = clip.duration > 0 ? width / clip.duration : 0;
  const previewSourceDuration = Math.max(clip.sourceDuration, clip.duration);
  const previewTimelineWidth = Math.max(
    width,
    previewSourceDuration * pixelsPerSecond,
  );
  const previewOffsetX = -clip.trimStart * pixelsPerSecond;
  const tileCount = Math.max(
    1,
    Math.floor(previewTimelineWidth / FRAME_PREVIEW_WIDTH),
  );
  const framePreviewCount = tileCount;
  const generatedPreviewClip = useMemo<TimelineClip>(
    () => ({
      duration: previewSourceDuration,
      id: clip.id,
      name: clip.name,
      sourceId: clip.sourceId,
      sourceDuration: previewSourceDuration,
      src: clip.src,
      start: clip.start,
      thumbnailUrls: clip.thumbnailUrls,
      trackId: clip.trackId,
      trimEnd: previewSourceDuration,
      trimStart: 0,
      transform: { ...clip.transform },
      type: clip.type,
      zIndex: clip.zIndex,
    }),
    [
      clip.id,
      clip.name,
      clip.sourceId,
      clip.src,
      clip.start,
      clip.thumbnailUrls,
      clip.trackId,
      clip.transform,
      clip.type,
      clip.zIndex,
      previewSourceDuration,
    ],
  );
  const generatedPreviewUrls = useFramePreviewUrls(
    generatedPreviewClip,
    framePreviewCount,
    clip.type === 'video' && clip.thumbnailUrls.length === 0,
  );
  const previewUrls =
    clip.thumbnailUrls.length > 0 ? clip.thumbnailUrls : generatedPreviewUrls;
  const images = useTimelineImages(previewUrls);
  const waveformSamples = useAudioWaveformSamples(
    clip.waveformSrc ?? clip.src,
    clip.type === 'audio',
  );
  const previewSlotCount =
    images.length > 0 ? Math.min(images.length, tileCount) : tileCount;
  const previewSlotWidth = previewTimelineWidth / previewSlotCount;
  const previewSlots = useMemo(
    () => Array.from({ length: previewSlotCount }, (_, index) => index),
    [previewSlotCount],
  );
  const waveformPoints = useMemo(() => {
    if (waveformSamples.length === 0) return [];

    const centerY = height / 2;
    const maxAmplitude = Math.max(4, height / 2 - 12);
    const topPoints = waveformSamples.flatMap((sample, index) => [
      (index / Math.max(1, waveformSamples.length - 1)) * previewTimelineWidth,
      centerY - sample * maxAmplitude,
    ]);
    const bottomPoints = [...waveformSamples]
      .reverse()
      .flatMap((sample, reverseIndex) => {
        const index = waveformSamples.length - reverseIndex - 1;
        return [
          (index / Math.max(1, waveformSamples.length - 1)) *
            previewTimelineWidth,
          centerY + sample * maxAmplitude,
        ];
      });

    return [...topPoints, ...bottomPoints];
  }, [height, previewTimelineWidth, waveformSamples]);
  const fill = clip.type === 'video' ? '#1f3f52' : AUDIO_CLIP_FILL;
  const audioLabelWidth = getAudioLabelWidth(clip.name, width);
  const strokeWidth = 1;
  const selectedStrokeWidth = 3;
  const selectedStrokeInset = selectedStrokeWidth / 2;
  const strokeInset = strokeWidth / 2;
  const handleHitWidth = Math.min(TRIM_HANDLE_HIT_WIDTH, width);
  const handleWidth = Math.min(TRIM_HANDLE_WIDTH, width);
  const startHandleX = -handleHitWidth + handleWidth;
  const endHandleX = width - handleWidth;
  const canRestoreStartTrim = clip.trimStart > TRIM_RESTORE_EPSILON_SECONDS;
  const canRestoreEndTrim =
    clip.trimEnd < clip.sourceDuration - TRIM_RESTORE_EPSILON_SECONDS;

  return (
    <Group
      draggable
      dragBoundFunc={dragBoundFunc}
      height={height}
      name='clip'
      opacity={isDragging ? 0.72 : 1}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect(clip.id);
      }}
      onDragEnd={(event) => {
        onCursorChange('clip-drag', 'default');
        onDragEnd(event);
      }}
      onDragMove={onDragMove}
      onDragStart={(event) => {
        onCursorChange('clip-drag', 'grabbing');
        onDragStart(event);
      }}
      onMouseDown={(event) => {
        event.cancelBubble = true;
        onSelect(clip.id);
      }}
      onMouseEnter={(event) => {
        event.cancelBubble = true;
        onCursorChange('clip', 'pointer');
      }}
      onMouseLeave={(event) => {
        event.cancelBubble = true;
        onCursorChange('clip', 'default');
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onSelect(clip.id);
      }}
      width={width}
      x={x}
      y={y}
    >
      <Group height={height} name='clip-visual' width={width}>
        <Rect
          cornerRadius={CLIP_CORNER_RADIUS}
          fill={fill}
          height={Math.max(0, height - strokeWidth)}
          shadowBlur={isDragging ? 14 : 0}
          shadowColor='black'
          shadowOpacity={0.3}
          stroke={CLIP_STROKE}
          strokeWidth={strokeWidth}
          width={Math.max(0, width - strokeWidth)}
          x={strokeInset}
          y={strokeInset}
        />
        <Group
          clipFunc={(ctx) => {
            clipRoundedRectPath(
              ctx,
              strokeInset,
              strokeInset,
              Math.max(0, width - strokeWidth),
              Math.max(0, height - strokeWidth),
              CLIP_CORNER_RADIUS,
            );
          }}
          name='clip-content'
          x={0}
          y={0}
        >
          {clip.type === 'video' ? (
            <Group name='clip-preview-strip' x={previewOffsetX} y={0}>
              {previewSlots.map((slot) => {
                const imageIndex =
                  images.length > previewSlotCount
                    ? Math.min(
                        images.length - 1,
                        Math.floor(
                          ((slot + 0.5) * images.length) / previewSlotCount,
                        ),
                      )
                    : slot;
                const image = images.length > 0 ? images[imageIndex] : null;

                return image ? (
                  <KonvaImage
                    key={slot}
                    height={height - 4}
                    image={image}
                    opacity={0.62}
                    width={previewSlotWidth - 2}
                    x={slot * previewSlotWidth + 1}
                    y={2}
                  />
                ) : (
                  <Rect
                    key={slot}
                    cornerRadius={
                      slot === 0 || slot === previewSlotCount - 1 ? 5 : 0
                    }
                    fill={
                      slot % 2 === 0
                        ? 'rgb(255 255 255 / 10%)'
                        : 'rgb(0 0 0 / 14%)'
                    }
                    height={height - 4}
                    width={previewSlotWidth - 2}
                    x={slot * previewSlotWidth + 1}
                    y={2}
                  />
                );
              })}
            </Group>
          ) : (
            <Group name='clip-waveform' x={previewOffsetX} y={0}>
              {waveformPoints.length > 0 && (
                <Line
                  closed
                  fill={AUDIO_WAVEFORM_FILL}
                  listening={false}
                  name='clip-waveform-shape'
                  opacity={0.86}
                  points={waveformPoints}
                />
              )}
              {waveformPoints.length === 0 && (
                <Text
                  fill='rgb(255 255 255 / 38%)'
                  fontSize={10}
                  listening={false}
                  text='AUDIO'
                  x={8}
                  y={height / 2 - 6}
                />
              )}
            </Group>
          )}
          <Rect
            cornerRadius={CLIP_CORNER_RADIUS}
            fill='black'
            height={height}
            opacity={clip.type === 'video' ? 0.26 : 0.12}
            width={width}
          />
          {clip.type === 'audio' && (
            <AudioVolumeLine
              clipX={x}
              clipY={y}
              height={height}
              onCursorChange={onCursorChange}
              onSelect={() => onSelect(clip.id)}
              onVolumeChange={onTrackVolumeChange}
              onVolumeCommit={onTrackVolumeCommit}
              volume={trackVolume}
              width={width}
            />
          )}
          {clip.type === 'audio' && (
            <Rect
              cornerRadius={4}
              fill='rgb(8 15 24 / 82%)'
              height={20}
              listening={false}
              name='clip-audio-label-background'
              width={audioLabelWidth}
              x={4}
              y={4}
            />
          )}
          <Text
            ellipsis
            fill='white'
            fontSize={12}
            listening={false}
            name={clip.type === 'audio' ? 'clip-audio-label' : undefined}
            text={clip.name}
            width={
              clip.type === 'audio'
                ? Math.max(0, audioLabelWidth - 10)
                : Math.max(0, width - 10)
            }
            wrap='none'
            x={clip.type === 'audio' ? 9 : 2}
            y={clip.type === 'audio' ? 7 : 4}
          />
          {clip.type === 'video' && (
            <Text
              align='right'
              fill='rgb(255 255 255 / 70%)'
              fontSize={12}
              listening={false}
              text={`${clip.duration.toFixed(1)}s`}
              width={Math.max(0, width - 8)}
              x={0}
              y={height - 22}
            />
          )}
        </Group>
        {isSelected && (
          <Rect
            cornerRadius={CLIP_CORNER_RADIUS}
            height={Math.max(0, height - selectedStrokeWidth)}
            listening={false}
            stroke={SELECTED_CLIP_STROKE}
            strokeWidth={selectedStrokeWidth}
            width={Math.max(0, width - selectedStrokeWidth)}
            x={selectedStrokeInset}
            y={selectedStrokeInset}
          />
        )}
      </Group>
      {isSelected && (
        <>
          <TrimHandle
            clipX={x}
            clipY={y}
            edge='start'
            height={height}
            hitWidth={handleHitWidth}
            isRestoreAvailable={canRestoreStartTrim}
            onCursorChange={onCursorChange}
            onTrimDragEnd={onTrimDragEnd}
            onTrimDragMove={onTrimDragMove}
            onTrimDragStart={onTrimDragStart}
            visibleWidth={handleWidth}
            x={startHandleX}
          />
          <TrimHandle
            clipX={x}
            clipY={y}
            edge='end'
            height={height}
            hitWidth={handleHitWidth}
            isRestoreAvailable={canRestoreEndTrim}
            onCursorChange={onCursorChange}
            onTrimDragEnd={onTrimDragEnd}
            onTrimDragMove={onTrimDragMove}
            onTrimDragStart={onTrimDragStart}
            visibleWidth={handleWidth}
            x={endHandleX}
          />
        </>
      )}
    </Group>
  );
}

type AudioVolumeLineProps = {
  clipX: number;
  clipY: number;
  height: number;
  onCursorChange: (source: 'volume', cursor: TimelineCursor) => void;
  onSelect: () => void;
  onVolumeChange: (volume: number) => void;
  onVolumeCommit: (previousVolume: number, volume: number) => void;
  volume: number;
  width: number;
};

function AudioVolumeLine({
  clipX,
  clipY,
  height,
  onCursorChange,
  onSelect,
  onVolumeChange,
  onVolumeCommit,
  volume,
  width,
}: AudioVolumeLineProps) {
  const [isHovered, setIsHovered] = useState(false);
  const initialVolumeRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const lineY = getAudioVolumeLineY(volume, height);
  const getEventVolume = (event: Konva.KonvaEventObject<DragEvent>) => {
    const pointerY = event.target.getStage()?.getPointerPosition()?.y;
    return getAudioVolumeAtY((pointerY ?? clipY + lineY) - clipY, height);
  };

  return (
    <Group
      draggable
      dragBoundFunc={(position) => ({
        x: clipX,
        y: Math.min(
          clipY + height - AUDIO_VOLUME_LINE_BOTTOM,
          Math.max(clipY + AUDIO_VOLUME_LINE_TOP, position.y),
        ),
      })}
      name='clip-volume-control'
      onClick={(event) => {
        event.cancelBubble = true;
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        const nextVolume = getEventVolume(event);
        const previousVolume = initialVolumeRef.current ?? volume;
        initialVolumeRef.current = null;
        isDraggingRef.current = false;
        event.target.position({
          x: 0,
          y: getAudioVolumeLineY(nextVolume, height),
        });
        onVolumeChange(nextVolume);
        onVolumeCommit(previousVolume, nextVolume);
        onCursorChange('volume', 'default');
      }}
      onDragMove={(event) => {
        event.cancelBubble = true;
        onVolumeChange(getEventVolume(event));
      }}
      onDragStart={(event) => {
        event.cancelBubble = true;
        initialVolumeRef.current = volume;
        isDraggingRef.current = true;
        setIsHovered(true);
        onSelect();
        onCursorChange('volume', 'ns-resize');
      }}
      onMouseDown={(event) => {
        event.cancelBubble = true;
        onSelect();
        onCursorChange('volume', 'ns-resize');
      }}
      onMouseEnter={(event) => {
        event.cancelBubble = true;
        setIsHovered(true);
        onCursorChange('volume', 'ns-resize');
      }}
      onMouseLeave={(event) => {
        event.cancelBubble = true;
        if (isDraggingRef.current) return;
        setIsHovered(false);
        onCursorChange('volume', 'default');
      }}
      width={width}
      x={0}
      y={lineY}
    >
      <Rect
        fill='black'
        height={AUDIO_VOLUME_LINE_HIT_HEIGHT}
        opacity={0.01}
        width={width}
        y={-AUDIO_VOLUME_LINE_HIT_HEIGHT / 2}
      />
      <Line
        listening={false}
        name='clip-volume-line'
        points={[0, 0, width, 0]}
        shadowBlur={isHovered ? 5 : 0}
        shadowColor={AUDIO_VOLUME_LINE_ACTIVE}
        stroke={isHovered ? AUDIO_VOLUME_LINE_ACTIVE : AUDIO_VOLUME_LINE_IDLE}
        strokeWidth={isHovered ? 2 : 1}
      />
    </Group>
  );
}

type TrimHandleProps = {
  clipX: number;
  clipY: number;
  edge: TimelineClipTrimEdge;
  height: number;
  hitWidth: number;
  isRestoreAvailable: boolean;
  onCursorChange: (source: 'trim', cursor: TimelineCursor) => void;
  onTrimDragEnd: (
    edge: TimelineClipTrimEdge,
    event: Konva.KonvaEventObject<DragEvent>,
  ) => void;
  onTrimDragMove: (
    edge: TimelineClipTrimEdge,
    event: Konva.KonvaEventObject<DragEvent>,
  ) => void;
  onTrimDragStart: (
    edge: TimelineClipTrimEdge,
    event: Konva.KonvaEventObject<DragEvent>,
  ) => void;
  visibleWidth: number;
  x: number;
};

function TrimHandle({
  clipX,
  clipY,
  edge,
  height,
  hitWidth,
  isRestoreAvailable,
  onCursorChange,
  onTrimDragEnd,
  onTrimDragMove,
  onTrimDragStart,
  visibleWidth,
  x,
}: TrimHandleProps) {
  const visibleX = edge === 'start' ? Math.max(0, hitWidth - visibleWidth) : 0;
  const visibleHeight = Math.max(0, height - TRIM_HANDLE_INSET_Y * 2);
  const markerCenterX = visibleX + visibleWidth / 2;
  const markerCenterY = TRIM_HANDLE_INSET_Y + visibleHeight / 2;
  const resetHandlePosition = (event: Konva.KonvaEventObject<DragEvent>) => {
    event.target.position({ x, y: 0 });
  };
  const isPointerInsideHandle = (event: Konva.KonvaEventObject<DragEvent>) => {
    const pointer = event.target.getStage()?.getPointerPosition();
    if (!pointer) return false;

    return (
      pointer.x >= clipX + x &&
      pointer.x <= clipX + x + hitWidth &&
      pointer.y >= clipY &&
      pointer.y <= clipY + height
    );
  };

  return (
    <Group
      draggable
      dragBoundFunc={() => ({
        x: clipX + x,
        y: clipY,
      })}
      name={`clip-trim-${edge}`}
      onClick={(event) => {
        event.cancelBubble = true;
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        resetHandlePosition(event);
        onCursorChange(
          'trim',
          isPointerInsideHandle(event) ? 'ew-resize' : 'default',
        );
        onTrimDragEnd(edge, event);
      }}
      onDragMove={(event) => {
        event.cancelBubble = true;
        resetHandlePosition(event);
        onCursorChange('trim', 'ew-resize');
        onTrimDragMove(edge, event);
      }}
      onDragStart={(event) => {
        event.cancelBubble = true;
        resetHandlePosition(event);
        onCursorChange('trim', 'ew-resize');
        onTrimDragStart(edge, event);
      }}
      onMouseDown={(event) => {
        event.cancelBubble = true;
        onCursorChange('trim', 'ew-resize');
      }}
      onMouseEnter={(event) => {
        event.cancelBubble = true;
        onCursorChange('trim', 'ew-resize');
      }}
      onMouseLeave={(event) => {
        event.cancelBubble = true;
        onCursorChange('trim', 'default');
      }}
      onTap={(event) => {
        event.cancelBubble = true;
      }}
      width={hitWidth}
      x={x}
      y={0}
    >
      <Rect fill='black' height={height} opacity={0.01} width={hitWidth} />
      <Rect
        cornerRadius={3}
        fill='black'
        height={Math.max(0, visibleHeight + 2)}
        opacity={0.36}
        width={Math.max(0, visibleWidth + 2)}
        x={Math.max(0, visibleX - 1)}
        y={TRIM_HANDLE_INSET_Y - 1}
      />
      <Rect
        cornerRadius={3}
        fill='#f8fafc'
        height={visibleHeight}
        opacity={0.96}
        shadowBlur={4}
        shadowColor='black'
        shadowOpacity={0.42}
        width={visibleWidth}
        x={visibleX}
        y={TRIM_HANDLE_INSET_Y}
      />
      {isRestoreAvailable && (
        <Rect
          cornerRadius={TRIM_RESTORE_MARKER_WIDTH / 2}
          fill={TRIM_RESTORE_MARKER_FILL}
          height={TRIM_RESTORE_MARKER_HEIGHT}
          listening={false}
          name={`clip-trim-restore-marker-${edge}`}
          width={TRIM_RESTORE_MARKER_WIDTH}
          x={markerCenterX - TRIM_RESTORE_MARKER_WIDTH / 2}
          y={markerCenterY - TRIM_RESTORE_MARKER_HEIGHT / 2}
        />
      )}
    </Group>
  );
}


