import { ToneGenerator } from '../ToneGenerator';
import { EHFAMetrics, EHFFrequency, EHF_FREQUENCIES } from '../../types/screening';

/**
 * 확장 고주파수 청력검사 엔진 (EHFA)
 *
 * 10kHz, 12.5kHz, 16kHz에서 상행법으로 역치를 측정한다.
 * 숨은 난청(Hidden Hearing Loss)을 감지하여 ADHD 오진을 필터링한다.
 */

const TONE_DURATION_MS = 800;   // 1500 → 800ms (스크리닝용 단축)
const GRACE_MS         = 400;
const ISI_MIN_MS       = 600;   // 1200 → 600ms
const ISI_MAX_MS       = 1500;  // 4000 → 1500ms
const CATCH_RATIO      = 0.15;  // 25% → 15%
const MAX_CATCH        = 1;
const START_DB         = 10;    // 0 → 10dB (시간 단축)
const STEP_UP          = 10;
const MAX_DB           = 60;    // 80 → 60dB (스크리닝 상한)

export type EHFAEvent =
  | { type: 'frequency_start'; freq: EHFFrequency }
  | { type: 'tone_start'; freq: number; dbHL: number }
  | { type: 'tone_end' }
  | { type: 'false_positive'; reason: 'isi' | 'catch' }
  | { type: 'threshold_found'; freq: EHFFrequency; dbHL: number }
  | { type: 'progress'; current: number; total: number }
  | { type: 'complete'; metrics: EHFAMetrics };

export class EHFAEngine {
  private toneGen = new ToneGenerator();
  private listener: ((e: EHFAEvent) => void) | null = null;
  private isRunning = false;

  // Promise 기반 응답 감지
  private _resolveResponse: (() => void) | null = null;
  private _isiPressed = false;

  setListener(cb: (e: EHFAEvent) => void) { this.listener = cb; }

  onUserResponse() {
    if (!this.isRunning) return;
    // ISI 구간에서 눌렀으면 기록
    if (this._isiPressed !== undefined && this._phase === 'isi') {
      this._isiPressed = true;
      this.emit({ type: 'false_positive', reason: 'isi' });
      return;
    }
    // tone/catch 구간에서 눌렀으면 resolve
    if (this._resolveResponse) {
      this._resolveResponse();
      this._resolveResponse = null;
    }
  }

  private _phase: 'isi' | 'tone' | 'none' = 'none';

  async start(): Promise<EHFAMetrics> {
    this.isRunning = true;
    const thresholds: Partial<Record<EHFFrequency, number>> = {};

    for (let i = 0; i < EHF_FREQUENCIES.length; i++) {
      if (!this.isRunning) break;
      const freq = EHF_FREQUENCIES[i];
      this.emit({ type: 'frequency_start', freq });
      this.emit({ type: 'progress', current: i, total: EHF_FREQUENCIES.length });

      const threshold = await this.testOneFrequency(freq);
      if (!this.isRunning) break;
      thresholds[freq] = threshold;
      this.emit({ type: 'threshold_found', freq, dbHL: threshold });
    }

    const values = Object.values(thresholds).filter((v): v is number => v !== undefined);
    const ptaEHF = values.length > 0
      ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      : 0;

    const metrics: EHFAMetrics = { thresholds, ptaEHF };
    this.emit({ type: 'complete', metrics });
    this.isRunning = false;
    return metrics;
  }

  stop() {
    this.isRunning = false;
    this._phase = 'none';
    this._resolveResponse = null;
    this.toneGen.stop();
  }

  dispose() {
    this.stop();
    this.toneGen.dispose();
  }

  private async testOneFrequency(freq: EHFFrequency): Promise<number> {
    let db = START_DB;
    while (db <= MAX_DB && this.isRunning) {
      const outcome = await this.singleTrial(freq, db, 0);
      if (!this.isRunning) return db;
      if (outcome === 'heard') return db;
      db += STEP_UP;
    }
    return MAX_DB;
  }

  private async singleTrial(
    freq: EHFFrequency,
    db: number,
    catchCount: number
  ): Promise<'heard' | 'missed' | 'fp'> {
    if (!this.isRunning) return 'missed';

    // ISI
    const isi = ISI_MIN_MS + Math.random() * (ISI_MAX_MS - ISI_MIN_MS);
    this._isiPressed = false;
    this._phase = 'isi';
    await this.sleep(isi);
    if (!this.isRunning) return 'missed';

    if (this._isiPressed) {
      this._phase = 'none';
      return 'fp';
    }

    // Catch trial (반복 대신 루프로)
    const doCatch = catchCount < MAX_CATCH && Math.random() < CATCH_RATIO;

    this._phase = 'tone';

    if (doCatch) {
      const pressed = await this.waitForResponse(TONE_DURATION_MS + GRACE_MS);
      this._phase = 'none';
      if (pressed) {
        this.emit({ type: 'false_positive', reason: 'catch' });
        return 'fp';
      }
      // catch 통과 → 같은 dB에서 재시도 (재귀 대신 루프)
      return this.singleTrial(freq, db, catchCount + 1);
    }

    // 실제 순음
    this.emit({ type: 'tone_start', freq, dbHL: db });
    const amplitude = this.dbHLToAmplitude(db, freq);

    // 순음 재생과 응답 대기 병렬
    const responsePromise = this.waitForResponse(TONE_DURATION_MS + GRACE_MS);
    await this.toneGen.playTone(freq, TONE_DURATION_MS, amplitude, 'both');

    const heard = await responsePromise;
    this._phase = 'none';
    this.emit({ type: 'tone_end' });
    return heard ? 'heard' : 'missed';
  }

  /** Promise 기반 응답 대기 */
  private waitForResponse(timeoutMs: number): Promise<boolean> {
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

  private dbHLToAmplitude(dbHL: number, freq: number): number {
    // ISO 389-5:2006 RETSPL 기반 오프셋 (dB SPL at 0 dB HL)
    const offsets: Record<number, number> = {
      10000: 22.5,   // ISO 389-5 (~22.5 dB SPL)
      12500: 28.0,   // ISO 389-5 (~26.6 dB SPL, 마진 포함)
      16000: 50.0,   // ISO 389-5 (~50.2 dB SPL)
    };
    const offset = offsets[freq] ?? 20;
    const normalized = Math.max(-10, Math.min(120, dbHL + offset));
    let amp = Math.pow(10, (normalized - 80) / 40) * 0.9;
    // 저장된 볼륨 캘리브레이션 적용
    try {
      const raw = localStorage.getItem('hicog_volume_calibration');
      if (raw) {
        const calib = JSON.parse(raw);
        if (calib.systemGainFactor && Date.now() - calib.timestamp < 24 * 60 * 60 * 1000) {
          amp *= calib.systemGainFactor;
        }
      }
    } catch {}
    return Math.min(1.0, Math.max(0.001, amp));
  }

  private emit(e: EHFAEvent) { this.listener?.(e); }
  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
