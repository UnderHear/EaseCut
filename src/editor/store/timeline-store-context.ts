import {
  createContext,
  createElement,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { useStore } from 'zustand';

import type { VideoTimelineDraft, VideoTimelineSource } from '../types';
import {
  createTimelineStore,
  type TimelineStore,
  type TimelineStoreApi,
} from './timeline-store';

const TimelineStoreContext = createContext<TimelineStoreApi | null>(null);

export type TimelineStoreProviderProps = {
  children: ReactNode;
  initialDraft?: VideoTimelineDraft;
  sources?: VideoTimelineSource[];
  store?: TimelineStoreApi;
};

export const TimelineStoreProvider = ({
  children,
  initialDraft,
  sources,
  store: providedStore,
}: TimelineStoreProviderProps) => {
  const [store] = useState(
    () =>
      providedStore ??
      createTimelineStore({
        draft: initialDraft,
        sources,
      }),
  );

  return createElement(TimelineStoreContext.Provider, { value: store }, children);
};

export const useTimelineStoreApi = (): TimelineStoreApi => {
  const store = useContext(TimelineStoreContext);
  if (!store) {
    throw new Error('useTimelineStore 必须在 TimelineStoreProvider 内使用');
  }

  return store;
};

export function useTimelineStore(): TimelineStore;
export function useTimelineStore<T>(selector: (state: TimelineStore) => T): T;
export function useTimelineStore<T>(
  selector?: (state: TimelineStore) => T,
): TimelineStore | T {
  const store = useTimelineStoreApi();
  const resolvedSelector: (state: TimelineStore) => TimelineStore | T =
    selector ?? ((state) => state);

  return useStore<TimelineStoreApi, TimelineStore | T>(store, resolvedSelector);
}
