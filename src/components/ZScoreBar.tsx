import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  label: string;
  value: number;      // raw value
  zScore: number;     // z-score
  unit?: string;
  color?: string;
  invertColor?: boolean; // true = 높을수록 나쁨 (빨강), false = 반대
}

const C = {
  bgBar:     '#132040',
  textWhite: '#ffffff',
  textMuted: '#78909c',
  normal:    '#00c853',
  warning:   '#ffd740',
  danger:    '#ff5252',
  good:      '#00b8d4',
};

export const ZScoreBar: React.FC<Props> = ({
  label, value, zScore, unit = '', color, invertColor = true,
}) => {
  // z-score를 0~100% 바 위치로 변환 (-3 ~ +3 범위)
  const clampedZ = Math.max(-3, Math.min(3, zScore));
  const percent = ((clampedZ + 3) / 6) * 100;

  // 색상 결정
  let barColor = color;
  if (!barColor) {
    const absZ = Math.abs(zScore);
    if (invertColor) {
      barColor = zScore <= 0 ? C.normal : zScore <= 1.5 ? C.warning : C.danger;
    } else {
      barColor = zScore >= 0 ? C.normal : zScore >= -1.5 ? C.warning : C.danger;
    }
  }

  const zLabel = zScore >= 0 ? `+${zScore.toFixed(1)}` : zScore.toFixed(1);

  return (
    <View style={s.container}>
      <View style={s.labelRow}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.value}>
          {typeof value === 'number' ? (value < 1 ? (value * 100).toFixed(0) + '%' : value.toFixed(1)) : value}
          {unit ? ` ${unit}` : ''}
        </Text>
      </View>
      <View style={s.barBg}>
        {/* 정상 범위 표시 (z = -1 ~ +1) */}
        <View style={s.normalRange} />
        {/* 중앙선 */}
        <View style={s.centerLine} />
        {/* 값 마커 */}
        <View style={[s.marker, { left: `${percent}%`, backgroundColor: barColor }]} />
      </View>
      <View style={s.zRow}>
        <Text style={s.zLabel}>-3σ</Text>
        <Text style={[s.zValue, { color: barColor }]}>Z = {zLabel}</Text>
        <Text style={s.zLabel}>+3σ</Text>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  container: { marginBottom: 16 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  value: { color: '#78909c', fontSize: 13 },
  barBg: { height: 14, backgroundColor: '#132040', borderRadius: 7, position: 'relative', overflow: 'hidden' },
  normalRange: { position: 'absolute', left: '33.3%', width: '33.3%', height: '100%', backgroundColor: 'rgba(0,200,83,0.12)', borderRadius: 7 },
  centerLine: { position: 'absolute', left: '50%', width: 1, height: '100%', backgroundColor: 'rgba(255,255,255,0.2)' },
  marker: { position: 'absolute', top: 2, width: 10, height: 10, borderRadius: 5, marginLeft: -5 },
  zRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  zLabel: { color: '#546e7a', fontSize: 10 },
  zValue: { fontSize: 11, fontWeight: '700' },
});
