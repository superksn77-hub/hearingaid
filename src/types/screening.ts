import { UserProfile } from './index';

// ══════════════════════════════════════════════════════════════
// ADHD / 난독증 스크리닝 타입 정의
// ══════════════════════════════════════════════════════════════

// ── 하드웨어 지연 보정 ───────────────────────────────────────
export interface LatencyCalibration {
  estimatedLatencyMs: number;
  measurements: number[];
}

// ── CPT (Continuous Performance Test) ────────────────────────
export interface CPTTrialResult {
  trialIndex: number;
  isCatch: boolean;
  responseTimeMs: number | null;
  falsePositive: boolean;
}

export interface CPTMetrics {
  rtMean: number;
  rtStd: number;
  rtTau: number;
  rtMu: number;
  rtSigma: number;
  falsePositiveRate: number;
  omissionRate: number;
  totalTrials: number;
  realTrials: number;
  catchTrials: number;
  allRTs: number[];
}

// ── DLF (Difference Limen for Frequency) ─────────────────────
export interface DLFMetrics {
  dlf1k: number;   // 1kHz 변별 임계치 %
  dlf6k: number;   // 6kHz 변별 임계치 %
  staircase1k: number[];
  staircase6k: number[];
}

// ── GDT (Gap Detection Threshold) ────────────────────────────
export interface GDTMetrics {
  gdt: number;     // 최소 탐지 간격 ms
  staircaseHistory: number[];
}

// ── EHFA (Extended High-Frequency Audiometry) ────────────────
export type EHFFrequency = 10000 | 12500 | 16000;
export const EHF_FREQUENCIES: EHFFrequency[] = [10000, 12500, 16000];

export interface EHFAMetrics {
  thresholds: Partial<Record<EHFFrequency, number>>;
  ptaEHF: number;
}

// ── 통합 결과 ────────────────────────────────────────────────
export interface ScreeningResult {
  cpt: CPTMetrics;
  dlf: DLFMetrics;
  gdt: GDTMetrics;
  ehfa: EHFAMetrics;
  latencyCalibration: LatencyCalibration;
  date: string;
  user?: UserProfile;
}

// ── 점수 산출 ────────────────────────────────────────────────
export type RiskLevel = 'low' | 'moderate' | 'high';

export interface ScreeningScores {
  riskEHF: number;
  pADHD: number;
  pDyslexia: number;
  zScores: {
    rtTau: number;
    fpr: number;
    oer: number;
    dlf1k: number;
    dlf6k: number;
    gdt: number;
    rtMean: number;
    ptaEHF: number;
  };
  adhdLevel: RiskLevel;
  dyslexiaLevel: RiskLevel;
  ehfFlag: boolean;
  interpretation: string;
  recommendations: string[];
}

// ── 엔진 이벤트 ─────────────────────────────────────────────
export type ScreeningModule = 'calibration' | 'ehfa' | 'cpt' | 'dlf' | 'gdt';

export type ScreeningEngineEvent =
  | { type: 'module_switch'; module: ScreeningModule; label: string }
  | { type: 'block_switch'; label: string }
  | { type: 'practice_info'; message: string; passed: boolean }
  | { type: 'progress'; module: ScreeningModule; current: number; total: number }
  | { type: 'tone_played' }
  | { type: 'noise_played' }
  | { type: 'awaiting_response'; mode: 'single' | 'dual' }
  | { type: 'false_positive'; reason: string }
  | { type: 'trial_result'; correct: boolean }
  | { type: 'threshold_found'; label: string; value: number }
  | { type: 'module_complete'; module: ScreeningModule }
  | { type: 'screening_complete'; result: ScreeningResult };

// ── 적응형 계단법 설정 ───────────────────────────────────────
export interface StaircaseConfig {
  initial: number;
  stepFactor: number;
  minVal: number;
  maxVal: number;
  nDown: number;
  targetReversals: number;
  maxTrials: number;
}
