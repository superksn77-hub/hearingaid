import React, { useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, Dimensions
} from 'react-native';
import { Audiogram } from '../components/Audiogram';
import { TestResult, FREQUENCY_ORDER, TestFrequency } from '../types';

interface Props {
  navigation: any;
  route: { params: { result: TestResult } };
}

const FREQ_LABELS: Record<number, string> = {
  125: '125Hz', 250: '250Hz', 500: '500Hz', 1000: '1kHz',
  2000: '2kHz', 4000: '4kHz', 8000: '8kHz',
};

function classifyHL(dbHL: number): { label: string; color: string } {
  if (dbHL <= 25) return { label: '정상', color: '#2e7d32' };
  if (dbHL <= 40) return { label: '경도 난청', color: '#f57f17' };
  if (dbHL <= 55) return { label: '중도 난청', color: '#e65100' };
  if (dbHL <= 70) return { label: '중고도 난청', color: '#bf360c' };
  if (dbHL <= 90) return { label: '고도 난청', color: '#b71c1c' };
  return { label: '심도 난청', color: '#880e4f' };
}

function getPTA(thresholds: Partial<Record<TestFrequency, number>>): number | null {
  const freqs: TestFrequency[] = [500, 1000, 2000, 4000];
  const values = freqs.map(f => thresholds[f]).filter((v): v is number => v !== undefined);
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export const ResultScreen: React.FC<Props> = ({ navigation, route }) => {
  const { result } = route.params;
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = Math.min(screenWidth - 80, 340);

  const rightPTA = getPTA(result.right);
  const leftPTA = getPTA(result.left);

  const rightClass = rightPTA !== null ? classifyHL(rightPTA) : null;
  const leftClass = leftPTA !== null ? classifyHL(leftPTA) : null;

  const handleShare = async () => {
    const lines = ['[청력 검사 결과]', `검사일: ${new Date(result.date).toLocaleDateString('ko-KR')}`, ''];
    lines.push('우측 귀:');
    FREQUENCY_ORDER.forEach(f => {
      const v = result.right[f];
      if (v !== undefined) lines.push(`  ${FREQ_LABELS[f]}: ${v} dB HL`);
    });
    lines.push('');
    lines.push('좌측 귀:');
    FREQUENCY_ORDER.forEach(f => {
      const v = result.left[f];
      if (v !== undefined) lines.push(`  ${FREQ_LABELS[f]}: ${v} dB HL`);
    });
    if (rightPTA !== null) lines.push(`\n우측 PTA: ${rightPTA} dB HL (${rightClass?.label})`);
    if (leftPTA !== null) lines.push(`좌측 PTA: ${leftPTA} dB HL (${leftClass?.label})`);
    lines.push('\n⚠️ 본 결과는 스크리닝 목적이며 전문 진단을 대체하지 않습니다.');

    await Share.share({ message: lines.join('\n') });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>검사 결과</Text>
      <Text style={styles.date}>
        {new Date(result.date).toLocaleDateString('ko-KR', {
          year: 'numeric', month: 'long', day: 'numeric'
        })}
      </Text>

      {/* Audiogram chart */}
      <View style={styles.chartCard}>
        <Audiogram result={result} width={chartWidth} height={280} />
      </View>

      {/* Summary */}
      <View style={styles.summaryRow}>
        {rightClass && (
          <View style={[styles.summaryCard, { borderColor: '#e53935' }]}>
            <Text style={styles.summaryEar}>🔴 우측 귀</Text>
            <Text style={styles.summaryPTA}>{rightPTA} dB HL</Text>
            <Text style={[styles.summaryLabel, { color: rightClass.color }]}>{rightClass.label}</Text>
          </View>
        )}
        {leftClass && (
          <View style={[styles.summaryCard, { borderColor: '#1565C0' }]}>
            <Text style={styles.summaryEar}>🔵 좌측 귀</Text>
            <Text style={styles.summaryPTA}>{leftPTA} dB HL</Text>
            <Text style={[styles.summaryLabel, { color: leftClass.color }]}>{leftClass.label}</Text>
          </View>
        )}
      </View>

      {/* Detailed table */}
      <View style={styles.tableCard}>
        <Text style={styles.tableTitle}>주파수별 상세 결과</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableCell, styles.tableHeaderText]}>주파수</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { color: '#e53935' }]}>우측 (dB)</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, { color: '#1565C0' }]}>좌측 (dB)</Text>
        </View>
        {FREQUENCY_ORDER.map(freq => (
          <View key={freq} style={styles.tableRow}>
            <Text style={styles.tableCell}>{FREQ_LABELS[freq]}</Text>
            <Text style={[styles.tableCell, { color: '#e53935', fontWeight: '600' }]}>
              {result.right[freq] !== undefined ? `${result.right[freq]}` : '-'}
            </Text>
            <Text style={[styles.tableCell, { color: '#1565C0', fontWeight: '600' }]}>
              {result.left[freq] !== undefined ? `${result.left[freq]}` : '-'}
            </Text>
          </View>
        ))}
      </View>

      {/* Classification legend */}
      <View style={styles.legendCard}>
        <Text style={styles.legendTitle}>난청 분류 기준</Text>
        {[
          { range: '≤ 25 dB', label: '정상 청력', color: '#2e7d32' },
          { range: '26~40 dB', label: '경도 난청', color: '#f57f17' },
          { range: '41~55 dB', label: '중도 난청', color: '#e65100' },
          { range: '56~70 dB', label: '중고도 난청', color: '#bf360c' },
          { range: '71~90 dB', label: '고도 난청', color: '#b71c1c' },
          { range: '91+ dB', label: '심도 난청', color: '#880e4f' },
        ].map(item => (
          <View key={item.range} style={styles.legendRow}>
            <Text style={styles.legendRange}>{item.range}</Text>
            <Text style={[styles.legendLabel, { color: item.color }]}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          ⚠️ 본 결과는 임상적 스크리닝 목적이며, 이비인후과 전문의의 공식 진단을 대체하지 않습니다. 이상 소견이 있으면 전문 의료 기관을 방문하세요.
        </Text>
      </View>

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Text style={styles.shareButtonText}>결과 공유</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.retestButton}
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={styles.retestButtonText}>홈으로</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  content: { padding: 20, paddingBottom: 50 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#1a237e', textAlign: 'center', marginTop: 20, marginBottom: 4 },
  date: { fontSize: 13, color: '#78909c', textAlign: 'center', marginBottom: 20 },
  chartCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  summaryCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryEar: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  summaryPTA: { fontSize: 28, fontWeight: 'bold', color: '#1a237e', marginBottom: 4 },
  summaryLabel: { fontSize: 13, fontWeight: '600' },
  tableCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  tableTitle: { fontSize: 15, fontWeight: 'bold', color: '#1a237e', marginBottom: 12 },
  tableHeader: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: '#e0e0e0' },
  tableHeaderText: { fontWeight: 'bold', color: '#37474f' },
  tableRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  tableCell: { flex: 1, textAlign: 'center', fontSize: 14, color: '#37474f' },
  legendCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  legendTitle: { fontSize: 15, fontWeight: 'bold', color: '#1a237e', marginBottom: 10 },
  legendRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  legendRange: { fontSize: 13, color: '#546e7a' },
  legendLabel: { fontSize: 13, fontWeight: '600' },
  disclaimer: {
    backgroundColor: '#fff8e1',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ffe082',
  },
  disclaimerText: { fontSize: 12, color: '#5d4037', lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: 12 },
  shareButton: {
    flex: 1,
    backgroundColor: '#e3f2fd',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1976D2',
  },
  shareButtonText: { color: '#1976D2', fontSize: 15, fontWeight: 'bold' },
  retestButton: {
    flex: 1,
    backgroundColor: '#1976D2',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  retestButtonText: { color: 'white', fontSize: 15, fontWeight: 'bold' },
});
