import type { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import soundTouchProcessorUrl from 'virtual:opencut-soundtouch-processor-url';

import type { TimelineClipSpeed } from '../core/model';

export type PreviewAudioConfiguration = {
  muted: boolean;
  speed: TimelineClipSpeed;
  volume: number;
};

type PreviewAudioConnection = {
  directGain: GainNode;
  outputGain: GainNode;
  source: MediaElementAudioSourceNode;
  stretchGain: GainNode;
  stretchNode: SoundTouchNode;
};

type PendingPreviewAudioConnection = {
  configuration: PreviewAudioConfiguration;
  connection?: PreviewAudioConnection;
  promise: Promise<PreviewAudioConnection | null>;
};

const setAudioParam = (
  parameter: AudioParam,
  value: number,
  context: BaseAudioContext,
) => {
  parameter.cancelScheduledValues(context.currentTime);
  parameter.setValueAtTime(value, context.currentTime);
};

const setNativePitchPreservation = (
  element: HTMLMediaElement,
  enabled: boolean,
) => {
  if ('preservesPitch' in element) {
    element.preservesPitch = enabled;
  }
};

const applyNativeConfiguration = (
  element: HTMLMediaElement,
  configuration: PreviewAudioConfiguration,
) => {
  element.muted = configuration.muted;
  element.playbackRate = configuration.speed;
  element.volume = configuration.muted ? 0 : configuration.volume;
  setNativePitchPreservation(element, true);
};

const applyEnhancedConfiguration = (
  context: AudioContext,
  element: HTMLMediaElement,
  connection: PreviewAudioConnection,
  configuration: PreviewAudioConfiguration,
) => {
  const shouldStretch = configuration.speed !== 1;

  element.muted = false;
  element.playbackRate = configuration.speed;
  element.volume = 1;
  setNativePitchPreservation(element, false);

  setAudioParam(
    connection.outputGain.gain,
    configuration.muted ? 0 : configuration.volume,
    context,
  );
  setAudioParam(connection.directGain.gain, shouldStretch ? 0 : 1, context);
  setAudioParam(connection.stretchGain.gain, shouldStretch ? 1 : 0, context);
  setAudioParam(
    connection.stretchNode.playbackRate,
    configuration.speed,
    context,
  );
  setAudioParam(connection.stretchNode.pitch, 1, context);
  setAudioParam(connection.stretchNode.pitchSemitones, 0, context);
};

const disconnectConnection = (connection: PreviewAudioConnection) => {
  connection.stretchNode.port.onmessage = null;
  connection.stretchNode.port.close();
  connection.source.disconnect();
  connection.directGain.disconnect();
  connection.stretchNode.disconnect();
  connection.stretchGain.disconnect();
  connection.outputGain.disconnect();
};

const canCreateAudioWorkletGraph = () =>
  typeof AudioContext !== 'undefined' &&
  typeof AudioWorkletNode !== 'undefined';

export class PreviewAudioEngine {
  private audioContext: AudioContext | null = null;
  private connections = new Map<
    HTMLMediaElement,
    PendingPreviewAudioConnection
  >();
  private disposed = false;
  private registrationPromise: Promise<void> | null = null;
  private soundTouchModulePromise: Promise<
    typeof import('@soundtouchjs/audio-worklet')
  > | null = null;

  configure(
    element: HTMLMediaElement,
    configuration: PreviewAudioConfiguration,
  ) {
    const entry = this.connections.get(element);
    if (!entry?.connection || !this.audioContext) {
      applyNativeConfiguration(element, configuration);
      if (entry) entry.configuration = configuration;
      return;
    }

    entry.configuration = configuration;
    applyEnhancedConfiguration(
      this.audioContext,
      element,
      entry.connection,
      configuration,
    );
  }

  async prepare(
    element: HTMLMediaElement,
    configuration: PreviewAudioConfiguration,
  ): Promise<boolean> {
    if (this.disposed) return false;

    const existing = this.connections.get(element);
    if (existing) {
      existing.configuration = configuration;
      const connection = await existing.promise;
      if (!connection || this.disposed) return false;
      this.configure(element, configuration);
      return true;
    }

    applyNativeConfiguration(element, configuration);
    if (!canCreateAudioWorkletGraph()) return false;

    const entry: PendingPreviewAudioConnection = {
      configuration,
      promise: Promise.resolve(null),
    };
    entry.promise = this.createConnection(element);
    this.connections.set(element, entry);

    const connection = await entry.promise;
    if (
      !connection ||
      this.disposed ||
      this.connections.get(element) !== entry
    ) {
      if (connection) disconnectConnection(connection);
      return false;
    }

    entry.connection = connection;
    this.configure(element, entry.configuration);
    return true;
  }

  release(element: HTMLMediaElement) {
    const entry = this.connections.get(element);
    if (!entry) return;

    this.connections.delete(element);
    if (entry.connection) disconnectConnection(entry.connection);
  }

  async resume(): Promise<boolean> {
    const context = this.audioContext;
    if (!context || this.disposed) return false;
    if (context.state === 'suspended') await context.resume();
    return context.state === 'running';
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    for (const entry of this.connections.values()) {
      if (entry.connection) disconnectConnection(entry.connection);
    }
    this.connections.clear();

    const context = this.audioContext;
    this.audioContext = null;
    if (context && context.state !== 'closed') {
      void context.close().catch((error: unknown) => {
        console.warn('关闭音频预览上下文失败', error);
      });
    }
  }

  private async createConnection(
    element: HTMLMediaElement,
  ): Promise<PreviewAudioConnection | null> {
    try {
      const context = await this.getAudioContext();
      if (!context || this.disposed) return null;
      const { SoundTouchNode: SoundTouchNodeConstructor } =
        await this.getSoundTouchModule();

      const directGain = context.createGain();
      const outputGain = context.createGain();
      const stretchGain = context.createGain();
      const stretchNode = new SoundTouchNodeConstructor({ context });

      directGain.connect(outputGain);
      stretchNode.connect(stretchGain);
      stretchGain.connect(outputGain);
      outputGain.connect(context.destination);

      const source = context.createMediaElementSource(element);
      source.connect(directGain);
      source.connect(stretchNode);

      return {
        directGain,
        outputGain,
        source,
        stretchGain,
        stretchNode,
      };
    } catch (error: unknown) {
      console.warn('高质量音频变速不可用，已回退浏览器处理', error);
      return null;
    }
  }

  private async getAudioContext(): Promise<AudioContext | null> {
    if (this.disposed || !canCreateAudioWorkletGraph()) return null;
    this.audioContext ??= new AudioContext({ latencyHint: 'playback' });
    const context = this.audioContext;
    this.registrationPromise ??= this.getSoundTouchModule().then(
      ({ SoundTouchNode: SoundTouchNodeConstructor }) =>
        SoundTouchNodeConstructor.register(
          context,
          soundTouchProcessorUrl,
        ),
    );
    await this.registrationPromise;
    return context;
  }

  private getSoundTouchModule() {
    this.soundTouchModulePromise ??= import(
      '@soundtouchjs/audio-worklet'
    );
    return this.soundTouchModulePromise;
  }
}
