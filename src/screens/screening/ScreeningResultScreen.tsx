import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions
} from 'react-native';
import { ScreeningResult, ScreeningScores, RiskLevel } from '../../types/screening';
import { UserProfile } from '../../types';
import { scoreScreening } from '../../engine/screening/ScreeningScorer';
import { SpectrumChart } from '../../components/SpectrumChart';
import { ZScoreBar } from '../../components/ZScoreBar';

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

export const ScreeningResultScreen: React.FC<Props> = ({ navigation, route }) => {
  const { result, user } = route.params;

  const scores: ScreeningScores = useMemo(
    () => scoreScreening(result, user?.age),
    [result, user?.age]
  );

  const adhdStyle = LEVEL_STYLE[scores.adhdLevel];
  const dysStyle  = LEVEL_STYLE[scores.dyslexiaLevel];

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
            ADHD 지표 해석 시 이 점을 고려하십시오.
          </Text>
          <Text style={s.warningNote}>PTA_EHF: {result.ehfa.ptaEHF} dB HL</Text>
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
          value={result.cpt.rtTau}
          zScore={scores.zScores.rtTau}
          unit="ms"
        />
        <ZScoreBar
          label="오경보율 (FPR)"
          value={result.cpt.falsePositiveRate}
          zScore={scores.zScores.fpr}
        />
        <ZScoreBar
          label="누락률 (OER)"
          value={result.cpt.omissionRate}
          zScore={scores.zScores.oer}
        />

        <View style={s.detailGrid}>
          <DetailBox label="평균 RT" value={`${result.cpt.rtMean}ms`} />
          <DetailBox label="RT σ" value={`${result.cpt.rtStd}ms`} />
          <DetailBox label="RT μ" value={`${result.cpt.rtMu}ms`} />
          <DetailBox label="총 시행" value={`${result.cpt.totalTrials}회`} />
        </View>
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
          value={result.dlf.dlf1k}
          zScore={scores.zScores.dlf1k}
          unit="%"
        />
        <ZScoreBar
          label="DLF 6kHz"
          value={result.dlf.dlf6k}
          zScore={scores.zScores.dlf6k}
          unit="%"
        />

        <Text style={s.sectionLabel}>시간 해상도 (GDT)</Text>
        <ZScoreBar
          label="간격 탐지 임계치"
          value={result.gdt.gdt}
          zScore={scores.zScores.gdt}
          unit="ms"
        />

        <View style={s.detailGrid}>
          <DetailBox label="DLF 1k 역전" value={`${result.dlf.staircase1k.length}회`} />
          <DetailBox label="DLF 6k 역전" value={`${result.dlf.staircase6k.length}회`} />
          <DetailBox label="GDT 역전" value={`${result.gdt.staircaseHistory.length}회`} />
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
                <Text style={s.ehfFreq}>{freq >= 1000 ? `${freq/1000}k` : freq}Hz</Text>
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

      {/* ═══════ 임상 해석 ═══════ */}
      <View style={s.card}>
        <Text style={s.cardTitle}>임상 해석</Text>
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
          검사 환경(소음, 이어폰 품질, 기기 성능)에 따라 결과가 영향받을 수 있습니다.
        </Text>
      </View>

      {/* 홈으로 돌아가기 */}
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
  warningNote: { color: '#ff9800', fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 8 },

  disclaimerCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  disclaimerTitle: { color: C.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  disclaimerText: { color: C.textDim, fontSize: 12, lineHeight: 18 },

  homeBtn: { backgroundColor: C.accentBlue, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  homeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
