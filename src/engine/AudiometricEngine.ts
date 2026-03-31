import { TestFrequency, Ear, TestResult, TEST_FREQUENCIES, AudiometricState } from '../types';
import { ToneGenerator } from './ToneGenerator';

/**
 * 순음 청력 검사 엔진
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  각 dB 레벨마다 아래 흐름을 반복:                                 │
 * │                                                                 │
 * │  [ISI 침묵]       [실제/함정 구간]         [판정]               │
 * │  1200~5000ms       1500ms + 500ms                              │
 * │  (랜덤 대기)       ├─ 실제(70%): 순음 재생                       │
 * │                   └─ 함정(30%): 무음 유지                       │
 * │                                                                 │
 * │  ISI 중 누름 → 오반응 → dB 상승                                  │
 * │  함정 중 누름 → 오반응 → dB 상승                                  │
 * │  실제 중 누름 + 앞서 오반응 없음 → 역치 확정                       │
 * │  실제 중 안 누름 → dB 상승                                       │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * ISI를 1200~5000ms 넓은 범위 랜덤으로 설정해 리듬 예측 차단
 * Catch trial 30%로 무작위 삽입해 "소리 없어도 타이밍 맞춰 누르기" 차단
 */

const TONE_DURATION_MS = 1500;
const GRACE_MS         = 500;   // 순음 종료 후 추가 응답 허용 시간
const ISI_MIN_MS       = 1200;  // ← 넓은 범위로 리듬 예측 차단
const ISI_MAX_MS       = 5000;  // ← 최대 5초까지 대기
const CATCH_RATIO      = 0.30;  // 30% 확률로 무음 함정 삽입
const MAX_CATCH_PER_LEVEL = 2;  // 한 레벨당 함정 최대 2회 (무한 루프 방지)

const START_DB = 0;
const STEP_UP  = 10;
const MAX_DB   = 100;

export type EngineEvent =
  | { type: 'tone_start';      frequency: number; dbHL: number }
  | { type: 'tone_end' }
  | { type: 'false_positive';  reason: 'isi' | 'catch' }   // 오반응 이유 구분
  | { type: 'threshold_found'; ear: Ear; frequency: TestFrequency; dbHL: number }
  | { type: 'ear_complete';    ear: Ear }
  | { type: 'test_complete';   result: TestResult }
  | { type: 'state_update';    state: AudiometricState };

export class AudiometricEngine {
  private toneGen    = new ToneGenerator();
  private state      = this.makeState();
  private listener: ((e: EngineEvent) => void) | null = null;
  private isRunning  = false;

  // 구간별 응답 플래그
  private _respondedInISI   = false;
  private _respondedInTone  = false;
  // 현재 구간
  private _phase: 'isi' | 'tone' | 'none' = 'none';

  // ── 공개 API ──────────────────────────────────────────────

  setListener(cb: (e: EngineEvent) => void) { this.listener = cb; }
  getState() { return { ...this.state }; }

  async start() {
    this.state     = this.makeState();
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
   * 버튼 / 스페이스바를 눌렀을 때 호출.
   * 현재 _phase 에 따라 정반응 / 오반응을 분리해 기록.
   */
  onUserResponse() {
    if (!this.isRunning) return;
    switch (this._phase) {
      case 'isi':
        // ISI 침묵 구간 → 오반응
        this._respondedInISI = true;
        this.emit({ type: 'false_positive', reason: 'isi' });
        break;
      case 'tone':
        // 순음/함정 구간 → 정반응 후보 (catch 여부는 engine 내부에서 판단)
        this._respondedInTone = true;
        break;
      case 'none':
      default:
        // 아무 구간도 아닌 상태 → 완전히 무시
        break;
    }
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
    for (const ear of ['right', 'left'] as Ear[]) {
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
        await this.sleep(500);
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
   * 한 주파수의 역치 탐색.
   *
   * 각 dB 레벨마다:
   *  1) 랜덤 ISI (1200~5000ms) — 이 구간에서 누르면 오반응
   *  2) 30% 확률로 함정(catch trial): 무음으로 같은 시간 대기
   *       - 이 구간에서 누르면 오반응 → dB 상승
   *       - 안 누르면 "통과" → 같은 dB 레벨 재시도 (최대 2회)
   *  3) 실제 순음 재생 (1500ms + 여운 500ms)
   *       - ISI 오반응 없고 순음 구간에서 눌렀으면 → 역치 확정
   *       - 그 외 → dB 상승
   */
  private async testOneFrequency(ear: Ear, freq: TestFrequency): Promise<number> {
    let db         = START_DB;

    while (db <= MAX_DB) {
      if (!this.isRunning) return db;

      // 화면 업데이트
      this.state.currentDb = db;
      this.state.phase     = db === START_DB ? 'familiarization' : 'ascending';
      this.emit({ type: 'state_update', state: this.getState() });

      // ── 이 dB 레벨에서의 단일 시도 ──────────────────────
      const outcome = await this.singleTrial(ear, freq, db);
      if (!this.isRunning) return db;

      if (outcome === 'heard') {
        return db;          // 역치 확정
      }
      // 'missed' | 'false_positive_catch' | 'false_positive_isi'
      db += STEP_UP;
    }

    return MAX_DB;
  }

  /**
   * 하나의 시도(trial) 수행.
   * 반환값:
   *  'heard'                → 역치 확정
   *  'missed'               → 못 들음, dB 상승
   *  'false_positive_catch' → 함정에 걸림, dB 상승
   *  'false_positive_isi'   → ISI 오반응, dB 상승
   *
   * Catch trial 통과 시 같은 dB로 재귀 재시도 (최대 MAX_CATCH_PER_LEVEL회).
   */
  private async singleTrial(
    ear: Ear,
    freq: TestFrequency,
    db: number,
    catchCount = 0
  ): Promise<'heard' | 'missed' | 'false_positive_catch' | 'false_positive_isi'> {

    if (!this.isRunning) return 'missed';

    // ── ① 랜덤 ISI ──────────────────────────────────────
    const isi = ISI_MIN_MS + Math.random() * (ISI_MAX_MS - ISI_MIN_MS);
    this._respondedInISI  = false;
    this._respondedInTone = false;
    this._phase = 'isi';
    await this.sleep(isi);
    if (!this.isRunning) return 'missed';

    const fpDuringISI = this._respondedInISI;  // ISI 중 눌렸는지

    // ISI 오반응 → 즉시 dB 상승 (false_positive 이벤트는 onUserResponse에서 이미 발생)
    if (fpDuringISI) {
      this._phase = 'none';
      return 'false_positive_isi';
    }

    // ── ② Catch trial 여부 결정 ──────────────────────────
    const doCatch = catchCount < MAX_CATCH_PER_LEVEL && Math.random() < CATCH_RATIO;

    this._respondedInTone = false;
    this._phase = 'tone';  // catch든 real이든 이 구간에서 누르면 기록됨

    if (doCatch) {
      // ── 함정: 소리 없이 같은 길이만큼 대기 ──────────────
      const [, pressedInSilence] = await Promise.all([
        this.sleep(TONE_DURATION_MS + 60),
        this.waitForToneResponse(TONE_DURATION_MS + GRACE_MS),
      ]);
      this._phase = 'none';

      if (pressedInSilence) {
        // 함정에 걸림 → 오반응 이벤트 (reason: 'catch')
        this.emit({ type: 'false_positive', reason: 'catch' });
        return 'false_positive_catch';
      }

      // 함정 통과 (소리 없을 때 안 누름 = 올바른 행동)
      // 같은 dB 레벨에서 재시도 (실제 순음으로)
      return this.singleTrial(ear, freq, db, catchCount + 1);
    }

    // ── ③ 실제 순음 재생 ─────────────────────────────────
    this.emit({ type: 'tone_start', frequency: freq, dbHL: db });
    const amplitude = this.dbHLToAmplitude(db);

    const [, heard] = await Promise.all([
      this.toneGen.playTone(freq, TONE_DURATION_MS, amplitude, ear),
      this.waitForToneResponse(TONE_DURATION_MS + GRACE_MS),
    ]);

    this._phase = 'none';
    this.emit({ type: 'tone_end' });
    if (!this.isRunning) return 'missed';

    return heard ? 'heard' : 'missed';
  }

  /**
   * tone 구간 전용 응답 대기 (_respondedInTone 감시)
   */
  private waitForToneResponse(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const tick = setInterval(() => {
        if (!this.isRunning) { clearInterval(tick); resolve(false); return; }
        if (this._respondedInTone) { clearInterval(tick); resolve(true); return; }
        if (Date.now() >= deadline) { clearInterval(tick); resolve(false); }
      }, 50);
    });
  }

  /** dB HL → 진폭 (0.001~1.0) · 기준 40 dB HL = 0.10 + 볼륨 캘리브레이션 적용 */
  private dbHLToAmplitude(dbHL: number): number {
    let amp = 0.10 * Math.pow(10, (dbHL - 40) / 20);
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

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
