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
        setAiError('Ollama 서버에 연결할 수 없습니다. 기본 분석을 표시합니다.');
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
        <ZScoreBar label="RT τ (주의력 일탈)" value={result.cpt.rtTau} zScore={scores.zScores.rtTau} unit="ms" />
        <ZScoreBar label="오경보율 (FPR)" value={result.cpt.falsePositiveRate} zScore={scores.zScores.fpr} />
        <ZScoreBar label="누락률 (OER)" value={result.cpt.omissionRate} zScore={scores.zScores.oer} />

        <View style={s.detailGrid}>
          <DetailBox label="평균 RT" value={`${result.cpt.rtMean}ms`} />
          <DetailBox label="RT σ" value={`${result.cpt.rtStd}ms`} />
          <DetailBox label="RT μ" value={`${result.cpt.rtMu}ms`} />
          <DetailBox label="총 시행" value={`${result.cpt.totalTrials}회`} />
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
        <ZScoreBar label="DLF 1kHz" value={result.dlf.dlf1k} zScore={scores.zScores.dlf1k} unit="%" />
        <ZScoreBar label="DLF 6kHz" value={result.dlf.dlf6k} zScore={scores.zScores.dlf6k} unit="%" />

        <Text style={s.sectionLabel}>시간 해상도 (GDT)</Text>
        <ZScoreBar label="간격 탐지 임계치" value={result.gdt.gdt} zScore={scores.zScores.gdt} unit="ms" />
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

      {/* ═══════ AI 종합 분석 ═══════ */}
      <View style={[s.card, s.aiCard]}>
        <View style={s.aiHeader}>
          <Text style={s.aiIcon}>&#129302;</Text>
          <Text style={s.cardTitle}>AI 종합 분석 (Ollama llama3)</Text>
        </View>
        {aiError && (
          <Text style={s.aiErrorText}>{aiError}</Text>
        )}
        {aiLoading && !aiText ? (
          <View style={s.aiLoadingRow}>
            <ActivityIndicator size="small" color={C.accentCyan} />
            <Text style={s.aiLoadingText}>AI 분석 생성 중...</Text>
          </View>
        ) : (
          <Text style={s.aiText}>{aiText}</Text>
        )}
        {aiLoading && aiText.length > 0 && (
          <View style={s.aiStreamingDot}>
            <Text style={s.aiStreamingText}>생성 중...</Text>
          </View>
        )}
      </View>

      {/* ═══════ 기존 임상 해석 ═══════ */}
      <View style={s.card}>
        <Text style={s.cardTitle}>기본 임상 해석</Text>
        <Text style={s.interpretation}>{scores.interpretation}</Text>
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
const DetailBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={s.detailBox}>
    <Text style={s.detailLabel}>{label}</Text>
    <Text style={s.detailValue}>{value}</Text>
  </View>
);

// ══════════════════════════════════════════════════════════════
// ── PDF HTML 생성 ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

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

  const adhdPct = (scores.pADHD * 100).toFixed(1);
  const dysPct = (scores.pDyslexia * 100).toFixed(1);
  const ehfPct = (scores.riskEHF * 100).toFixed(1);

  const aiHtml = aiAnalysis
    ? aiAnalysis.replace(/\n/g, '<br>').replace(/##\s*(.*?)(<br>|$)/g, '<h3 style="color:#1565c0;margin:16px 0 8px;">$1</h3>')
    : '<p style="color:#999;">AI 분석 데이터 없음</p>';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HICOG ADHD/난독증 스크리닝 보고서</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; background: #f5f7fa; color: #333; padding: 24px; max-width: 900px; margin: 0 auto; }
  .header { background: linear-gradient(135deg, #0d1b4b, #1565c0); color: white; padding: 32px; border-radius: 16px; text-align: center; margin-bottom: 24px; }
  .header h1 { font-size: 22px; margin-bottom: 4px; }
  .header p { opacity: 0.8; font-size: 13px; }
  .meta { display: flex; gap: 24px; justify-content: center; margin-top: 12px; font-size: 14px; }
  .card { background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
  .card h2 { font-size: 16px; color: #0d1b4b; border-bottom: 2px solid #e3f2fd; padding-bottom: 8px; margin-bottom: 12px; }
  .risk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .risk-box { text-align: center; padding: 20px; border-radius: 12px; }
  .risk-box.adhd { background: ${scores.adhdLevel === 'high' ? '#ffebee' : scores.adhdLevel === 'moderate' ? '#fff8e1' : '#e8f5e9'}; }
  .risk-box.dys { background: ${scores.dyslexiaLevel === 'high' ? '#ffebee' : scores.dyslexiaLevel === 'moderate' ? '#fff8e1' : '#e8f5e9'}; }
  .risk-pct { font-size: 36px; font-weight: 800; }
  .risk-label { font-size: 13px; color: #666; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 8px 12px; border: 1px solid #e0e0e0; text-align: center; }
  th { background: #f5f5f5; font-weight: 600; color: #333; }
  .z-bar { height: 8px; background: #e0e0e0; border-radius: 4px; position: relative; margin: 4px 0; }
  .z-fill { height: 8px; border-radius: 4px; position: absolute; top: 0; }
  .ai-section { background: #f3e5f5; border-left: 4px solid #7c4dff; padding: 16px; border-radius: 0 8px 8px 0; line-height: 1.8; font-size: 14px; }
  .disclaimer { background: #fff3e0; border: 1px solid #ffcc80; border-radius: 8px; padding: 16px; font-size: 12px; color: #666; }
  .print-btn { display: block; margin: 24px auto; padding: 12px 48px; background: #1565c0; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; }
  @media print { .print-btn { display: none; } body { padding: 0; } .card { box-shadow: none; border: 1px solid #e0e0e0; } }
</style>
</head>
<body>

<div class="header">
  <h1>HICOG ADHD / 난독증 스크리닝 보고서</h1>
  <p>Pure-Tone Audiometry Based Cognitive-Auditory Screening</p>
  <div class="meta">
    <span>이름: ${name}</span>
    <span>나이: ${age}세</span>
    <span>성별: ${gender}</span>
    <span>검사일: ${date}</span>
  </div>
</div>

<div class="risk-grid">
  <div class="risk-box adhd">
    <div class="risk-pct" style="color:${scores.adhdLevel === 'high' ? '#d32f2f' : scores.adhdLevel === 'moderate' ? '#f57f17' : '#2e7d32'}">${adhdPct}%</div>
    <div class="risk-label">ADHD 위험도 (${scores.adhdLevel === 'high' ? '높음' : scores.adhdLevel === 'moderate' ? '중간' : '낮음'})</div>
  </div>
  <div class="risk-box dys">
    <div class="risk-pct" style="color:${scores.dyslexiaLevel === 'high' ? '#d32f2f' : scores.dyslexiaLevel === 'moderate' ? '#f57f17' : '#2e7d32'}">${dysPct}%</div>
    <div class="risk-label">난독증 위험도 (${scores.dyslexiaLevel === 'high' ? '높음' : scores.dyslexiaLevel === 'moderate' ? '중간' : '낮음'})</div>
  </div>
</div>

<div class="card">
  <h2>1. 주의력 검사 (CPT) 결과</h2>
  <table>
    <tr><th>지표</th><th>측정값</th><th>Z점수</th><th>해석</th></tr>
    <tr><td>RT τ (주의력 일탈)</td><td>${result.cpt.rtTau}ms</td><td>${scores.zScores.rtTau.toFixed(1)}</td><td>${scores.zScores.rtTau > 1.5 ? '⚠️ 상승' : '정상'}</td></tr>
    <tr><td>오경보율 (FPR)</td><td>${(result.cpt.falsePositiveRate * 100).toFixed(1)}%</td><td>${scores.zScores.fpr.toFixed(1)}</td><td>${scores.zScores.fpr > 1.5 ? '⚠️ 상승' : '정상'}</td></tr>
    <tr><td>누락률 (OER)</td><td>${(result.cpt.omissionRate * 100).toFixed(1)}%</td><td>${scores.zScores.oer.toFixed(1)}</td><td>${scores.zScores.oer > 1.5 ? '⚠️ 상승' : '정상'}</td></tr>
    <tr><td>평균 RT</td><td>${result.cpt.rtMean}ms</td><td>${scores.zScores.rtMean.toFixed(1)}</td><td>-</td></tr>
    <tr><td>RT μ</td><td>${result.cpt.rtMu}ms</td><td>-</td><td>기본 처리 속도</td></tr>
    <tr><td>RT σ</td><td>${result.cpt.rtStd}ms</td><td>-</td><td>반응 일관성</td></tr>
  </table>
</div>

<div class="card">
  <h2>2. 주파수 변별 (DLF) 및 간격 탐지 (GDT)</h2>
  <table>
    <tr><th>지표</th><th>측정값</th><th>Z점수</th><th>해석</th></tr>
    <tr><td>DLF 1kHz</td><td>${result.dlf.dlf1k.toFixed(1)}%</td><td>${scores.zScores.dlf1k.toFixed(1)}</td><td>${scores.zScores.dlf1k > 1.5 ? '⚠️ 상승' : '정상'}</td></tr>
    <tr><td>DLF 6kHz</td><td>${result.dlf.dlf6k.toFixed(1)}%</td><td>${scores.zScores.dlf6k.toFixed(1)}</td><td>${scores.zScores.dlf6k > 1.5 ? '⚠️ 상승' : '정상'}</td></tr>
    <tr><td>GDT</td><td>${result.gdt.gdt.toFixed(1)}ms</td><td>${scores.zScores.gdt.toFixed(1)}</td><td>${scores.zScores.gdt > 1.5 ? '⚠️ 상승' : '정상'}</td></tr>
  </table>
</div>

<div class="card">
  <h2>3. 확장 고주파 청력 (EHFA)</h2>
  <table>
    <tr><th>주파수</th><th>역치 (dB HL)</th><th>판정</th></tr>
    <tr><td>10 kHz</td><td>${result.ehfa.thresholds[10000] ?? 'N/A'}</td><td>${(result.ehfa.thresholds[10000] ?? 0) > 25 ? '⚠️ 저하' : '정상'}</td></tr>
    <tr><td>12.5 kHz</td><td>${result.ehfa.thresholds[12500] ?? 'N/A'}</td><td>${(result.ehfa.thresholds[12500] ?? 0) > 25 ? '⚠️ 저하' : '정상'}</td></tr>
    <tr><td>16 kHz</td><td>${result.ehfa.thresholds[16000] ?? 'N/A'}</td><td>${(result.ehfa.thresholds[16000] ?? 0) > 25 ? '⚠️ 저하' : '정상'}</td></tr>
    <tr><td><b>PTA_EHF</b></td><td><b>${result.ehfa.ptaEHF} dB</b></td><td>${result.ehfa.ptaEHF > 25 ? '⚠️ 숨은 난청 위험' : '정상'}</td></tr>
  </table>
  <p style="margin-top:8px;font-size:12px;color:#666;">숨은 난청 위험도: ${ehfPct}%</p>
</div>

<div class="card">
  <h2>4. AI 종합 분석</h2>
  <div class="ai-section">${aiHtml}</div>
</div>

<div class="card">
  <h2>5. 권고사항</h2>
  <ul style="padding-left:20px;line-height:2;">
    ${scores.recommendations.map(r => `<li>${r}</li>`).join('\n    ')}
  </ul>
</div>

<div class="disclaimer">
  <strong>⚠ 주의사항:</strong> 본 검사는 ADHD 및 난독증의 스크리닝(선별) 목적으로만 사용되며, 확정 진단을 위한 것이 아닙니다.
  결과는 전문 의료기관의 종합적인 신경심리 평가를 대체할 수 없습니다.
  검사 환경(소음, 이어폰 품질, 기기 성능)에 따라 결과가 영향받을 수 있습니다.
</div>

<p style="text-align:center;margin-top:24px;font-size:11px;color:#999;">
  HICOG Hearing Intelligence Cognitive Screening System v1.0<br>
  Generated: ${new Date().toISOString()}
</p>

<button class="print-btn" onclick="window.print()">인쇄 / PDF 저장</button>

<script>
  // PC 브라우저에서는 자동 인쇄 대화상자
  if (!/Mobile|Android|iPhone/i.test(navigator.userAgent)) {
    setTimeout(() => window.print(), 800);
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
  aiErrorText: { color: '#ff9800', fontSize: 12, marginBottom: 8 },
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
