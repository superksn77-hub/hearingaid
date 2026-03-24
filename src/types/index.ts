export type Ear = 'right' | 'left';

export type TestFrequency = 125 | 250 | 500 | 1000 | 2000 | 4000 | 8000;

// 검사 순서: 125 → 250 → 500 → 1k → 2k → 4k → 8k
export const TEST_FREQUENCIES: TestFrequency[] = [125, 250, 500, 1000, 2000, 4000, 8000];

export const FREQUENCY_ORDER: TestFrequency[] = [125, 250, 500, 1000, 2000, 4000, 8000];

export interface ThresholdPoint {
  frequency: TestFrequency;
  dbHL: number;
}

export interface EarResult {
  ear: Ear;
  thresholds: Partial<Record<TestFrequency, number>>;
}

export interface UserProfile {
  name: string;
  age: string;
  gender: 'male' | 'female' | 'other' | '';
}

export interface TestResult {
  right: Partial<Record<TestFrequency, number>>;
  left: Partial<Record<TestFrequency, number>>;
  date: string;
  user?: UserProfile;
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
