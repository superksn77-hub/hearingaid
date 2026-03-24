import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert
} from 'react-native';
import { ToneGenerator } from '../engine/ToneGenerator';
import { dbHLToAmplitude } from '../engine/CalibrationManager';
import { TestFrequency, FREQUENCY_ORDER } from '../types';

interface Props {
  navigation: any;
}

const CALIB_FREQUENCIES: TestFrequency[] = [1000, 2000, 4000, 500, 250];

export const CalibrationScreen: React.FC<Props> = ({ navigation }) => {
  const toneGen = useRef(new ToneGenerator()).current;
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState<'intro' | 'calib' | 'done'>('intro');

  const handleSkip = () => {
    navigation.navigate('Test');
  };

  const handlePlay = async () => {
    setPlaying(true);
    // Play a 1kHz tone at 40 dB HL for volume check
    const amp = 0.3; // moderate amplitude
    await toneGen.playTone(1000, 2000, amp);
    setTimeout(() => setPlaying(false), 2500);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>볼륨 설정</Text>
      <Text style={styles.subtitle}>검사 전 기기 볼륨을 적절히 설정하세요</Text>

      <View style={styles.card}>
        <Text style={styles.stepTitle}>1. 이어폰/헤드폰 착용</Text>
        <Text style={styles.stepText}>
          양쪽 귀에 이어폰을 올바르게 착용하고{'\n'}L(좌), R(우) 방향을 확인하세요.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.stepTitle}>2. 볼륨 확인</Text>
        <Text style={styles.stepText}>
          아래 버튼을 눌러 테스트 음을 재생하고{'\n'}
          소리가 편안하게 들릴 때까지 기기 볼륨을{'\n'}
          70~80% 수준으로 조절하세요.
        </Text>

        <TouchableOpacity
          style={[styles.playButton, playing && styles.playButtonActive]}
          onPress={handlePlay}
          disabled={playing}
        >
          <Text style={styles.playButtonText}>
            {playing ? '🔊 재생 중...' : '🔊 테스트 음 재생 (1kHz)'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.stepTitle}>3. 조용한 환경 확인</Text>
        <Text style={styles.stepText}>
          주변이 조용한지 확인하세요.{'\n'}
          TV, 음악, 선풍기 등 소음원을 제거하고{'\n'}
          가능하면 조용한 방에서 검사하세요.
        </Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          💡 검사 중 소음이 35dB을 초과하면{'\n'}자동으로 검사가 일시 중지됩니다.
        </Text>
      </View>

      <TouchableOpacity style={styles.nextButton} onPress={handleSkip}>
        <Text style={styles.nextButtonText}>검사 시작하기 →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1a237e', textAlign: 'center', marginTop: 20, marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#546e7a', textAlign: 'center', marginBottom: 24 },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  stepTitle: { fontSize: 16, fontWeight: 'bold', color: '#1976D2', marginBottom: 8 },
  stepText: { fontSize: 14, color: '#37474f', lineHeight: 22 },
  playButton: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 2,
    borderColor: '#1976D2',
  },
  playButtonActive: { backgroundColor: '#bbdefb' },
  playButtonText: { fontSize: 15, color: '#1976D2', fontWeight: '600' },
  infoBox: {
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#a5d6a7',
  },
  infoText: { fontSize: 13, color: '#2e7d32', lineHeight: 20, textAlign: 'center' },
  nextButton: {
    backgroundColor: '#1976D2',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
  },
  nextButtonText: { color: 'white', fontSize: 17, fontWeight: 'bold' },
});
