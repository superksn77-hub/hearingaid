import { ToneGenerator } from '../ToneGenerator';
import { AdaptiveStaircase } from './AdaptiveStaircase';
import { GDTMetrics } from '../../types/screening';

/**
 * 간격 탐지 임계치(GDT) 엔진 — 시간 해상도 평가
 *
 * 광대역 백색 소음(500ms) 중간에 묵음 간격을 삽입하고
 * 사용자가 간격을 감지하면 버튼을 누르는 과제.
 * 적응형 2-down 1-up 계단법으로 최소 탐지 간격 추정.
 */

const NOISE_DURATION    = 500;
const NOISE_AMPLITUDE   = 0.20;
const GAP_POSITION_MIN  = 100;
const GAP_POSITION_MAX  = 350;
const CATCH_RATIO       = 0.20;  // 20%로 줄여서 검사 단축
const ISI_MIN           = 800;
const ISI_MAX           = 2000;
const RESPONSE_WINDOW   = 1500;
const PRACTICE_TRIALS   = 2;
const TOTAL_DISPLAY     = 30;    // 사용자에게 보이는 총 시행 수

// 스크리닝 목적: 최대 30시행, 6 reversal 수렴
const STAIRCASE_CONFIG = {
  initial: 10,
  stepFactor: 1.41,
  minVal: 0.5,
  maxVal: 30,
  nDown: 2,
  targetReversals: 6,
  maxTrials: 30,
};

const PRACTICE_REQUIRED = 2;
const PRACTICE_MAX_ROUNDS = 3;

export type GDTEvent =
  | { type: 'practice_start' }
  | { type: 'practice_info'; message: string; passed: boolean }
  | { type: 'noise_playing'; hasGap: boolean; gapMs: number }
  | { type: 'awaiting_response' }
  | { type: 'hit' }
  | { type: 'miss' }
  | { type: 'false_positive' }
  | { type: 'correct_rejection' }
  | { type: 'feedback'; correct: boolean }
  | { type: 'progress'; current: number; total: number }
  | { type: 'complete'; metrics: GDTMetrics };

export class GDTEngine {
  private toneGen = new ToneGenerator();
  private listener: ((e: GDTEvent) => void) | null = null;
  private isRunning = false;

  // Promise 기반 응답 감지
  private _resolveResponse: (() => void) | null = null;

  setListener(cb: (e: GDTEvent) => void) { this.listener = cb; }

  onUserResponse() {
    if (!this.isRunning) return;
    if (this._resolveResponse) {
      this._resolveResponse();
      this._resolveResponse = null;
    }
  }

  async start(): Promise<GDTMetrics> {
    this.isRunning = true;

    // ── 연습: 2문제 연속 정답 시 통과, 최대 3라운드 ──
    this.emit({ type: 'practice_start' });
    let practicePassed = false;
    for (let round = 0; round < PRACTICE_MAX_ROUNDS && !practicePassed; round++) {
      if (!this.isRunning) break;
      this.emit({ type: 'practice_info', message: `연습 ${round + 1}/${PRACTICE_MAX_ROUNDS}: 소음 중간 끊김이 느껴지면 누르세요`, passed: false });
      await this.sleep(1500);

      let consecutive = 0;
      while (consecutive < PRACTICE_REQUIRED && this.isRunning) {
        // 연습은 항상 끊김 있는 시행 (15ms 큰 간격)
        const detected = await this.runOneTrial(15, true);
        if (!this.isRunning) break;
        if (detected) {
          consecutive++;
          this.emit({ type: 'practice_info', message: `정답! 끊김을 감지했습니다 (${consecutive}/${PRACTICE_REQUIRED})`, passed: false });
        } else {
          consecutive = 0;
          this.emit({ type: 'practice_info', message: '소음 중간에 잠깐 끊기는 순간에 눌러주세요!', passed: false });
        }
        await this.sleep(800);
      }
      if (consecutive >= PRACTICE_REQUIRED) practicePassed = true;
    }
    this.emit({ type: 'practice_info', message: practicePassed ? '연습 통과! 본 검사를 시작합니다.' : '본 검사를 시작합니다.', passed: true });
    if (!this.isRunning) return this.fallbackMetrics();
    await this.sleep(2000);

    // 본 검사
    const staircase = new AdaptiveStaircase(STAIRCASE_CONFIG);
    let trialNum = 0;

    while (this.isRunning && trialNum < TOTAL_DISPLAY) {
      trialNum++;
      this.emit({ type: 'progress', current: trialNum, total: TOTAL_DISPLAY });

      // 20% catch trial
      const isCatch = Math.random() < CATCH_RATIO;

      if (isCatch) {
        const detected = await this.runOneTrial(0, false);
        if (!this.isRunning) break;
        if (detected) {
          this.emit({ type: 'false_positive' });
        } else {
          this.emit({ type: 'correct_rejection' });
        }
        continue; // catch는 계단법에 반영 안 함
      }

      // 실제 시행
      const gapMs = staircase.getValue();
      const detected = await this.runOneTrial(gapMs, true);
      if (!this.isRunning) break;

      if (detected) {
        this.emit({ type: 'hit' });
      } else {
        this.emit({ type: 'miss' });
      }

      const { done } = staircase.respond(detected);
      if (done) break;
    }

    const metrics: GDTMetrics = {
      gdt: Math.round(staircase.getThreshold() * 100) / 100,
      staircaseHistory: staircase.getReversals(),
    };

    this.emit({ type: 'complete', metrics });
    this.isRunning = false;
    return metrics;
  }

  stop() {
    this.isRunning = false;
    this._resolveResponse = null;
    this.toneGen.stop();
  }

  dispose() {
    this.stop();
    this.toneGen.dispose();
  }

  /** 한 시행 실행: 소음(+간격) 재생 → 응답 대기 → 결과 반환 */
  private async runOneTrial(gapMs: number, hasGap: boolean): Promise<boolean> {
    if (!this.isRunning) return false;

    // ISI
    const isi = ISI_MIN + Math.random() * (ISI_MAX - ISI_MIN);
    await this.sleep(isi);
    if (!this.isRunning) return false;

    const gapStart = GAP_POSITION_MIN +
      Math.random() * (GAP_POSITION_MAX - GAP_POSITION_MIN);

    this.emit({ type: 'noise_playing', hasGap, gapMs });

    if (hasGap && gapMs > 0) {
      await this.toneGen.playNoiseWithGap(
        NOISE_DURATION, gapStart, gapMs, NOISE_AMPLITUDE, 'both'
      );
    } else {
      await this.toneGen.playNoise(NOISE_DURATION, NOISE_AMPLITUDE, 'both');
    }

    if (!this.isRunning) return false;

    // 응답 대기
    this.emit({ type: 'awaiting_response' });
    const detected = await this.waitForResponse(RESPONSE_WINDOW - NOISE_DURATION);

    return detected;
  }

  /** Promise 기반 응답 대기 */
  private waitForResponse(timeoutMs: number): Promise<boolean> {
    if (timeoutMs <= 0) return Promise.resolve(false);
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this._resolveResponse = null;
        resolve(false);
      }, timeoutMs);

      this._resolveResponse = () => {
        clearTimeout(timer);
        resolve(true);
      };
    });
  }

  private fallbackMetrics(): GDTMetrics {
    return { gdt: 10, staircaseHistory: [] };
  }

  private emit(e: GDTEvent) { this.listener?.(e); }
  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
