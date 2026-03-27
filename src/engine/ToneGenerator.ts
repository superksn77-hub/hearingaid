import { Ear } from '../types';

/**
 * Web Audio API 기반 순음 발생기
 * - 우측 귀: StereoPanner pan=1.0 (우측 채널만)
 * - 좌측 귀: StereoPanner pan=-1.0 (좌측 채널만)
 * - ADSR 엔벨로프로 클릭 소음 방지
 */
export class ToneGenerator {
  private ctx: AudioContext | null = null;
  private activeOsc: OscillatorNode | null = null;
  private activeGain: GainNode | null = null;
  private stopTime = 0;

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      // @ts-ignore
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.ctx;
  }

  async playTone(
    frequencyHz: number,
    durationMs: number,
    amplitude: number,     // 0.0 ~ 1.0
    ear: Ear = 'right'
  ): Promise<void> {
    this.stop();  // 동기 호출 - await 제거로 즉시 정리

    try {
      const ctx = this.getContext();

      // iOS Safari / Chrome: resume suspended context
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const now = ctx.currentTime;
      const duration = durationMs / 1000;
      const attack = 0.03;
      const release = 0.03;

      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const panner = ctx.createStereoPanner();

      osc.type = 'sine';
      osc.frequency.value = frequencyHz;

      // 엔벨로프: fade in → sustain → fade out
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(amplitude, now + attack);
      gainNode.gain.setValueAtTime(amplitude, now + duration - release);
      gainNode.gain.linearRampToValueAtTime(0, now + duration);

      // 좌우 채널 분리
      panner.pan.value = ear === 'right' ? 1.0 : -1.0;

      osc.connect(gainNode);
      gainNode.connect(panner);
      panner.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration + 0.05);

      this.activeOsc = osc;
      this.activeGain = gainNode;
      this.stopTime = now + duration + 0.05;

      // 재생 완료까지 대기
      await new Promise<void>((resolve) => {
        const wait = durationMs + 60;
        setTimeout(resolve, wait);
      });
    } catch (e) {
      console.warn('[ToneGenerator] playTone error:', e);
    }
  }

  stop(): void {
    try {
      if (this.activeOsc) {
        try { this.activeOsc.stop(); } catch (_) {}
        try { this.activeOsc.disconnect(); } catch (_) {}
        this.activeOsc = null;
      }
      if (this.activeGain) {
        try { this.activeGain.disconnect(); } catch (_) {}
        this.activeGain = null;
      }
    } catch (_) {}
  }

  /**
   * 짧은 순음 재생 (CPT용) — 재생 시작 시각(performance.now()) 반환
   */
  async playShortTone(
    frequencyHz: number,
    durationMs: number,
    amplitude: number,
    ear: Ear = 'right'
  ): Promise<number> {
    this.stop();
    const onsetTime = performance.now();

    try {
      const ctx = this.getContext();
      if (ctx.state === 'suspended') await ctx.resume();

      const now = ctx.currentTime;
      const duration = durationMs / 1000;
      const attack = 0.005;
      const release = 0.005;

      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const panner = ctx.createStereoPanner();

      osc.type = 'sine';
      osc.frequency.value = frequencyHz;

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(amplitude, now + attack);
      gainNode.gain.setValueAtTime(amplitude, now + duration - release);
      gainNode.gain.linearRampToValueAtTime(0, now + duration);

      panner.pan.value = ear === 'right' ? 1.0 : -1.0;

      osc.connect(gainNode);
      gainNode.connect(panner);
      panner.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration + 0.02);

      this.activeOsc = osc;
      this.activeGain = gainNode;

      await new Promise<void>(r => setTimeout(r, durationMs + 30));
    } catch (e) {
      console.warn('[ToneGenerator] playShortTone error:', e);
    }

    return onsetTime;
  }

  /**
   * 광대역 백색 소음 + 묵음 간격 재생 (GDT용)
   */
  async playNoiseWithGap(
    totalDurationMs: number,
    gapStartMs: number,
    gapDurationMs: number,
    amplitude: number,
    ear: Ear = 'right'
  ): Promise<void> {
    this.stop();

    try {
      const ctx = this.getContext();
      if (ctx.state === 'suspended') await ctx.resume();

      const now = ctx.currentTime;
      const totalSec = totalDurationMs / 1000;
      const gapStartSec = gapStartMs / 1000;
      const gapSec = gapDurationMs / 1000;

      // 백색 소음 버퍼 생성
      const bufferSize = Math.ceil(ctx.sampleRate * totalSec);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = ctx.createGain();
      const panner = ctx.createStereoPanner();

      // 간격 엔벨로프: full → 0 → full
      const ramp = 0.002; // 2ms ramp to avoid clicks
      gainNode.gain.setValueAtTime(amplitude, now);
      gainNode.gain.setValueAtTime(amplitude, now + gapStartSec - ramp);
      gainNode.gain.linearRampToValueAtTime(0, now + gapStartSec);
      gainNode.gain.setValueAtTime(0, now + gapStartSec + gapSec);
      gainNode.gain.linearRampToValueAtTime(amplitude, now + gapStartSec + gapSec + ramp);
      gainNode.gain.setValueAtTime(amplitude, now + totalSec - 0.005);
      gainNode.gain.linearRampToValueAtTime(0, now + totalSec);

      panner.pan.value = ear === 'right' ? 1.0 : -1.0;

      source.connect(gainNode);
      gainNode.connect(panner);
      panner.connect(ctx.destination);

      source.start(now);
      source.stop(now + totalSec + 0.05);

      await new Promise<void>(r => setTimeout(r, totalDurationMs + 60));
    } catch (e) {
      console.warn('[ToneGenerator] playNoiseWithGap error:', e);
    }
  }

  /**
   * 간격 없는 순수 소음 재생 (GDT catch trial용)
   */
  async playNoise(
    durationMs: number,
    amplitude: number,
    ear: Ear = 'right'
  ): Promise<void> {
    this.stop();

    try {
      const ctx = this.getContext();
      if (ctx.state === 'suspended') await ctx.resume();

      const now = ctx.currentTime;
      const durSec = durationMs / 1000;

      const bufferSize = Math.ceil(ctx.sampleRate * durSec);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = ctx.createGain();
      const panner = ctx.createStereoPanner();

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(amplitude, now + 0.005);
      gainNode.gain.setValueAtTime(amplitude, now + durSec - 0.005);
      gainNode.gain.linearRampToValueAtTime(0, now + durSec);

      panner.pan.value = ear === 'right' ? 1.0 : -1.0;

      source.connect(gainNode);
      gainNode.connect(panner);
      panner.connect(ctx.destination);

      source.start(now);
      source.stop(now + durSec + 0.05);

      await new Promise<void>(r => setTimeout(r, durationMs + 60));
    } catch (e) {
      console.warn('[ToneGenerator] playNoise error:', e);
    }
  }

  dispose() {
    this.stop();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
