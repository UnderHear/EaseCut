import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAudioWaveformCache,
  sampleAudioBuffer,
} from './audio-waveform';

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
});
