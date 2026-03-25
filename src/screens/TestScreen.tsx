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
  right: '우측 귀 (R)',
  left:  '좌측 귀 (L)',
};

// ── Design tokens ──────────────────────────────────────────────────────────
const C = {
  bg:          '#0a1628',
  bgCard:      '#0f1f3d',
  bgCardMid:   '#132040',
  accentBlue:  '#1e88e5',
  accentCyan:  '#00b8d4',
  earRight:    '#ef5350',
  earLeft:     '#42a5f5',
  earRightBg:  'rgba(239,83,80,0.12)',
  earLeftBg:   'rgba(66,165,245,0.12)',
  earRightBdr: '#c62828',
  earLeftBdr:  '#1565c0',
  textWhite:   '#ffffff',
  textMuted:   '#546e7a',
  textDim:     '#37474f',
  progressFg:  '#1e88e5',
  progressBg:  '#132040',
  errorRed:    '#b71c1c',
  errorBorder: '#e53935',
  btnRing:     '#1e88e5',
  btnBg:       '#0f1f3d',
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
  const [falsePosAlert,   setFalsePosAlert]   = useState(false);
  const [falsePosReason,  setFalsePosReason]  = useState<'isi'|'catch'>('isi');

  const falsePosTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeAnim     = useRef(new Animated.Value(0)).current;

  const totalSteps = TEST_FREQUENCIES.length * 2; // 14

  // ── Shake animation (false positive only) ───────────────────────────
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

  // ── False positive alert ─────────────────────────────────────────────
  const showFalsePositiveAlert = (reason: 'isi' | 'catch') => {
    if (falsePosTimer.current) clearTimeout(falsePosTimer.current);
    setFalsePosReason(reason);
    setFalsePosAlert(true);
    triggerShake();
    if (Platform.OS !== 'web') Vibration.vibrate([0, 80, 60, 80]);
    falsePosTimer.current = setTimeout(() => setFalsePosAlert(false), 1800);
  };

  // ── Spacebar support (web) ───────────────────────────────────────────
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

  // ── Engine event listener ────────────────────────────────────────────
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

  const phaseLabel: Record<string, string> = {
    familiarization: '소리 크기 파악 중',
    ascending:       '역치 탐색 중',
    threshold_found: '역치 확인됨',
    idle:            '귀 전환 준비 중...',
    complete:        '완료',
  };

  const isRight = currentEar === 'right';

  return (
    <View style={styles.container}>

      {/* ── EAR SWITCH OVERLAY ──────────────────────────────────────── */}
      {earSwitchMsg && (
        <View style={styles.earSwitchOverlay}>
          <View style={styles.earSwitchIconWrap}>
            <View style={styles.earSwitchDot} />
          </View>
          <Text style={styles.earSwitchTitle}>좌측 귀 검사로 전환합니다</Text>
          <Text style={styles.earSwitchSub}>이어폰을 그대로 유지하세요</Text>
        </View>
      )}

      {/* ── TOP SECTION ─────────────────────────────────────────────── */}
      <View style={styles.topSection}>

        {/* Ear badge */}
        <View style={[
          styles.earBadge,
          isRight ? styles.earBadgeRight : styles.earBadgeLeft,
        ]}>
          <View style={[
            styles.earDot,
            { backgroundColor: isRight ? C.earRight : C.earLeft },
          ]} />
          <Text style={[
            styles.earLabel,
            { color: isRight ? C.earRight : C.earLeft },
          ]}>
            {EAR_LABELS[currentEar]}
          </Text>
        </View>

        {/* Frequency */}
        <Text style={styles.freqLabel}>
          {FREQ_LABELS[currentFreq] ?? `${currentFreq} Hz`}
        </Text>
        <Text style={styles.dbLabel}>{currentDb} dB HL</Text>
      </View>

      {/* ── SEGMENTED PROGRESS BAR ──────────────────────────────────── */}
      <View style={styles.progressSection}>
        <View style={styles.segBarRow}>
          {Array.from({ length: totalSteps }).map((_, i) => {
            const isRight7 = i < 7;
            const filled   = i < completedSteps;
            return (
              <View
                key={i}
                style={[
                  styles.segBar,
                  i === 6 && styles.segBarGap,
                  filled
                    ? (isRight7 ? styles.segBarFilledRight : styles.segBarFilledLeft)
                    : styles.segBarEmpty,
                ]}
              />
            );
          })}
        </View>
        <View style={styles.segLabels}>
          <Text style={styles.segLabelText}>우측 (R)</Text>
          <Text style={styles.segLabelText}>좌측 (L)</Text>
        </View>
        <Text style={styles.progressCount}>{completedSteps} / {totalSteps} 주파수 완료</Text>
      </View>

      {/* ── PHASE TEXT ──────────────────────────────────────────────── */}
      <Text style={styles.phaseText}>
        {phaseLabel[phase] ?? phase}
      </Text>

      {/* ── FALSE POSITIVE BANNER ───────────────────────────────────── */}
      {falsePosAlert && (
        <View style={styles.falsePosBox}>
          <View style={styles.falsePosIconWrap}>
            <Text style={styles.falsePosIcon}>✕</Text>
          </View>
          <Text style={styles.falsePosText}>
            {falsePosReason === 'catch'
              ? '소리가 없었습니다 — 오반응'
              : '대기 중에 눌렀습니다 — 오반응'}
          </Text>
        </View>
      )}

      {/* ── RESPONSE BUTTON (visually static) ──────────────────────── */}
      <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
        <TouchableOpacity
          onPress={handleResponse}
          activeOpacity={0.88}
          style={styles.responseTouchable}
        >
          {/* Outer decorative ring */}
          <View style={[
            styles.responseRingOuter,
            falsePosAlert && styles.responseRingOuterError,
          ]}>
            {/* Inner ring */}
            <View style={[
              styles.responseRingInner,
              falsePosAlert && styles.responseRingInnerError,
            ]}>
              {/* Button core */}
              <View style={styles.responseCore}>
                <Text style={styles.responseMainText}>소리가 들리면{'\n'}누르세요</Text>
                <Text style={styles.responseSubText}>또는 스페이스바</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* ── HINT TEXT ───────────────────────────────────────────────── */}
      <Text style={styles.hintText}>
        소리가 날 때만 누르세요
      </Text>
      <Text style={styles.hintTextSub}>
        소리 없을 때 누르면 오반응 처리됩니다
      </Text>

      {/* ── ABORT BUTTON ────────────────────────────────────────────── */}
      <TouchableOpacity style={styles.abortButton} onPress={handleAbort}>
        <View style={styles.abortInner}>
          <Text style={styles.abortText}>검사 중단</Text>
        </View>
      </TouchableOpacity>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 20,
  },

  // ── EAR SWITCH OVERLAY ────────────────────────────────────────────────
  earSwitchOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(2,8,20,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    padding: 32,
  },
  earSwitchIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: C.earLeft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    backgroundColor: C.earLeftBg,
  },
  earSwitchDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.earLeft,
  },
  earSwitchTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#90caf9',
    textAlign: 'center',
    marginBottom: 10,
  },
  earSwitchSub: {
    fontSize: 14,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },

  // ── TOP SECTION ───────────────────────────────────────────────────────
  topSection: {
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  earBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginBottom: 12,
    borderWidth: 1.5,
  },
  earBadgeRight: {
    backgroundColor: C.earRightBg,
    borderColor: C.earRightBdr,
  },
  earBadgeLeft: {
    backgroundColor: C.earLeftBg,
    borderColor: C.earLeftBdr,
  },
  earDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  earLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  freqLabel: {
    fontSize: 42,
    fontWeight: '900',
    color: C.textWhite,
    letterSpacing: -1,
    marginBottom: 4,
  },
  dbLabel: {
    fontSize: 16,
    color: C.textMuted,
    fontWeight: '500',
  },

  // ── SEGMENTED PROGRESS ────────────────────────────────────────────────
  progressSection: {
    width: '100%',
    marginBottom: 10,
    alignItems: 'center',
  },
  segBarRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 6,
    alignItems: 'center',
  },
  segBar: {
    width: 17,
    height: 8,
    borderRadius: 4,
  },
  segBarGap: {
    marginRight: 8,
  },
  segBarEmpty: {
    backgroundColor: C.progressBg,
  },
  segBarFilledRight: {
    backgroundColor: '#ef5350',
  },
  segBarFilledLeft: {
    backgroundColor: C.accentBlue,
  },
  segLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '72%',
    marginBottom: 4,
  },
  segLabelText: {
    fontSize: 10,
    color: C.textDim,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  progressCount: {
    fontSize: 12,
    color: C.textMuted,
    fontWeight: '500',
  },

  // ── PHASE TEXT ────────────────────────────────────────────────────────
  phaseText: {
    fontSize: 13,
    color: C.textMuted,
    marginBottom: 10,
    letterSpacing: 0.3,
    fontStyle: 'italic',
  },

  // ── FALSE POSITIVE BANNER ─────────────────────────────────────────────
  falsePosBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.errorRed,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.errorBorder,
  },
  falsePosIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  falsePosIcon: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  falsePosText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── RESPONSE BUTTON ───────────────────────────────────────────────────
  // The button is visually completely static — no state tied to isPlaying.
  // Only the falsePosAlert state causes any visual change (ring tint to red).
  responseTouchable: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  responseRingOuter: {
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 2,
    borderColor: 'rgba(30,136,229,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,136,229,0.04)',
  },
  responseRingOuterError: {
    borderColor: 'rgba(229,57,53,0.40)',
    backgroundColor: 'rgba(229,57,53,0.05)',
  },
  responseRingInner: {
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 3,
    borderColor: C.btnRing,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,136,229,0.06)',
    shadowColor: C.btnRing,
    shadowOpacity: 0.20,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  responseRingInnerError: {
    borderColor: C.errorBorder,
    shadowColor: C.errorBorder,
  },
  responseCore: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: C.btnBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  responseMainText: {
    color: '#90caf9',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 10,
  },
  responseSubText: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '400',
    textAlign: 'center',
  },

  // ── HINT TEXT ─────────────────────────────────────────────────────────
  hintText: {
    fontSize: 12,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: 20,
    fontWeight: '500',
  },
  hintTextSub: {
    fontSize: 11,
    color: C.textDim,
    textAlign: 'center',
    marginTop: 4,
  },

  // ── ABORT BUTTON ──────────────────────────────────────────────────────
  abortButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
  },
  abortInner: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.textDim,
  },
  abortText: {
    color: C.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
});
