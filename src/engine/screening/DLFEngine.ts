import { ToneGenerator } from '../ToneGenerator';
import { AdaptiveStaircase } from './AdaptiveStaircase';
import { DLFMetrics } from '../../types/screening';

/**
 * 주파수 변별 임계치(DLF) 엔진 — 난독증 평가
 *
 * 2AFC 패러다임: 두 순음을 쌍으로 제시, "같은 소리" / "다른 소리" 판단
 * 기준 주파수: 1000Hz (위상잠금 O), 6000Hz (위상잠금 X)
 * 적응형 2-down 1-up 계단법 (70.7% 수렴 임계치)
 */

const TONE_DURATION   = 300;  // ms per tone
const GAP_BETWEEN     = 200;  // ms between two tones
const TONE_AMPLITUDE  = 0.25;
const PRACTICE_TRIALS = 3;
const RESPONSE_TIMEOUT = 5000; // ms

const STAIRCASE_1K = {
  initial: 10,
  stepFactor: 1.41,
  minVal: 0.1,
  maxVal: 25,
  nDown: 2,
  targetReversals: 8,
  maxTrials: 60,
};

const STAIRCASE_6K = {
  initial: 5,
  stepFactor: 1.41,
  minVal: 0.1,
  maxVal: 25,
  nDown: 2,
  targetReversals: 8,
  maxTrials: 60,
};

export type DLFEvent =
  | { type: 'block_start'; baseFreq: number; label: string }
  | { type: 'practice_start' }
  | { type: 'pair_playing'; baseFreq: number; delta: number }
  | { type: 'awaiting_response' }
  | { type: 'feedback'; correct: boolean }
  | { type: 'trial_result'; correct: boolean; delta: number }
  | { type: 'progress'; current: number; total: number }
  | { type: 'complete'; metrics: DLFMetrics };

export class DLFEngine {
  private toneGen = new ToneGenerator();
  private listener: ((e: DLFEvent) => void) | null = null;
  private isRunning = false;

  // 응답 관리 — Promise 기반으로 레이스 컨디션 방지
  private _resolveChoice: ((choice: 'same' | 'different') => void) | null = null;

  setListener(cb: (e: DLFEvent) => void) { this.listener = cb; }

  /** 사용자가 "같은 소리" / "다른 소리" 선택 */
  onUserResponse(choice: 'same' | 'different') {
    if (!this.isRunning) return;
    if (this._resolveChoice) {
      this._resolveChoice(choice);
      this._resolveChoice = null;
    }
  }

  async start(): Promise<DLFMetrics> {
    this.isRunning = true;

    // Block 1: 1000Hz
    this.emit({ type: 'block_start', baseFreq: 1000, label: '1kHz 주파수 변별' });
    const result1k = await this.runBlock(1000, STAIRCASE_1K);
    if (!this.isRunning) return this.fallbackMetrics();

    await this.sleep(2000);

    // Block 2: 6000Hz
    this.emit({ type: 'block_start', baseFreq: 6000, label: '6kHz 주파수 변별' });
    const result6k = await this.runBlock(6000, STAIRCASE_6K);

    const metrics: DLFMetrics = {
      dlf1k: result1k.threshold,
      dlf6k: result6k.threshold,
      staircase1k: result1k.reversals,
      staircase6k: result6k.reversals,
    };

    this.emit({ type: 'complete', metrics });
    this.isRunning = false;
    return metrics;
  }

  stop() {
    this.isRunning = false;
    this._resolveChoice = null;
    this.toneGen.stop();
  }

  dispose() {
    this.stop();
    this.toneGen.dispose();
  }

  private async runBlock(
    baseFreq: number,
    config: typeof STAIRCASE_1K
  ): Promise<{ threshold: number; reversals: number[] }> {
    // 연습 시행 (피드백 포함)
    this.emit({ type: 'practice_start' });
    for (let p = 0; p < PRACTICE_TRIALS; p++) {
      if (!this.isRunning) break;
      await this.runOneTrial(baseFreq, 15, true);
    }
    if (!this.isRunning) return { threshold: config.initial, reversals: [] };

    await this.sleep(1000);

    // 본 검사
    const staircase = new AdaptiveStaircase(config);
    let trialNum = 0;

    while (this.isRunning) {
      const delta = staircase.getValue();
      trialNum++;
      this.emit({ type: 'progress', current: trialNum, total: config.maxTrials });

      const correct = await this.runOneTrial(baseFreq, delta, false);
      if (!this.isRunning) break;

      this.emit({ type: 'trial_result', correct, delta });
      const { done } = staircase.respond(correct);
      if (done) break;
    }

    return {
      threshold: Math.round(staircase.getThreshold() * 100) / 100,
      reversals: staircase.getReversals(),
    };
  }

  private async runOneTrial(
    baseFreq: number,
    deltaPercent: number,
    isPractice: boolean
  ): Promise<boolean> {
    if (!this.isRunning) return false;

    // 50% 확률로 "같은" vs "다른" 쌍 결정
    const isSamePair = Math.random() < 0.5;
    const compFreq = isSamePair
      ? baseFreq
      : baseFreq * (1 + deltaPercent / 100);

    // 순서 랜덤화
    const playBaseFirst = Math.random() < 0.5;
    const freq1 = playBaseFirst ? baseFreq : compFreq;
    const freq2 = playBaseFirst ? compFreq : baseFreq;

    this.emit({ type: 'pair_playing', baseFreq, delta: deltaPercent });

    // 첫 번째 음
    await this.toneGen.playTone(freq1, TONE_DURATION, TONE_AMPLITUDE, 'right');
    if (!this.isRunning) return false;

    // 간격
    await this.sleep(GAP_BETWEEN);
    if (!this.isRunning) return false;

    // 두 번째 음
    await this.toneGen.playTone(freq2, TONE_DURATION, TONE_AMPLITUDE, 'right');
    if (!this.isRunning) return false;

    // 사용자 응답 대기 — Promise 기반
    this.emit({ type: 'awaiting_response' });
    const choice = await this.waitForChoice(RESPONSE_TIMEOUT);

    if (!choice) return false; // 시간 초과 = 오답

    const correct = isSamePair ? choice === 'same' : choice === 'different';

    if (isPractice) {
      this.emit({ type: 'feedback', correct });
      await this.sleep(800);
    }

    return correct;
  }

  /** Promise 기반 응답 대기 — 레이스 컨디션 없음 */
  private waitForChoice(timeoutMs: number): Promise<'same' | 'different' | null> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this._resolveChoice = null;
        resolve(null);
      }, timeoutMs);

      this._resolveChoice = (choice) => {
        clearTimeout(timer);
        resolve(choice);
      };
    });
  }

  private fallbackMetrics(): DLFMetrics {
    return { dlf1k: 10, dlf6k: 5, staircase1k: [], staircase6k: [] };
  }

  private emit(e: DLFEvent) { this.listener?.(e); }
  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
