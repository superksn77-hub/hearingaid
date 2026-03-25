import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Vibration, Platform, Animated
} from 'react-native';
import { AudiometricEngine, EngineEvent } from '../engine/AudiometricEngine';
import { Ear, TestFrequency, TEST_FREQUENCIES } from '../types';

interface Props {
  navigation: any;
  route: { params?: { user?: import('../types').UserProfile } };
}

const FREQ_LABELS: Record<number, string> = {
  125: '125 Hz', 250: '250 Hz', 500: '500 Hz', 1000: '1 kHz',
  2000: '2 kHz', 4000: '4 kHz', 8000: '8 kHz',
};

const EAR_LABELS: Record<Ear, string> = {
  right: '🔴 우측 귀 (R)',
  left:  '🔵 좌측 귀 (L)',
};

export const TestScreen: React.FC<Props> = ({ navigation, route }) => {
  const user      = route?.params?.user;
  const engineRef = useRef(new AudiometricEngine());
  const engine    = engineRef.current;

  const [currentFreq,     setCurrentFreq]     = useState<TestFrequency>(125);
  const [currentDb,       setCurrentDb]       = useState(0);
  const [currentEar,      setCurrentEar]      = useState<Ear>('right');
  const [phase,           setPhase]           = useState<string>('idle');
  const [completedSteps,  setCompletedSteps]  = useState(0);
  const [earSwitchMsg,    setEarSwitchMsg]    = useState(false);
  // 오반응 경고 표시 (잠깐 보였다 사라짐)
  const [falsePosAlert,   setFalsePosAlert]   = useState(false);
  const [falsePosReason,  setFalsePosReason]  = useState<'isi'|'catch'>('isi');

  const falsePosTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 버튼 흔들기 애니메이션
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const totalSteps = TEST_FREQUENCIES.length * 2; // 14

  // ── 버튼 흔들기 애니메이션 ──────────────────────────────
  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue:  8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:  6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:  0, duration: 40, useNativeDriver: true }),
    ]).start();
  };

  // ── 오반응 경고 표시 ────────────────────────────────────
  const showFalsePositiveAlert = (reason: 'isi' | 'catch') => {
    if (falsePosTimer.current) clearTimeout(falsePosTimer.current);
    setFalsePosReason(reason);
    setFalsePosAlert(true);
    triggerShake();
    if (Platform.OS !== 'web') Vibration.vibrate([0, 80, 60, 80]);
    falsePosTimer.current = setTimeout(() => setFalsePosAlert(false), 1800);
  };

  // ── 스페이스바 지원 (웹) ────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        engine.onUserResponse();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }
  }, []);

  // ── 엔진 이벤트 구독 ────────────────────────────────────
  useEffect(() => {
    engine.setListener((event: EngineEvent) => {
      switch (event.type) {
        case 'state_update': {
          const s = event.state;
          setCurrentFreq(s.currentFrequency);
          setCurrentDb(s.currentDb);
          setCurrentEar(s.currentEar);
          setPhase(s.phase);
          break;
        }
        case 'false_positive':
          showFalsePositiveAlert(event.reason);
          break;
        case 'threshold_found':
          setCompletedSteps(prev => prev + 1);
          break;
        case 'ear_complete':
          if (event.ear === 'right') {
            setEarSwitchMsg(true);
            setTimeout(() => setEarSwitchMsg(false), 1800);
          }
          break;
        case 'test_complete':
          navigation.navigate('Result', { result: { ...event.result, user } });
          break;
      }
    });

    engine.start();

    return () => {
      engine.dispose();
      if (falsePosTimer.current) clearTimeout(falsePosTimer.current);
    };
  }, []);

  const handleResponse = () => {
    engine.onUserResponse();
  };

  const handleAbort = () => {
    Alert.alert(
      '검사 중단',
      '검사를 중단하시겠습니까?',
      [
        { text: '계속하기', style: 'cancel' },
        {
          text: '중단',
          style: 'destructive',
          onPress: () => { engine.stop(); navigation.goBack(); },
        },
      ]
    );
  };

  const progressPct = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  const phaseLabel: Record<string, string> = {
    familiarization: '소리 크기 파악 중',
    ascending:       '역치 탐색 중',
    threshold_found: '✓ 역치 확인됨',
    idle:            '귀 전환 준비 중...',
    complete:        '완료',
  };

  return (
    <View style={styles.container}>

      {/* 귀 전환 오버레이 */}
      {earSwitchMsg && (
        <View style={styles.earSwitchOverlay}>
          <Text style={styles.earSwitchIcon}>🔵</Text>
          <Text style={styles.earSwitchTitle}>좌측 귀 검사로 전환합니다</Text>
          <Text style={styles.earSwitchSub}>이어폰을 그대로 유지하세요</Text>
        </View>
      )}

      {/* 헤더 */}
      <View style={styles.header}>
        <View style={[styles.earBadge, currentEar === 'left' && styles.earBadgeLeft]}>
          <Text style={styles.earLabel}>{EAR_LABELS[currentEar]}</Text>
        </View>
        <Text style={styles.freqLabel}>{FREQ_LABELS[currentFreq] ?? `${currentFreq} Hz`}</Text>
        <Text style={styles.dbLabel}>{currentDb} dB HL</Text>
      </View>

      {/* 진행 바 */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
        </View>
        <Text style={styles.progressText}>{completedSteps} / {totalSteps} 주파수 완료</Text>
      </View>

      {/* 단계 안내 */}
      <Text style={styles.phaseText}>{phaseLabel[phase] ?? phase}</Text>

      {/* 오반응 경고 배너 */}
      {falsePosAlert && (
        <View style={styles.falsePosBox}>
          <Text style={styles.falsePosText}>
            {falsePosReason === 'catch'
              ? '❌ 소리가 없었습니다 — 오반응'
              : '❌ 대기 중에 눌렀습니다 — 오반응'}
          </Text>
        </View>
      )}

      {/* 반응 버튼 (오반응 시 흔들림) */}
      <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
        <TouchableOpacity
          style={[styles.responseButton, falsePosAlert && styles.responseButtonError]}
          onPress={handleResponse}
          activeOpacity={0.75}
        >
          <Text style={styles.responseButtonText}>소리가 들리면{'\n'}누르세요</Text>
          <Text style={styles.responseButtonSub}>또는 스페이스바</Text>
        </TouchableOpacity>
      </Animated.View>

      <Text style={styles.hint}>소리가 날 때만 누르세요{'\n'}소리 없을 때 누르면 오반응 처리됩니다</Text>

      {/* 중단 버튼 */}
      <TouchableOpacity style={styles.abortButton} onPress={handleAbort}>
        <Text style={styles.abortText}>검사 중단</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#0d1b2a',
    alignItems: 'center', paddingTop: 60, paddingHorizontal: 20,
  },

  // 귀 전환 오버레이
  earSwitchOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center',
    justifyContent: 'center', zIndex: 200, padding: 30,
  },
  earSwitchIcon:  { fontSize: 64, marginBottom: 16 },
  earSwitchTitle: { fontSize: 22, fontWeight: 'bold', color: '#90caf9', textAlign: 'center', marginBottom: 12 },
  earSwitchSub:   { fontSize: 14, color: '#78909c', textAlign: 'center', lineHeight: 22 },

  // 헤더
  header: { alignItems: 'center', marginBottom: 20 },
  earBadge: {
    backgroundColor: '#3a1a1a', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 6, marginBottom: 8,
    borderWidth: 1, borderColor: '#c62828',
  },
  earBadgeLeft:   { backgroundColor: '#1a1a3a', borderColor: '#1565C0' },
  earLabel:       { fontSize: 15, color: '#ef9a9a', fontWeight: '600' },
  freqLabel:      { fontSize: 34, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 },
  dbLabel:        { fontSize: 16, color: '#78909c' },

  // 진행 바
  progressContainer: { width: '100%', marginBottom: 10 },
  progressBar:       { height: 6, backgroundColor: '#1a3a5c', borderRadius: 3, overflow: 'hidden' },
  progressFill:      { height: '100%', backgroundColor: '#42a5f5', borderRadius: 3 },
  progressText:      { fontSize: 12, color: '#546e7a', textAlign: 'center', marginTop: 4 },

  phaseText: { fontSize: 13, color: '#78909c', marginBottom: 8 },

  // 오반응 경고
  falsePosBox: {
    backgroundColor: '#b71c1c', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 8, marginBottom: 12,
  },
  falsePosText: { color: '#ffffff', fontSize: 13, fontWeight: 'bold', textAlign: 'center' },

  // 반응 버튼
  responseButton: {
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: '#1a3a5c', borderWidth: 4, borderColor: '#1976D2',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#1976D2', shadowOpacity: 0.3, shadowRadius: 20, elevation: 8,
  },
  responseButtonError: {
    borderColor: '#e53935', backgroundColor: '#2a1a1a', shadowColor: '#e53935',
  },
  responseButtonText: {
    color: '#90caf9', fontSize: 20, fontWeight: 'bold', textAlign: 'center', lineHeight: 28,
  },
  responseButtonSub: { color: '#546e7a', fontSize: 12, marginTop: 8 },

  hint: { fontSize: 12, color: '#37474f', textAlign: 'center', marginTop: 20, lineHeight: 20 },
  abortButton: { position: 'absolute', bottom: 30, right: 20, padding: 12 },
  abortText:   { color: '#546e7a', fontSize: 14 },
});
