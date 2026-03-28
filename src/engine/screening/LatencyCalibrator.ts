import { ToneGenerator } from '../ToneGenerator';
import { LatencyCalibration } from '../../types/screening';

/**
 * 하드웨어 지연 보정 엔진
 *
 * 1000Hz 순음을 10회 재생하며 사용자의 즉시 반응 시간을 측정한다.
 * 평균 청각 반응 시간(~200ms)을 차감하여 순수 하드웨어 지연을 추정한다.
 */

const CALIBRATION_TRIALS = 10;
const TONE_FREQ = 1000;
const TONE_DURATION = 200;
const TONE_AMPLITUDE = 0.3;
const RESPONSE_WINDOW = 2000;
const HUMAN_AUDITORY_RT = 200;
const ISI_MIN = 1500;
const ISI_MAX = 3000;

export type CalibrationEvent =
  | { type: 'trial_start'; trial: number; total: number }
  | { type: 'tone_played' }
  | { type: 'response_recorded'; rt: number }
  | { type: 'calibration_complete'; result: LatencyCalibration };

export class LatencyCalibrator {
  private toneGen = new ToneGenerator();
  private listener: ((e: CalibrationEvent) => void) | null = null;
  private isRunning = false;

  // Promise 기반 응답 감지
  private _resolveResponse: ((time: number) => void) | null = null;

  setListener(cb: (e: CalibrationEvent) => void) { this.listener = cb; }

  onUserResponse() {
    if (!this.isRunning) return;
    if (this._resolveResponse) {
      this._resolveResponse(performance.now());
      this._resolveResponse = null;
    }
  }

  async start(): Promise<LatencyCalibration> {
    this.isRunning = true;
    const measurements: number[] = [];

    for (let i = 0; i < CALIBRATION_TRIALS; i++) {
      if (!this.isRunning) break;

      this.listener?.({ type: 'trial_start', trial: i + 1, total: CALIBRATION_TRIALS });

      // 랜덤 ISI
      const isi = ISI_MIN + Math.random() * (ISI_MAX - ISI_MIN);
      await this.sleep(isi);
      if (!this.isRunning) break;

      // 순음 재생
      this.listener?.({ type: 'tone_played' });
      const onsetTime = await this.toneGen.playShortTone(
        TONE_FREQ, TONE_DURATION, TONE_AMPLITUDE, 'both'
      );

      // Promise 기반 응답 대기
      const responseTime = await this.waitForResponse(RESPONSE_WINDOW);

      if (responseTime !== null && this.isRunning) {
        const rt = responseTime - onsetTime;
        measurements.push(rt);
        this.listener?.({ type: 'response_recorded', rt });
      }
    }

    const filtered = this.removeOutliers(measurements);
    const meanRT = filtered.length > 0
      ? filtered.reduce((a, b) => a + b, 0) / filtered.length
      : 250;

    const latency = Math.max(0, Math.min(150, meanRT - HUMAN_AUDITORY_RT));

    const result: LatencyCalibration = {
      estimatedLatencyMs: Math.round(latency),
      measurements,
    };

    this.listener?.({ type: 'calibration_complete', result });
    this.isRunning = false;
    return result;
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

  /** Promise 기반 응답 대기 */
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

  private removeOutliers(arr: number[]): number[] {
    if (arr.length < 4) return arr;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
    return arr.filter(v => Math.abs(v - mean) <= 2 * std);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
