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

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const [agreed, setAgreed] = useState(false);

  // 사용자 정보
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
      <View style={styles.header}>
        <Text style={styles.icon}>🦻</Text>
        <Text style={styles.title}>HICOG 청력검사</Text>
        <Text style={styles.subtitle}>순음 청력 검사 (Pure-Tone Audiometry)</Text>
      </View>

      {/* ── 사용자 정보 입력 ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>👤 검사자 정보</Text>

        <Text style={styles.fieldLabel}>이름</Text>
        <TextInput
          style={styles.input}
          placeholder="이름을 입력하세요"
          placeholderTextColor="#aaa"
          value={name}
          onChangeText={setName}
          returnKeyType="next"
        />

        <Text style={styles.fieldLabel}>나이</Text>
        <TextInput
          style={styles.input}
          placeholder="나이 (예: 35)"
          placeholderTextColor="#aaa"
          keyboardType="number-pad"
          value={age}
          onChangeText={setAge}
          returnKeyType="done"
          maxLength={3}
        />

        <Text style={styles.fieldLabel}>성별</Text>
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

      {/* ── 준비사항 ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>검사 전 준비사항</Text>
        {[
          ['🎧', '헤드폰 또는 이어폰을 착용해 주세요'],
          ['🤫', '조용한 환경에서 검사하세요 (35 dB 이하)'],
          ['📱', '볼륨을 70~80% 수준으로 설정하세요'],
          ['⏱️', '검사 시간: 약 5~10분'],
        ].map(([icon, text]) => (
          <View key={text} style={styles.checkItem}>
            <Text style={styles.checkIcon}>{icon}</Text>
            <Text style={styles.checkText}>{text}</Text>
          </View>
        ))}
      </View>

      {/* ── 검사 방법 ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>검사 방법</Text>
        <Text style={styles.instruction}>
          소리가 들리면 즉시 화면 중앙의 <Text style={styles.bold}>반응 버튼</Text>을 누르세요.{'\n\n'}
          소리의 크기나 방향에 관계없이{'\n'}아주 작은 소리라도 들리면 버튼을 누르세요.{'\n\n'}
          125 Hz ~ 8000 Hz 주파수 대역을{'\n'}우측 귀 → 좌측 귀 순으로 검사합니다.
        </Text>
      </View>

      {/* ── 면책 조항 ── */}
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerTitle}>⚠️ 면책 조항</Text>
        <Text style={styles.disclaimerText}>
          본 검사는 임상적 스크리닝 목적이며, 이비인후과 전문의나 청각 전문가가 방음 부스에서 수행하는 공식 진단 검사를 완전히 대체할 수 없습니다. 난청 징후나 귀의 통증이 느껴질 경우 즉시 전문 의료 기관을 방문하시기 바랍니다.
        </Text>
        <View style={styles.agreeRow}>
          <Switch value={agreed} onValueChange={setAgreed} trackColor={{ true: '#1976D2' }} />
          <Text style={styles.agreeText}>위 내용을 이해하고 동의합니다</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.startButton, !agreed && styles.startButtonDisabled]}
        onPress={handleStart}
        activeOpacity={0.8}
      >
        <Text style={styles.startButtonText}>검사 시작</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.demoButton} onPress={handleDemoResult}>
        <Text style={styles.demoButtonText}>📊 결과 화면 미리보기 (데모)</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  content: { padding: 20, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 24, paddingTop: 20 },
  icon: { fontSize: 56 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1a237e', marginTop: 8 },
  subtitle: { fontSize: 14, color: '#546e7a', marginTop: 4 },

  card: {
    backgroundColor: 'white', borderRadius: 16, padding: 18, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1a237e', marginBottom: 14 },

  // 사용자 입력 폼
  fieldLabel: { fontSize: 13, color: '#546e7a', fontWeight: '600', marginBottom: 4, marginTop: 8 },
  input: {
    borderWidth: 1.5, borderColor: '#b0bec5', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: '#1a237e', backgroundColor: '#f8faff',
  },
  genderRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  genderBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#b0bec5', alignItems: 'center',
    backgroundColor: '#f8faff',
  },
  genderBtnActive: { borderColor: '#1976D2', backgroundColor: '#e3f2fd' },
  genderBtnText: { fontSize: 14, color: '#546e7a', fontWeight: '600' },
  genderBtnTextActive: { color: '#1976D2' },

  checkItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  checkIcon: { fontSize: 20 },
  checkText: { fontSize: 14, color: '#37474f', flex: 1 },
  instruction: { fontSize: 14, color: '#37474f', lineHeight: 22 },
  bold: { fontWeight: 'bold', color: '#1a237e' },

  disclaimer: {
    backgroundColor: '#fff8e1', borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#ffe082',
  },
  disclaimerTitle: { fontSize: 15, fontWeight: 'bold', color: '#e65100', marginBottom: 8 },
  disclaimerText: { fontSize: 13, color: '#5d4037', lineHeight: 20, marginBottom: 12 },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  agreeText: { fontSize: 14, color: '#37474f', flex: 1 },

  startButton: {
    backgroundColor: '#1976D2', borderRadius: 16, padding: 18, alignItems: 'center',
    shadowColor: '#1976D2', shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  startButtonDisabled: { backgroundColor: '#90a4ae', shadowOpacity: 0 },
  startButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  demoButton: {
    marginTop: 12, padding: 14, alignItems: 'center',
    borderRadius: 12, borderWidth: 1, borderColor: '#90a4ae',
  },
  demoButtonText: { color: '#546e7a', fontSize: 14 },
});
