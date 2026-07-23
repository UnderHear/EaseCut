import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAudioWaveformCache,
  sampleAudioBuffer,
} from './audio-waveform';
import type { AudioWaveformExtractor } from './mediabunny-audio-waveform';
import { MAX_AUDIO_WAVEFORM_SAMPLE_COUNT } from '../workers/audio-waveform-protocol';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('audio waveform', () => {
  it('returns no samples for an empty audio buffer', () => {
    expect(
      sampleAudioBuffer({
        getChannelData: () => new Float32Array(),
        length: 0,
        numberOfChannels: 1,
      }),
    ).toEqual([]);
  });

  it('returns no samples when the requested sample count is zero', () => {
    expect(
      sampleAudioBuffer(
        {
          getChannelData: () => new Float32Array([0.5, -0.5]),
          length: 2,
          numberOfChannels: 1,
        },
        0,
      ),
    ).toEqual([]);
  });

  it('keeps a silent buffer as normalized zero samples', () => {
    expect(
      sampleAudioBuffer(
        {
          getChannelData: () => new Float32Array([0, 0, 0, 0]),
          length: 4,
          numberOfChannels: 1,
        },
        2,
      ),
    ).toEqual([0, 0]);
  });

  it('samples and normalizes peaks across all channels', () => {
    const channels = [
      new Float32Array([0, 0.25, -0.5, 0.25]),
      new Float32Array([0, -1, 0.2, 0.1]),
    ];

    expect(
      sampleAudioBuffer(
        {
          getChannelData: (channel) => channels[channel],
          length: 4,
          numberOfChannels: 2,
        },
        2,
      ),
    ).toEqual([1, 0.5]);
  });

  it('deduplicates decoding inside one cache without sharing another instance', async () => {
    const decodeAudioData = vi.fn().mockResolvedValue({
      getChannelData: () => new Float32Array([0, 1, 0.5, 0]),
      length: 4,
      numberOfChannels: 1,
    });
    vi.stubGlobal(
      'AudioContext',
      class AudioContextMock {
        decodeAudioData = decodeAudioData;
        close = vi.fn().mockResolvedValue(undefined);
      },
    );
    const getBlob = vi.fn().mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    } as unknown as Blob);
    const firstCache = createAudioWaveformCache(getBlob, () => false);
    const secondCache = createAudioWaveformCache(getBlob, () => false);

    const first = firstCache.getSamples('/music.mp3');
    const duplicate = firstCache.getSamples('/music.mp3');
    expect(duplicate).toBe(first);
    await expect(first).resolves.toHaveLength(512);
    await expect(secondCache.getSamples('/music.mp3')).resolves.toHaveLength(
      512,
    );

    expect(getBlob).toHaveBeenCalledTimes(2);
    expect(decodeAudioData).toHaveBeenCalledTimes(2);
  });

  it('allows a retry after a transient decoding failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const decodeAudioData = vi.fn().mockResolvedValue({
      getChannelData: () => new Float32Array([0, 1, 0.5, 0]),
      length: 4,
      numberOfChannels: 1,
    });
    vi.stubGlobal(
      'AudioContext',
      class AudioContextMock {
        decodeAudioData = decodeAudioData;
        close = vi.fn().mockResolvedValue(undefined);
      },
    );
    const getBlob = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      } as unknown as Blob);
    const cache = createAudioWaveformCache(getBlob, () => false);

    await expect(cache.getSamples('/music.mp3')).resolves.toEqual([]);
    await expect(cache.getSamples('/music.mp3')).resolves.toHaveLength(512);
    expect(getBlob).toHaveBeenCalledTimes(2);
  });

  it('prefers the Mediabunny worker without creating an AudioContext', async () => {
    const extractor: AudioWaveformExtractor = {
      dispose: vi.fn(),
      extract: vi.fn().mockResolvedValue([0.25, 1]),
    };
    const getBlob = vi.fn().mockResolvedValue(new Blob(['audio']));
    const cache = createAudioWaveformCache(
      getBlob,
      () => false,
      extractor,
    );

    await expect(cache.getSamples('/music.mp3', 2)).resolves.toEqual([
      0.25, 1,
    ]);
    expect(extractor.extract).toHaveBeenCalledWith(
      expect.any(Blob),
      2,
      expect.any(AbortSignal),
    );
    expect(globalThis.AudioContext).toBeUndefined();
  });

  it('falls back to AudioContext when Mediabunny cannot decode the source', async () => {
    const extractor: AudioWaveformExtractor = {
      dispose: vi.fn(),
      extract: vi.fn().mockRejectedValue(new Error('unsupported')),
    };
    const decodeAudioData = vi.fn().mockResolvedValue({
      getChannelData: () => new Float32Array([0, 1, 0.5, 0]),
      length: 4,
      numberOfChannels: 1,
    });
    vi.stubGlobal(
      'AudioContext',
      class AudioContextMock {
        decodeAudioData = decodeAudioData;
        close = vi.fn().mockResolvedValue(undefined);
      },
    );
    const cache = createAudioWaveformCache(
      vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      } as unknown as Blob),
      () => false,
      extractor,
    );

    await expect(cache.getSamples('/music.mp3', 2)).resolves.toEqual([
      1, 0.5,
    ]);
    expect(extractor.extract).toHaveBeenCalledTimes(1);
    expect(decodeAudioData).toHaveBeenCalledTimes(1);
  });

  it('aborts active worker extraction when the cache is cleared', async () => {
    const extractor: AudioWaveformExtractor = {
      dispose: vi.fn(),
      extract: vi.fn((_blob, _sampleCount, signal) => {
        return new Promise<number[]>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        });
      }),
    };
    const cache = createAudioWaveformCache(
      vi.fn().mockResolvedValue(new Blob(['audio'])),
      () => false,
      extractor,
    );
    const request = cache.getSamples('/music.mp3');
    await vi.waitFor(() => expect(extractor.extract).toHaveBeenCalled());

    cache.clear();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not let a cleared request remove a newer cache entry', async () => {
    const resolvers: Array<(samples: number[]) => void> = [];
    const extractor: AudioWaveformExtractor = {
      dispose: vi.fn(),
      extract: vi.fn(
        () =>
          new Promise<number[]>((resolve) => {
            resolvers.push(resolve);
          }),
      ),
    };
    const cache = createAudioWaveformCache(
      vi.fn().mockResolvedValue(new Blob(['audio'])),
      () => false,
      extractor,
    );
    const first = cache.getSamples('/music.mp3', 2);
    await vi.waitFor(() => expect(resolvers).toHaveLength(1));
    cache.clear();
    const second = cache.getSamples('/music.mp3', 2);
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));

    resolvers[0]?.([0.1, 0.2]);
    resolvers[1]?.([0.5, 1]);

    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).resolves.toEqual([0.5, 1]);
    await expect(cache.getSamples('/music.mp3', 2)).resolves.toEqual([
      0.5, 1,
    ]);
    expect(extractor.extract).toHaveBeenCalledTimes(2);
  });

  it('normalizes unsafe sample counts before starting worker work', async () => {
    const extractor: AudioWaveformExtractor = {
      dispose: vi.fn(),
      extract: vi.fn().mockResolvedValue([]),
    };
    const getBlob = vi.fn().mockResolvedValue(new Blob(['audio']));
    const cache = createAudioWaveformCache(
      getBlob,
      () => false,
      extractor,
    );

    await expect(cache.getSamples('/nan.mp3', Number.NaN)).resolves.toEqual(
      [],
    );
    await expect(
      cache.getSamples('/infinity.mp3', Number.POSITIVE_INFINITY),
    ).resolves.toEqual([]);
    expect(getBlob).not.toHaveBeenCalled();

    await cache.getSamples('/huge.mp3', Number.MAX_SAFE_INTEGER);
    expect(extractor.extract).toHaveBeenCalledWith(
      expect.any(Blob),
      MAX_AUDIO_WAVEFORM_SAMPLE_COUNT,
      expect.any(AbortSignal),
    );
  });

  it('preserves AbortError semantics when a worker fails during cancellation', async () => {
    const extractor: AudioWaveformExtractor = {
      dispose: vi.fn(),
      extract: vi.fn((_blob, _sampleCount, signal) => {
        return new Promise<number[]>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new Error('worker stopped')),
            { once: true },
          );
        });
      }),
    };
    const cache = createAudioWaveformCache(
      vi.fn().mockResolvedValue(new Blob(['audio'])),
      () => false,
      extractor,
    );
    const request = cache.getSamples('/music.mp3');
    await vi.waitFor(() => expect(extractor.extract).toHaveBeenCalled());

    cache.clear();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});
