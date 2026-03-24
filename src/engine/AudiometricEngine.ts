import { TestFrequency, Ear, TestResult, TEST_FREQUENCIES, AudiometricState } from '../types';
import { ToneGenerator } from './ToneGenerator';
import { CalibrationManager, dbHLToAmplitude } from './CalibrationManager';

const TONE_DURATION_MS = 1000;
const MIN_DB = -10;
const MAX_DB = 120;

// Descend 10 dB on response, ascend 5 dB on no-response
const STEP_DOWN = 10;
const STEP_UP = 5;

// Threshold confirmed when 2 out of 3 ascending responses at same level
const THRESHOLD_RESPONSES_NEEDED = 2;
const THRESHOLD_TRIALS_NEEDED = 3;

export type EngineEvent =
  | { type: 'tone_start'; frequency: number; dbHL: number }
  | { type: 'tone_end' }
  | { type: 'threshold_found'; ear: Ear; frequency: TestFrequency; dbHL: number }
  | { type: 'ear_complete'; ear: Ear }
  | { type: 'test_complete'; result: TestResult }
  | { type: 'noise_warning' }
  | { type: 'state_update'; state: AudiometricState };

export class AudiometricEngine {
  private toneGen: ToneGenerator;
  private calibration: CalibrationManager;
  private state: AudiometricState;
  private listener: ((event: EngineEvent) => void) | null = null;
  private isPaused = false;
  private isRunning = false;
  private toneTimer: ReturnType<typeof setTimeout> | null = null;
  private responseReceived = false;

  // Ascending run tracking per level
  private ascendingLevelResponses: Map<number, { responses: number; trials: number }> = new Map();

  constructor() {
    this.toneGen = new ToneGenerator();
    this.calibration = new CalibrationManager();
    this.state = this.createInitialState();
  }

  private createInitialState(): AudiometricState {
    return {
      currentEar: 'right',
      currentFrequency: 125,
      currentDb: 50,
      phase: 'idle',
      ascendingResponses: [],
      trialCount: 0,
      results: { right: {}, left: {}, date: new Date().toISOString() },
    };
  }

  setListener(listener: (event: EngineEvent) => void) {
    this.listener = listener;
  }

  getCalibrationManager() {
    return this.calibration;
  }

  getState(): AudiometricState {
    return { ...this.state };
  }

  private emit(event: EngineEvent) {
    this.listener?.(event);
  }

  async start() {
    this.state = this.createInitialState();
    this.isRunning = true;
    this.isPaused = false;
    this.state.phase = 'familiarization';
    this.state.currentFrequency = 125;
    this.state.currentDb = 50;
    this.ascendingLevelResponses.clear();
    this.emit({ type: 'state_update', state: this.getState() });
    await this.runNextTrial();
  }

  pause() {
    this.isPaused = true;
    this.toneGen.stop();
    if (this.toneTimer) {
      clearTimeout(this.toneTimer);
      this.toneTimer = null;
    }
  }

  resume() {
    if (!this.isRunning) return;
    this.isPaused = false;
    setTimeout(() => this.runNextTrial(), 500);
  }

  stop() {
    this.isRunning = false;
    this.isPaused = false;
    this.toneGen.stop();
    if (this.toneTimer) {
      clearTimeout(this.toneTimer);
    }
  }

  // Called when user presses response button
  onUserResponse() {
    if (!this.isRunning || this.isPaused) return;
    this.responseReceived = true;
  }

  private async runNextTrial() {
    if (!this.isRunning || this.isPaused) return;

    const { currentFrequency, currentDb, phase, currentEar } = this.state;

    // Clamp dB
    const clampedDb = Math.max(MIN_DB, Math.min(MAX_DB, currentDb));
    this.state.currentDb = clampedDb;

    // Random inter-stimulus interval 1-2.5 seconds to prevent button mashing
    const isi = 1000 + Math.random() * 1500;
    await this.delay(isi);

    if (!this.isRunning || this.isPaused) return;

    // Play tone
    this.responseReceived = false;
    const amplitude = dbHLToAmplitude(clampedDb, currentFrequency, this.calibration.getCalibration());
    this.emit({ type: 'tone_start', frequency: currentFrequency, dbHL: clampedDb });
    this.emit({ type: 'state_update', state: this.getState() });

    await this.toneGen.playTone(currentFrequency, TONE_DURATION_MS, Math.max(0.001, amplitude), currentEar);
    this.emit({ type: 'tone_end' });

    // Response window: 1.5 seconds after tone
    await this.delay(1500);

    if (!this.isRunning || this.isPaused) return;

    const responded = this.responseReceived;
    this.responseReceived = false;

    await this.processResponse(responded);
  }

  private async processResponse(responded: boolean) {
    if (!this.isRunning) return;
    const { phase, currentFrequency, currentDb, currentEar } = this.state;

    if (phase === 'familiarization') {
      if (responded) {
        // Start descending phase
        this.state.phase = 'descending';
        this.state.currentDb = currentDb - STEP_DOWN;
        this.ascendingLevelResponses.clear();
      } else {
        // Increase by 20 dB until heard
        this.state.currentDb = Math.min(MAX_DB, currentDb + 20);
      }
      this.emit({ type: 'state_update', state: this.getState() });
      await this.runNextTrial();
      return;
    }

    if (phase === 'descending') {
      if (responded) {
        // Keep descending
        this.state.currentDb = currentDb - STEP_DOWN;
      } else {
        // Switch to ascending
        this.state.phase = 'ascending';
        this.state.currentDb = currentDb + STEP_UP;
        this.ascendingLevelResponses.clear();
      }
      this.emit({ type: 'state_update', state: this.getState() });
      await this.runNextTrial();
      return;
    }

    if (phase === 'ascending') {
      const dbKey = currentDb;
      if (!this.ascendingLevelResponses.has(dbKey)) {
        this.ascendingLevelResponses.set(dbKey, { responses: 0, trials: 0 });
      }
      const entry = this.ascendingLevelResponses.get(dbKey)!;
      entry.trials++;
      if (responded) entry.responses++;

      if (responded) {
        // Check threshold condition: 2+ of 3 responses at same level
        if (entry.responses >= THRESHOLD_RESPONSES_NEEDED && entry.trials >= THRESHOLD_TRIALS_NEEDED) {
          // Threshold found!
          const dbHL = currentDb;
          this.state.phase = 'threshold_found';
          this.state.results[currentEar][currentFrequency] = dbHL;
          this.emit({ type: 'threshold_found', ear: currentEar, frequency: currentFrequency, dbHL });
          await this.delay(500);
          await this.moveToNextFrequency();
          return;
        } else if (entry.trials < THRESHOLD_TRIALS_NEEDED) {
          // Need more trials at this level
          await this.runNextTrial();
          return;
        } else {
          // Not enough responses, descend again then ascend
          this.state.phase = 'descending';
          this.state.currentDb = currentDb - STEP_DOWN;
          await this.runNextTrial();
          return;
        }
      } else {
        // No response: go up 5 dB
        this.state.currentDb = currentDb + STEP_UP;
        if (this.state.currentDb > MAX_DB) {
          // Can't go higher, mark as no response
          this.state.results[currentEar][currentFrequency] = MAX_DB;
          this.emit({ type: 'threshold_found', ear: currentEar, frequency: currentFrequency, dbHL: MAX_DB });
          await this.moveToNextFrequency();
          return;
        }
        this.ascendingLevelResponses.clear();
        this.emit({ type: 'state_update', state: this.getState() });
        await this.runNextTrial();
        return;
      }
    }
  }

  private async moveToNextFrequency() {
    const { currentEar, currentFrequency } = this.state;
    const freqIndex = TEST_FREQUENCIES.indexOf(currentFrequency);
    this.ascendingLevelResponses.clear();

    if (freqIndex < TEST_FREQUENCIES.length - 1) {
      // Next frequency for current ear
      const nextFreq = TEST_FREQUENCIES[freqIndex + 1];
      this.state.currentFrequency = nextFreq;
      this.state.currentDb = 50; // Reset to 50 dB
      this.state.phase = 'familiarization';
      this.emit({ type: 'state_update', state: this.getState() });
      await this.delay(1000);
      await this.runNextTrial();
    } else {
      // Current ear done
      this.emit({ type: 'ear_complete', ear: currentEar });

      if (currentEar === 'right') {
        // Switch to left ear
        this.state.currentEar = 'left';
        this.state.currentFrequency = 125;
        this.state.currentDb = 50;
        this.state.phase = 'familiarization';
        this.emit({ type: 'state_update', state: this.getState() });
        await this.delay(2000);
        await this.runNextTrial();
      } else {
        // Both ears done
        this.state.phase = 'complete';
        this.isRunning = false;
        this.emit({ type: 'test_complete', result: this.state.results });
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.toneTimer = setTimeout(resolve, ms);
    });
  }

  dispose() {
    this.stop();
    this.toneGen.dispose();
  }
}
