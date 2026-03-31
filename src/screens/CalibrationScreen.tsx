import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { ToneGenerator } from '../engine/ToneGenerator';
import { dbHLToAmplitude } from '../engine/CalibrationManager';
import { TestFrequency, FREQUENCY_ORDER } from '../types';
import { VolumeCalibrator, CalibrationResult } from '../engine/VolumeCalibrator';

interface Props {
  navigation: any;
  route: { params?: { user?: import('../types').UserProfile } };
}

const CALIB_FREQUENCIES: TestFrequency[] = [1000, 2000, 4000, 500, 250];

// ── Design tokens ──────────────────────────────────────────────────────────
const C = {
  navyDeep:   '#0d1b4b',
  navyMid:    '#1565c0',
  accentBlue: '#1e88e5',
  accentCyan: '#00b8d4',
  success:    '#00c853',
  bgLight:    '#f0f4fc',
  cardWhite:  '#ffffff',
  textPri:    '#0d1b4b',
  textSec:    '#607d8b',
  border:     '#cfd8dc',
};

export const CalibrationScreen: React.FC<Props> = ({ navigation, route }) => {
  const user = route?.params?.user;
  const toneGen = useRef(new ToneGenerator()).current;
  const calibrator = useRef(new VolumeCalibrator()).current;
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState<'intro' | 'calib' | 'done'>('intro');

  // 자동 캘리브레이션 상태
  const [calibStatus, setCalibStatus] = useState<'idle' | 'running' | 'success' | 'fallback'>('idle');
  const [calibResult, setCalibResult] = useState<CalibrationResult | null>(null);
  const [calibMessage, setCalibMessage] = useState('');

  // 저장된 캘리브레이션 확인
  useEffect(() => {
    const saved = calibrator.loadCalibration();
    if (saved) {
      setCalibResult(saved);
      setCalibStatus('success');
      setCalibMessage(`이전 캘리브레이션 적용 (${saved.method === 'microphone' ? '마이크' : saved.method === 'biological' ? '역치' : '수동'}, 보정계수: ${saved.systemGainFactor.toFixed(2)})`);
    }
  }, []);

  // 자동 캘리브레이션 실행
  const runAutoCalibration = async () => {
    setCalibStatus('running');
    setCalibMessage('마이크 기반 자동 캘리브레이션 시도 중...');

    // 1단계: 마이크 기반 시도
    const micResult = await calibrator.calibrateWithMicrophone();
    if (micResult) {
      setCalibResult(micResult);
      setCalibStatus('success');
      setCalibMessage(`자동 캘리브레이션 완료 (보정계수: ${micResult.systemGainFactor.toFixed(2)}, 신뢰도: ${(micResult.confidence * 100).toFixed(0)}%)`);
      return;
    }

    // 2단계: 마이크 실패 → 생물학적 역치 방식
    setCalibMessage('마이크 감지 불가 — 역치 기반 캘리브레이션 시작...');

    let currentAmp = 0.001;
    const maxSteps = 15;
    let foundThreshold = false;

    for (let i = 0; i < maxSteps && !foundThreshold; i++) {
      setCalibMessage(`역치 탐색 중... (${i + 1}/${maxSteps}) — 소리가 들리면 화면을 터치하세요`);

      // 톤 재생
      await toneGen.playTone(1000, 1500, currentAmp, 'both');

      // 2초 대기 (사용자 반응 대기) — 간단한 타이머
      const heard = await new Promise<boolean>(resolve => {
        const timer = setTimeout(() => resolve(false), 2000);
        const handler = () => {
          clearTimeout(timer);
          document.removeEventListener('click', handler);
          document.removeEventListener('keydown', handler);
          resolve(true);
        };
        document.addEventListener('click', handler, { once: true });
        document.addEventListener('keydown', handler, { once: true });
      });

      if (heard) {
        // 들렸으면 보정 계수 산출
        const expectedThreshold = 0.001;
        const factor = Math.max(0.1, Math.min(10, expectedThreshold / currentAmp));
        const result: CalibrationResult = {
          method: 'biological',
          systemGainFactor: factor,
          thresholdGain: currentAmp,
          confidence: 0.85,
          timestamp: Date.now(),
        };
        try { localStorage.setItem('hicog_volume_calibration', JSON.stringify(result)); } catch {}
        setCalibResult(result);
        setCalibStatus('success');
        setCalibMessage(`역치 캘리브레이션 완료 (보정계수: ${factor.toFixed(2)})`);
        foundThreshold = true;
      } else {
        currentAmp *= 1.5;
      }
    }

    if (!foundThreshold) {
      // 역치를 찾지 못함 — 수동 fallback
      const manual = calibrator.getManualCalibration();
      setCalibResult(manual);
      setCalibStatus('fallback');
      setCalibMessage('자동 캘리브레이션 실패 — 볼륨을 70~80%로 설정해 주세요');
    }
  };

  const handleSkip = () => {
    // 캘리브레이션 결과를 Test 화면으로 전달
    navigation.navigate('Test', { user, calibration: calibResult });
  };

  const handlePlay = async () => {
    setPlaying(true);
    const amp = calibResult
      ? VolumeCalibrator.applyCalibration(0.3, calibResult)
      : 0.3;
    await toneGen.playTone(1000, 2000, amp);
    setTimeout(() => setPlaying(false), 2500);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.headerLabel}>CALIBRATION</Text>
        <Text style={styles.headerTitle}>볼륨 보정</Text>
        <Text style={styles.headerSub}>검사 전 기기 볼륨을 적절히 설정하세요</Text>
      </View>

      {/* ── STEP 01 ────────────────────────────────────────────────── */}
      <View style={styles.stepCard}>
        <View style={styles.stepRow}>
          <View style={styles.stepNumWrap}>
            <Text style={styles.stepNumBig}>01</Text>
          </View>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>이어폰 / 헤드폰 착용</Text>
            <Text style={styles.stepText}>
              양쪽 귀에 이어폰을 올바르게 착용하고{'\n'}
              L (좌측), R (우측) 방향을 확인하세요.
            </Text>
          </View>
        </View>
        <View style={styles.stepAccentLine} />
      </View>

      {/* ── STEP 02: 자동 캘리브레이션 ────────────────────────────── */}
      <View style={styles.stepCard}>
        <View style={styles.stepRow}>
          <View style={styles.stepNumWrap}>
            <Text style={styles.stepNumBig}>02</Text>
          </View>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>자동 볼륨 보정</Text>
            <Text style={styles.stepText}>
              자동 캘리브레이션을 실행하면{'\n'}
              시스템 볼륨에 관계없이 정확한 dB로{'\n'}
              검사를 진행할 수 있습니다.
            </Text>
          </View>
        </View>
        <View style={styles.stepAccentLine} />

        <View style={styles.playSection}>
          {/* 캘리브레이션 상태 표시 */}
          {calibStatus === 'success' && (
            <View style={{ backgroundColor: '#e8f5e9', borderRadius: 10, padding: 12, marginBottom: 16, width: '100%' }}>
              <Text style={{ color: '#2e7d32', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
                ✅ {calibMessage}
              </Text>
            </View>
          )}
          {calibStatus === 'fallback' && (
            <View style={{ backgroundColor: '#fff3e0', borderRadius: 10, padding: 12, marginBottom: 16, width: '100%' }}>
              <Text style={{ color: '#e65100', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
                ⚠ {calibMessage}
              </Text>
            </View>
          )}
          {calibStatus === 'running' && (
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <ActivityIndicator color={C.accentBlue} style={{ marginBottom: 8 }} />
              <Text style={{ color: C.textSec, fontSize: 13, textAlign: 'center' }}>{calibMessage}</Text>
            </View>
          )}

          {/* 자동 캘리브레이션 버튼 */}
          <TouchableOpacity
            style={[styles.playButton, calibStatus === 'running' && styles.playButtonActive]}
            onPress={runAutoCalibration}
            disabled={calibStatus === 'running'}
            activeOpacity={0.8}
          >
            <View style={[styles.playButtonRing, calibStatus === 'success' && { borderColor: '#2e7d32' }]}>
              <View style={[styles.playButtonInner, calibStatus === 'success' && { backgroundColor: '#2e7d32' }]}>
                <Text style={styles.playIcon}>{calibStatus === 'success' ? '✓' : '⚙'}</Text>
              </View>
            </View>
            <Text style={styles.playLabel}>
              {calibStatus === 'running' ? '캘리브레이션 진행 중...'
                : calibStatus === 'success' ? '재캘리브레이션'
                : '자동 캘리브레이션 시작'}
            </Text>
          </TouchableOpacity>

          {/* 수동 테스트 톤 재생 */}
          <TouchableOpacity
            style={{ marginTop: 20, opacity: playing ? 0.5 : 1 }}
            onPress={handlePlay}
            disabled={playing}
          >
            <Text style={{ color: C.accentBlue, fontSize: 13, textDecorationLine: 'underline' }}>
              {playing ? '재생 중... (1 kHz)' : '▶ 테스트 음 재생 (1 kHz)'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── STEP 03 ────────────────────────────────────────────────── */}
      <View style={styles.stepCard}>
        <View style={styles.stepRow}>
          <View style={styles.stepNumWrap}>
            <Text style={styles.stepNumBig}>03</Text>
          </View>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>조용한 환경 확인</Text>
            <Text style={styles.stepText}>
              주변이 조용한지 확인하세요.{'\n'}
              TV, 음악, 선풍기 등 소음원을 제거하고{'\n'}
              가능하면 조용한 방에서 검사하세요.
            </Text>
          </View>
        </View>
        <View style={styles.stepAccentLine} />
      </View>

      {/* ── INFO BOX ────────────────────────────────────────────────── */}
      <View style={styles.infoBox}>
        <View style={styles.infoIcon}>
          <Text style={styles.infoIconText}>i</Text>
        </View>
        <Text style={styles.infoText}>
          검사 중 주변 소음이 35 dB을 초과하면{'\n'}
          자동으로 검사가 일시 중지됩니다.
        </Text>
      </View>

      {/* ── START BUTTON ────────────────────────────────────────────── */}
      <TouchableOpacity style={styles.nextButton} onPress={handleSkip} activeOpacity={0.82}>
        <Text style={styles.nextButtonText}>검사 시작하기</Text>
        <View style={styles.nextArrowBadge}>
          <Text style={styles.nextArrowText}>→</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bgLight },
  content:   { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 0 },

  // ── HEADER ──────────────────────────────────────────────────────────
  header: {
    backgroundColor: C.navyDeep,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingTop: 52,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginHorizontal: -20,
    marginBottom: 28,
    borderTopWidth: 4,
    borderTopColor: C.accentCyan,
  },
  headerLabel: {
    fontSize: 11,
    color: C.accentCyan,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 6,
  },
  headerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.60)',
    letterSpacing: 0.3,
  },

  // ── STEP CARD ───────────────────────────────────────────────────────
  stepCard: {
    backgroundColor: C.cardWhite,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    overflow: 'hidden',
  },
  stepAccentLine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: C.accentBlue,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    paddingLeft: 12,
  },
  stepNumWrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  stepNumBig: {
    fontSize: 36,
    fontWeight: '900',
    color: '#e3f2fd',
    lineHeight: 40,
    letterSpacing: -1,
  },
  stepContent: { flex: 1 },
  stepTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.textPri,
    marginBottom: 8,
  },
  stepText: {
    fontSize: 14,
    color: '#37474f',
    lineHeight: 22,
  },

  // ── PLAY SECTION ────────────────────────────────────────────────────
  playSection: {
    alignItems: 'center',
    marginTop: 24,
    paddingLeft: 12,
  },

  // Static volume bars
  volBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    marginBottom: 20,
    height: 50,
  },
  volBar: {
    width: 14,
    borderRadius: 3,
    backgroundColor: C.border,
  },

  // Circular play button
  playButton: {
    alignItems: 'center',
    gap: 14,
  },
  playButtonActive: { opacity: 0.7 },
  playButtonRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: C.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3f2fd',
    shadowColor: C.accentBlue,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  playButtonInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.navyDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    fontSize: 28,
    color: '#ffffff',
    marginLeft: 4, // optical centering of triangle
  },
  playLabel: {
    fontSize: 14,
    color: C.accentBlue,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // ── INFO BOX ────────────────────────────────────────────────────────
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#e8f5e9',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#a5d6a7',
    gap: 12,
  },
  infoIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2e7d32',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  infoIconText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    fontStyle: 'italic',
  },
  infoText: {
    fontSize: 13,
    color: '#2e7d32',
    lineHeight: 21,
    flex: 1,
  },

  // ── NEXT BUTTON ─────────────────────────────────────────────────────
  nextButton: {
    backgroundColor: C.accentBlue,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderTopWidth: 3,
    borderTopColor: C.accentCyan,
    shadowColor: C.accentBlue,
    shadowOpacity: 0.40,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  nextButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  nextArrowBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextArrowText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },

  bottomSpacer: { height: 20 },
});
