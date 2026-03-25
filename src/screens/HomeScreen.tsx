import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Switch, Alert, TextInput,
} from 'react-native';
import { UserProfile } from '../types';

interface Props {
  navigation: any;
}

const GENDER_OPTIONS: { value: UserProfile['gender']; label: string }[] = [
  { value: 'male',   label: '남성' },
  { value: 'female', label: '여성' },
  { value: 'other',  label: '기타' },
];

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
  inputBg:    '#f8faff',
  errorRed:   '#d32f2f',
};

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const [agreed, setAgreed] = useState(false);
  const [name,   setName]   = useState('');
  const [age,    setAge]    = useState('');
  const [gender, setGender] = useState<UserProfile['gender']>('');

  const userProfile: UserProfile = { name, age, gender };

  const handleStart = () => {
    if (!name.trim()) {
      Alert.alert('입력 필요', '이름을 입력해 주세요.');
      return;
    }
    if (!age.trim() || isNaN(Number(age)) || Number(age) <= 0) {
      Alert.alert('입력 필요', '올바른 나이를 입력해 주세요.');
      return;
    }
    if (!gender) {
      Alert.alert('입력 필요', '성별을 선택해 주세요.');
      return;
    }
    if (!agreed) {
      Alert.alert('동의 필요', '면책 조항에 동의해야 검사를 시작할 수 있습니다.');
      return;
    }
    navigation.navigate('Calibration', { user: userProfile });
  };

  const handleDemoResult = () => {
    navigation.navigate('Result', {
      result: {
        right: { 125: 15, 250: 20, 500: 35, 1000: 40, 2000: 40, 4000: 55, 8000: 60 },
        left:  { 125: 15, 250: 20, 500: 40, 1000: 45, 2000: 40, 4000: 55, 8000: 60 },
        date: new Date().toISOString(),
        user: { name: '홍길동', age: '45', gender: 'male' },
      },
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── HERO HEADER ─────────────────────────────────────────── */}
      <View style={styles.heroCard}>
        {/* Decorative soundwave icon built from Views */}
        <View style={styles.iconContainer}>
          {/* Outer arc ring */}
          <View style={styles.arcOuter} />
          {/* Inner arc ring */}
          <View style={styles.arcInner} />
          {/* Ear silhouette core */}
          <View style={styles.earCore} />
          {/* Center dot */}
          <View style={styles.earDot} />
        </View>

        <Text style={styles.heroTitle}>HICOG 청력검사</Text>
        <Text style={styles.heroSubtitle}>Pure-Tone Audiometry System</Text>

        <View style={styles.versionBadge}>
          <Text style={styles.versionText}>v1.0  |  ISO 8253-1 기준</Text>
        </View>
      </View>

      {/* ── PATIENT INFO CARD ────────────────────────────────────── */}
      <View style={styles.sectionCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardAccentBar} />
          <Text style={styles.cardTitle}>검사자 정보</Text>
        </View>

        <Text style={styles.fieldLabel}>이름 (Name)</Text>
        <TextInput
          style={styles.input}
          placeholder="이름을 입력하세요"
          placeholderTextColor={C.textSec}
          value={name}
          onChangeText={setName}
          returnKeyType="next"
        />

        <Text style={styles.fieldLabel}>나이 (Age)</Text>
        <TextInput
          style={styles.input}
          placeholder="나이 (예: 35)"
          placeholderTextColor={C.textSec}
          keyboardType="number-pad"
          value={age}
          onChangeText={setAge}
          returnKeyType="done"
          maxLength={3}
        />

        <Text style={styles.fieldLabel}>성별 (Sex)</Text>
        <View style={styles.genderRow}>
          {GENDER_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.genderBtn, gender === opt.value && styles.genderBtnActive]}
              onPress={() => setGender(opt.value)}
            >
              <Text style={[styles.genderBtnText, gender === opt.value && styles.genderBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── PREPARATION STEPS ───────────────────────────────────── */}
      <View style={styles.sectionCard}>
        <View style={styles.cardHeaderRow}>
          <View style={[styles.cardAccentBar, { backgroundColor: C.accentCyan }]} />
          <Text style={styles.cardTitle}>검사 준비사항</Text>
        </View>

        {[
          { num: '①', text: '헤드폰 또는 이어폰을 착용해 주세요' },
          { num: '②', text: '조용한 환경에서 검사하세요 (주변 소음 35 dB 이하)' },
          { num: '③', text: '기기 볼륨을 70~80% 수준으로 설정하세요' },
          { num: '④', text: '검사 소요 시간: 약 5~10분' },
        ].map(item => (
          <View key={item.num} style={styles.prepItem}>
            <View style={styles.prepNumBadge}>
              <Text style={styles.prepNum}>{item.num}</Text>
            </View>
            <Text style={styles.prepText}>{item.text}</Text>
          </View>
        ))}
      </View>

      {/* ── HOW TO TEST ─────────────────────────────────────────── */}
      <View style={styles.sectionCard}>
        <View style={styles.cardHeaderRow}>
          <View style={[styles.cardAccentBar, { backgroundColor: C.success }]} />
          <Text style={styles.cardTitle}>검사 방법</Text>
        </View>
        <Text style={styles.bodyText}>
          소리가 들리면 즉시 화면 중앙의{' '}
          <Text style={styles.bold}>반응 버튼</Text>을 누르세요.{'\n\n'}
          소리의 크기나 방향에 관계없이{'\n'}
          아주 작은 소리라도 들리면 버튼을 누르세요.{'\n\n'}
          125 Hz ~ 8000 Hz 주파수 대역을{'\n'}
          우측 귀 → 좌측 귀 순으로 검사합니다.
        </Text>
      </View>

      {/* ── DISCLAIMER ──────────────────────────────────────────── */}
      <View style={styles.disclaimerCard}>
        <View style={styles.disclaimerHeader}>
          <View style={styles.disclaimerIcon}>
            <Text style={styles.disclaimerIconText}>!</Text>
          </View>
          <Text style={styles.disclaimerTitle}>면책 조항 (Medical Disclaimer)</Text>
        </View>

        <View style={styles.disclaimerDivider} />

        <Text style={styles.disclaimerText}>
          본 검사는 임상적 스크리닝 목적이며, 이비인후과 전문의나 청각 전문가가 방음 부스에서 수행하는
          공식 진단 검사를 완전히 대체할 수 없습니다. 난청 징후나 귀의 통증이 느껴질 경우 즉시
          전문 의료 기관을 방문하시기 바랍니다.
        </Text>

        <View style={styles.agreeRow}>
          <Switch
            value={agreed}
            onValueChange={setAgreed}
            trackColor={{ false: C.border, true: C.accentBlue }}
            thumbColor={agreed ? '#ffffff' : '#f0f0f0'}
          />
          <Text style={styles.agreeText}>위 내용을 이해하고 동의합니다</Text>
        </View>
      </View>

      {/* ── START BUTTON ────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.startButton, !agreed && styles.startButtonDisabled]}
        onPress={handleStart}
        activeOpacity={0.82}
      >
        <View style={styles.startButtonInner}>
          <Text style={styles.startButtonText}>검사 시작</Text>
          <Text style={styles.startButtonArrow}> →</Text>
        </View>
      </TouchableOpacity>

      {/* ── DEMO BUTTON ─────────────────────────────────────────── */}
      <TouchableOpacity style={styles.demoButton} onPress={handleDemoResult}>
        <Text style={styles.demoButtonText}>결과 화면 미리보기 (데모)</Text>
      </TouchableOpacity>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bgLight },
  content:   { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 0 },

  // ── HERO ──────────────────────────────────────────────────────────────
  heroCard: {
    backgroundColor: C.navyDeep,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingTop: 56,
    paddingBottom: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginHorizontal: -20,
    marginBottom: 28,
    // Top accent line
    borderTopWidth: 4,
    borderTopColor: C.accentCyan,
  },

  // Decorative ear/soundwave icon
  iconContainer: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  arcOuter: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: C.accentCyan,
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    transform: [{ rotate: '-45deg' }],
    opacity: 0.6,
  },
  arcInner: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: C.accentBlue,
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    transform: [{ rotate: '-45deg' }],
    opacity: 0.8,
  },
  earCore: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'transparent',
    borderWidth: 3,
    borderColor: '#ffffff',
    opacity: 0.9,
  },
  earDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.accentCyan,
  },

  heroTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1,
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  versionBadge: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  versionText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.5,
    fontWeight: '600',
  },

  // ── SECTION CARD ──────────────────────────────────────────────────────
  sectionCard: {
    backgroundColor: C.cardWhite,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardAccentBar: {
    width: 4,
    height: 20,
    backgroundColor: C.accentBlue,
    borderRadius: 2,
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.textPri,
  },

  // ── FORM FIELDS ───────────────────────────────────────────────────────
  fieldLabel: {
    fontSize: 11,
    color: C.textSec,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: C.textPri,
    backgroundColor: C.inputBg,
  },
  genderRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  genderBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    backgroundColor: C.inputBg,
  },
  genderBtnActive:     { borderColor: C.accentBlue, backgroundColor: '#e3f2fd' },
  genderBtnText:       { fontSize: 14, color: C.textSec, fontWeight: '600' },
  genderBtnTextActive: { color: C.accentBlue },

  // ── PREP ITEMS ────────────────────────────────────────────────────────
  prepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 12,
  },
  prepNumBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e3f2fd',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  prepNum:  { fontSize: 14, color: C.accentBlue, fontWeight: '700' },
  prepText: { fontSize: 14, color: '#37474f', lineHeight: 22, flex: 1 },

  // ── BODY TEXT ─────────────────────────────────────────────────────────
  bodyText: { fontSize: 14, color: '#37474f', lineHeight: 24 },
  bold:     { fontWeight: '700', color: C.navyDeep },

  // ── DISCLAIMER ────────────────────────────────────────────────────────
  disclaimerCard: {
    backgroundColor: C.cardWhite,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#ffcc80',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  disclaimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  disclaimerIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#e65100',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disclaimerIconText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
  },
  disclaimerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e65100',
    flex: 1,
  },
  disclaimerDivider: {
    height: 1,
    backgroundColor: '#ffe0b2',
    marginBottom: 12,
  },
  disclaimerText: {
    fontSize: 13,
    color: '#5d4037',
    lineHeight: 21,
    marginBottom: 16,
  },
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ffe0b2',
  },
  agreeText: { fontSize: 14, color: '#37474f', flex: 1 },

  // ── START BUTTON ──────────────────────────────────────────────────────
  startButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: C.accentBlue,
    borderTopWidth: 3,
    borderTopColor: C.accentCyan,
    shadowColor: C.accentBlue,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  startButtonDisabled: {
    backgroundColor: '#90a4ae',
    borderTopColor: '#90a4ae',
    shadowOpacity: 0,
    elevation: 0,
  },
  startButtonInner: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
  },
  startButtonText:  { color: '#ffffff', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  startButtonArrow: { color: 'rgba(255,255,255,0.85)', fontSize: 20, fontWeight: '300' },

  // ── DEMO BUTTON ───────────────────────────────────────────────────────
  demoButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: 'transparent',
  },
  demoButtonText: { color: C.textSec, fontSize: 14, fontWeight: '500' },

  bottomSpacer: { height: 20 },
});
