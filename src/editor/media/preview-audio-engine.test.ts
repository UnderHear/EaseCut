import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PreviewAudioEngine } from './preview-audio-engine';

const createDeferred = <Value,>() => {
  let resolvePromise: ((value: Value) => void) | null = null;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value: Value) {
      if (!resolvePromise) {
        throw new Error('Deferred promise resolver is unavailable');
      }
      resolvePromise(value);
    },
  };
};

const soundTouchMocks = vi.hoisted(() => {
  const instances: SoundTouchNodeMock[] = [];
  const register = vi.fn(() => Promise.resolve());

  class AudioParamMock {
    value = 0;

    cancelScheduledValues = vi.fn();

    setValueAtTime = vi.fn((value: number) => {
      this.value = value;
      return this;
    });
  }

  class SoundTouchNodeMock {
    static register = register;

    connect = vi.fn();

    disconnect = vi.fn();

    port = {
      close: vi.fn(),
      onmessage: vi.fn(),
    };

    pitch = new AudioParamMock();

    pitchSemitones = new AudioParamMock();

    playbackRate = new AudioParamMock();

    constructor() {
      instances.push(this);
    }
  }

  return { instances, register, SoundTouchNodeMock };
});

vi.mock('@soundtouchjs/audio-worklet', () => ({
  SoundTouchNode: soundTouchMocks.SoundTouchNodeMock,
}));

class AudioParamMock {
  value = 1;

  cancelScheduledValues = vi.fn();

  setValueAtTime = vi.fn((value: number) => {
    this.value = value;
    return this;
  });
}

class AudioNodeMock {
  connect = vi.fn();

  disconnect = vi.fn();
}

class GainNodeMock extends AudioNodeMock {
  gain = new AudioParamMock();
}

class AudioContextMock {
  static instances: AudioContextMock[] = [];

  close = vi.fn(async () => {
    this.state = 'closed';
  });

  createGain = vi.fn(() => {
    const gain = new GainNodeMock();
    this.gains.push(gain);
    return gain;
  });

  createMediaElementSource = vi.fn(() => {
    this.source = new AudioNodeMock();
    return this.source;
  });

  currentTime = 3;

  destination = new AudioNodeMock();

  gains: GainNodeMock[] = [];

  resume = vi.fn(async () => {
    this.state = 'running';
  });

  source: AudioNodeMock | null = null;

  state = 'suspended';

  constructor() {
    AudioContextMock.instances.push(this);
  }
}

describe('PreviewAudioEngine', () => {
  beforeEach(() => {
    AudioContextMock.instances = [];
    soundTouchMocks.instances.length = 0;
    soundTouchMocks.register.mockClear();
    vi.stubGlobal('AudioContext', AudioContextMock);
    vi.stubGlobal('AudioWorkletNode', class AudioWorkletNodeMock {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('routes retimed media through SoundTouch and preserves a direct 1x path', async () => {
    const engine = new PreviewAudioEngine();
    const media = document.createElement('audio');

    await expect(
      engine.prepare(media, {
        muted: false,
        speed: 0.5,
        volume: 0.4,
      }),
    ).resolves.toBe(true);

    const context = AudioContextMock.instances[0];
    const soundTouch = soundTouchMocks.instances[0];
    expect(context).toBeDefined();
    expect(soundTouch).toBeDefined();
    expect(soundTouchMocks.register).toHaveBeenCalledOnce();
    expect(media).toMatchObject({
      muted: false,
      playbackRate: 0.5,
      volume: 1,
    });
    expect(context?.gains.map((gain) => gain.gain.value)).toEqual([
      0,
      0.4,
      1,
    ]);
    expect(soundTouch?.playbackRate.value).toBe(0.5);
    expect(soundTouch?.pitch.value).toBe(1);

    const configuredParams = [
      ...(context?.gains.map((gain) => gain.gain) ?? []),
      soundTouch?.pitch,
      soundTouch?.pitchSemitones,
      soundTouch?.playbackRate,
    ].filter((parameter) => parameter !== undefined);
    for (const parameter of configuredParams) {
      parameter.cancelScheduledValues.mockClear();
      parameter.setValueAtTime.mockClear();
    }

    engine.configure(media, {
      muted: false,
      speed: 0.5,
      volume: 0.4,
    });

    for (const parameter of configuredParams) {
      expect(parameter.cancelScheduledValues).not.toHaveBeenCalled();
      expect(parameter.setValueAtTime).not.toHaveBeenCalled();
    }

    engine.configure(media, {
      muted: true,
      speed: 1,
      volume: 0.8,
    });

    expect(context?.gains.map((gain) => gain.gain.value)).toEqual([
      1,
      0,
      0,
    ]);
    await expect(engine.resume()).resolves.toBe(true);
    expect(context?.resume).toHaveBeenCalledOnce();

    engine.release(media);
    expect(context?.source?.disconnect).toHaveBeenCalledOnce();
    expect(soundTouch?.port.close).toHaveBeenCalledOnce();
    expect(soundTouch?.port.onmessage).toBeNull();
    engine.dispose();
  });

  it('falls back to native pitch preservation without AudioWorklet', async () => {
    vi.unstubAllGlobals();
    const engine = new PreviewAudioEngine();
    const media = document.createElement('audio');
    Object.defineProperty(media, 'preservesPitch', {
      configurable: true,
      writable: true,
      value: false,
    });

    await expect(
      engine.prepare(media, {
        muted: false,
        speed: 0.25,
        volume: 0.6,
      }),
    ).resolves.toBe(false);

    expect(media).toMatchObject({
      playbackRate: 0.25,
      preservesPitch: true,
      volume: 0.6,
    });
    engine.dispose();
  });

  it('keeps the newest configuration when audio preparation finishes late', async () => {
    const registration = createDeferred<void>();
    soundTouchMocks.register.mockImplementationOnce(
      () => registration.promise,
    );
    const engine = new PreviewAudioEngine();
    const media = document.createElement('audio');
    const firstPreparation = engine.prepare(media, {
      muted: true,
      speed: 0.5,
      volume: 0.2,
    });
    const secondPreparation = engine.prepare(media, {
      muted: true,
      speed: 0.5,
      volume: 0.4,
    });

    engine.configure(media, {
      muted: false,
      speed: 0.5,
      volume: 0.8,
    });
    registration.resolve();
    await expect(
      Promise.all([firstPreparation, secondPreparation]),
    ).resolves.toEqual([true, true]);

    const context = AudioContextMock.instances[0];
    expect(context?.gains[1]?.gain.value).toBe(0.8);
    expect(media).toMatchObject({
      muted: false,
      playbackRate: 0.5,
      volume: 1,
    });
    engine.dispose();
  });
});
