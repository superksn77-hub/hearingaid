import { TestFrequency, Ear, TestResult, TEST_FREQUENCIES, AudiometricState } from '../types';
import { ToneGenerator } from './ToneGenerator';

/**
 * 순음 청력 검사 엔진
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  응답 유효성 판별                                         │
 * │                                                         │
 * │  [ISI 침묵 구간]  →  [순음 재생]  →  [여운 대기]         │
 * │   800~1400ms         1500ms          500ms             │
 * │                                                         │
 * │  이 구간에서 누름    이 구간에서 누름   이 구간에서 누름   │
 * │  = 오반응(위양성)   = 정반응          = 정반응           │
 * │  → 그 레벨 "못들음" → 역치 확정       → 역치 확정        │
 * └─────────────────────────────────────────────────────────┘
 *
 * ISI 중 버튼을 누르면 false_positive 이벤트 발생 → UI에 경고 표시
 * 해당 dB 레벨은 "미반응"으로 처리 → 10 dB 상승
 */

const TONE_DURATION_MS = 1500;  // 순음 재생 시간
const GRACE_MS         = 500;   // 순음 종료 후 응답 허용 여운
const ISI_MIN_MS       = 900;   // 자극 간격 최소 (무작위 → 예측 불가)
const ISI_MAX_MS       = 1800;  // 자극 간격 최대

const START_DB = 0;
const STEP_UP  = 10;
const MAX_DB   = 100;

export type EngineEvent =
  | { type: 'tone_start';      frequency: number; dbHL: number }
  | { type: 'tone_end' }
  | { type: 'false_positive' }                              // ISI 중 누름
  | { type: 'threshold_found'; ear: Ear; frequency: TestFrequency; dbHL: number }
  | { type: 'ear_complete';    ear: Ear }
  | { type: 'test_complete';   result: TestResult }
  | { type: 'state_update';    state: AudiometricState };

export class AudiometricEngine {
  private toneGen    = new ToneGenerator();
  private state      = this.makeState();
  private listener: ((e: EngineEvent) => void) | null = null;
  private isRunning  = false;

  // 두 개의 독립된 플래그
  private _respondedInISI  = false; // ISI 침묵 구간에서 눌렸는지
  private _respondedInTone = false; // 순음 구간에서 눌렸는지

  // 현재 어느 구간인지
  private _phase: 'isi' | 'tone' | 'none' = 'none';

  // ── 공개 API ──────────────────────────────────────────────

  setListener(cb: (e: EngineEvent) => void) { this.listener = cb; }
  getState() { return { ...this.state }; }

  async start() {
    this.state    = this.makeState();
    this.isRunning = true;
    this._phase    = 'none';
    this.emit({ type: 'state_update', state: this.getState() });
    await this.runAllFrequencies();
  }

  stop() {
    this.isRunning = false;
    this._phase    = 'none';
    this.toneGen.stop();
  }

  /**
   * 버튼 / 스페이스바 누를 때 호출
   *
   * _phase 에 따라 플래그를 분리해서 기록:
   *  - 'isi'  구간 → _respondedInISI  = true  (오반응)
   *  - 'tone' 구간 → _respondedInTone = true  (정반응)
   *  - 'none' 구간 → 무시
   */
  onUserResponse() {
    if (!this.isRunning) return;
    if (this._phase === 'isi') {
      this._respondedInISI = true;
      this.emit({ type: 'false_positive' });
    } else if (this._phase === 'tone') {
      this._respondedInTone = true;
    }
    // 'none' 구간은 무시
  }

  dispose() {
    this.stop();
    this.toneGen.dispose();
  }

  // ── 내부 로직 ─────────────────────────────────────────────

  private makeState(): AudiometricState {
    return {
      currentEar:         'right',
      currentFrequency:   125,
      currentDb:          START_DB,
      phase:              'familiarization',
      ascendingResponses: [],
      trialCount:         0,
      results:            { right: {}, left: {}, date: new Date().toISOString() },
    };
  }

  private emit(e: EngineEvent) { this.listener?.(e); }

  private async runAllFrequencies() {
    const ears: Ear[] = ['right', 'left'];

    for (const ear of ears) {
      if (!this.isRunning) return;
      this.state.currentEar = ear;

      for (const freq of TEST_FREQUENCIES) {
        if (!this.isRunning) return;

        this.state.currentFrequency = freq;
        this.state.currentDb        = START_DB;
        this.state.phase            = 'familiarization';
        this.emit({ type: 'state_update', state: this.getState() });

        const threshold = await this.testOneFrequency(ear, freq);
        if (!this.isRunning) return;

        this.state.results[ear][freq] = threshold;
        this.state.phase              = 'threshold_found';
        this.emit({ type: 'threshold_found', ear, frequency: freq, dbHL: threshold });
        this.emit({ type: 'state_update', state: this.getState() });

        await this.sleep(600);
      }

      this.emit({ type: 'ear_complete', ear });

      if (ear === 'right') {
        this.state.phase = 'idle';
        this.emit({ type: 'state_update', state: this.getState() });
        await this.sleep(2200);
      }
    }

    if (this.isRunning) {
      this.state.phase = 'complete';
      this.isRunning   = false;
      this.emit({ type: 'test_complete', result: this.state.results });
    }
  }

  /**
   * 한 주파수 역치 탐색
   *
   * 각 dB 레벨마다:
   *  1) ISI 침묵 구간 (_phase = 'isi')  → 이때 누르면 오반응
   *  2) 순음+여운 구간 (_phase = 'tone') → 이때만 정반응
   *
   *  정반응 && 오반응 없음 → 역치 확정
   *  오반응 발생 OR 정반응 없음 → 미반응 → 10 dB 상승
   */
  private async testOneFrequency(ear: Ear, freq: TestFrequency): Promise<number> {
    let db = START_DB;

    while (db <= MAX_DB) {
      if (!this.isRunning) return db;

      // 화면 업데이트
      this.state.currentDb = db;
      this.state.phase     = db === START_DB ? 'familiarization' : 'ascending';
      this.emit({ type: 'state_update', state: this.getState() });

      // ── ① ISI 침묵 구간 ──────────────────────────────────
      const isi = ISI_MIN_MS + Math.random() * (ISI_MAX_MS - ISI_MIN_MS);
      this._respondedInISI  = false;
      this._respondedInTone = false;
      this._phase = 'isi';          // 이 구간에서 누르면 → 오반응

      await this.sleep(isi);
      if (!this.isRunning) return db;

      const falsePositive = this._respondedInISI;  // ISI 중 눌렸는지 기록

      // ── ② 순음 + 여운 구간 ───────────────────────────────
      this._respondedInTone = false;
      this._phase = 'tone';         // 이 구간에서만 → 정반응
      this.emit({ type: 'tone_start', frequency: freq, dbHL: db });

      const amplitude = this.dbHLToAmplitude(db);

      // playTone 과 유효응답 대기를 동시에 실행
      const [, heardInWindow] = await Promise.all([
        this.toneGen.playTone(freq, TONE_DURATION_MS, amplitude, ear),
        this.waitForToneResponse(TONE_DURATION_MS + GRACE_MS),
      ]);

      this._phase = 'none';         // 순음 구간 종료 → 이후 누름 무시
      this.emit({ type: 'tone_end' });
      if (!this.isRunning) return db;

      // ── ③ 판정 ──────────────────────────────────────────
      //  정반응 O + 오반응 X  → 역치 확정
      //  오반응 O (ISI 중 누름) → 이 레벨 무효 → 상승
      //  정반응 X              → 못들음 → 상승
      if (heardInWindow && !falsePositive) {
        return db;
      }

      db += STEP_UP;
    }

    return MAX_DB;
  }

  /**
   * tone 구간 전용 응답 대기
   * _respondedInTone 플래그만 감시 (ISI 플래그와 완전히 분리)
   */
  private waitForToneResponse(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const tick = setInterval(() => {
        if (!this.isRunning) {
          clearInterval(tick);
          resolve(false);
          return;
        }
        if (this._respondedInTone) {
          clearInterval(tick);
          resolve(true);
          return;
        }
        if (Date.now() >= deadline) {
          clearInterval(tick);
          resolve(false);
        }
      }, 50);
    });
  }

  /** dB HL → 진폭 (0.001 ~ 1.0) · 기준 40 dB HL = 0.10 */
  private dbHLToAmplitude(dbHL: number): number {
    const amp = 0.10 * Math.pow(10, (dbHL - 40) / 20);
    return Math.min(1.0, Math.max(0.001, amp));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
