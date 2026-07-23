import { describe, expect, it } from 'vitest';

import {
  MAX_AUDIO_WAVEFORM_SAMPLE_COUNT,
  isAudioWaveformWorkerRequest,
  isAudioWaveformWorkerResponse,
  normalizeAudioWaveformSampleCount,
} from './audio-waveform-protocol';

describe('audio waveform worker protocol', () => {
  it('validates extract and cancel requests', () => {
    expect(
      isAudioWaveformWorkerRequest({
        blob: new Blob(['audio']),
        requestId: 1,
        sampleCount: 512,
        type: 'extract',
      }),
    ).toBe(true);
    expect(
      isAudioWaveformWorkerRequest({ requestId: 1, type: 'cancel' }),
    ).toBe(true);
    expect(
      isAudioWaveformWorkerRequest({
        blob: new Blob(),
        requestId: 1,
        sampleCount: -1,
        type: 'extract',
      }),
    ).toBe(false);
    expect(
      isAudioWaveformWorkerRequest({
        blob: new Blob(),
        requestId: 1,
        sampleCount: MAX_AUDIO_WAVEFORM_SAMPLE_COUNT + 1,
        type: 'extract',
      }),
    ).toBe(false);
  });

  it('normalizes unsafe sample counts', () => {
    expect(normalizeAudioWaveformSampleCount(Number.NaN)).toBe(0);
    expect(normalizeAudioWaveformSampleCount(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normalizeAudioWaveformSampleCount(-1)).toBe(0);
    expect(normalizeAudioWaveformSampleCount(512.9)).toBe(512);
    expect(normalizeAudioWaveformSampleCount(Number.MAX_SAFE_INTEGER)).toBe(
      MAX_AUDIO_WAVEFORM_SAMPLE_COUNT,
    );
  });

  it('validates complete and error responses', () => {
    expect(
      isAudioWaveformWorkerResponse({
        requestId: 1,
        samples: new Float32Array([0, 1]),
        type: 'complete',
      }),
    ).toBe(true);
    expect(
      isAudioWaveformWorkerResponse({
        requestId: 1,
        samples: [0, 1],
        type: 'complete',
      }),
    ).toBe(false);
    expect(
      isAudioWaveformWorkerResponse({
        code: 'unsupported',
        message: 'unsupported',
        requestId: 1,
        type: 'error',
      }),
    ).toBe(true);
  });
});
