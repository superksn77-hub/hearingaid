import { ToneGenerator } from '../ToneGenerator';
import { CPTMetrics, LatencyCalibration } from '../../types/screening';

/**
 * 연속 수행 검사(CPT) 엔진 — ADHD 주의력 평가
 *
 * 1000Hz, 50ms 순음을 80회 제시 (64 실제 + 16 catch).
 * 측정 변수:
 *   RT_μ, RT_σ, RT_τ (Ex-Gaussian), FPR, OER
 */

const TONE_FREQ      = 1000;
const TONE_DURATION  = 50;
const TONE_AMPLITUDE = 0.25;
const ISI_MIN        = 1000;
const ISI_MAX        = 3000;
const CATCH_RATIO    = 0.20;
const TOTAL_TRIALS   = 80;
const RESPONSE_WINDOW = 1500;

export type CPTEvent =
  | { type: 'trial_start'; trial: number; total: number; isCatch: boolean }
  | { type: 'tone_played' }
  | { type: 'false_positive' }
  | { type: 'omission' }
  | { type: 'hit'; rt: number }
  | { type: 'correct_rejection' }
  | { type: 'progress'; current: number; total: number }
  | { type: 'complete'; metrics: CPTMetrics };

export class CPTEngine {
  private toneGen = new ToneGenerator();
  private listener: ((e: CPTEvent) => void) | null = null;
  private isRunning = false;
  private latencyOffset = 0;

  // Promise 기반 응답 감지
  private _resolveResponse: ((time: number) => void) | null = null;

  setListener(cb: (e: CPTEvent) => void) { this.listener = cb; }

  onUserResponse() {
    if (!this.isRunning) return;
    if (this._resolveResponse) {
      this._resolveResponse(performance.now());
      this._resolveResponse = null;
    }
  }

  async start(calibration: LatencyCalibration): Promise<CPTMetrics> {
    this.isRunning = true;
    this.latencyOffset = calibration.estimatedLatencyMs;

    const trials = this.generateTrialOrder();
    const allRTs: number[] = [];
    let falsePositives = 0;
    let omissions = 0;
    let catchCount = 0;
    let realCount = 0;

    for (let i = 0; i < trials.length; i++) {
      if (!this.isRunning) break;

      const isCatch = trials[i];
      if (isCatch) catchCount++;
      else realCount++;

      this.emit({ type: 'trial_start', trial: i + 1, total: TOTAL_TRIALS, isCatch });
      this.emit({ type: 'progress', current: i + 1, total: TOTAL_TRIALS });

      // 랜덤 ISI
      const isi = ISI_MIN + Math.random() * (ISI_MAX - ISI_MIN);
      await this.sleep(isi);
      if (!this.isRunning) break;

      if (isCatch) {
        // 무음 catch trial — 응답하면 false positive
        const responseTime = await this.waitForResponse(RESPONSE_WINDOW);
        if (responseTime !== null) {
          falsePositives++;
          this.emit({ type: 'false_positive' });
        } else {
          this.emit({ type: 'correct_rejection' });
        }
      } else {
        // 실제 순음
        this.emit({ type: 'tone_played' });
        const onsetTime = await this.toneGen.playShortTone(
          TONE_FREQ, TONE_DURATION, TONE_AMPLITUDE, 'right'
        );

        const responseTime = await this.waitForResponse(RESPONSE_WINDOW);
        if (responseTime !== null) {
          const rt = Math.max(0, responseTime - onsetTime - this.latencyOffset);
          allRTs.push(rt);
          this.emit({ type: 'hit', rt });
        } else {
          omissions++;
          this.emit({ type: 'omission' });
        }
      }
    }

    const { mu, sigma, tau } = this.fitExGaussian(allRTs);
    const rtMean = allRTs.length > 0
      ? allRTs.reduce((a, b) => a + b, 0) / allRTs.length : 0;
    const rtStd = this.std(allRTs);

    const metrics: CPTMetrics = {
      rtMean: Math.round(rtMean),
      rtStd: Math.round(rtStd),
      rtTau: Math.round(tau),
      rtMu: Math.round(mu),
      rtSigma: Math.round(sigma),
      falsePositiveRate: catchCount > 0 ? falsePositives / catchCount : 0,
      omissionRate: realCount > 0 ? omissions / realCount : 0,
      totalTrials: TOTAL_TRIALS,
      realTrials: realCount,
      catchTrials: catchCount,
      allRTs,
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

  /** Promise 기반 응답 대기 — null = 무응답, number = 응답 시각 */
  private waitForResponse(timeoutMs: number): Promise<number | null> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this._resolveResponse = null;
        resolve(null);
      }, timeoutMs);

      this._resolveResponse = (time: number) => {
        clearTimeout(timer);
        resolve(time);
      };
    });
  }

  private generateTrialOrder(): boolean[] {
    const catchTrials = Math.round(TOTAL_TRIALS * CATCH_RATIO);
    const arr: boolean[] = [];
    for (let i = 0; i < TOTAL_TRIALS; i++) {
      arr.push(i < catchTrials);
    }
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Ex-Gaussian 모멘트법 적합 */
  private fitExGaussian(rts: number[]): { mu: number; sigma: number; tau: number } {
    if (rts.length < 10) {
      const m = this.mean(rts);
      const s = this.std(rts);
      return { mu: m, sigma: s, tau: s * 0.3 };
    }

    const m = this.mean(rts);
    const s = this.std(rts);
    const n = rts.length;
    const m3 = rts.reduce((acc, x) => acc + Math.pow(x - m, 3), 0) / n;
    const skew = s > 0 ? m3 / Math.pow(s, 3) : 0;

    if (skew <= 0) {
      return { mu: m, sigma: s, tau: s * 0.3 };
    }

    const tau = s * Math.pow(skew / 2, 1 / 3);
    const sigmaSquared = Math.max(0.01, s * s - tau * tau);
    const sigma = Math.sqrt(sigmaSquared);
    const mu = Math.max(0, m - tau);

    return { mu, sigma, tau: Math.max(0, tau) };
  }

  private mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private std(arr: number[]): number {
    if (arr.length < 2) return 0;
    const m = this.mean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
  }

  private emit(e: CPTEvent) { this.listener?.(e); }
  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
