import { StaircaseConfig } from '../../types/screening';

/**
 * 적응형 계단법 (2-down 1-up)
 *
 * 연속 nDown번 정답 → 값 감소 (난이도 상승)
 * 1번 오답 → 값 증가 (난이도 하락)
 * 방향 전환 = reversal, targetReversals개 달성 시 종료
 * 임계치 = 마지막 6개 reversal의 평균
 */
export class AdaptiveStaircase {
  private value: number;
  private stepFactor: number;
  private minVal: number;
  private maxVal: number;
  private nDown: number;
  private consecutiveCorrect = 0;
  private reversals: number[] = [];
  private lastDirection: 'up' | 'down' | null = null;
  private targetReversals: number;
  private maxTrials: number;
  private trialCount = 0;

  constructor(config: StaircaseConfig) {
    this.value = config.initial;
    this.stepFactor = config.stepFactor;
    this.minVal = config.minVal;
    this.maxVal = config.maxVal;
    this.nDown = config.nDown;
    this.targetReversals = config.targetReversals;
    this.maxTrials = config.maxTrials;
  }

  getValue(): number { return this.value; }
  getReversals(): number[] { return [...this.reversals]; }
  getTrialCount(): number { return this.trialCount; }

  respond(correct: boolean): { done: boolean; nextValue: number } {
    this.trialCount++;

    if (correct) {
      this.consecutiveCorrect++;
      if (this.consecutiveCorrect >= this.nDown) {
        this.consecutiveCorrect = 0;
        const newDir: 'down' = 'down';
        if (this.lastDirection === 'up') {
          this.reversals.push(this.value);
        }
        this.lastDirection = newDir;
        this.value = Math.max(this.minVal, this.value / this.stepFactor);
      }
    } else {
      this.consecutiveCorrect = 0;
      const newDir: 'up' = 'up';
      if (this.lastDirection === 'down') {
        this.reversals.push(this.value);
      }
      this.lastDirection = newDir;
      this.value = Math.min(this.maxVal, this.value * this.stepFactor);
    }

    const done = this.reversals.length >= this.targetReversals
      || this.trialCount >= this.maxTrials;

    return { done, nextValue: this.value };
  }

  getThreshold(): number {
    if (this.reversals.length === 0) return this.value;
    const useCount = Math.min(6, this.reversals.length);
    const last = this.reversals.slice(-useCount);
    return last.reduce((a, b) => a + b, 0) / last.length;
  }
}
