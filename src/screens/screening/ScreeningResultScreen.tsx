import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions,
  ActivityIndicator, Platform
} from 'react-native';
import { ScreeningResult, ScreeningScores, RiskLevel } from '../../types/screening';
import { UserProfile } from '../../types';
import { scoreScreening } from '../../engine/screening/ScreeningScorer';
import { SpectrumChart } from '../../components/SpectrumChart';
import { ZScoreBar } from '../../components/ZScoreBar';
import { RTDistributionChart } from '../../components/RTDistributionChart';
import { StaircaseChart } from '../../components/StaircaseChart';
import { generateScreeningAnalysis, checkOllamaAvailable } from '../../services/ollamaService';

interface Props {
  navigation: any;
  route: { params: { result: ScreeningResult; user?: UserProfile } };
}

const C = {
  bg:         '#0a1628',
  bgCard:     '#0f1f3d',
  accentBlue: '#1e88e5',
  accentCyan: '#00b8d4',
  accentPurple: '#7c4dff',
  success:    '#00c853',
  warning:    '#ffd740',
  danger:     '#ff5252',
  textWhite:  '#ffffff',
  textMuted:  '#78909c',
  textDim:    '#455a64',
};

const LEVEL_STYLE: Record<RiskLevel, { label: string; color: string; bg: string }> = {
  low:      { label: '낮음 (Low)', color: C.success, bg: 'rgba(0,200,83,0.12)' },
  moderate: { label: '중간 (Moderate)', color: C.warning, bg: 'rgba(255,215,64,0.12)' },
  high:     { label: '높음 (High)', color: C.danger, bg: 'rgba(255,82,82,0.12)' },
};

const screenW = Dimensions.get('window').width;
const chartSize = Math.min(screenW - 48, 360);
const smallChartW = Math.min(screenW - 64, 320);

export const ScreeningResultScreen: React.FC<Props> = ({ navigation, route }) => {
  const { result, user } = route.params;

  const scores: ScreeningScores = useMemo(
    () => scoreScreening(result, user?.age),
    [result, user?.age]
  );

  // AI 분석 상태
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState<string | null>(null);

  // Ollama AI 분석 실행
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAiLoading(true);
      setAiError(null);

      const available = await checkOllamaAvailable();
      if (!available) {
        setAiError('분석 서버에 연결할 수 없습니다. 기본 분석을 표시합니다.');
      }

      try {
        const text = await generateScreeningAnalysis(
          result, scores, user,
          (chunk) => { if (!cancelled) setAiText(chunk); }
        );
        if (!cancelled) {
          setAiText(text);
          setAiLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setAiError(err.message);
          setAiLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const adhdStyle = LEVEL_STYLE[scores.adhdLevel];
  const dysStyle  = LEVEL_STYLE[scores.dyslexiaLevel];

  // PDF 저장
  const handleExportPdf = useCallback(() => {
    const html = buildScreeningPdfHtml(result, scores, user, aiText);
    try {
      const w = window.open('', '_blank', 'width=900,height=700');
      if (w) {
        w.document.write(html);
        w.document.close();
      } else {
        // 팝업 차단 시 파일 다운로드
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `HICOG_스크리닝_${new Date().toISOString().slice(0, 10)}.html`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.warn('PDF export error:', e);
    }
  }, [result, scores, user, aiText]);

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      {/* 헤더 */}
      <View style={s.header}>
        <Text style={s.headerTitle}>ADHD / 난독증 스크리닝 결과</Text>
        {user?.name && <Text style={s.headerSub}>{user.name} ({user.age}세, {user.gender === 'male' ? '남' : user.gender === 'female' ? '여' : '기타'})</Text>}
        <Text style={s.headerDate}>{new Date(result.date).toLocaleDateString('ko-KR')}</Text>
      </View>

      {/* ═══════ 2D 스펙트럼 차트 ═══════ */}
      <View style={s.card}>
        <Text style={s.cardTitle}>2D 인지-청각 스펙트럼</Text>
        <View style={s.chartContainer}>
          <SpectrumChart
            pADHD={scores.pADHD}
            pDyslexia={scores.pDyslexia}
            ehfFlag={scores.ehfFlag}
            width={chartSize}
            height={chartSize}
          />
        </View>
      </View>

      {/* ═══════ EHF 필터 경고 ═══════ */}
      {scores.ehfFlag && (
        <View style={[s.card, s.warningCard]}>
          <Text style={s.warningIcon}>&#9888;</Text>
          <Text style={s.warningTitle}>확장 고주파 난청 감지</Text>
          <Text style={s.warningText}>
            고주파수 대역(10~16kHz) 청력 저하가 감지되었습니다 (Risk: {(scores.riskEHF * 100).toFixed(0)}%).
            {'\n'}숨은 난청으로 인한 청취 노력 증가가 ADHD 유사 증상을 유발할 수 있습니다.
          </Text>
        </View>
      )}

      {/* ═══════ ADHD 위험도 ═══════ */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>ADHD 위험도</Text>
          <View style={[s.levelBadge, { backgroundColor: adhdStyle.bg }]}>
            <Text style={[s.levelText, { color: adhdStyle.color }]}>{adhdStyle.label}</Text>
          </View>
        </View>
        <View style={s.percentRow}>
          <Text style={[s.percentValue, { color: adhdStyle.color }]}>
            {(scores.pADHD * 100).toFixed(1)}%
          </Text>
        </View>

        <Text style={s.sectionLabel}>핵심 지표</Text>
        <ZScoreBar
          label="RT τ (주의력 일탈)"
          value={result.cpt.rtTau} zScore={scores.zScores.rtTau} unit="ms"
          description="반응 시간 분포의 우측 꼬리 길이입니다. 값이 클수록 집중이 간헐적으로 끊기는 '주의력 일탈'이 자주 발생함을 의미합니다."
        />
        <ZScoreBar
          label="오경보율 (FPR)"
          value={result.cpt.falsePositiveRate} zScore={scores.zScores.fpr}
          description="소리가 나지 않았는데 버튼을 누른 비율입니다. 높을수록 충동적 반응 억제 능력이 저하되어 있음을 시사합니다."
        />
        <ZScoreBar
          label="누락률 (OER)"
          value={result.cpt.omissionRate} zScore={scores.zScores.oer}
          description="소리가 났는데 반응하지 못한 비율입니다. 높을수록 지속적 주의력 유지에 어려움이 있음을 의미합니다."
        />

        <View style={s.detailGrid}>
          <DetailBox label="평균 RT" value={`${result.cpt.rtMean}ms`} desc="전체 반응의 평균 속도" />
          <DetailBox label="RT σ" value={`${result.cpt.rtStd}ms`} desc="반응 시간의 흔들림 폭" />
          <DetailBox label="RT μ" value={`${result.cpt.rtMu}ms`} desc="기본 감각-운동 처리 속도" />
          <DetailBox label="총 시행" value={`${result.cpt.totalTrials}회`} desc="검사에 사용된 총 문항 수" />
        </View>
      </View>

      {/* ═══════ RT 분포 히스토그램 ═══════ */}
      <View style={s.card}>
        <Text style={s.cardTitle}>반응 시간 분포 (Ex-Gaussian)</Text>
        <View style={s.chartContainer}>
          <RTDistributionChart
            allRTs={result.cpt.allRTs}
            mu={result.cpt.rtMu}
            sigma={result.cpt.rtSigma}
            tau={result.cpt.rtTau}
            width={smallChartW}
            height={200}
          />
        </View>
        <Text style={s.chartNote}>
          빨간 영역(μ+τ 이후)은 주의력 일탈(Attention Lapse) 구간입니다.
          이 구간의 비중이 높을수록 ADHD 위험이 증가합니다.
        </Text>
      </View>

      {/* ═══════ 난독증 위험도 ═══════ */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>난독증 위험도</Text>
          <View style={[s.levelBadge, { backgroundColor: dysStyle.bg }]}>
            <Text style={[s.levelText, { color: dysStyle.color }]}>{dysStyle.label}</Text>
          </View>
        </View>
        <View style={s.percentRow}>
          <Text style={[s.percentValue, { color: dysStyle.color }]}>
            {(scores.pDyslexia * 100).toFixed(1)}%
          </Text>
        </View>

        <Text style={s.sectionLabel}>주파수 변별 (DLF)</Text>
        <ZScoreBar
          label="DLF 1kHz"
          value={result.dlf.dlf1k} zScore={scores.zScores.dlf1k} unit="%"
          description="1kHz 기준으로 두 음의 높낮이 차이를 구별할 수 있는 최소 주파수 차이입니다. 값이 클수록 미세한 음 높이 변화를 감지하기 어렵다는 뜻입니다."
        />
        <ZScoreBar
          label="DLF 6kHz"
          value={result.dlf.dlf6k} zScore={scores.zScores.dlf6k} unit="%"
          description="6kHz 고주파 대역의 주파수 변별력입니다. 1kHz와 함께 두 대역 모두 저하되면 전반적 감각 표상 체계 결함을 시사합니다."
        />

        <Text style={s.sectionLabel}>시간 해상도 (GDT)</Text>
        <ZScoreBar
          label="간격 탐지 임계치"
          value={result.gdt.gdt} zScore={scores.zScores.gdt} unit="ms"
          description="소음 속 짧은 침묵(끊김)을 감지할 수 있는 최소 시간입니다. 값이 클수록 빠르게 변하는 말소리의 시간 패턴을 분절하는 능력이 저하되어 있습니다."
        />
      </View>

      {/* ═══════ 계단법 수렴 차트 ═══════ */}
      <View style={s.card}>
        <Text style={s.cardTitle}>적응형 계단법 수렴 과정</Text>
        <View style={s.chartContainer}>
          <StaircaseChart
            reversals={result.dlf.staircase1k}
            threshold={result.dlf.dlf1k}
            label="DLF 1kHz"
            unit="%"
            color="#7c4dff"
            width={smallChartW}
          />
          <StaircaseChart
            reversals={result.dlf.staircase6k}
            threshold={result.dlf.dlf6k}
            label="DLF 6kHz"
            unit="%"
            color="#1e88e5"
            width={smallChartW}
          />
          <StaircaseChart
            reversals={result.gdt.staircaseHistory}
            threshold={result.gdt.gdt}
            label="GDT (간격 탐지)"
            unit="ms"
            color="#26c6da"
            width={smallChartW}
          />
        </View>
      </View>

      {/* ═══════ EHFA 결과 ═══════ */}
      <View style={s.card}>
        <Text style={s.cardTitle}>확장 고주파 청력 (EHFA)</Text>
        <View style={s.ehfGrid}>
          {([10000, 12500, 16000] as const).map(freq => {
            const val = result.ehfa.thresholds[freq];
            return (
              <View key={freq} style={s.ehfItem}>
                <Text style={s.ehfFreq}>{freq / 1000}kHz</Text>
                <Text style={[s.ehfValue, val !== undefined && val > 25 ? { color: C.danger } : {}]}>
                  {val !== undefined ? `${val} dB` : 'N/A'}
                </Text>
              </View>
            );
          })}
          <View style={s.ehfItem}>
            <Text style={s.ehfFreq}>PTA_EHF</Text>
            <Text style={[s.ehfValue, result.ehfa.ptaEHF > 25 ? { color: C.danger } : {}]}>
              {result.ehfa.ptaEHF} dB
            </Text>
          </View>
        </View>
      </View>

      {/* ═══════ 종합 분석 ═══════ */}
      <View style={[s.card, s.aiCard]}>
        <View style={s.aiHeader}>
          <Text style={s.cardTitle}>종합 분석 보고</Text>
        </View>
        {aiError && (
          <View style={s.aiErrorBanner}>
            <Text style={s.aiErrorText}>{aiError}</Text>
          </View>
        )}
        {aiLoading && !aiText ? (
          <View style={s.aiLoadingRow}>
            <ActivityIndicator size="small" color={C.accentCyan} />
            <Text style={s.aiLoadingText}>분석 보고서 생성 중...</Text>
          </View>
        ) : (
          <FormattedAnalysis text={aiText} />
        )}
        {aiLoading && aiText.length > 0 && (
          <View style={s.aiStreamingDot}>
            <Text style={s.aiStreamingText}>생성 중...</Text>
          </View>
        )}
      </View>

      {/* ═══════ 권고사항 ═══════ */}
      <View style={s.card}>
        <Text style={s.cardTitle}>권고사항</Text>
        {scores.recommendations.map((rec, i) => (
          <View key={i} style={s.recRow}>
            <Text style={s.recBullet}>•</Text>
            <Text style={s.recText}>{rec}</Text>
          </View>
        ))}
      </View>

      {/* ═══════ 면책 조항 ═══════ */}
      <View style={[s.card, s.disclaimerCard]}>
        <Text style={s.disclaimerTitle}>주의사항</Text>
        <Text style={s.disclaimerText}>
          본 검사는 ADHD 및 난독증의 스크리닝(선별) 목적으로만 사용되며, 확정 진단을 위한 것이 아닙니다.
          결과는 전문 의료기관의 종합적인 신경심리 평가를 대체할 수 없습니다.
        </Text>
      </View>

      {/* ═══════ 버튼 영역 ═══════ */}
      {Platform.OS === 'web' && (
        <TouchableOpacity style={s.pdfBtn} onPress={handleExportPdf} activeOpacity={0.8}>
          <Text style={s.pdfBtnText}>PDF 저장 / 인쇄</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={s.homeBtn}
        onPress={() => navigation.navigate('Home')}
        activeOpacity={0.8}
      >
        <Text style={s.homeBtnText}>홈으로 돌아가기</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

// ── 보조 컴포넌트 ──
const DetailBox: React.FC<{ label: string; value: string; desc?: string }> = ({ label, value, desc }) => (
  <View style={s.detailBox}>
    <Text style={s.detailLabel}>{label}</Text>
    <Text style={s.detailValue}>{value}</Text>
    {desc && <Text style={s.detailDesc}>{desc}</Text>}
  </View>
);

/**
 * AI/규칙 기반 분석 텍스트를 파싱하여
 * 섹션 제목, 본문, 항목으로 구조화된 카드로 렌더링한다.
 * Markdown 특수문자(**, ##, ---)를 제거하고 깔끔하게 표시.
 */
const FormattedAnalysis: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;

  // ** 특수문자 제거, ## 제목 파싱
  const cleaned = text
    .replace(/\*\*/g, '')     // ** 제거
    .replace(/\*/g, '')       // * 제거
    .replace(/_{2,}/g, '')    // __ 제거
    .replace(/`/g, '');       // ` 제거

  const lines = cleaned.split('\n');
  const elements: React.ReactNode[] = [];
  let sectionIndex = 0;

  const sectionColors: Record<number, string> = {
    0: '#4fc3f7', // 요약 - 하늘
    1: '#ff8a65', // ADHD - 주황
    2: '#ce93d8', // 난독증 - 보라
    3: '#4db6ac', // 청력 - 청록
    4: '#ffd54f', // 종합 - 노랑
    5: '#81c784', // 권고 - 초록
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === '---') continue;

    // ## 섹션 제목
    if (line.startsWith('## ')) {
      const title = line.replace(/^##\s*/, '');
      const accentColor = sectionColors[sectionIndex % 6] || '#78909c';
      sectionIndex++;
      elements.push(
        <View key={`h-${i}`} style={fa.sectionHeader}>
          <View style={[fa.sectionAccent, { backgroundColor: accentColor }]} />
          <Text style={[fa.sectionTitle, { color: accentColor }]}>{title}</Text>
        </View>
      );
      continue;
    }

    // 번호 목록 (1. 2. 3. ...)
    const numMatch = line.match(/^(\d+)\.\s*(.+)/);
    if (numMatch) {
      elements.push(
        <View key={`n-${i}`} style={fa.numRow}>
          <View style={fa.numBadge}>
            <Text style={fa.numText}>{numMatch[1]}</Text>
          </View>
          <Text style={fa.itemText}>{numMatch[2]}</Text>
        </View>
      );
      continue;
    }

    // 대시 목록 (- )
    if (line.startsWith('- ')) {
      elements.push(
        <View key={`d-${i}`} style={fa.dashRow}>
          <Text style={fa.dashDot}>{'  \u25B8  '}</Text>
          <Text style={fa.itemText}>{line.slice(2)}</Text>
        </View>
      );
      continue;
    }

    // 경고/면책 (⚠)
    if (line.includes('\u26A0') || line.includes('주의사항') || line.includes('면책')) {
      elements.push(
        <View key={`w-${i}`} style={fa.warnBox}>
          <Text style={fa.warnText}>{line}</Text>
        </View>
      );
      continue;
    }

    // 일반 본문
    elements.push(
      <Text key={`p-${i}`} style={fa.paragraph}>{line}</Text>
    );
  }

  return <View style={fa.container}>{elements}</View>;
};

const fa = StyleSheet.create({
  container: { gap: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  sectionAccent: { width: 4, height: 18, borderRadius: 2, marginRight: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  paragraph: { color: '#b0bec5', fontSize: 13, lineHeight: 22, marginBottom: 6 },
  numRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, paddingLeft: 4 },
  numBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(99,102,241,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 1 },
  numText: { color: '#818cf8', fontSize: 11, fontWeight: '700' },
  dashRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4, paddingLeft: 8 },
  dashDot: { color: '#4fc3f7', fontSize: 12, marginRight: 2, marginTop: 1 },
  itemText: { color: '#cfd8dc', fontSize: 13, lineHeight: 21, flex: 1 },
  warnBox: { backgroundColor: 'rgba(255,152,0,0.08)', borderLeftWidth: 3, borderLeftColor: '#ff9800', borderRadius: 6, padding: 12, marginTop: 8 },
  warnText: { color: '#ffb74d', fontSize: 12, lineHeight: 20 },
});

// ══════════════════════════════════════════════════════════════
// ── PDF HTML 생성 ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

function zBarHtml(label: string, value: string, z: number, maxZ = 3): string {
  const pct = Math.min(100, Math.max(0, ((z + maxZ) / (2 * maxZ)) * 100));
  const color = z > 2 ? '#e53935' : z > 1 ? '#ff9800' : z > 0 ? '#fdd835' : '#43a047';
  const zLabel = z >= 0 ? `+${z.toFixed(1)}` : z.toFixed(1);
  return `<div class="zbar-row">
    <div class="zbar-label">${label}</div>
    <div class="zbar-value">${value}</div>
    <div class="zbar-track"><div class="zbar-normal"></div><div class="zbar-center"></div><div class="zbar-dot" style="left:${pct}%;background:${color}"></div></div>
    <div class="zbar-z" style="color:${color}">Z=${zLabel}</div>
  </div>`;
}

function riskGaugeHtml(label: string, pct: number, level: string): string {
  const color = level === 'high' ? '#e53935' : level === 'moderate' ? '#ff9800' : '#43a047';
  const bg = level === 'high' ? '#ffebee' : level === 'moderate' ? '#fff8e1' : '#e8f5e9';
  const levelKo = level === 'high' ? '높음' : level === 'moderate' ? '중간' : '낮음';
  const deg = Math.min(180, (pct / 100) * 180);
  return `<div class="gauge-box" style="background:${bg}">
    <svg viewBox="0 0 120 70" class="gauge-svg">
      <path d="M10 65 A50 50 0 0 1 110 65" fill="none" stroke="#e0e0e0" stroke-width="8" stroke-linecap="round"/>
      <path d="M10 65 A50 50 0 0 1 110 65" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${deg * 1.745} 999" opacity="0.8"/>
      <text x="60" y="52" text-anchor="middle" font-size="22" font-weight="800" fill="${color}">${pct.toFixed(0)}%</text>
      <text x="60" y="67" text-anchor="middle" font-size="9" fill="#666">${levelKo}</text>
    </svg>
    <div class="gauge-label">${label}</div>
  </div>`;
}

function buildScreeningPdfHtml(
  result: ScreeningResult,
  scores: ScreeningScores,
  user?: UserProfile,
  aiAnalysis?: string,
): string {
  const date = new Date(result.date).toLocaleDateString('ko-KR');
  const name = user?.name || '미지정';
  const age = user?.age || '-';
  const gender = user?.gender === 'male' ? '남성' : user?.gender === 'female' ? '여성' : '기타';
  const ehfPct = (scores.riskEHF * 100).toFixed(1);

  const aiHtml = aiAnalysis
    ? aiAnalysis
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/`/g, '')
        .replace(/\n/g, '<br>')
        .replace(/##\s*(.*?)(<br>|$)/g, '<h3>$1</h3>')
        .replace(/^(\d+)\.\s*/gm, '<span style="display:inline-block;width:22px;height:22px;border-radius:11px;background:#ede9fe;color:#6366f1;text-align:center;line-height:22px;font-weight:700;font-size:11px;margin-right:8px;">$1</span>')
        .replace(/^- /gm, '<span style="color:#6366f1;margin-right:6px;">\u25B8</span>')
    : '<p style="color:#aaa;font-style:italic;">분석 데이터 없음</p>';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HICOG ADHD/난독증 스크리닝 보고서</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;900&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Noto Sans KR',sans-serif; background:#f0f2f5; color:#1a1a2e; line-height:1.6; }
  .page { max-width:860px; margin:0 auto; padding:32px 24px; }

  /* ── Header ── */
  .header { background:linear-gradient(135deg,#0f0c29,#302b63,#24243e); color:#fff; padding:40px 36px; border-radius:20px; position:relative; overflow:hidden; margin-bottom:28px; }
  .header::before { content:''; position:absolute; top:-40px; right:-40px; width:200px; height:200px; background:radial-gradient(circle,rgba(99,102,241,0.3),transparent); border-radius:50%; }
  .header::after { content:''; position:absolute; bottom:-60px; left:-30px; width:180px; height:180px; background:radial-gradient(circle,rgba(16,185,129,0.2),transparent); border-radius:50%; }
  .header-content { position:relative; z-index:1; }
  .logo-row { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
  .logo-icon { width:36px; height:36px; background:rgba(255,255,255,0.15); border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px; }
  .header h1 { font-size:24px; font-weight:700; letter-spacing:-0.5px; }
  .header-sub { font-size:13px; opacity:0.7; margin-bottom:20px; }
  .meta-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
  .meta-item { background:rgba(255,255,255,0.08); border-radius:10px; padding:10px 14px; backdrop-filter:blur(4px); }
  .meta-label { font-size:10px; opacity:0.6; text-transform:uppercase; letter-spacing:1px; }
  .meta-val { font-size:15px; font-weight:600; margin-top:2px; }

  /* ── Cards ── */
  .card { background:#fff; border-radius:16px; padding:24px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.03); border:1px solid rgba(0,0,0,0.04); }
  .card-title { font-size:15px; font-weight:700; color:#302b63; margin-bottom:16px; padding-bottom:10px; border-bottom:2px solid #ede9fe; display:flex; align-items:center; gap:8px; }
  .card-title .icon { width:24px; height:24px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; font-size:13px; color:#fff; }

  /* ── Gauge ── */
  .gauge-row { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px; }
  .gauge-box { border-radius:16px; padding:20px; text-align:center; }
  .gauge-svg { width:140px; height:80px; }
  .gauge-label { font-size:13px; font-weight:600; color:#555; margin-top:4px; }

  /* ── Z-bar ── */
  .zbar-row { display:grid; grid-template-columns:140px 80px 1fr 60px; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid #f5f5f5; }
  .zbar-label { font-size:12px; font-weight:500; color:#444; }
  .zbar-value { font-size:12px; font-weight:700; color:#1a1a2e; text-align:right; }
  .zbar-track { height:10px; background:#f0f0f0; border-radius:5px; position:relative; overflow:visible; }
  .zbar-normal { position:absolute; left:33.3%; width:33.3%; height:100%; background:rgba(67,160,71,0.1); border-radius:5px; }
  .zbar-center { position:absolute; left:50%; width:1px; height:100%; background:#ccc; }
  .zbar-dot { position:absolute; top:-1px; width:12px; height:12px; border-radius:6px; margin-left:-6px; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.2); }
  .zbar-z { font-size:11px; font-weight:700; text-align:right; }

  /* ── Tables ── */
  table { width:100%; border-collapse:separate; border-spacing:0; font-size:12px; border-radius:10px; overflow:hidden; border:1px solid #e8e8e8; }
  th { background:linear-gradient(135deg,#f8f9ff,#f0f1ff); color:#302b63; font-weight:600; padding:10px 14px; text-align:center; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; }
  td { padding:10px 14px; text-align:center; border-top:1px solid #f0f0f0; }
  tr:hover td { background:#fafbff; }
  .status-ok { color:#43a047; font-weight:600; }
  .status-warn { color:#e53935; font-weight:600; }

  /* ── AI Section ── */
  .ai-box { background:linear-gradient(135deg,#faf5ff,#f3e8ff); border-left:4px solid #7c3aed; border-radius:0 12px 12px 0; padding:20px; line-height:1.9; font-size:13px; color:#333; }
  .ai-box h3 { color:#5b21b6; font-size:14px; margin:16px 0 6px; font-weight:700; }
  .no-data { color:#aaa; font-style:italic; }

  /* ── Recommendations ── */
  .rec-list { list-style:none; padding:0; }
  .rec-list li { padding:10px 14px; margin-bottom:6px; background:#f8fafc; border-radius:8px; border-left:3px solid #6366f1; font-size:13px; line-height:1.6; }

  /* ── Disclaimer ── */
  .disclaimer { background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:16px 20px; font-size:11px; color:#92400e; line-height:1.7; }
  .disclaimer strong { color:#b45309; }

  /* ── Footer ── */
  .footer { text-align:center; padding:24px; color:#aaa; font-size:10px; border-top:1px solid #eee; margin-top:20px; }
  .footer .brand { font-weight:700; color:#6366f1; font-size:11px; }

  /* ── Print ── */
  .print-actions { text-align:center; margin:24px 0; }
  .btn { display:inline-block; padding:12px 36px; border:none; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; }
  .btn-primary { background:linear-gradient(135deg,#6366f1,#4f46e5); color:#fff; box-shadow:0 4px 12px rgba(99,102,241,0.3); }
  .btn-primary:hover { transform:translateY(-1px); box-shadow:0 6px 16px rgba(99,102,241,0.4); }
  @media print { .print-actions{display:none;} body{background:#fff;} .card{box-shadow:none;border:1px solid #ddd;} .header{-webkit-print-color-adjust:exact;print-color-adjust:exact;} }
</style>
</head>
<body>
<div class="page">

<!-- Header -->
<div class="header">
  <div class="header-content">
    <div class="logo-row">
      <div class="logo-icon">&#x1F9E0;</div>
      <h1>ADHD / 난독증 스크리닝 보고서</h1>
    </div>
    <div class="header-sub">HICOG Pure-Tone Audiometry Based Cognitive-Auditory Screening Report</div>
    <div class="meta-grid">
      <div class="meta-item"><div class="meta-label">이름</div><div class="meta-val">${name}</div></div>
      <div class="meta-item"><div class="meta-label">나이</div><div class="meta-val">${age}세</div></div>
      <div class="meta-item"><div class="meta-label">성별</div><div class="meta-val">${gender}</div></div>
      <div class="meta-item"><div class="meta-label">검사일</div><div class="meta-val">${date}</div></div>
    </div>
  </div>
</div>

<!-- Risk Gauges -->
<div class="gauge-row">
  ${riskGaugeHtml('ADHD 위험도', scores.pADHD * 100, scores.adhdLevel)}
  ${riskGaugeHtml('난독증 위험도', scores.pDyslexia * 100, scores.dyslexiaLevel)}
</div>

<!-- CPT -->
<div class="card">
  <div class="card-title"><span class="icon" style="background:#f59e0b">&#x26A1;</span> 주의력 검사 (CPT)</div>
  ${zBarHtml('RT τ (주의력 일탈)', `${result.cpt.rtTau}ms`, scores.zScores.rtTau)}
  ${zBarHtml('오경보율 (FPR)', `${(result.cpt.falsePositiveRate*100).toFixed(1)}%`, scores.zScores.fpr)}
  ${zBarHtml('누락률 (OER)', `${(result.cpt.omissionRate*100).toFixed(1)}%`, scores.zScores.oer)}
  ${zBarHtml('평균 반응시간', `${result.cpt.rtMean}ms`, scores.zScores.rtMean)}
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px;">
    <div style="background:#f8f9ff;border-radius:8px;padding:8px 12px;text-align:center"><div style="font-size:10px;color:#888">μ (기본속도)</div><div style="font-size:16px;font-weight:700">${result.cpt.rtMu}ms</div></div>
    <div style="background:#f8f9ff;border-radius:8px;padding:8px 12px;text-align:center"><div style="font-size:10px;color:#888">σ (변동성)</div><div style="font-size:16px;font-weight:700">${result.cpt.rtStd}ms</div></div>
    <div style="background:#f8f9ff;border-radius:8px;padding:8px 12px;text-align:center"><div style="font-size:10px;color:#888">총 시행</div><div style="font-size:16px;font-weight:700">${result.cpt.totalTrials}회</div></div>
  </div>
</div>

<!-- DLF + GDT -->
<div class="card">
  <div class="card-title"><span class="icon" style="background:#7c3aed">&#x1F3B5;</span> 주파수 변별 (DLF) 및 간격 탐지 (GDT)</div>
  ${zBarHtml('DLF 1kHz', `${result.dlf.dlf1k.toFixed(1)}%`, scores.zScores.dlf1k)}
  ${zBarHtml('DLF 6kHz', `${result.dlf.dlf6k.toFixed(1)}%`, scores.zScores.dlf6k)}
  ${zBarHtml('간격 탐지 (GDT)', `${result.gdt.gdt.toFixed(1)}ms`, scores.zScores.gdt)}
</div>

<!-- EHFA -->
<div class="card">
  <div class="card-title"><span class="icon" style="background:#0891b2">&#x1F50A;</span> 확장 고주파 청력 (EHFA)</div>
  <table>
    <tr><th>주파수</th><th>역치 (dB HL)</th><th>판정</th></tr>
    <tr><td>10 kHz</td><td>${result.ehfa.thresholds[10000] ?? 'N/A'}</td><td class="${(result.ehfa.thresholds[10000]??0)>25?'status-warn':'status-ok'}">${(result.ehfa.thresholds[10000]??0)>25?'저하':'정상'}</td></tr>
    <tr><td>12.5 kHz</td><td>${result.ehfa.thresholds[12500] ?? 'N/A'}</td><td class="${(result.ehfa.thresholds[12500]??0)>25?'status-warn':'status-ok'}">${(result.ehfa.thresholds[12500]??0)>25?'저하':'정상'}</td></tr>
    <tr><td>16 kHz</td><td>${result.ehfa.thresholds[16000] ?? 'N/A'}</td><td class="${(result.ehfa.thresholds[16000]??0)>25?'status-warn':'status-ok'}">${(result.ehfa.thresholds[16000]??0)>25?'저하':'정상'}</td></tr>
    <tr style="font-weight:700"><td>PTA_EHF</td><td>${result.ehfa.ptaEHF} dB</td><td class="${result.ehfa.ptaEHF>25?'status-warn':'status-ok'}">${result.ehfa.ptaEHF>25?'숨은 난청 위험':'정상'}</td></tr>
  </table>
  <div style="margin-top:8px;font-size:11px;color:#888;">숨은 난청 위험도: ${ehfPct}%</div>
</div>

<!-- AI Analysis -->
<div class="card">
  <div class="card-title"><span class="icon" style="background:#7c3aed">&#x1F4CB;</span> 종합 분석 보고</div>
  <div class="ai-box">${aiHtml}</div>
</div>

<!-- Recommendations -->
<div class="card">
  <div class="card-title"><span class="icon" style="background:#059669">&#x2705;</span> 권고사항</div>
  <ul class="rec-list">
    ${scores.recommendations.map(r => `<li>${r}</li>`).join('\n    ')}
  </ul>
</div>

<!-- Disclaimer -->
<div class="disclaimer">
  <strong>&#x26A0; 주의사항:</strong> 본 검사는 ADHD 및 난독증의 스크리닝(선별) 목적으로만 사용되며, 확정 진단을 위한 것이 아닙니다.
  결과는 전문 의료기관의 종합적인 신경심리 평가를 대체할 수 없습니다.
  검사 환경(소음, 이어폰 품질, 기기 성능)에 따라 결과가 영향받을 수 있습니다.
</div>

<!-- Footer -->
<div class="footer">
  <div class="brand">HICOG</div>
  Hearing Intelligence Cognitive Screening System v1.0<br>
  Generated: ${new Date().toISOString().slice(0,19).replace('T',' ')}
</div>

<!-- Print Button -->
<div class="print-actions">
  <button class="btn btn-primary" onclick="window.print()">&#x1F5A8; 인쇄 / PDF 저장</button>
</div>

</div><!-- .page -->

<script>
if (!/Mobile|Android|iPhone/i.test(navigator.userAgent)) {
  setTimeout(() => window.print(), 1000);
}
</script>
</body>
</html>`;
}

// ── 스타일 ──
const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },

  header: { alignItems: 'center', marginBottom: 20, paddingTop: 8 },
  headerTitle: { color: C.textWhite, fontSize: 20, fontWeight: '700' },
  headerSub: { color: C.textMuted, fontSize: 14, marginTop: 4 },
  headerDate: { color: C.textDim, fontSize: 12, marginTop: 2 },

  card: { backgroundColor: C.bgCard, borderRadius: 16, padding: 20, marginBottom: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { color: C.textWhite, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  chartContainer: { alignItems: 'center', marginVertical: 8 },
  chartNote: { color: C.textDim, fontSize: 11, lineHeight: 16, marginTop: 8, textAlign: 'center' },

  levelBadge: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 12 },
  levelText: { fontSize: 13, fontWeight: '700' },
  percentRow: { alignItems: 'center', marginBottom: 16 },
  percentValue: { fontSize: 36, fontWeight: '800' },

  sectionLabel: { color: C.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 12, textTransform: 'uppercase', letterSpacing: 1 },

  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 8 },
  detailBox: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10, minWidth: 80, flex: 1 },
  detailLabel: { color: C.textMuted, fontSize: 11, marginBottom: 2 },
  detailValue: { color: C.textWhite, fontSize: 14, fontWeight: '700' },
  detailDesc: { color: '#78909c', fontSize: 9, marginTop: 3, lineHeight: 13 },

  ehfGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ehfItem: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12, flex: 1, minWidth: 70, alignItems: 'center' },
  ehfFreq: { color: C.textMuted, fontSize: 11, marginBottom: 4 },
  ehfValue: { color: C.textWhite, fontSize: 16, fontWeight: '700' },

  interpretation: { color: C.textMuted, fontSize: 14, lineHeight: 22 },

  recRow: { flexDirection: 'row', marginBottom: 8, paddingRight: 12 },
  recBullet: { color: C.accentCyan, fontSize: 14, marginRight: 8, marginTop: 1 },
  recText: { color: C.textMuted, fontSize: 14, lineHeight: 21, flex: 1 },

  warningCard: { borderWidth: 1, borderColor: 'rgba(255,152,0,0.4)', backgroundColor: 'rgba(255,152,0,0.08)' },
  warningIcon: { color: '#ff9800', fontSize: 28, textAlign: 'center', marginBottom: 8 },
  warningTitle: { color: '#ff9800', fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  warningText: { color: C.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center' },

  // AI 분석 카드
  aiCard: { borderWidth: 1, borderColor: 'rgba(124,77,255,0.3)', backgroundColor: 'rgba(124,77,255,0.05)' },
  aiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  aiIcon: { fontSize: 22, marginRight: 8 },
  aiLoadingRow: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  aiLoadingText: { color: C.accentCyan, fontSize: 14, marginLeft: 12 },
  aiErrorBanner: { backgroundColor: 'rgba(255,152,0,0.08)', borderRadius: 8, padding: 10, marginBottom: 8 },
  aiErrorText: { color: '#ff9800', fontSize: 12 },
  aiText: { color: C.textMuted, fontSize: 14, lineHeight: 24 },
  aiStreamingDot: { marginTop: 8 },
  aiStreamingText: { color: C.accentPurple, fontSize: 12, fontStyle: 'italic' },

  disclaimerCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  disclaimerTitle: { color: C.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  disclaimerText: { color: C.textDim, fontSize: 12, lineHeight: 18 },

  pdfBtn: { backgroundColor: '#7c4dff', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  pdfBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  homeBtn: { backgroundColor: C.accentBlue, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  homeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
