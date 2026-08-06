import { createStore, type StoreApi } from 'zustand/vanilla';

import type { VideoTimelineSource } from '../types';

const cloneSource = (source: VideoTimelineSource): VideoTimelineSource => ({
  ...source,
});

export type VideoTimelineSourceState = {
  revision: number;
  sourceRevisions: Record<string, number>;
  sources: VideoTimelineSource[];
};

export type VideoTimelineSourceStoreApi = StoreApi<VideoTimelineSourceState>;

export const createVideoTimelineSourceStore = (
  sources: readonly VideoTimelineSource[] = [],
): VideoTimelineSourceStoreApi => {
  const ids = new Set<string>();
  for (const source of sources) {
    if (ids.has(source.id)) {
      throw new TypeError(`素材 ID 重复：${source.id}`);
    }
    ids.add(source.id);
  }

  return createStore<VideoTimelineSourceState>()(() => ({
    revision: 0,
    sourceRevisions: Object.fromEntries(
      sources.map((source) => [source.id, 0]),
    ),
    sources: sources.map(cloneSource),
  }));
};

export const getSourceSnapshot = (
  store: VideoTimelineSourceStoreApi,
  id: string,
) => {
  const source = store
    .getState()
    .sources.find((candidate) => candidate.id === id);
  return source ? cloneSource(source) : undefined;
};

export const getSourceSnapshots = (store: VideoTimelineSourceStoreApi) =>
  store.getState().sources.map(cloneSource);

export const getSourceRevision = (
  store: VideoTimelineSourceStoreApi,
  id: string,
) => store.getState().sourceRevisions[id];

export const addSourceSnapshot = (
  store: VideoTimelineSourceStoreApi,
  source: VideoTimelineSource,
) => {
  store.setState((state) => {
    const revision = state.revision + 1;
    return {
      revision,
      sourceRevisions: { ...state.sourceRevisions, [source.id]: revision },
      sources: [...state.sources, cloneSource(source)],
    };
  });
};

export const updateSourceSnapshot = (
  store: VideoTimelineSourceStoreApi,
  source: VideoTimelineSource,
) => {
  store.setState((state) => {
    const revision = state.revision + 1;
    return {
      revision,
      sourceRevisions: { ...state.sourceRevisions, [source.id]: revision },
      sources: state.sources.map((candidate) =>
        candidate.id === source.id ? cloneSource(source) : candidate,
      ),
    };
  });
};

export const removeSourceSnapshot = (
  store: VideoTimelineSourceStoreApi,
  id: string,
) => {
  store.setState((state) => {
    const revision = state.revision + 1;
    return {
      revision,
      sourceRevisions: { ...state.sourceRevisions, [id]: revision },
      sources: state.sources.filter((source) => source.id !== id),
    };
  });
};
