import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Circle, Line, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';

interface Props {
  pADHD: number;      // 0-1
  pDyslexia: number;  // 0-1
  ehfFlag: boolean;
  width?: number;
  height?: number;
}

const PAD = 48;

export const SpectrumChart: React.FC<Props> = ({
  pADHD, pDyslexia, ehfFlag,
  width = 320, height = 320,
}) => {
  const plotW = width - PAD * 2;
  const plotH = height - PAD * 2;

  // 데이터 포인트 위치
  const px = PAD + pADHD * plotW;
  const py = PAD + (1 - pDyslexia) * plotH; // Y축 반전

  // 경계선 (0.3, 0.6)
  const line30x = PAD + 0.3 * plotW;
  const line60x = PAD + 0.6 * plotW;
  const line30y = PAD + (1 - 0.3) * plotH;
  const line60y = PAD + (1 - 0.6) * plotH;

  // 점 색상
  const dotColor = ehfFlag ? '#ff9800' :
    (pADHD >= 0.6 && pDyslexia >= 0.6) ? '#ff1744' :
    (pADHD >= 0.6) ? '#ff5252' :
    (pDyslexia >= 0.6) ? '#7c4dff' :
    (pADHD >= 0.3 || pDyslexia >= 0.3) ? '#ffd740' :
    '#00e676';

  return (
    <View style={s.container}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#0a2a1a" stopOpacity="0.4" />
            <Stop offset="1" stopColor="#1a0a2a" stopOpacity="0.4" />
          </LinearGradient>
        </Defs>

        {/* 배경 */}
        <Rect x={PAD} y={PAD} width={plotW} height={plotH} fill="url(#bgGrad)" rx={4} />

        {/* 사분면 영역 색상 */}
        {/* 좌하: 정상 */}
        <Rect x={PAD} y={line30y} width={line30x - PAD} height={PAD + plotH - line30y}
          fill="rgba(0,230,118,0.06)" />
        {/* 우하: ADHD 우세 */}
        <Rect x={line30x} y={line30y} width={PAD + plotW - line30x} height={PAD + plotH - line30y}
          fill="rgba(255,82,82,0.06)" />
        {/* 좌상: 난독증 우세 */}
        <Rect x={PAD} y={PAD} width={line30x - PAD} height={line30y - PAD}
          fill="rgba(124,77,255,0.06)" />
        {/* 우상: 동반이환 */}
        <Rect x={line30x} y={PAD} width={PAD + plotW - line30x} height={line30y - PAD}
          fill="rgba(255,23,68,0.06)" />

        {/* 격자선 */}
        <Line x1={line30x} y1={PAD} x2={line30x} y2={PAD + plotH}
          stroke="rgba(255,255,255,0.15)" strokeDasharray="4,4" />
        <Line x1={line60x} y1={PAD} x2={line60x} y2={PAD + plotH}
          stroke="rgba(255,255,255,0.15)" strokeDasharray="4,4" />
        <Line x1={PAD} y1={line30y} x2={PAD + plotW} y2={line30y}
          stroke="rgba(255,255,255,0.15)" strokeDasharray="4,4" />
        <Line x1={PAD} y1={line60y} x2={PAD + plotW} y2={line60y}
          stroke="rgba(255,255,255,0.15)" strokeDasharray="4,4" />

        {/* 축 */}
        <Line x1={PAD} y1={PAD + plotH} x2={PAD + plotW} y2={PAD + plotH}
          stroke="rgba(255,255,255,0.3)" />
        <Line x1={PAD} y1={PAD} x2={PAD} y2={PAD + plotH}
          stroke="rgba(255,255,255,0.3)" />

        {/* 축 레이블 */}
        <SvgText x={PAD + plotW / 2} y={height - 6} fill="#78909c" fontSize="11"
          textAnchor="middle">ADHD 위험도 →</SvgText>
        <SvgText x={10} y={PAD + plotH / 2} fill="#78909c" fontSize="11"
          textAnchor="middle" transform={`rotate(-90, 10, ${PAD + plotH / 2})`}>
          난독증 위험도 →
        </SvgText>

        {/* 눈금 */}
        <SvgText x={PAD} y={PAD + plotH + 14} fill="#546e7a" fontSize="9" textAnchor="middle">0</SvgText>
        <SvgText x={line30x} y={PAD + plotH + 14} fill="#546e7a" fontSize="9" textAnchor="middle">30%</SvgText>
        <SvgText x={line60x} y={PAD + plotH + 14} fill="#546e7a" fontSize="9" textAnchor="middle">60%</SvgText>
        <SvgText x={PAD + plotW} y={PAD + plotH + 14} fill="#546e7a" fontSize="9" textAnchor="middle">100%</SvgText>

        <SvgText x={PAD - 6} y={PAD + plotH + 4} fill="#546e7a" fontSize="9" textAnchor="end">0</SvgText>
        <SvgText x={PAD - 6} y={line30y + 4} fill="#546e7a" fontSize="9" textAnchor="end">30%</SvgText>
        <SvgText x={PAD - 6} y={line60y + 4} fill="#546e7a" fontSize="9" textAnchor="end">60%</SvgText>
        <SvgText x={PAD - 6} y={PAD + 4} fill="#546e7a" fontSize="9" textAnchor="end">100%</SvgText>

        {/* 데이터 포인트 — 외부 글로우 */}
        <Circle cx={px} cy={py} r={14} fill={dotColor} opacity={0.2} />
        <Circle cx={px} cy={py} r={8} fill={dotColor} />
        <Circle cx={px} cy={py} r={3} fill="#ffffff" />

        {/* 값 표시 */}
        <SvgText x={px + 14} y={py - 10} fill={dotColor} fontSize="10" fontWeight="bold">
          ({(pADHD * 100).toFixed(0)}%, {(pDyslexia * 100).toFixed(0)}%)
        </SvgText>
      </Svg>

      {/* 범례 */}
      <View style={s.legend}>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: '#00e676' }]} />
          <Text style={s.legendText}>정상</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: '#ffd740' }]} />
          <Text style={s.legendText}>경계</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: '#ff5252' }]} />
          <Text style={s.legendText}>ADHD</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: '#7c4dff' }]} />
          <Text style={s.legendText}>난독증</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: '#ff1744' }]} />
          <Text style={s.legendText}>동반</Text>
        </View>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  container: { alignItems: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 8, gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  legendText: { color: '#78909c', fontSize: 11 },
});
