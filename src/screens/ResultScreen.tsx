import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Platform
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
  if (dbHL <= 25) return { label: '정상',         color: '#2e7d32' };
  if (dbHL <= 40) return { label: '경도 난청',    color: '#f57f17' };
  if (dbHL <= 55) return { label: '중도 난청',    color: '#e65100' };
  if (dbHL <= 70) return { label: '중고도 난청',  color: '#bf360c' };
  if (dbHL <= 90) return { label: '고도 난청',    color: '#b71c1c' };
  return              { label: '심도 난청',    color: '#880e4f' };
}

function getPTA(thresholds: Partial<Record<TestFrequency, number>>): number | null {
  const freqs: TestFrequency[] = [500, 1000, 2000, 4000];
  const values = freqs.map(f => thresholds[f]).filter((v): v is number => v !== undefined);
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

// ── SVG 오디오그램 (PDF용 인라인) ─────────────────────────────────────
function buildAudiogramSvg(result: TestResult): string {
  const W = 480, H = 320;
  const left = 60, top = 30, right = W - 20, bottom = H - 30;
  const plotW = right - left;
  const plotH = bottom - top;

  const freqs = [125, 250, 500, 1000, 2000, 4000, 8000];
  const dbMin = -10, dbMax = 100;

  const xPos = (f: number) => {
    const idx = freqs.indexOf(f);
    return left + (idx / (freqs.length - 1)) * plotW;
  };
  const yPos = (db: number) =>
    top + ((db - dbMin) / (dbMax - dbMin)) * plotH;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#fff;font-family:sans-serif;">`;

  // 배경 밴드
  const bands = [
    { min: -10, max: 25,  color: '#e8f5e9' },
    { min: 25,  max: 40,  color: '#fff9c4' },
    { min: 40,  max: 55,  color: '#ffe0b2' },
    { min: 55,  max: 70,  color: '#ffccbc' },
    { min: 70,  max: 90,  color: '#ffcdd2' },
    { min: 90,  max: 100, color: '#f8bbd0' },
  ];
  bands.forEach(b => {
    const y1 = yPos(b.min), y2 = yPos(b.max);
    svg += `<rect x="${left}" y="${y1}" width="${plotW}" height="${y2 - y1}" fill="${b.color}"/>`;
  });

  // 격자선 + dB 레이블
  for (let db = -10; db <= 100; db += 10) {
    const y = yPos(db);
    svg += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#ccc" stroke-width="0.5"/>`;
    svg += `<text x="${left - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="#555">${db}</text>`;
  }

  // 주파수 격자선 + 레이블
  freqs.forEach(f => {
    const x = xPos(f);
    svg += `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="#ccc" stroke-width="0.5"/>`;
    const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
    svg += `<text x="${x}" y="${top - 8}" text-anchor="middle" font-size="9" fill="#555">${label}</text>`;
  });

  // 테두리
  svg += `<rect x="${left}" y="${top}" width="${plotW}" height="${plotH}" fill="none" stroke="#999" stroke-width="1"/>`;

  // 축 레이블
  svg += `<text x="${left + plotW / 2}" y="${H - 4}" text-anchor="middle" font-size="10" fill="#333">주파수 (Hz)</text>`;
  svg += `<text transform="rotate(-90,12,${top + plotH / 2})" x="12" y="${top + plotH / 2}" text-anchor="middle" font-size="10" fill="#333">dB HL</text>`;

  // 데이터 포인트 그리기
  const drawEar = (
    thresholds: Partial<Record<TestFrequency, number>>,
    color: string,
    symbol: 'O' | 'X'
  ) => {
    const pts = freqs
      .filter(f => thresholds[f as TestFrequency] !== undefined)
      .map(f => ({ x: xPos(f), y: yPos(thresholds[f as TestFrequency]!) }));

    // 선
    if (pts.length > 1) {
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
      svg += `<path d="${d}" stroke="${color}" stroke-width="2" fill="none"/>`;
    }

    // 심볼
    pts.forEach(p => {
      if (symbol === 'O') {
        svg += `<circle cx="${p.x}" cy="${p.y}" r="6" fill="white" stroke="${color}" stroke-width="2"/>`;
      } else {
        const s = 5;
        svg += `<line x1="${p.x - s}" y1="${p.y - s}" x2="${p.x + s}" y2="${p.y + s}" stroke="${color}" stroke-width="2"/>`;
        svg += `<line x1="${p.x + s}" y1="${p.y - s}" x2="${p.x - s}" y2="${p.y + s}" stroke="${color}" stroke-width="2"/>`;
      }
    });
  };

  drawEar(result.right, '#e53935', 'O');
  drawEar(result.left,  '#1565C0', 'X');

  svg += '</svg>';
  return svg;
}

// ── 병원 검사지 스타일 HTML 생성 ─────────────────────────────────────
function buildPrintHtml(result: TestResult): string {
  const dateStr = new Date(result.date).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const rightPTA = getPTA(result.right);
  const leftPTA  = getPTA(result.left);
  const rightClass = rightPTA !== null ? classifyHL(rightPTA) : null;
  const leftClass  = leftPTA  !== null ? classifyHL(leftPTA)  : null;

  const audiogramSvg = buildAudiogramSvg(result);

  const tableRows = FREQUENCY_ORDER.map(freq => {
    const r = result.right[freq];
    const l = result.left[freq];
    return `
      <tr>
        <td>${FREQ_LABELS[freq]}</td>
        <td style="color:#c62828;font-weight:bold;">${r !== undefined ? r + ' dB' : '-'}</td>
        <td style="color:#1565c0;font-weight:bold;">${l !== undefined ? l + ' dB' : '-'}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>HICOG 청력검사 결과지</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; color: #1a1a1a; font-size: 12px; }
  .report { max-width: 170mm; margin: 0 auto; }

  /* 헤더 */
  .header { border-bottom: 3px solid #1a237e; padding-bottom: 10px; margin-bottom: 16px; display:flex; justify-content:space-between; align-items:flex-end; }
  .logo { font-size: 22px; font-weight: bold; color: #1a237e; letter-spacing:1px; }
  .sub-logo { font-size: 11px; color: #555; }
  .meta { text-align: right; font-size: 11px; color: #555; line-height: 1.8; }

  /* 섹션 제목 */
  h2 { font-size: 13px; color: #1a237e; border-left: 4px solid #1a237e; padding-left: 8px; margin: 16px 0 8px; }

  /* 오디오그램 */
  .audiogram-box { border: 1px solid #ddd; border-radius: 6px; padding: 10px; background: #fafafa; margin-bottom: 16px; }
  .legend { display: flex; gap: 24px; justify-content: center; font-size: 11px; margin-top: 6px; }
  .legend span { display: flex; align-items: center; gap: 4px; }

  /* 요약 카드 */
  .summary { display: flex; gap: 16px; margin-bottom: 16px; }
  .card { flex: 1; border: 2px solid #ddd; border-radius: 8px; padding: 12px; text-align: center; }
  .card.right { border-color: #e53935; }
  .card.left  { border-color: #1565c0; }
  .card .ear  { font-size: 13px; font-weight: bold; margin-bottom: 4px; }
  .card .pta  { font-size: 24px; font-weight: bold; color: #1a237e; }
  .card .cls  { font-size: 12px; font-weight: bold; margin-top: 4px; }

  /* 상세 표 */
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
  th { background: #1a237e; color: white; padding: 6px; text-align: center; }
  td { padding: 5px 8px; text-align: center; border-bottom: 1px solid #eee; }
  tr:nth-child(even) td { background: #f5f7ff; }

  /* 분류 기준 */
  .legend-table td { text-align: left; }

  /* 면책 조항 */
  .disclaimer { border: 1px solid #ffe082; background: #fff8e1; border-radius: 6px; padding: 10px; font-size: 11px; color: #5d4037; line-height: 1.8; margin-top: 16px; }

  /* 서명란 */
  .sign { margin-top: 20px; display: flex; justify-content: flex-end; }
  .sign-box { border-top: 1px solid #333; width: 120px; text-align: center; padding-top: 4px; font-size: 11px; color: #555; }

  @media print { button { display: none; } }
</style>
</head>
<body>
<div class="report">

  <!-- 헤더 -->
  <div class="header">
    <div>
      <div class="logo">HICOG 청력검사</div>
      <div class="sub-logo">Mobile Pure-Tone Audiometry System</div>
    </div>
    <div class="meta">
      <div>검사일: <strong>${dateStr}</strong></div>
      <div>검사 방법: 기도 순음 청력 검사 (Air Conduction)</div>
      <div>검사 장비: 모바일 자가 검사 (스크리닝)</div>
    </div>
  </div>

  <!-- 오디오그램 -->
  <h2>순음 청력도 (Audiogram)</h2>
  <div class="audiogram-box">
    ${audiogramSvg}
    <div class="legend">
      <span><svg width="28" height="14"><line x1="0" y1="7" x2="18" y2="7" stroke="#e53935" stroke-width="2"/><circle cx="22" cy="7" r="5" fill="white" stroke="#e53935" stroke-width="2"/></svg> 우측 귀 (O)</span>
      <span><svg width="28" height="14"><line x1="0" y1="7" x2="18" y2="7" stroke="#1565c0" stroke-width="2"/><line x1="17" y1="2" x2="27" y2="12" stroke="#1565c0" stroke-width="2"/><line x1="27" y1="2" x2="17" y2="12" stroke="#1565c0" stroke-width="2"/></svg> 좌측 귀 (X)</span>
    </div>
  </div>

  <!-- 요약 -->
  <h2>검사 요약 (순음 평균 청력, PTA 500~4000Hz)</h2>
  <div class="summary">
    <div class="card right">
      <div class="ear">🔴 우측 귀 (Right)</div>
      <div class="pta">${rightPTA !== null ? rightPTA + ' dB HL' : '-'}</div>
      ${rightClass ? `<div class="cls" style="color:${rightClass.color}">${rightClass.label}</div>` : ''}
    </div>
    <div class="card left">
      <div class="ear">🔵 좌측 귀 (Left)</div>
      <div class="pta">${leftPTA !== null ? leftPTA + ' dB HL' : '-'}</div>
      ${leftClass ? `<div class="cls" style="color:${leftClass.color}">${leftClass.label}</div>` : ''}
    </div>
  </div>

  <!-- 주파수별 상세 -->
  <h2>주파수별 청력 역치 (Frequency-Specific Thresholds)</h2>
  <table>
    <thead><tr><th>주파수</th><th style="color:#ffcdd2;">우측 귀 (dB HL)</th><th style="color:#bbdefb;">좌측 귀 (dB HL)</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>

  <!-- 난청 분류 -->
  <h2>난청 분류 기준 (WHO / ASHA 기준)</h2>
  <table class="legend-table">
    <thead><tr><th>역치 범위</th><th>분류</th><th>일상 영향</th></tr></thead>
    <tbody>
      <tr><td>≤ 25 dB HL</td><td style="color:#2e7d32;font-weight:bold;">정상 청력</td><td>일반적인 소리 인지 문제 없음</td></tr>
      <tr><td>26~40 dB HL</td><td style="color:#f57f17;font-weight:bold;">경도 난청</td><td>조용한 소리나 속삭임 놓칠 수 있음</td></tr>
      <tr><td>41~55 dB HL</td><td style="color:#e65100;font-weight:bold;">중도 난청</td><td>일상 대화 이해 어려움</td></tr>
      <tr><td>56~70 dB HL</td><td style="color:#bf360c;font-weight:bold;">중고도 난청</td><td>큰 목소리만 인지 가능</td></tr>
      <tr><td>71~90 dB HL</td><td style="color:#b71c1c;font-weight:bold;">고도 난청</td><td>매우 큰 소리에만 반응</td></tr>
      <tr><td>91+ dB HL</td><td style="color:#880e4f;font-weight:bold;">심도 난청</td><td>소리 진동 위주로 인지</td></tr>
    </tbody>
  </table>

  <!-- 면책 조항 -->
  <div class="disclaimer">
    ⚠️ <strong>주의사항:</strong> 본 검사 결과는 모바일 기기를 이용한 자가 청력 스크리닝 결과로,
    방음 부스를 갖춘 임상 환경에서 청각 전문가(Audiologist)가 수행하는 공식 순음 청력 검사를 대체할 수 없습니다.
    이상 소견이 있거나 청력 저하, 이명, 귀 통증이 느껴지는 경우 이비인후과 전문의를 방문하시기 바랍니다.
  </div>

  <!-- 서명란 -->
  <div class="sign">
    <div class="sign-box">검사자 확인<br><br></div>
  </div>

</div>

<script>
  // 자동 인쇄 다이얼로그 (PDF 저장 선택 가능)
  window.onload = function() { window.print(); };
</script>
</body>
</html>`;
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────
export const ResultScreen: React.FC<Props> = ({ navigation, route }) => {
  const { result } = route.params;
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = Math.min(screenWidth - 80, 340);

  const rightPTA = getPTA(result.right);
  const leftPTA  = getPTA(result.left);
  const rightClass = rightPTA !== null ? classifyHL(rightPTA) : null;
  const leftClass  = leftPTA  !== null ? classifyHL(leftPTA)  : null;

  const handleExportPdf = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const html = buildPrintHtml(result);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const win  = window.open(url, '_blank');
      if (win) win.focus();
    } else {
      alert('PDF 내보내기는 웹 환경에서 지원됩니다.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>검사 결과</Text>
      <Text style={styles.date}>
        {new Date(result.date).toLocaleDateString('ko-KR', {
          year: 'numeric', month: 'long', day: 'numeric'
        })}
      </Text>

      {/* Audiogram */}
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

      {/* Detail table */}
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

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          ⚠️ 본 결과는 임상적 스크리닝 목적이며, 이비인후과 전문의의 공식 진단을 대체하지 않습니다. 이상 소견이 있으면 전문 의료 기관을 방문하세요.
        </Text>
      </View>

      {/* Buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.pdfButton} onPress={handleExportPdf}>
          <Text style={styles.pdfButtonText}>📄 PDF 저장</Text>
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
    backgroundColor: 'white', borderRadius: 16, padding: 16, alignItems: 'center',
    marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  summaryCard: {
    flex: 1, backgroundColor: 'white', borderRadius: 16, padding: 16, alignItems: 'center',
    borderWidth: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  summaryEar:   { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  summaryPTA:   { fontSize: 28, fontWeight: 'bold', color: '#1a237e', marginBottom: 4 },
  summaryLabel: { fontSize: 13, fontWeight: '600' },
  tableCard: {
    backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  tableTitle:      { fontSize: 15, fontWeight: 'bold', color: '#1a237e', marginBottom: 12 },
  tableHeader:     { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: '#e0e0e0' },
  tableHeaderText: { fontWeight: 'bold', color: '#37474f' },
  tableRow:        { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  tableCell:       { flex: 1, textAlign: 'center', fontSize: 14, color: '#37474f' },
  disclaimer: {
    backgroundColor: '#fff8e1', borderRadius: 12, padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: '#ffe082',
  },
  disclaimerText: { fontSize: 12, color: '#5d4037', lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: 12 },
  pdfButton: {
    flex: 1, backgroundColor: '#1a237e', borderRadius: 14, padding: 16, alignItems: 'center',
  },
  pdfButtonText: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  retestButton: {
    flex: 1, backgroundColor: '#1976D2', borderRadius: 14, padding: 16, alignItems: 'center',
  },
  retestButtonText: { color: 'white', fontSize: 15, fontWeight: 'bold' },
});
