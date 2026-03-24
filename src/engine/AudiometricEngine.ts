import { TestFrequency, Ear, TestResult, TEST_FREQUENCIES, AudiometricState } from '../types';
import { ToneGenerator } from './ToneGenerator';

/**
 * 순음 청력 검사 엔진 (수정된 Hughson-Westlake 방식)
 *
 * 각 주파수마다 0 dB HL → 10 dB 단위로 상승 탐색:
 *  - playTone + waitForResponse 를 Promise.all 로 병렬 실행
 *  - 사용자가 처음 반응하는 레벨이 해당 주파수 역치
 *  - 100 dB 에서도 무반응 → 역치 = 100 dB (고도 난청)
 *
 * 우측 귀 7개 → 좌측 귀 7개 → 결과 화면
 */

const TONE_DURATION_MS  = 1500;  // 순음 재생 시간
const RESPONSE_WINDOW_MS = 2000; // 재생 후 추가 응답 대기 시간
const ISI_MIN_MS = 800;          // 자극 간격 최소
const ISI_MAX_MS = 1400;         // 자극 간격 최대 (무작위)

const START_DB = 0;
const STEP_UP  = 10;
const MAX_DB   = 100;

export type EngineEvent =
  | { type: 'tone_start';        frequency: number; dbHL: number }
  | { type: 'tone_end' }
  | { type: 'threshold_found';   ear: Ear; frequency: TestFrequency; dbHL: number }
  | { type: 'ear_complete';      ear: Ear }
  | { type: 'test_complete';     result: TestResult }
  | { type: 'state_update';      state: AudiometricState };

export class AudiometricEngine {
  private toneGen   = new ToneGenerator();
  private state     = this.makeState();
  private listener: ((e: EngineEvent) => void) | null = null;
  private isRunning = false;
  private _responded = false;   // 응답 플래그 (단순 필드, 동기적)

  // ── 공개 API ──────────────────────────────────────────────

  setListener(cb: (e: EngineEvent) => void) { this.listener = cb; }
  getState() { return { ...this.state }; }

  async start() {
    this.state     = this.makeState();
    this.isRunning = true;
    this._responded = false;
    this.emit({ type: 'state_update', state: this.getState() });
    await this.runAllFrequencies();
  }

  stop() {
    this.isRunning = false;
    this.toneGen.stop();
  }

  /** 버튼 / 스페이스바 누를 때 호출 */
  onUserResponse() {
    if (!this.isRunning) return;
    this._responded = true;
  }

  dispose() {
    this.stop();
    this.toneGen.dispose();
  }

  // ── 내부 로직 ─────────────────────────────────────────────

  private makeState(): AudiometricState {
    return {
      currentEar:          'right',
      currentFrequency:    125,
      currentDb:           START_DB,
      phase:               'familiarization',
      ascendingResponses:  [],
      trialCount:          0,
      results:             { right: {}, left: {}, date: new Date().toISOString() },
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

        await this.sleep(500);
      }

      this.emit({ type: 'ear_complete', ear });

      if (ear === 'right') {
        // 귀 전환 안내용 대기
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
   * 한 주파수의 역치 탐색:
   *  0 → 10 → 20 → ... → 100 dB HL
   *  playTone 과 waitForResponse 를 Promise.all 로 병렬 실행
   *  → 어느 쪽이 먼저 끝나도 반드시 둘 다 완료된 뒤 다음 단계
   */
  private async testOneFrequency(ear: Ear, freq: TestFrequency): Promise<number> {
    let db = START_DB;

    while (db <= MAX_DB) {
      if (!this.isRunning) return db;

      // 화면 업데이트
      this.state.currentDb = db;
      this.state.phase     = db === START_DB ? 'familiarization' : 'ascending';
      this.emit({ type: 'state_update', state: this.getState() });

      // 무작위 ISI (위양성 방지)
      const isi = ISI_MIN_MS + Math.random() * (ISI_MAX_MS - ISI_MIN_MS);
      await this.sleep(isi);
      if (!this.isRunning) return db;

      // 응답 플래그 초기화 (ISI 이후에 리셋 → ISI 중 버튼 무시)
      this._responded = false;
      this.emit({ type: 'tone_start', frequency: freq, dbHL: db });

      const amplitude = this.dbHLToAmplitude(db);

      // ★ 핵심 수정: playTone + waitForResponse 를 Promise.all 로 병렬 실행
      const [, responded] = await Promise.all([
        this.toneGen.playTone(freq, TONE_DURATION_MS, amplitude, ear),
        this.waitForResponse(TONE_DURATION_MS + RESPONSE_WINDOW_MS),
      ]);

      this.emit({ type: 'tone_end' });
      if (!this.isRunning) return db;

      if (responded) {
        return db;   // 역치 확정
      }

      db += STEP_UP; // 미반응 → 10 dB 상승
    }

    return MAX_DB; // 100 dB 에서도 무반응
  }

  /**
   * timeoutMs 이내에 _responded 가 true 가 되면 true 반환.
   * 100 ms 폴링.
   */
  private waitForResponse(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const tick = setInterval(() => {
        if (!this.isRunning) {
          clearInterval(tick);
          resolve(false);
          return;
        }
        if (this._responded) {
          clearInterval(tick);
          resolve(true);
          return;
        }
        if (Date.now() >= deadline) {
          clearInterval(tick);
          resolve(false);
        }
      }, 100);
    });
  }

  /**
   * dB HL → 진폭 (0.001 ~ 1.0)
   * 기준: 40 dB HL = 0.10 (헤드폰 기준 충분히 들리는 레벨)
   */
  private dbHLToAmplitude(dbHL: number): number {
    const refDb  = 40;
    const refAmp = 0.10;
    const amp    = refAmp * Math.pow(10, (dbHL - refDb) / 20);
    return Math.min(1.0, Math.max(0.001, amp));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
