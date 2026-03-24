import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Line, Circle, Text as SvgText, Path, G, Rect, Defs, LinearGradient, Stop
} from 'react-native-svg';
import { TestFrequency, TestResult, FREQUENCY_ORDER } from '../types';

interface Props {
  result: TestResult;
  width?: number;
  height?: number;
}

const FREQUENCIES = FREQUENCY_ORDER;
const FREQ_LABELS = ['250', '500', '1k', '2k', '4k', '8k'];

const DB_MIN = -10;
const DB_MAX = 100;
const DB_STEP = 10;

// Hearing loss classification bands
const BANDS = [
  { from: -10, to: 25, color: '#e8f5e9', label: '정상' },
  { from: 25, to: 40, color: '#fff9e6', label: '경도' },
  { from: 40, to: 55, color: '#fff3e0', label: '중도' },
  { from: 55, to: 70, color: '#fbe9e7', label: '중고도' },
  { from: 70, to: 90, color: '#fce4ec', label: '고도' },
  { from: 90, to: 110, color: '#f3e5f5', label: '심도' },
];

export const Audiogram: React.FC<Props> = ({ result, width = 340, height = 300 }) => {
  // Chart area margins
  const marginLeft = 48;
  const marginRight = 24;
  const marginTop = 20;
  const marginBottom = 30;

  const chartW = width - marginLeft - marginRight;
  const chartH = height - marginTop - marginBottom;

  const numFreqs = FREQUENCIES.length;
  const numDbs = (DB_MAX - DB_MIN) / DB_STEP + 1;

  const xForFreq = (idx: number) => (idx / (numFreqs - 1)) * chartW;
  const yForDb = (db: number) => ((db - DB_MIN) / (DB_MAX - DB_MIN)) * chartH;

  // Build path for an ear
  const buildPath = (thresholds: Partial<Record<TestFrequency, number>>) => {
    let path = '';
    FREQUENCIES.forEach((freq, i) => {
      const db = thresholds[freq];
      if (db === undefined) return;
      const x = xForFreq(i);
      const y = yForDb(db);
      if (path === '') path = `M ${x} ${y}`;
      else path += ` L ${x} ${y}`;
    });
    return path;
  };

  const rightPath = buildPath(result.right);
  const leftPath = buildPath(result.left);

  return (
    <View style={styles.container}>
      {/* Title */}
      <Text style={styles.xAxisTitle}>주파수 단위 (Hz)</Text>
      <View style={{ flexDirection: 'row' }}>
        {/* Y axis label */}
        <View style={styles.yLabelContainer}>
          <Text style={styles.yAxisTitle}>데시벨 단위 (dB)</Text>
        </View>

        <Svg width={width} height={height}>
          <G x={marginLeft} y={marginTop}>
            {/* Hearing loss severity bands */}
            {BANDS.map((band, i) => {
              const y1 = Math.max(0, yForDb(band.from));
              const y2 = Math.min(chartH, yForDb(band.to));
              return (
                <Rect
                  key={i}
                  x={0} y={y1}
                  width={chartW} height={y2 - y1}
                  fill={band.color}
                  opacity={0.7}
                />
              );
            })}

            {/* Grid lines - horizontal (dB) */}
            {Array.from({ length: numDbs }).map((_, i) => {
              const db = DB_MIN + i * DB_STEP;
              const y = yForDb(db);
              return (
                <G key={`hgrid-${i}`}>
                  <Line x1={0} y1={y} x2={chartW} y2={y} stroke="#ccc" strokeWidth={db === 0 ? 1.5 : 0.5} />
                  <SvgText x={-6} y={y + 4} textAnchor="end" fontSize={9} fill="#555">
                    {db}
                  </SvgText>
                </G>
              );
            })}

            {/* Grid lines - vertical (frequency) */}
            {FREQUENCIES.map((freq, i) => {
              const x = xForFreq(i);
              return (
                <G key={`vgrid-${i}`}>
                  <Line x1={x} y1={0} x2={x} y2={chartH} stroke="#ccc" strokeWidth={0.5} />
                  <SvgText x={x} y={chartH + 14} textAnchor="middle" fontSize={10} fill="#333">
                    {FREQ_LABELS[i]}
                  </SvgText>
                </G>
              );
            })}

            {/* Axes */}
            {/* X axis */}
            <Line x1={0} y1={0} x2={chartW + 12} y2={0} stroke="#333" strokeWidth={2} />
            {/* X arrow */}
            <Path d={`M ${chartW + 8} -5 L ${chartW + 16} 0 L ${chartW + 8} 5`} fill="#333" />

            {/* Y axis */}
            <Line x1={0} y1={0} x2={0} y2={chartH + 12} stroke="#333" strokeWidth={2} />
            {/* Y arrow */}
            <Path d={`M -5 ${chartH + 8} L 0 ${chartH + 16} L 5 ${chartH + 8}`} fill="#333" />

            {/* Origin yellow dot at 125Hz equiv position (before 250Hz) */}
            <Circle cx={-chartW / (numFreqs - 1) * 0.5} cy={yForDb(-10)} r={6} fill="#FFD600" />

            {/* Right ear path (red) */}
            {rightPath !== '' && (
              <Path d={rightPath} stroke="#e53935" strokeWidth={2} fill="none" strokeLinejoin="round" />
            )}

            {/* Left ear path (blue) */}
            {leftPath !== '' && (
              <Path d={leftPath} stroke="#1565C0" strokeWidth={2} fill="none" strokeLinejoin="round" strokeDasharray="4,2" />
            )}

            {/* Right ear symbols - O (circle) */}
            {FREQUENCIES.map((freq, i) => {
              const db = result.right[freq];
              if (db === undefined) return null;
              const x = xForFreq(i);
              const y = yForDb(db);
              return (
                <G key={`r-${freq}`}>
                  <Circle cx={x} cy={y} r={7} stroke="#e53935" strokeWidth={2} fill="white" />
                </G>
              );
            })}

            {/* Left ear symbols - X */}
            {FREQUENCIES.map((freq, i) => {
              const db = result.left[freq];
              if (db === undefined) return null;
              const x = xForFreq(i);
              const y = yForDb(db);
              return (
                <G key={`l-${freq}`}>
                  <Line x1={x-6} y1={y-6} x2={x+6} y2={y+6} stroke="#1565C0" strokeWidth={2.5} />
                  <Line x1={x+6} y1={y-6} x2={x-6} y2={y+6} stroke="#1565C0" strokeWidth={2.5} />
                </G>
              );
            })}
          </G>
        </Svg>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <Svg width={30} height={16}>
            <Line x1={0} y1={8} x2={30} y2={8} stroke="#e53935" strokeWidth={2} />
            <Circle cx={15} cy={8} r={5} stroke="#e53935" strokeWidth={2} fill="white" />
          </Svg>
          <Text style={[styles.legendText, { color: '#e53935' }]}>우측 귀 (R)</Text>
        </View>
        <View style={styles.legendItem}>
          <Svg width={30} height={16}>
            <Line x1={0} y1={8} x2={30} y2={8} stroke="#1565C0" strokeWidth={2} strokeDasharray="4,2" />
            <Line x1={11} y1={3} x2={19} y2={13} stroke="#1565C0" strokeWidth={2} />
            <Line x1={19} y1={3} x2={11} y2={13} stroke="#1565C0" strokeWidth={2} />
          </Svg>
          <Text style={[styles.legendText, { color: '#1565C0' }]}>좌측 귀 (L)</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  xAxisTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#e53935',
    marginBottom: 4,
  },
  yLabelContainer: {
    width: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  yAxisTitle: {
    fontSize: 11,
    color: '#e53935',
    transform: [{ rotate: '-90deg' }],
    fontWeight: 'bold',
    width: 120,
    textAlign: 'center',
  },
  legend: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
