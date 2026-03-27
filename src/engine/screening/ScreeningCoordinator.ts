import { CPTEngine } from './CPTEngine';
import { DLFEngine } from './DLFEngine';
import { GDTEngine } from './GDTEngine';
import { EHFAEngine } from './EHFAEngine';
import {
  ScreeningResult, ScreeningModule, ScreeningEngineEvent,
  LatencyCalibration, CPTMetrics, DLFMetrics, GDTMetrics, EHFAMetrics
} from '../../types/screening';
import { UserProfile } from '../../types';

/**
 * 스크리닝 검사 총괄 코디네이터
 *
 * 4개 모듈을 순차 실행:
 *   1. EHFA (숨은 난청 필터)
 *   2. CPT (주의력/반응 억제)
 *   3. DLF (주파수 변별)
 *   4. GDT (간격 탐지)
 */

const MODULE_LABELS: Record<ScreeningModule, string> = {
  calibration: '하드웨어 보정',
  ehfa: '확장 고주파 청력검사',
  cpt: '주의력 검사 (CPT)',
  dlf: '주파수 변별력 검사',
  gdt: '시간 해상도 검사',
};

export class ScreeningCoordinator {
  private cptEngine = new CPTEngine();
  private dlfEngine = new DLFEngine();
  private gdtEngine = new GDTEngine();
  private ehfaEngine = new EHFAEngine();

  private currentModule: ScreeningModule | null = null;
  private listener: ((e: ScreeningEngineEvent) => void) | null = null;
  private isRunning = false;
  private latencyCalibration: LatencyCalibration = { estimatedLatencyMs: 0, measurements: [] };

  setListener(cb: (e: ScreeningEngineEvent) => void) { this.listener = cb; }
  getCurrentModule(): ScreeningModule | null { return this.currentModule; }

  async start(
    calibration: LatencyCalibration,
    user?: UserProfile
  ): Promise<ScreeningResult | null> {
    this.isRunning = true;
    this.latencyCalibration = calibration;

    // 모듈별 이벤트 포워딩 설정
    this.ehfaEngine.setListener(e => {
      if (e.type === 'progress') this.emit({ type: 'progress', module: 'ehfa', current: e.current, total: e.total });
      if (e.type === 'false_positive') this.emit({ type: 'false_positive', reason: e.reason });
      if (e.type === 'threshold_found') this.emit({ type: 'threshold_found', label: `${e.freq}Hz`, value: e.dbHL });
    });

    this.cptEngine.setListener(e => {
      if (e.type === 'progress') this.emit({ type: 'progress', module: 'cpt', current: e.current, total: e.total });
      if (e.type === 'tone_played') this.emit({ type: 'tone_played' });
      if (e.type === 'false_positive') this.emit({ type: 'false_positive', reason: 'catch' });
    });

    this.dlfEngine.setListener(e => {
      if (e.type === 'progress') this.emit({ type: 'progress', module: 'dlf', current: e.current, total: e.total });
      if (e.type === 'awaiting_response') this.emit({ type: 'awaiting_response', mode: 'dual' });
      if (e.type === 'pair_playing') this.emit({ type: 'tone_played' });
    });

    this.gdtEngine.setListener(e => {
      if (e.type === 'progress') this.emit({ type: 'progress', module: 'gdt', current: e.current, total: e.total });
      if (e.type === 'noise_playing') this.emit({ type: 'noise_played' });
      if (e.type === 'awaiting_response') this.emit({ type: 'awaiting_response', mode: 'single' });
    });

    let ehfaMetrics: EHFAMetrics | null = null;
    let cptMetrics: CPTMetrics | null = null;
    let dlfMetrics: DLFMetrics | null = null;
    let gdtMetrics: GDTMetrics | null = null;

    // 1. EHFA
    this.switchModule('ehfa');
    ehfaMetrics = await this.ehfaEngine.start();
    if (!this.isRunning) return null;

    await this.sleep(2000);

    // 2. CPT
    this.switchModule('cpt');
    cptMetrics = await this.cptEngine.start(calibration);
    if (!this.isRunning) return null;

    await this.sleep(2000);

    // 3. DLF
    this.switchModule('dlf');
    dlfMetrics = await this.dlfEngine.start();
    if (!this.isRunning) return null;

    await this.sleep(2000);

    // 4. GDT
    this.switchModule('gdt');
    gdtMetrics = await this.gdtEngine.start();
    if (!this.isRunning) return null;

    const result: ScreeningResult = {
      cpt: cptMetrics!,
      dlf: dlfMetrics!,
      gdt: gdtMetrics!,
      ehfa: ehfaMetrics!,
      latencyCalibration: calibration,
      date: new Date().toISOString(),
      user,
    };

    this.emit({ type: 'screening_complete', result });
    this.isRunning = false;
    return result;
  }

  /** 사용자 응답 전달 — 현재 활성 모듈로 라우팅 */
  onUserResponse(choice?: 'same' | 'different') {
    switch (this.currentModule) {
      case 'ehfa': this.ehfaEngine.onUserResponse(); break;
      case 'cpt':  this.cptEngine.onUserResponse(); break;
      case 'dlf':  this.dlfEngine.onUserResponse(choice ?? 'same'); break;
      case 'gdt':  this.gdtEngine.onUserResponse(); break;
    }
  }

  stop() {
    this.isRunning = false;
    this.ehfaEngine.stop();
    this.cptEngine.stop();
    this.dlfEngine.stop();
    this.gdtEngine.stop();
  }

  dispose() {
    this.stop();
    this.ehfaEngine.dispose();
    this.cptEngine.dispose();
    this.dlfEngine.dispose();
    this.gdtEngine.dispose();
  }

  private switchModule(module: ScreeningModule) {
    this.currentModule = module;
    this.emit({
      type: 'module_switch',
      module,
      label: MODULE_LABELS[module],
    });
  }

  private emit(e: ScreeningEngineEvent) { this.listener?.(e); }
  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
