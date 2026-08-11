/* eslint-disable react-refresh/only-export-components -- 测试 Provider 与 store helper 需要共享同一实例。 */
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { MediaRuntimeProvider } from '../media';
import {
  createTimelineStore,
  type TimelineStoreApi,
} from '../store/timeline-store';
import { TimelineStoreProvider } from '../store/timeline-store-context';
import type {
  EaseCutMediaLoader,
  VideoTimelineSource,
} from '../types';

const defaultMediaLoader: EaseCutMediaLoader = {
  loadBlob: async () => new Blob([], { type: 'video/mp4' }),
};

export let testTimelineStore = createTimelineStore();

export function resetTestTimelineStore() {
  testTimelineStore = createTimelineStore();
}

type EditorTestProvidersProps = {
  children: ReactNode;
  mediaLoader?: EaseCutMediaLoader;
  sources?: VideoTimelineSource[];
  store?: TimelineStoreApi;
};

export function EditorTestProviders({
  children,
  mediaLoader = defaultMediaLoader,
  sources = [],
  store = testTimelineStore,
}: EditorTestProvidersProps) {
  return (
    <TimelineStoreProvider store={store}>
      <MediaRuntimeProvider mediaLoader={mediaLoader} sources={sources}>
        {children}
      </MediaRuntimeProvider>
    </TimelineStoreProvider>
  );
}

export function renderWithEditorProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> &
    Omit<EditorTestProvidersProps, 'children'>,
) {
  const {
    mediaLoader,
    sources,
    store,
    ...renderOptions
  } = options ?? {};

  return render(ui, {
    ...renderOptions,
    wrapper: ({ children }) => (
      <EditorTestProviders
        mediaLoader={mediaLoader}
        sources={sources}
        store={store}
      >
        {children}
      </EditorTestProviders>
    ),
  });
}
