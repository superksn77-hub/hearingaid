import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert
} from 'react-native';
import { ToneGenerator } from '../engine/ToneGenerator';
import { dbHLToAmplitude } from '../engine/CalibrationManager';
import { TestFrequency, FREQUENCY_ORDER } from '../types';

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
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState<'intro' | 'calib' | 'done'>('intro');

  const handleSkip = () => {
    navigation.navigate('Test', { user });
  };

  const handlePlay = async () => {
    setPlaying(true);
    const amp = 0.3;
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

      {/* ── STEP 02 ────────────────────────────────────────────────── */}
      <View style={styles.stepCard}>
        <View style={styles.stepRow}>
          <View style={styles.stepNumWrap}>
            <Text style={styles.stepNumBig}>02</Text>
          </View>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>볼륨 확인</Text>
            <Text style={styles.stepText}>
              아래 버튼을 눌러 테스트 음을 재생하고{'\n'}
              소리가 편안하게 들릴 때까지{'\n'}
              기기 볼륨을 70~80% 수준으로 조절하세요.
            </Text>
          </View>
        </View>
        <View style={styles.stepAccentLine} />

        {/* Play button */}
        <View style={styles.playSection}>
          {/* Volume bar indicator (static decorative) */}
          <View style={styles.volBarsRow}>
            {[1, 2, 3, 4, 5].map(i => (
              <View
                key={i}
                style={[
                  styles.volBar,
                  { height: 10 + i * 8 },
                  playing
                    ? { backgroundColor: i <= 3 ? C.accentCyan : C.accentBlue }
                    : { backgroundColor: i <= 2 ? C.border : C.border },
                ]}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.playButton, playing && styles.playButtonActive]}
            onPress={handlePlay}
            disabled={playing}
            activeOpacity={0.8}
          >
            <View style={styles.playButtonRing}>
              <View style={styles.playButtonInner}>
                <Text style={styles.playIcon}>▶</Text>
              </View>
            </View>
            <Text style={styles.playLabel}>
              {playing ? '재생 중... (1 kHz)' : '테스트 음 재생  1 kHz'}
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
