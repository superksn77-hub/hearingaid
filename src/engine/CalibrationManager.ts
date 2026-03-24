import { TestFrequency, CalibrationData } from '../types';

// RETSPL offsets (dB) for insert earphones per ANSI S3.6
// These convert dB SPL to dB HL. Lower = more sensitive ear at that freq.
const DEFAULT_RETSPL: Record<TestFrequency, number> = {
  250: 14.5,
  500: 11.5,
  1000: 7.0,
  2000: 9.0,
  4000: 9.5,
  8000: 13.0,
};

// Amplitude mapping: dB HL -> amplitude (0..1)
// 0 dB HL = reference threshold, max ~120 dB HL
export function dbHLToAmplitude(dbHL: number, frequency: TestFrequency, calibration: CalibrationData): number {
  const offset = calibration[frequency] ?? 0;
  const adjusted = dbHL + offset;
  // Map dB HL to amplitude using inverse log scale
  // 0 dB HL ~ amplitude 0.001, 80 dB HL ~ amplitude 0.9
  const normalized = Math.max(-10, Math.min(120, adjusted));
  return Math.pow(10, (normalized - 80) / 40) * 0.9;
}

export class CalibrationManager {
  private calibration: CalibrationData = {};

  constructor() {
    // Default: use RETSPL-based calibration (Tier 1 approximation)
    Object.keys(DEFAULT_RETSPL).forEach((k) => {
      const freq = parseInt(k) as TestFrequency;
      this.calibration[freq] = 0; // no offset initially
    });
  }

  getCalibration(): CalibrationData {
    return { ...this.calibration };
  }

  setCalibrationOffset(frequency: TestFrequency, offsetDb: number) {
    this.calibration[frequency] = offsetDb;
  }

  // Biological calibration: user sets threshold at each frequency
  // We assume normal hearing = 0 dB HL, so we compute offset
  setBiologicalThreshold(frequency: TestFrequency, measuredDbHL: number) {
    // If user hears the tone at X dB HL when they should hear it at 0,
    // offset = -X (we need to reduce apparent threshold)
    this.calibration[frequency] = -measuredDbHL;
  }
}
