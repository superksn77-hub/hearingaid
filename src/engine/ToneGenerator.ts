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

  dispose() {
    this.stop();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
