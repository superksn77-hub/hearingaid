/**
 * VolumeCalibrator — 자동 볼륨 캘리브레이션
 *
 * 사용자의 시스템 볼륨에 관계없이 정확한 dB HL을 재현하기 위해
 * 마이크 피드백 루프 또는 생물학적 역치를 사용하여
 * 시스템 게인 보정 계수(systemGainFactor)를 산출한다.
 *
 * 방법 1 (마이크 기반 — 자동):
 *   1) 알려진 진폭(0.1)의 1kHz 톤을 재생
 *   2) 마이크로 녹음하여 RMS 레벨 측정
 *   3) 목표 RMS와 비교하여 보정 계수 산출
 *
 * 방법 2 (생물학적 — 반자동):
 *   1) 1kHz 톤을 매우 작은 소리부터 시작
 *   2) 사용자가 "들린다"고 응답할 때의 게인을 기록
 *   3) 정상 청력의 0 dB HL 역치와 비교하여 보정 계수 산출
 *
 * 결과: systemGainFactor를 모든 dB→amplitude 변환에 곱하여
 *       시스템 볼륨 차이를 상쇄한다.
 */

export interface CalibrationResult {
  method: 'microphone' | 'biological' | 'manual';
  systemGainFactor: number;    // 모든 amplitude에 곱할 보정 계수
  measuredRMS?: number;        // 마이크 측정 RMS (방법1)
  thresholdGain?: number;      // 역치 게인 (방법2)
  confidence: number;          // 0~1 신뢰도
  timestamp: number;
}

// ── 상수 ────────────────────────────────────────────────────────
// 정상 청력에서 0 dB HL ≈ amplitude 0.001 (CalibrationManager 공식 기준)
// 40 dB HL ≈ amplitude 0.1 (AudiometricEngine 공식 기준)
const REFERENCE_AMPLITUDE = 0.1;   // 40 dB HL 기준 진폭
const TARGET_RMS_DB = -30;         // 마이크에서 측정 목표 RMS (dBFS)
const TARGET_RMS = Math.pow(10, TARGET_RMS_DB / 20); // ≈ 0.0316

const STORAGE_KEY = 'hicog_volume_calibration';

export class VolumeCalibrator {
  private audioCtx: AudioContext | null = null;

  /** 마이크 기반 자동 캘리브레이션 시도 */
  async calibrateWithMicrophone(): Promise<CalibrationResult | null> {
    try {
      // 마이크 권한 요청
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioCtx = new AudioContext();

      // 마이크 입력 → AnalyserNode
      const source = this.audioCtx.createMediaStreamSource(stream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      // 1kHz 테스트 톤 재생 (양쪽 귀)
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.frequency.value = 1000;
      osc.type = 'sine';
      gain.gain.value = REFERENCE_AMPLITUDE;
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();

      // 500ms 대기 후 RMS 측정
      await this.delay(500);

      const buffer = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buffer);
      const rms = this.calculateRMS(buffer);

      osc.stop();
      stream.getTracks().forEach(t => t.stop());

      if (rms < 0.0001) {
        // 마이크에서 소리가 감지되지 않음 (헤드폰 사용 시)
        return null;
      }

      // 보정 계수 산출: 목표 RMS / 측정 RMS
      const systemGainFactor = TARGET_RMS / rms;
      const clampedFactor = Math.max(0.1, Math.min(10.0, systemGainFactor));

      const result: CalibrationResult = {
        method: 'microphone',
        systemGainFactor: clampedFactor,
        measuredRMS: rms,
        confidence: 0.8,
        timestamp: Date.now(),
      };

      this.saveCalibration(result);
      return result;
    } catch {
      return null;
    }
  }

  /** 생물학적 역치 기반 캘리브레이션 */
  async calibrateWithThreshold(
    onTonePlay: (amplitude: number) => Promise<void>,
    onAskHeard: () => Promise<boolean>,
  ): Promise<CalibrationResult> {
    // 매우 작은 소리부터 시작하여 들릴 때까지 증가
    let amplitude = 0.001;  // 약 0 dB HL
    let heard = false;
    let thresholdAmp = 0.001;

    while (amplitude <= 0.5 && !heard) {
      await onTonePlay(amplitude);
      heard = await onAskHeard();
      if (heard) {
        thresholdAmp = amplitude;
      } else {
        amplitude *= 1.5;  // ~3.5 dB 증가
      }
    }

    // 정상 청력이라면 0 dB HL ≈ 0.001 amplitude에서 들려야 함
    // 실제로 thresholdAmp에서 들렸다면, 보정 계수 = 0.001 / thresholdAmp
    const expectedThreshold = 0.001;
    const systemGainFactor = expectedThreshold / thresholdAmp;
    const clampedFactor = Math.max(0.1, Math.min(10.0, systemGainFactor));

    const result: CalibrationResult = {
      method: 'biological',
      systemGainFactor: clampedFactor,
      thresholdGain: thresholdAmp,
      confidence: 0.9,
      timestamp: Date.now(),
    };

    this.saveCalibration(result);
    return result;
  }

  /** 수동 캘리브레이션 (볼륨 70~80% 가정) */
  getManualCalibration(): CalibrationResult {
    return {
      method: 'manual',
      systemGainFactor: 1.0,
      confidence: 0.5,
      timestamp: Date.now(),
    };
  }

  /** 저장된 캘리브레이션 로드 */
  loadCalibration(): CalibrationResult | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as CalibrationResult;
      // 24시간 이내의 캘리브레이션만 유효
      if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) return null;
      return data;
    } catch {
      return null;
    }
  }

  /** 캘리브레이션 결과를 dB→amplitude 변환에 적용 */
  static applyCalibration(amplitude: number, calibration: CalibrationResult | null): number {
    if (!calibration) return amplitude;
    const adjusted = amplitude * calibration.systemGainFactor;
    return Math.min(1.0, Math.max(0.0001, adjusted));
  }

  // ── 내부 유틸 ────────────────────────────────────────────────
  private calculateRMS(buffer: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }

  private saveCalibration(result: CalibrationResult): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    } catch {}
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  dispose(): void {
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}
