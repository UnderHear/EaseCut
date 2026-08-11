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
import { createEaseCutApi } from './create-easecut-api';
import type { VideoTimelineSourceStoreApi } from './source-store';
import type { EaseCutHandle } from './types';

const EaseCutApiContext =
  createContext<EaseCutHandle | null>(null);

type EaseCutApiProviderProps = {
  apiRef: Ref<EaseCutHandle>;
  children: ReactNode;
  sourceStore: VideoTimelineSourceStoreApi;
};

export function EaseCutApiProvider({
  apiRef,
  children,
  sourceStore,
}: EaseCutApiProviderProps) {
  const mediaRuntime = useMediaRuntime();
  const timelineStore = useTimelineStoreApi();
  const api = useMemo(
    () =>
      createEaseCutApi({
        mediaRuntime,
        sourceStore,
        timelineStore,
      }),
    [mediaRuntime, sourceStore, timelineStore],
  );
  useImperativeHandle(apiRef, () => api, [api]);

  return (
    <EaseCutApiContext.Provider value={api}>
      {children}
    </EaseCutApiContext.Provider>
  );
}

export const useEaseCutApi = () => {
  const api = useContext(EaseCutApiContext);
  if (!api) {
    throw new Error(
      'useEaseCutApi 必须在 EaseCutApiProvider 内使用',
    );
  }
  return api;
};
