export type Ear = 'right' | 'left';

export type TestFrequency = 250 | 500 | 1000 | 2000 | 4000 | 8000;

export const TEST_FREQUENCIES: TestFrequency[] = [1000, 2000, 4000, 8000, 500, 250];

export const FREQUENCY_ORDER: TestFrequency[] = [250, 500, 1000, 2000, 4000, 8000];

export interface ThresholdPoint {
  frequency: TestFrequency;
  dbHL: number;
}

export interface EarResult {
  ear: Ear;
  thresholds: Partial<Record<TestFrequency, number>>;
}

export interface TestResult {
  right: Partial<Record<TestFrequency, number>>;
  left: Partial<Record<TestFrequency, number>>;
  date: string;
}

export type TestPhase =
  | 'idle'
  | 'familiarization'
  | 'descending'
  | 'ascending'
  | 'threshold_found'
  | 'complete';

export interface AudiometricState {
  currentEar: Ear;
  currentFrequency: TestFrequency;
  currentDb: number;
  phase: TestPhase;
  ascendingResponses: number[];
  trialCount: number;
  results: TestResult;
}

export type CalibrationData = Partial<Record<TestFrequency, number>>;

export type NoiseStatus = 'ok' | 'warning' | 'error';
