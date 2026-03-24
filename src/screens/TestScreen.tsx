import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Vibration, Platform
} from 'react-native';
import { Audio } from 'expo-av';
import { AudiometricEngine, EngineEvent } from '../engine/AudiometricEngine';
import { Ear, TestFrequency, TestResult, TEST_FREQUENCIES } from '../types';

interface Props {
  navigation: any;
}

const FREQ_LABELS: Record<number, string> = {
  250: '250 Hz', 500: '500 Hz', 1000: '1 kHz',
  2000: '2 kHz', 4000: '4 kHz', 8000: '8 kHz',
};

const EAR_LABELS: Record<Ear, string> = {
  right: '🔴 우측 귀 (R)',
  left: '🔵 좌측 귀 (L)',
};

export const TestScreen: React.FC<Props> = ({ navigation }) => {
  const engine = useRef(new AudiometricEngine()).current;
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFreq, setCurrentFreq] = useState<TestFrequency>(1000);
  const [currentDb, setCurrentDb] = useState(50);
  const [currentEar, setCurrentEar] = useState<Ear>('right');
  const [phase, setPhase] = useState<string>('idle');
  const [progress, setProgress] = useState(0);
  const [noiseWarning, setNoiseWarning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const noiseCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Progress: each ear has 6 frequencies = 12 total steps
  const totalSteps = TEST_FREQUENCIES.length * 2;
  const [completedSteps, setCompletedSteps] = useState(0);

  const startNoiseMonitoring = useCallback(async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Simple noise check: record briefly every 5 seconds
      noiseCheckRef.current = setInterval(async () => {
        if (isPaused) return;
        try {
          const rec = new Audio.Recording();
          await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.LOW_QUALITY);
          await rec.startAsync();
          await new Promise(r => setTimeout(r, 500));
          await rec.stopAndUnloadAsync();
          const status = await rec.getStatusAsync();
          // Simple metering check
          const metering = (status as any).metering ?? -60;
          if (metering > -25) { // roughly > 35 dB(A)
            setNoiseWarning(true);
            engine.pause();
            setIsPaused(true);
          } else {
            setNoiseWarning(false);
          }
        } catch (_) {}
      }, 5000);
    } catch (_) {}
  }, [isPaused]);

  useEffect(() => {
    engine.setListener((event: EngineEvent) => {
      switch (event.type) {
        case 'state_update':
          setCurrentFreq(event.state.currentFrequency);
          setCurrentDb(event.state.currentDb);
          setCurrentEar(event.state.currentEar);
          setPhase(event.state.phase);
          break;
        case 'tone_start':
          setIsPlaying(true);
          break;
        case 'tone_end':
          setIsPlaying(false);
          break;
        case 'threshold_found':
          setCompletedSteps(prev => prev + 1);
          break;
        case 'ear_complete':
          // Small pause notification
          Vibration.vibrate(200);
          break;
        case 'test_complete':
          navigation.navigate('Result', { result: event.result });
          break;
      }
    });

    // Request audio permissions and start
    (async () => {
      await Audio.requestPermissionsAsync();
      await engine.start();
      await startNoiseMonitoring();
    })();

    return () => {
      engine.dispose();
      if (noiseCheckRef.current) clearInterval(noiseCheckRef.current);
      if (recordingRef.current) recordingRef.current.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  const handleResponse = () => {
    engine.onUserResponse();
    Vibration.vibrate(50);
  };

  const handleResume = () => {
    setNoiseWarning(false);
    setIsPaused(false);
    engine.resume();
  };

  const handleAbort = () => {
    Alert.alert(
      '검사 중단',
      '검사를 중단하시겠습니까? 지금까지의 결과는 저장되지 않습니다.',
      [
        { text: '계속하기', style: 'cancel' },
        {
          text: '중단',
          style: 'destructive',
          onPress: () => {
            engine.stop();
            navigation.goBack();
          },
        },
      ]
    );
  };

  const progressPct = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  const phaseLabel: Record<string, string> = {
    familiarization: '소리 크기 파악 중',
    descending: '역치 탐색 중 (하강)',
    ascending: '역치 탐색 중 (상승)',
    threshold_found: '역치 확인됨',
    idle: '준비 중',
    complete: '완료',
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.earBadge}>
          <Text style={styles.earLabel}>{EAR_LABELS[currentEar]}</Text>
        </View>
        <Text style={styles.freqLabel}>{FREQ_LABELS[currentFreq] ?? `${currentFreq} Hz`}</Text>
        <Text style={styles.dbLabel}>{currentDb} dB HL</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
        </View>
        <Text style={styles.progressText}>
          {completedSteps} / {totalSteps} 주파수 완료
        </Text>
      </View>

      {/* Phase indicator */}
      <Text style={styles.phaseText}>{phaseLabel[phase] ?? phase}</Text>

      {/* Noise warning overlay */}
      {noiseWarning && (
        <View style={styles.noiseWarning}>
          <Text style={styles.noiseIcon}>🔇</Text>
          <Text style={styles.noiseTitle}>주변 소음이 너무 큽니다</Text>
          <Text style={styles.noiseText}>
            더 조용한 장소로 이동하거나{'\n'}소음원을 제거한 후 계속하세요.
          </Text>
          <TouchableOpacity style={styles.resumeButton} onPress={handleResume}>
            <Text style={styles.resumeButtonText}>계속하기</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Spacer replacing tone indicator */}
      <View style={styles.toneIndicator} />

      {/* Main response button - no visual change when tone plays */}
      <TouchableOpacity
        style={styles.responseButton}
        onPress={handleResponse}
        activeOpacity={0.7}
      >
        <Text style={styles.responseButtonText}>
          {'소리가 들리면\n누르세요'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.hint}>
        소리가 아주 작더라도 들리면 버튼을 누르세요
      </Text>

      {/* Abort button */}
      <TouchableOpacity style={styles.abortButton} onPress={handleAbort}>
        <Text style={styles.abortText}>검사 중단</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1b2a',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  header: { alignItems: 'center', marginBottom: 20 },
  earBadge: {
    backgroundColor: '#1a3a5c',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 8,
  },
  earLabel: { fontSize: 15, color: '#90caf9', fontWeight: '600' },
  freqLabel: { fontSize: 32, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 },
  dbLabel: { fontSize: 16, color: '#78909c' },
  progressContainer: { width: '100%', marginBottom: 16 },
  progressBar: { height: 6, backgroundColor: '#1a3a5c', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#42a5f5', borderRadius: 3 },
  progressText: { fontSize: 12, color: '#546e7a', textAlign: 'center', marginTop: 4 },
  phaseText: { fontSize: 13, color: '#78909c', marginBottom: 24 },
  noiseWarning: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 30,
  },
  noiseIcon: { fontSize: 60, marginBottom: 16 },
  noiseTitle: { fontSize: 22, fontWeight: 'bold', color: '#ff7043', marginBottom: 12, textAlign: 'center' },
  noiseText: { fontSize: 15, color: '#b0bec5', textAlign: 'center', lineHeight: 24, marginBottom: 24 },
  resumeButton: {
    backgroundColor: '#1976D2',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  resumeButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  toneIndicator: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  responseButton: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#1a3a5c',
    borderWidth: 4,
    borderColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1976D2',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  responseButtonText: {
    color: '#90caf9',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 28,
  },
  hint: { fontSize: 12, color: '#37474f', textAlign: 'center', marginTop: 20, lineHeight: 18 },
  abortButton: { position: 'absolute', bottom: 30, right: 20, padding: 12 },
  abortText: { color: '#546e7a', fontSize: 14 },
});
