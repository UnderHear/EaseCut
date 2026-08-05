/* eslint-disable react-refresh/only-export-components -- Provider 与内部 Hook 共享私有 Context。 */
import {
  createContext,
  useContext,
  useImperativeHandle,
  useMemo,
  type ReactNode,
  type Ref,
} from 'react';

import { useMediaRuntime } from '../media';
import { useTimelineStoreApi } from '../store/timeline-store-context';
import { createVideoTimelineEditorApi } from './create-editor-api';
import type { VideoTimelineSourceStoreApi } from './source-store';
import type { VideoTimelineEditorHandle } from './types';

const VideoTimelineEditorApiContext =
  createContext<VideoTimelineEditorHandle | null>(null);

type VideoTimelineEditorApiProviderProps = {
  apiRef: Ref<VideoTimelineEditorHandle>;
  children: ReactNode;
  sourceStore: VideoTimelineSourceStoreApi;
};

export function VideoTimelineEditorApiProvider({
  apiRef,
  children,
  sourceStore,
}: VideoTimelineEditorApiProviderProps) {
  const mediaRuntime = useMediaRuntime();
  const timelineStore = useTimelineStoreApi();
  const api = useMemo(
    () =>
      createVideoTimelineEditorApi({
        mediaRuntime,
        sourceStore,
        timelineStore,
      }),
    [mediaRuntime, sourceStore, timelineStore],
  );
  useImperativeHandle(apiRef, () => api, [api]);

  return (
    <VideoTimelineEditorApiContext.Provider value={api}>
      {children}
    </VideoTimelineEditorApiContext.Provider>
  );
}

export const useVideoTimelineEditorApi = () => {
  const api = useContext(VideoTimelineEditorApiContext);
  if (!api) {
    throw new Error(
      'useVideoTimelineEditorApi 必须在 VideoTimelineEditorApiProvider 内使用',
    );
  }
  return api;
};
