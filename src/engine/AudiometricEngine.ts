import { TestFrequency, Ear, TestResult, TEST_FREQUENCIES, AudiometricState } from '../types';
import { ToneGenerator } from './ToneGenerator';

/**
 * 간소화된 순음 청력 검사 엔진
 *
 * 각 주파수마다:
 *  1) 40 dB HL로 순음 재생 (1.5초)
 *  2) 반응 창 2.5초 대기
 *  3) 반응 있으면 → 역치 = 40 dB, 다음 주파수
 *  4) 반응 없으면 → 20 dB 올려서 재시도 (최대 100 dB)
 *  5) 100 dB에서도 무반응 → 역치 = 100 dB (고도 난청)
 *
 * 우측 귀 7개 → 좌측 귀 7개 → 결과 화면
 */

const TONE_DURATION_MS = 1500;
const RESPONSE_WINDOW_MS = 2500; // 순음 재생 후 응답 대기 시간
const ISI_MS = 1200;             // 순음 간 간격 (Inter-Stimulus Interval)

const START_DB = 40;
const STEP_UP = 20;
const MAX_DB = 100;

export type EngineEvent =
  | { type: 'tone_start'; frequency: number; dbHL: number }
  | { type: 'tone_end' }
  | { type: 'threshold_found'; ear: Ear; frequency: TestFrequency; dbHL: number }
  | { type: 'ear_complete'; ear: Ear }
  | { type: 'test_complete'; result: TestResult }
  | { type: 'noise_warning' }
  | { type: 'state_update'; state: AudiometricState }
  | { type: 'countdown'; seconds: number };

export class AudiometricEngine {
  private toneGen: ToneGenerator;
  private state: AudiometricState;
  private listener: ((event: EngineEvent) => void) | null = null;
  private isPaused = false;
  private isRunning = false;
  private responseReceived = false;
  private abortController: AbortController = new AbortController();

  constructor() {
    this.toneGen = new ToneGenerator();
    this.state = this.createInitialState();
  }

  private createInitialState(): AudiometricState {
    return {
      currentEar: 'right',
      currentFrequency: 125,
      currentDb: START_DB,
      phase: 'familiarization',
      ascendingResponses: [],
      trialCount: 0,
      results: { right: {}, left: {}, date: new Date().toISOString() },
    };
  }

  setListener(listener: (event: EngineEvent) => void) {
    this.listener = listener;
  }

  getState(): AudiometricState {
    return { ...this.state };
  }

  private emit(event: EngineEvent) {
    this.listener?.(event);
  }

  // ── 외부 제어 ──────────────────────────────────────────

  async start() {
    this.abortController = new AbortController();
    this.state = this.createInitialState();
    this.isRunning = true;
    this.isPaused = false;
    this.responseReceived = false;
    this.emit({ type: 'state_update', state: this.getState() });
    await this.runAllFrequencies();
  }

  pause() {
    this.isPaused = true;
    this.toneGen.stop();
  }

  resume() {
    if (!this.isRunning) return;
    this.isPaused = false;
    // 일시 정지 후 다시 실행은 현재 주파수부터 재시작
    this.runAllFrequencies();
  }

  stop() {
    this.isRunning = false;
    this.abortController.abort();
    this.toneGen.stop();
  }

  /** 사용자가 버튼/스페이스바를 눌렀을 때 호출 */
  onUserResponse() {
    if (!this.isRunning || this.isPaused) return;
    this.responseReceived = true;
  }

  dispose() {
    this.stop();
    this.toneGen.dispose();
  }

  // ── 내부 검사 루프 ──────────────────────────────────────

  private async runAllFrequencies() {
    const ears: Ear[] = ['right', 'left'];

    for (const ear of ears) {
      if (!this.isRunning) return;
      this.state.currentEar = ear;

      for (const freq of TEST_FREQUENCIES) {
        if (!this.isRunning) return;

        // 일시정지 해제 대기
        while (this.isPaused) {
          await this.sleep(200);
          if (!this.isRunning) return;
        }

        this.state.currentFrequency = freq;
        this.state.currentDb = START_DB;
        this.state.phase = 'familiarization';
        this.emit({ type: 'state_update', state: this.getState() });

        const threshold = await this.testOneFrequency(ear, freq);
        if (!this.isRunning) return;

        this.state.results[ear][freq] = threshold;
        this.state.phase = 'threshold_found';
        this.emit({ type: 'threshold_found', ear, frequency: freq, dbHL: threshold });
        this.emit({ type: 'state_update', state: this.getState() });

        await this.sleep(600);
      }

      this.emit({ type: 'ear_complete', ear });
      if (ear === 'right') {
        // 귀 전환 전 2초 대기 + 안내
        this.state.phase = 'idle';
        this.emit({ type: 'state_update', state: this.getState() });
        await this.sleep(2000);
      }
    }

    if (this.isRunning) {
      this.state.phase = 'complete';
      this.isRunning = false;
      this.emit({ type: 'test_complete', result: this.state.results });
    }
  }

  /**
   * 하나의 주파수에 대한 역치 탐색
   * START_DB에서 시작 → 반응 없으면 +20 dB → MAX_DB까지
   */
  private async testOneFrequency(ear: Ear, freq: TestFrequency): Promise<number> {
    let currentDb = START_DB;

    while (currentDb <= MAX_DB) {
      if (!this.isRunning) return currentDb;

      this.state.currentDb = currentDb;
      this.state.phase = currentDb === START_DB ? 'familiarization' : 'ascending';
      this.emit({ type: 'state_update', state: this.getState() });

      // ISI 대기
      await this.sleep(ISI_MS);
      if (!this.isRunning) return currentDb;

      // 순음 재생
      this.responseReceived = false;
      this.emit({ type: 'tone_start', frequency: freq, dbHL: currentDb });

      const amplitude = this.dbHLToAmplitude(currentDb);
      this.toneGen.playTone(freq, TONE_DURATION_MS, amplitude, ear);

      // 순음 재생 중 응답 대기 (TONE_DURATION + RESPONSE_WINDOW)
      const totalWait = TONE_DURATION_MS + RESPONSE_WINDOW_MS;
      const responded = await this.waitForResponse(totalWait);

      this.emit({ type: 'tone_end' });
      if (!this.isRunning) return currentDb;

      if (responded) {
        return currentDb; // 역치 확정
      }

      // 미반응 → 20 dB 상승
      currentDb += STEP_UP;
    }

    return MAX_DB; // 최대에서도 무반응
  }

  /**
   * timeoutMs 이내에 responseReceived가 true가 되면 true 반환
   * 카운트다운도 함께 방출
   */
  private waitForResponse(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = setInterval(() => {
        if (!this.isRunning) {
          clearInterval(tick);
          resolve(false);
          return;
        }
        if (this.responseReceived) {
          clearInterval(tick);
          resolve(true);
          return;
        }
        const elapsed = Date.now() - start;
        const remaining = Math.ceil((timeoutMs - elapsed) / 1000);
        if (remaining >= 0) {
          this.emit({ type: 'countdown', seconds: remaining });
        }
        if (elapsed >= timeoutMs) {
          clearInterval(tick);
          resolve(false);
        }
      }, 100);
    });
  }

  /**
   * dB HL → 진폭 변환 (간이 선형 근사)
   * 0 dB HL → ~0.001, 40 dB HL → ~0.08, 100 dB HL → 1.0
   */
  private dbHLToAmplitude(dbHL: number): number {
    // 기준: 40 dB HL = 0.08 amplitude
    const refDb = 40;
    const refAmp = 0.08;
    const amp = refAmp * Math.pow(10, (dbHL - refDb) / 20);
    return Math.min(1.0, Math.max(0.001, amp));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
