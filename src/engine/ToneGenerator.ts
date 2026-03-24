import { Audio } from 'expo-av';

const SAMPLE_RATE = 44100;

function createWavBuffer(
  frequency: number,
  durationMs: number,
  amplitude: number, // 0 to 1
  attackMs: number = 30,
  releaseMs: number = 30
): ArrayBuffer {
  const numSamples = Math.floor((SAMPLE_RATE * durationMs) / 1000);
  const attackSamples = Math.floor((SAMPLE_RATE * attackMs) / 1000);
  const releaseSamples = Math.floor((SAMPLE_RATE * releaseMs) / 1000);

  // WAV header: 44 bytes + PCM data (16-bit samples)
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF chunk
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, 1, true);  // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true);  // block align
  view.setUint16(34, 16, true); // bits per sample
  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM samples with envelope
  for (let i = 0; i < numSamples; i++) {
    let env = 1.0;
    if (i < attackSamples) {
      env = i / attackSamples;
    } else if (i >= numSamples - releaseSamples) {
      env = (numSamples - i) / releaseSamples;
    }
    const sample = Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE);
    const value = Math.round(sample * amplitude * env * 32767);
    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, value)), true);
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
  // Use btoa if available
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
    amplitude: number
  ): Promise<void> {
    await this.stop();

    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
      });

      const wavBuffer = createWavBuffer(frequencyHz, durationMs, amplitude);
      const base64 = bufferToBase64(wavBuffer);
      const uri = `data:audio/wav;base64,${base64}`;

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, volume: 1.0 }
      );
      this.sound = sound;

      // Auto-stop after duration
      setTimeout(() => this.stop(), durationMs + 100);
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
