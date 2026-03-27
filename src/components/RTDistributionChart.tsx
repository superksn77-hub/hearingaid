import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, Path } from 'react-native-svg';

interface Props {
  allRTs: number[];
  mu: number;
  sigma: number;
  tau: number;
  width?: number;
  height?: number;
}

const PAD = { top: 20, right: 16, bottom: 36, left: 44 };

/**
 * CPT 반응 시간 분포 히스토그램 + Ex-Gaussian 파라미터 표시
 */
export const RTDistributionChart: React.FC<Props> = ({
  allRTs, mu, sigma, tau,
  width = 320, height = 200,
}) => {
  if (allRTs.length < 5) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyText}>반응 데이터 부족</Text>
      </View>
    );
  }

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  // 히스토그램 빈 계산
  const minRT = Math.max(0, Math.min(...allRTs) - 50);
  const maxRT = Math.min(2000, Math.max(...allRTs) + 50);
  const binCount = Math.min(20, Math.max(8, Math.round(allRTs.length / 3)));
  const binWidth = (maxRT - minRT) / binCount;

  const bins: number[] = new Array(binCount).fill(0);
  for (const rt of allRTs) {
    const idx = Math.min(binCount - 1, Math.floor((rt - minRT) / binWidth));
    if (idx >= 0) bins[idx]++;
  }
  const maxBin = Math.max(...bins, 1);

  // 빈 막대
  const barW = plotW / binCount - 2;
  const bars = bins.map((count, i) => {
    const x = PAD.left + i * (plotW / binCount) + 1;
    const barH = (count / maxBin) * plotH;
    const y = PAD.top + plotH - barH;
    return { x, y, w: barW, h: barH, count, rtCenter: minRT + (i + 0.5) * binWidth };
  });

  // 축 눈금
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(p => ({
    x: PAD.left + p * plotW,
    label: `${Math.round(minRT + p * (maxRT - minRT))}`,
  }));

  // μ, τ 위치 마커
  const muX = PAD.left + ((mu - minRT) / (maxRT - minRT)) * plotW;
  const tauX = PAD.left + ((mu + tau - minRT) / (maxRT - minRT)) * plotW;

  return (
    <View style={s.container}>
      <Svg width={width} height={height}>
        {/* Y축 */}
        <Line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH}
          stroke="rgba(255,255,255,0.2)" />
        {/* X축 */}
        <Line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH}
          stroke="rgba(255,255,255,0.2)" />

        {/* 히스토그램 막대 */}
        {bars.map((b, i) => (
          <Rect key={i} x={b.x} y={b.y} width={b.w} height={b.h}
            fill={b.rtCenter > mu + tau ? '#ff5252' : '#1e88e5'}
            opacity={0.7}
            rx={2}
          />
        ))}

        {/* μ 마커 */}
        {muX > PAD.left && muX < PAD.left + plotW && (
          <>
            <Line x1={muX} y1={PAD.top} x2={muX} y2={PAD.top + plotH}
              stroke="#00e676" strokeDasharray="4,3" strokeWidth={1.5} />
            <SvgText x={muX} y={PAD.top - 4} fill="#00e676" fontSize="9"
              textAnchor="middle" fontWeight="bold">μ={Math.round(mu)}</SvgText>
          </>
        )}

        {/* μ+τ 마커 (주의력 일탈 구간 시작) */}
        {tauX > PAD.left && tauX < PAD.left + plotW && (
          <>
            <Line x1={tauX} y1={PAD.top} x2={tauX} y2={PAD.top + plotH}
              stroke="#ff5252" strokeDasharray="4,3" strokeWidth={1.5} />
            <SvgText x={tauX} y={PAD.top - 4} fill="#ff5252" fontSize="9"
              textAnchor="middle" fontWeight="bold">μ+τ={Math.round(mu + tau)}</SvgText>
          </>
        )}

        {/* X축 눈금 */}
        {xTicks.map((t, i) => (
          <SvgText key={i} x={t.x} y={PAD.top + plotH + 16} fill="#78909c" fontSize="9"
            textAnchor="middle">{t.label}</SvgText>
        ))}

        {/* 축 라벨 */}
        <SvgText x={PAD.left + plotW / 2} y={height - 4} fill="#78909c" fontSize="10"
          textAnchor="middle">반응 시간 (ms)</SvgText>
        <SvgText x={10} y={PAD.top + plotH / 2} fill="#78909c" fontSize="10"
          textAnchor="middle" transform={`rotate(-90, 10, ${PAD.top + plotH / 2})`}>빈도</SvgText>
      </Svg>

      {/* 파라미터 범례 */}
      <View style={s.legend}>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: '#00e676' }]} />
          <Text style={s.legendText}>μ = {Math.round(mu)}ms (기본 속도)</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: '#ff5252' }]} />
          <Text style={s.legendText}>τ = {Math.round(tau)}ms (주의력 일탈)</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: '#1e88e5' }]} />
          <Text style={s.legendText}>σ = {Math.round(sigma)}ms (변동성)</Text>
        </View>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  container: { alignItems: 'center' },
  empty: { padding: 20, alignItems: 'center' },
  emptyText: { color: '#78909c', fontSize: 13 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 8, gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  legendText: { color: '#78909c', fontSize: 10 },
});
