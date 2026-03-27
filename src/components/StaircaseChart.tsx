import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Line, Circle, Polyline, Rect, Text as SvgText } from 'react-native-svg';

interface Props {
  reversals: number[];
  threshold: number;
  label: string;
  unit: string;
  color?: string;
  width?: number;
  height?: number;
}

const PAD = { top: 24, right: 16, bottom: 32, left: 48 };

/**
 * 적응형 계단법 수렴 과정 시각화
 * X축: reversal 인덱스, Y축: 값 (% 또는 ms)
 * 임계치 수평선 + 마지막 6개 reversal 강조
 */
export const StaircaseChart: React.FC<Props> = ({
  reversals, threshold, label, unit,
  color = '#7c4dff',
  width = 300, height = 160,
}) => {
  if (reversals.length < 2) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyText}>{label}: 데이터 부족</Text>
      </View>
    );
  }

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const minVal = Math.max(0, Math.min(...reversals) * 0.7);
  const maxVal = Math.max(...reversals) * 1.2;
  const range = maxVal - minVal || 1;

  // 포인트 좌표
  const points = reversals.map((val, i) => ({
    x: PAD.left + (i / (reversals.length - 1)) * plotW,
    y: PAD.top + (1 - (val - minVal) / range) * plotH,
    val,
    isLast6: i >= reversals.length - 6,
  }));

  // 폴리라인 문자열
  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');

  // 임계치 Y 위치
  const thresholdY = PAD.top + (1 - (threshold - minVal) / range) * plotH;

  // Y축 눈금
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(p => ({
    y: PAD.top + (1 - p) * plotH,
    label: (minVal + p * range).toFixed(1),
  }));

  return (
    <View style={s.container}>
      <Text style={[s.title, { color }]}>{label}</Text>
      <Svg width={width} height={height}>
        {/* 배경 격자 */}
        {yTicks.map((t, i) => (
          <Line key={i} x1={PAD.left} y1={t.y} x2={PAD.left + plotW} y2={t.y}
            stroke="rgba(255,255,255,0.06)" />
        ))}

        {/* 축 */}
        <Line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH}
          stroke="rgba(255,255,255,0.2)" />
        <Line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH}
          stroke="rgba(255,255,255,0.2)" />

        {/* 임계치 수평선 */}
        <Line x1={PAD.left} y1={thresholdY} x2={PAD.left + plotW} y2={thresholdY}
          stroke="#00e676" strokeDasharray="6,3" strokeWidth={1.5} />
        <SvgText x={PAD.left + plotW + 2} y={thresholdY + 4} fill="#00e676" fontSize="9"
          textAnchor="start">{threshold.toFixed(1)}</SvgText>

        {/* 수렴 경로 */}
        <Polyline points={polylinePoints} fill="none" stroke={color} strokeWidth={1.5} opacity={0.6} />

        {/* reversal 포인트 */}
        {points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y}
            r={p.isLast6 ? 5 : 3}
            fill={p.isLast6 ? color : 'rgba(255,255,255,0.3)'}
            stroke={p.isLast6 ? '#ffffff' : 'none'}
            strokeWidth={p.isLast6 ? 1 : 0}
          />
        ))}

        {/* Y축 눈금 */}
        {yTicks.filter((_, i) => i % 2 === 0).map((t, i) => (
          <SvgText key={i} x={PAD.left - 6} y={t.y + 4} fill="#546e7a" fontSize="9"
            textAnchor="end">{t.label}</SvgText>
        ))}

        {/* X축 라벨 */}
        <SvgText x={PAD.left + plotW / 2} y={height - 4} fill="#78909c" fontSize="9"
          textAnchor="middle">Reversal 번호</SvgText>

        {/* Y축 라벨 */}
        <SvgText x={8} y={PAD.top + plotH / 2} fill="#78909c" fontSize="9"
          textAnchor="middle" transform={`rotate(-90, 8, ${PAD.top + plotH / 2})`}>{unit}</SvgText>
      </Svg>

      <View style={s.thresholdRow}>
        <View style={[s.thresholdDot, { backgroundColor: '#00e676' }]} />
        <Text style={s.thresholdText}>임계치: {threshold.toFixed(1)} {unit}</Text>
        <Text style={s.reversalCount}>(reversals: {reversals.length})</Text>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  container: { alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  empty: { padding: 16, alignItems: 'center' },
  emptyText: { color: '#78909c', fontSize: 12 },
  thresholdRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  thresholdDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  thresholdText: { color: '#00e676', fontSize: 11, fontWeight: '600' },
  reversalCount: { color: '#546e7a', fontSize: 10, marginLeft: 8 },
});
