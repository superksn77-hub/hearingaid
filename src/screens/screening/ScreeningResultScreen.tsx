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
import { generateScreeningAnalysis, getAiEngineStatus } from '../../services/ollamaService';
import { saveTestHistory, generateTestId } from '../../services/testHistoryService';
import { generateDeviceFingerprint } from '../../utils/deviceFingerprint';

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

  // AI 분석 실행 (Ollama → Gemini → 규칙 기반)
  const [aiEngine, setAiEngine] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAiLoading(true);
      setAiError(null);

      const engine = await getAiEngineStatus();
      setAiEngine(engine);

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

  // 검사 이력 저장 (최초 1회)
  useEffect(() => {
    let done = false;
    (async () => {
      if (done) return;
      done = true;
      try {
        const deviceId = await generateDeviceFingerprint();
        await saveTestHistory({
          id: generateTestId(),
          deviceId,
          userName: user?.name || '미지정',
          testType: 'screening',
          date: result.date || new Date().toISOString(),
          screeningSummary: {
            adhdPct: scores.pADHD * 100,
            dyslexiaPct: scores.pDyslexia * 100,
            adhdLevel: scores.adhdLevel,
            dyslexiaLevel: scores.dyslexiaLevel,
            ehfFlag: scores.ehfFlag,
            rtTau: result.cpt.rtTau,
            dlf1k: result.dlf.dlf1k,
            dlf6k: result.dlf.dlf6k,
            gdt: result.gdt.gdt,
            ptaEHF: result.ehfa.ptaEHF,
          },
        });
      } catch (e) {
        console.warn('[TestHistory] 스크리닝 저장 실패:', e);
      }
    })();
  }, []);

  const adhdStyle = LEVEL_STYLE[scores.adhdLevel];
  const dysStyle  = LEVEL_STYLE[scores.dyslexiaLevel];

  // PDF 저장 (3단계 fallback)
  const handleExportPdf = useCallback(() => {
    const html = buildScreeningPdfHtml(result, scores, user, aiText);
    // 1) Blob URL → 새 탭
    try {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const win = window.open(blobUrl, '_blank');
      if (win) { setTimeout(() => URL.revokeObjectURL(blobUrl), 60000); return; }
      URL.revokeObjectURL(blobUrl);
    } catch {}
    // 2) iframe
    try {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;border:none;background:white';
      document.body.appendChild(iframe);
      const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iDoc) { iDoc.open(); iDoc.write(html); iDoc.close();
        const btn = iDoc.createElement('button'); btn.textContent = '\u2715 닫기';
        btn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:100000;padding:8px 16px;background:#e53935;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer';
        btn.onclick = () => document.body.removeChild(iframe); iDoc.body.appendChild(btn);
      }
      return;
    } catch {}
    // 3) 파일 다운로드
    try {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `HICOG_청각스크린검사_${new Date().toISOString().slice(0,10)}.html`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { console.warn('PDF export error:', e); }
  }, [result, scores, user, aiText]);

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      {/* 헤더 */}
      <View style={s.header}>
        <Text style={s.headerTitle}>HICOG 청각 스크린 검사 결과</Text>
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

// ── PDF 보조 함수 ──────────────────────────────────────────────────────

function zBarPdf(label: string, value: string, z: number, desc: string): string {
  const pct = Math.min(100, Math.max(0, ((z + 3) / 6) * 100));
  const color = z > 2 ? '#e53935' : z > 1 ? '#ff9800' : z > 0 ? '#fdd835' : '#2e7d32';
  const zLabel = z >= 0 ? `+${z.toFixed(1)}` : z.toFixed(1);
  const status = z > 2 ? '주의' : z > 1 ? '경계' : '정상';
  const statusColor = z > 2 ? '#e53935' : z > 1 ? '#ff9800' : '#2e7d32';
  return `<div class="metric-card">
    <div class="metric-header">
      <span class="metric-name">${label}</span>
      <span class="metric-badge" style="background:${statusColor}15;color:${statusColor}">${status}</span>
    </div>
    <div class="metric-row">
      <span class="metric-val">${value}</span>
      <div class="metric-bar"><div class="bar-bg"><div class="bar-normal"></div><div class="bar-dot" style="left:${pct}%;background:${color};box-shadow:0 0 6px ${color}80"></div></div></div>
      <span class="metric-z" style="color:${color}">Z = ${zLabel}</span>
    </div>
    <div class="metric-desc">${desc}</div>
  </div>`;
}

function gaugeCircleSvg(label: string, pct: number, level: string): string {
  const color = level === 'high' ? '#e53935' : level === 'moderate' ? '#ff9800' : '#2e7d32';
  const bg = level === 'high' ? '#fef2f2' : level === 'moderate' ? '#fffbeb' : '#f0fdf4';
  const levelKo = level === 'high' ? '높음' : level === 'moderate' ? '중간' : '낮음';
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (pct / 100) * circumference;
  return `<div class="gauge-card" style="background:${bg}">
    <svg viewBox="0 0 120 120" class="gauge-ring">
      <circle cx="60" cy="60" r="54" fill="none" stroke="#e5e7eb" stroke-width="8"/>
      <circle cx="60" cy="60" r="54" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
        transform="rotate(-90 60 60)" style="transition:stroke-dashoffset 1s ease"/>
      <text x="60" y="55" text-anchor="middle" font-size="26" font-weight="900" fill="${color}">${pct.toFixed(0)}%</text>
      <text x="60" y="72" text-anchor="middle" font-size="10" fill="#666" font-weight="500">${levelKo}</text>
    </svg>
    <div class="gauge-name">${label}</div>
  </div>`;
}

function spectrumSvg(adhdPct: number, dysPct: number, ehfFlag: boolean): string {
  const x = 30 + (adhdPct / 100) * 240;
  const y = 270 - (dysPct / 100) * 240;
  const dotColor = (adhdPct > 60 && dysPct > 60) ? '#e53935' :
    adhdPct > 60 ? '#ff6d00' : dysPct > 60 ? '#7c3aed' :
    (adhdPct > 30 || dysPct > 30) ? '#ff9800' : '#2e7d32';
  return `<svg viewBox="0 0 300 300" class="spectrum-svg">
    <defs>
      <linearGradient id="gBg" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#f0fdf4"/><stop offset="33%" stop-color="#fefce8"/><stop offset="66%" stop-color="#fff7ed"/><stop offset="100%" stop-color="#fef2f2"/></linearGradient>
    </defs>
    <rect x="30" y="30" width="240" height="240" rx="4" fill="url(#gBg)" stroke="#e5e7eb"/>
    <line x1="110" y1="30" x2="110" y2="270" stroke="#d1d5db" stroke-dasharray="3,3"/>
    <line x1="190" y1="30" x2="190" y2="270" stroke="#d1d5db" stroke-dasharray="3,3"/>
    <line x1="30" y1="110" x2="270" y2="110" stroke="#d1d5db" stroke-dasharray="3,3"/>
    <line x1="30" y1="190" x2="270" y2="190" stroke="#d1d5db" stroke-dasharray="3,3"/>
    <text x="150" y="290" text-anchor="middle" font-size="10" fill="#666">ADHD 위험도 →</text>
    <text x="12" y="150" text-anchor="middle" font-size="10" fill="#666" transform="rotate(-90 12 150)">← 난독증 위험도</text>
    <text x="70" y="24" font-size="8" fill="#999">30%</text><text x="148" y="24" font-size="8" fill="#999">60%</text>
    <text x="22" y="194" font-size="8" fill="#999">30%</text><text x="22" y="114" font-size="8" fill="#999">60%</text>
    <circle cx="${x}" cy="${y}" r="8" fill="${dotColor}" opacity="0.9"/>
    <circle cx="${x}" cy="${y}" r="12" fill="none" stroke="${dotColor}" stroke-width="1.5" opacity="0.4"/>
    <text x="${x}" y="${y - 16}" text-anchor="middle" font-size="9" font-weight="700" fill="${dotColor}">(${adhdPct.toFixed(0)}%, ${dysPct.toFixed(0)}%)</text>
    ${ehfFlag ? '<text x="150" y="16" text-anchor="middle" font-size="8" fill="#e53935" font-weight="600">EHF Flag: 숨은 난청 감지</text>' : ''}
  </svg>`;
}

function parseAiToHtml(raw: string): string {
  if (!raw) return '<p class="no-data">분석 데이터 없음</p>';

  // ** bold ** → <strong>
  const boldified = raw.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const lines = boldified.replace(/`/g, '').split('\n');
  let html = '';
  let inList = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { if (inList) { html += '</ul>'; inList = false; } html += '<div style="height:10px"></div>'; continue; }
    if (trimmed === '---') { html += '<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">'; continue; }
    if (/^##\s*/.test(trimmed)) {
      if (inList) { html += '</ul>'; inList = false; }
      const title = trimmed.replace(/^##\s*/, '');
      html += `<div class="ai-section-title">${title}</div>`;
    } else if (/^\d+[\.\)]\s/.test(trimmed)) {
      if (!inList) { html += '<ol class="ai-list-ol">'; inList = true; }
      html += `<li class="ai-list-num">${trimmed.replace(/^\d+[\.\)]\s*/, '')}</li>`;
    } else if (/^[-\u25B8\u2022]\s/.test(trimmed)) {
      if (!inList) { html += '<ul class="ai-list">'; inList = true; }
      html += `<li class="ai-list-dash">${trimmed.replace(/^[-\u25B8\u2022]\s*/, '')}</li>`;
    } else {
      if (inList) { html += inList ? '</ul>' : '</ol>'; inList = false; }
      html += `<p class="ai-para">${trimmed}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;
}

function buildScreeningPdfHtml(
  result: ScreeningResult,
  scores: ScreeningScores,
  user?: UserProfile,
  aiAnalysis?: string,
): string {
  const date = new Date(result.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const name = (user?.name && user.name.trim()) ? user.name.trim() : '미지정';
  const age = (user?.age && user.age.trim()) ? user.age.trim() : '-';
  const gender = user?.gender === 'male' ? '남성' : user?.gender === 'female' ? '여성' : user?.gender === 'other' ? '기타' : '-';
  console.log('[PDF] user 객체:', JSON.stringify(user), '→ name:', name, 'age:', age, 'gender:', gender);
  const adhdPct = scores.pADHD * 100;
  const dysPct = scores.pDyslexia * 100;
  const ehfPct = scores.riskEHF * 100;
  const aiHtml = parseAiToHtml(aiAnalysis || '');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HICOG 청각 스크린 검사 보고서</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;900&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Noto Sans KR',sans-serif;background:#f8fafc;color:#1e293b;line-height:1.7;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:900px;margin:0 auto;padding:32px 28px}

  /* Header */
  .header{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#312e81 100%);color:#fff;padding:44px 40px;border-radius:24px;position:relative;overflow:hidden;margin-bottom:32px}
  .header::before{content:'';position:absolute;top:-60px;right:-40px;width:240px;height:240px;background:radial-gradient(circle,rgba(99,102,241,0.25),transparent);border-radius:50%}
  .header::after{content:'';position:absolute;bottom:-80px;left:-40px;width:200px;height:200px;background:radial-gradient(circle,rgba(6,182,212,0.15),transparent);border-radius:50%}
  .h-inner{position:relative;z-index:1}
  .h-logo{display:flex;align-items:center;gap:14px;margin-bottom:6px}
  .h-logo-icon{width:42px;height:42px;background:rgba(255,255,255,0.12);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;backdrop-filter:blur(4px)}
  .header h1{font-size:26px;font-weight:800;letter-spacing:-0.5px}
  .h-sub{font-size:12px;opacity:0.6;margin-bottom:24px;letter-spacing:0.5px}
  .h-meta{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .h-meta-item{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px 16px;backdrop-filter:blur(8px)}
  .h-meta-label{font-size:9px;opacity:0.5;text-transform:uppercase;letter-spacing:1.5px;font-weight:600}
  .h-meta-val{font-size:16px;font-weight:700;margin-top:3px}

  /* Summary Row */
  .summary-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:28px}
  .gauge-card{border-radius:20px;padding:24px 16px;text-align:center;border:1px solid rgba(0,0,0,0.04)}
  .gauge-ring{width:130px;height:130px;display:block;margin:0 auto}
  .gauge-name{font-size:13px;font-weight:700;color:#475569;margin-top:8px}
  .spectrum-card{background:#fff;border-radius:20px;padding:16px;border:1px solid rgba(0,0,0,0.04);box-shadow:0 1px 4px rgba(0,0,0,0.03)}
  .spectrum-svg{width:100%;height:auto;display:block}
  .spectrum-title{font-size:11px;font-weight:700;color:#475569;text-align:center;margin-bottom:4px}

  /* Cards */
  .card{background:#fff;border-radius:20px;padding:28px;margin-bottom:22px;box-shadow:0 1px 3px rgba(0,0,0,0.03),0 6px 20px rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.04)}
  .card-title{font-size:16px;font-weight:800;color:#1e293b;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #e2e8f0;display:flex;align-items:center;gap:10px}
  .card-title .ico{width:28px;height:28px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:14px;color:#fff;flex-shrink:0}
  .card-subtitle{font-size:11px;color:#94a3b8;font-weight:500;margin-bottom:16px}

  /* Metric Cards */
  .metric-card{background:#f8fafc;border-radius:12px;padding:14px 16px;margin-bottom:10px;border:1px solid #f1f5f9}
  .metric-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
  .metric-name{font-size:13px;font-weight:600;color:#334155}
  .metric-badge{font-size:10px;font-weight:700;padding:2px 10px;border-radius:20px}
  .metric-row{display:grid;grid-template-columns:70px 1fr 65px;align-items:center;gap:10px;margin-bottom:6px}
  .metric-val{font-size:15px;font-weight:800;color:#0f172a}
  .bar-bg{height:8px;background:#e2e8f0;border-radius:4px;position:relative}
  .bar-normal{position:absolute;left:33%;width:34%;height:100%;background:rgba(34,197,94,0.12);border-radius:4px}
  .bar-dot{position:absolute;top:-3px;width:14px;height:14px;border-radius:7px;margin-left:-7px;border:2.5px solid #fff}
  .metric-z{font-size:12px;font-weight:700;text-align:right}
  .metric-desc{font-size:11px;color:#64748b;line-height:1.6;padding-left:2px}
  .stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}
  .stat-box{background:#f1f5f9;border-radius:10px;padding:12px;text-align:center}
  .stat-label{font-size:9px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
  .stat-num{font-size:18px;font-weight:800;color:#1e293b;margin-top:2px}

  /* Table */
  table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0}
  th{background:#f1f5f9;color:#475569;font-weight:600;padding:12px 16px;text-align:center;font-size:11px;letter-spacing:0.3px}
  td{padding:12px 16px;text-align:center;border-top:1px solid #f1f5f9}
  .s-ok{color:#16a34a;font-weight:700}.s-warn{color:#dc2626;font-weight:700}

  /* AI Analysis */
  .ai-wrap{background:linear-gradient(135deg,#faf5ff,#ede9fe);border-radius:16px;padding:24px;border:1px solid #ddd6fe}
  .ai-section-title{font-size:15px;font-weight:800;color:#4c1d95;margin:20px 0 8px;padding:8px 14px;background:rgba(124,58,237,0.08);border-radius:8px;border-left:4px solid #7c3aed}
  .ai-section-title:first-child{margin-top:0}
  .ai-para{font-size:13px;color:#374151;line-height:1.9;margin:6px 0;padding-left:4px}
  .ai-list{list-style:none;padding:0;margin:6px 0}
  .ai-list-num{font-size:13px;color:#374151;line-height:1.8;padding:6px 12px;margin:4px 0;background:rgba(255,255,255,0.6);border-radius:8px;border-left:3px solid #8b5cf6;counter-increment:ai-counter}
  .ai-list-num::before{content:counter(ai-counter);display:inline-flex;width:20px;height:20px;border-radius:10px;background:#8b5cf6;color:#fff;align-items:center;justify-content:center;font-size:10px;font-weight:700;margin-right:8px}
  .ai-list-dash{font-size:13px;color:#374151;line-height:1.8;padding:4px 12px;margin:2px 0}
  .ai-list-dash::before{content:'\\25B8';color:#8b5cf6;margin-right:8px;font-size:11px}
  .no-data{color:#a3a3a3;font-style:italic;text-align:center;padding:20px}

  /* Recommendations */
  .rec-grid{display:grid;gap:8px;counter-reset:rec-counter}
  .rec-item{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;background:#f8fafc;border-radius:12px;border:1px solid #f1f5f9}
  .rec-num{flex-shrink:0;width:24px;height:24px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800}
  .rec-text{font-size:13px;color:#334155;line-height:1.7}

  /* Disclaimer & Footer */
  .disclaimer{background:#fffbeb;border:1px solid #fde68a;border-radius:14px;padding:18px 22px;font-size:11px;color:#92400e;line-height:1.8;margin-bottom:20px}
  .footer{text-align:center;padding:28px;color:#94a3b8;font-size:10px;border-top:1px solid #e2e8f0}
  .footer .brand{font-weight:800;color:#6366f1;font-size:12px;letter-spacing:1px}

  .print-actions{text-align:center;margin:28px 0}
  .btn{display:inline-block;padding:14px 40px;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer}
  .btn-primary{background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;box-shadow:0 4px 14px rgba(99,102,241,0.3)}

  @media print{
    .print-actions{display:none!important}
    body{background:#fff!important}
    .card,.gauge-card,.spectrum-card{box-shadow:none!important;border:1px solid #e2e8f0!important}
    .header{background:linear-gradient(135deg,#0f172a,#1e3a5f,#312e81)!important}
    .header,.header *{color:#fff!important}
    .h-meta-item{background:rgba(255,255,255,0.12)!important}
    .gauge-card,.metric-card,.stat-box,.ai-wrap,.rec-item,.bar-normal,.bar-dot,.ai-section-title,.metric-badge,.rec-num{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    @page{size:A4;margin:12mm}
  }
</style>
</head>
<body>
<div class="page">

<div class="header">
  <div class="h-inner">
    <div class="h-logo">
      <div class="h-logo-icon">&#x1F9E0;</div>
      <h1>HICOG 청각 스크린 검사 보고서</h1>
    </div>
    <div class="h-sub">HICOG Pure-Tone Audiometry Based Cognitive-Auditory Screening Report</div>
    <div class="h-meta">
      <div class="h-meta-item"><div class="h-meta-label">이름</div><div class="h-meta-val">${name}</div></div>
      <div class="h-meta-item"><div class="h-meta-label">나이</div><div class="h-meta-val">${age}세</div></div>
      <div class="h-meta-item"><div class="h-meta-label">성별</div><div class="h-meta-val">${gender}</div></div>
      <div class="h-meta-item"><div class="h-meta-label">검사일</div><div class="h-meta-val">${date}</div></div>
    </div>
  </div>
</div>

<!-- Summary: Gauges + Spectrum -->
<div class="summary-row">
  ${gaugeCircleSvg('ADHD 위험도', adhdPct, scores.adhdLevel)}
  ${gaugeCircleSvg('난독증 위험도', dysPct, scores.dyslexiaLevel)}
  <div class="spectrum-card">
    <div class="spectrum-title">2D 인지-청각 스펙트럼</div>
    ${spectrumSvg(adhdPct, dysPct, scores.ehfFlag)}
  </div>
</div>

<!-- CPT -->
<div class="card">
  <div class="card-title"><span class="ico" style="background:linear-gradient(135deg,#f59e0b,#d97706)">&#x26A1;</span> 1. 주의력 및 반응 억제 검사 (CPT)</div>
  <div class="card-subtitle">순음 자극에 대한 반응 시간 변동성과 충동 억제 능력을 평가합니다. Ex-Gaussian 분포 모델의 τ 값은 ADHD의 핵심 바이오마커입니다.</div>
  ${zBarPdf('RT τ (주의력 일탈)', `${result.cpt.rtTau}ms`, scores.zScores.rtTau, '반응 시간 분포의 우측 꼬리 길이. 높을수록 간헐적 집중 붕괴(주의력 일탈)가 자주 발생함을 의미합니다.')}
  ${zBarPdf('오경보율 (FPR)', `${(result.cpt.falsePositiveRate*100).toFixed(1)}%`, scores.zScores.fpr, '소리가 없을 때 버튼을 누른 비율. 높을수록 전두엽 하향식 억제 통제 기능이 저하되어 있음을 시사합니다.')}
  ${zBarPdf('누락률 (OER)', `${(result.cpt.omissionRate*100).toFixed(1)}%`, scores.zScores.oer, '소리가 났는데 반응하지 못한 비율. 높을수록 지속적 주의력(Sustained Attention) 유지에 어려움이 있습니다.')}
  ${zBarPdf('평균 반응시간', `${result.cpt.rtMean}ms`, scores.zScores.rtMean, '청각 자극 감지 후 반응까지 걸린 평균 시간. 전반적인 정보 처리 속도를 반영합니다.')}
  <div class="stat-grid">
    <div class="stat-box"><div class="stat-label">μ (기본속도)</div><div class="stat-num">${result.cpt.rtMu}ms</div></div>
    <div class="stat-box"><div class="stat-label">σ (변동성)</div><div class="stat-num">${result.cpt.rtStd}ms</div></div>
    <div class="stat-box"><div class="stat-label">총 시행</div><div class="stat-num">${result.cpt.totalTrials}회</div></div>
  </div>
</div>

<!-- DLF + GDT -->
<div class="card">
  <div class="card-title"><span class="ico" style="background:linear-gradient(135deg,#8b5cf6,#6d28d9)">&#x1F3B5;</span> 2. 청각 감각 해상도 검사 (DLF / GDT)</div>
  <div class="card-subtitle">주파수 변별력과 시간적 해상도를 측정합니다. 난독증 환자는 음운 표상 체계의 붕괴로 인해 이 지표들이 유의미하게 상승합니다.</div>
  ${zBarPdf('DLF 1kHz (저주파 변별)', `${result.dlf.dlf1k.toFixed(1)}%`, scores.zScores.dlf1k, '1kHz 대역에서 두 음의 높낮이 차이를 인식하는 최소 주파수 차이. 위상 잠금(Phase-locking) 정보가 풍부한 대역입니다.')}
  ${zBarPdf('DLF 6kHz (고주파 변별)', `${result.dlf.dlf6k.toFixed(1)}%`, scores.zScores.dlf6k, '6kHz 대역에서의 주파수 변별 임계치. 위상 잠금이 작동하지 않는 대역으로, 대뇌의 전반적 감각 표상 능력을 평가합니다.')}
  ${zBarPdf('간격 탐지 GDT', `${result.gdt.gdt.toFixed(1)}ms`, scores.zScores.gdt, '소음 중 극히 짧은 침묵을 감지하는 최소 시간. 밀리초 단위 시간적 처리 능력으로, 음운 분절에 핵심적 역할을 합니다.')}
</div>

<!-- EHFA -->
<div class="card">
  <div class="card-title"><span class="ico" style="background:linear-gradient(135deg,#0891b2,#0e7490)">&#x1F50A;</span> 3. 확장 고주파 청력 검사 (EHFA)</div>
  <div class="card-subtitle">10~16kHz 대역의 청력을 평가합니다. 이 대역의 저하는 와우 시냅스 병증(숨은 난청)의 초기 지표이며, 청취 노력 증가로 ADHD 유사 증상을 유발할 수 있습니다.</div>
  <table>
    <tr><th>주파수</th><th>역치 (dB HL)</th><th>판정</th></tr>
    <tr><td>10 kHz</td><td>${result.ehfa.thresholds[10000] ?? 'N/A'}</td><td class="${(result.ehfa.thresholds[10000]??0)>25?'s-warn':'s-ok'}">${(result.ehfa.thresholds[10000]??0)>25?'저하':'정상'}</td></tr>
    <tr><td>12.5 kHz</td><td>${result.ehfa.thresholds[12500] ?? 'N/A'}</td><td class="${(result.ehfa.thresholds[12500]??0)>25?'s-warn':'s-ok'}">${(result.ehfa.thresholds[12500]??0)>25?'저하':'정상'}</td></tr>
    <tr><td>16 kHz</td><td>${result.ehfa.thresholds[16000] ?? 'N/A'}</td><td class="${(result.ehfa.thresholds[16000]??0)>25?'s-warn':'s-ok'}">${(result.ehfa.thresholds[16000]??0)>25?'저하':'정상'}</td></tr>
    <tr style="font-weight:700;background:#f8fafc"><td>PTA_EHF 평균</td><td>${result.ehfa.ptaEHF} dB</td><td class="${result.ehfa.ptaEHF>25?'s-warn':'s-ok'}">${result.ehfa.ptaEHF>25?'숨은 난청 위험':'정상'}</td></tr>
  </table>
  <div style="margin-top:10px;font-size:12px;color:#64748b">숨은 난청(Hidden Hearing Loss) 위험도: <strong style="color:${ehfPct>75?'#dc2626':ehfPct>50?'#f59e0b':'#16a34a'}">${ehfPct.toFixed(1)}%</strong></div>
</div>

<!-- AI Analysis -->
<div class="card">
  <div class="card-title"><span class="ico" style="background:linear-gradient(135deg,#7c3aed,#6d28d9)">&#x1F4CB;</span> 4. 종합 분석 보고</div>
  <div class="ai-wrap">${aiHtml}</div>
</div>

<!-- Recommendations -->
<div class="card">
  <div class="card-title"><span class="ico" style="background:linear-gradient(135deg,#059669,#047857)">&#x2705;</span> 5. 권고사항</div>
  <div class="rec-grid" style="counter-reset:rec-counter">
    ${scores.recommendations.map((r,i) => `<div class="rec-item"><div class="rec-num">${i+1}</div><div class="rec-text">${r}</div></div>`).join('\n    ')}
  </div>
</div>

<div class="disclaimer">
  <strong>&#x26A0; 면책 조항:</strong> 본 검사는 ADHD 및 발달성 난독증의 스크리닝(선별) 목적으로만 사용되며, 확정적인 임상 진단을 위한 도구가 아닙니다.
  검사 결과는 전문 의료기관의 종합적인 신경심리 평가를 대체할 수 없으며, 검사 환경(주변 소음, 이어폰 품질, 기기 성능, 사용자의 컨디션)에 따라 결과가 영향받을 수 있습니다.
  이상 소견이 관찰된 경우, 반드시 이비인후과 전문의 또는 신경심리 전문가의 정밀 진단을 받으시기 바랍니다.
</div>

<div class="footer">
  <div class="brand">HICOG</div>
  Hearing Intelligence Cognitive Screening System v1.0<br>
  Pure-Tone Audiometry Based Cognitive-Auditory Biomarker Analysis<br>
  Report Generated: ${new Date().toISOString().slice(0,19).replace('T',' ')}
</div>

<div class="print-actions">
  <button class="btn btn-primary" onclick="window.print()">&#x1F5A8; 인쇄 / PDF 저장</button>
</div>

</div>
<script>if(!/Mobile|Android|iPhone/i.test(navigator.userAgent)){setTimeout(()=>window.print(),1200)}</script>
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
