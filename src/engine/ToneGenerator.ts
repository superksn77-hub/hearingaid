import { Audio } from 'expo-av';
import { Ear } from '../types';

const SAMPLE_RATE = 44100;
const NUM_CHANNELS = 2; // stereo

/**
 * Stereo WAV 생성
 * - right ear: 우측 채널에만 신호, 좌측 채널 무음
 * - left  ear: 좌측 채널에만 신호, 우측 채널 무음
 */
function createStereoPcmWav(
  frequency: number,
  durationMs: number,
  amplitude: number,
  ear: Ear,
  attackMs = 30,
  releaseMs = 30
): ArrayBuffer {
  const numSamples = Math.floor((SAMPLE_RATE * durationMs) / 1000);
  const attackSamples = Math.floor((SAMPLE_RATE * attackMs) / 1000);
  const releaseSamples = Math.floor((SAMPLE_RATE * releaseMs) / 1000);

  // 스테레오: 샘플당 2채널 × 2바이트
  const dataSize = numSamples * NUM_CHANNELS * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF / WAVE 헤더
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt 청크
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);                          // chunk size
  view.setUint16(20, 1, true);                           // PCM
  view.setUint16(22, NUM_CHANNELS, true);                // 2 채널
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * NUM_CHANNELS * 2, true); // byte rate
  view.setUint16(32, NUM_CHANNELS * 2, true);            // block align
  view.setUint16(34, 16, true);                          // bits/sample

  // data 청크
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM 데이터 (인터리브: L, R, L, R, ...)
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    // 어택/릴리즈 엔벨로프
    let env = 1.0;
    if (i < attackSamples) {
      env = i / attackSamples;
    } else if (i >= numSamples - releaseSamples) {
      env = (numSamples - i) / releaseSamples;
    }

    const sample = Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE);
    const value = Math.round(sample * amplitude * env * 32767);
    const clamped = Math.max(-32768, Math.min(32767, value));

    // 좌측(L) 채널
    const leftSample  = ear === 'left'  ? clamped : 0;
    // 우측(R) 채널
    const rightSample = ear === 'right' ? clamped : 0;

    view.setInt16(offset, leftSample, true);
    offset += 2;
    view.setInt16(offset, rightSample, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa !== 'undefined') {
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

export class ToneGenerator {
  private sound: Audio.Sound | null = null;

  async playTone(
    frequencyHz: number,
    durationMs: number,
    amplitude: number,
    ear: Ear = 'right'
  ): Promise<void> {
    await this.stop();

    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
      });

      const wavBuffer = createStereoPcmWav(frequencyHz, durationMs, Math.max(0.001, amplitude), ear);
      const base64 = bufferToBase64(wavBuffer);
      const uri = `data:audio/wav;base64,${base64}`;

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, volume: 1.0 }
      );
      this.sound = sound;

      // 재생 완료 후 자동 언로드
      setTimeout(() => this.stop(), durationMs + 200);
    } catch (e) {
      console.warn('ToneGenerator error:', e);
    }
  }

  async stop(): Promise<void> {
    if (this.sound) {
      try {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
      } catch (_) {}
      this.sound = null;
    }
  }

  dispose() {
    this.stop();
  }
}
