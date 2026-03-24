import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, Alert
} from 'react-native';

interface Props {
  navigation: any;
}

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const [agreed, setAgreed] = useState(false);

  const handleStart = () => {
    if (!agreed) {
      Alert.alert('동의 필요', '면책 조항에 동의해야 검사를 시작할 수 있습니다.');
      return;
    }
    navigation.navigate('Calibration');
  };

  const handleDemoResult = () => {
    navigation.navigate('Result', {
      result: {
        right: { 250: 20, 500: 35, 1000: 40, 2000: 40, 4000: 55, 8000: 60 },
        left:  { 250: 20, 500: 40, 1000: 45, 2000: 40, 4000: 55, 8000: 60 },
        date: new Date().toISOString(),
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

      <View style={styles.card}>
        <Text style={styles.cardTitle}>검사 전 준비사항</Text>
        <View style={styles.checkItem}>
          <Text style={styles.checkIcon}>🎧</Text>
          <Text style={styles.checkText}>헤드폰 또는 이어폰을 착용해 주세요</Text>
        </View>
        <View style={styles.checkItem}>
          <Text style={styles.checkIcon}>🤫</Text>
          <Text style={styles.checkText}>조용한 환경에서 검사하세요 (35dB 이하)</Text>
        </View>
        <View style={styles.checkItem}>
          <Text style={styles.checkIcon}>📱</Text>
          <Text style={styles.checkText}>볼륨을 70~80% 수준으로 설정하세요</Text>
        </View>
        <View style={styles.checkItem}>
          <Text style={styles.checkIcon}>⏱️</Text>
          <Text style={styles.checkText}>검사 시간: 약 5~10분</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>검사 방법</Text>
        <Text style={styles.instruction}>
          소리가 들리면 즉시 화면 중앙의 <Text style={styles.bold}>반응 버튼</Text>을 누르세요.{'\n\n'}
          소리의 크기나 방향에 관계없이 {'\n'}아주 작은 소리라도 들리면 버튼을 누르세요.{'\n\n'}
          250Hz ~ 8000Hz 주파수 대역을 {'\n'}양쪽 귀 각각 검사합니다.
        </Text>
      </View>

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
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1a237e', marginBottom: 12 },
  checkItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  checkIcon: { fontSize: 20 },
  checkText: { fontSize: 14, color: '#37474f', flex: 1 },
  instruction: { fontSize: 14, color: '#37474f', lineHeight: 22 },
  bold: { fontWeight: 'bold', color: '#1a237e' },
  disclaimer: {
    backgroundColor: '#fff8e1',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ffe082',
  },
  disclaimerTitle: { fontSize: 15, fontWeight: 'bold', color: '#e65100', marginBottom: 8 },
  disclaimerText: { fontSize: 13, color: '#5d4037', lineHeight: 20, marginBottom: 12 },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  agreeText: { fontSize: 14, color: '#37474f', flex: 1 },
  startButton: {
    backgroundColor: '#1976D2',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    shadowColor: '#1976D2',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  startButtonDisabled: { backgroundColor: '#90a4ae', shadowOpacity: 0 },
  startButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  demoButton: {
    marginTop: 12,
    padding: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#90a4ae',
  },
  demoButtonText: { color: '#546e7a', fontSize: 14 },
});
