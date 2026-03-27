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

// ══════════════════════════════════════════════════════════════════════
// ── 논문 기반 청력도 임상 분류 분석 (맨 위에 표시) ─────────────────────
// ══════════════════════════════════════════════════════════════════════

export interface AudiogramAnalysis {
  /** 난청 유형: 정상/전음성/감각신경성/혼합성/비대칭 */
  hlType:         string;
  hlTypeColor:    string;
  /** WHO 중증도 분류 */
  severity:       string;
  severityColor:  string;
  /** 청력도 패턴 형태 (하강형/노치형/평탄형 등) */
  shape:          string;
  /** 추정 원인/질환 */
  etiology:       string;
  /** 응급도 */
  urgency:        'normal' | 'caution' | 'refer' | 'emergency';
  urgencyLabel:   string;
  urgencyColor:   string;
  urgencyReason:  string;
  /** 이퀄라이저 추천 (NAL-NL2 / DSL v5.0) */
  eqMode:         'NAL-NL2' | 'DSL v5.0' | 'none';
  eqReason:       string;
  /** 임상 해석 요약 */
  clinicalNote:   string;
  /** 권고사항 */
  recommendation: string;
  /** Red Flag 목록 */
  redFlags:       string[];
}

function analyzeAudiogramPattern(
  result: TestResult,
  ageStr?: string,
  genderArg?: string,
): AudiogramAnalysis {
  const rightPTA = getPTA(result.right);
  const leftPTA  = getPTA(result.left);
  const avgPTA   = (rightPTA !== null && leftPTA !== null)
    ? Math.round((rightPTA + leftPTA) / 2)
    : (rightPTA ?? leftPTA ?? 0);
  const asymmetry = (rightPTA !== null && leftPTA !== null)
    ? Math.abs(rightPTA - leftPTA) : 0;

  const age    = ageStr ? parseInt(ageStr, 10) : undefined;
  const hasAge = age !== undefined && !isNaN(age) && age > 0;
  const isChild    = hasAge && age! < 18;
  const isSenior   = hasAge && age! >= 60;
  const isElderly  = hasAge && age! >= 70;
  const isFemale   = genderArg === 'female';

  const rP = detectPattern(result.right);
  const lP = detectPattern(result.left);
  const hasNotch4k       = rP.hasNotch4k      || lP.hasNotch4k;
  const hasHighFreqSlope = rP.hasHighFreqSlope || lP.hasHighFreqSlope;
  const hasLowFreqLoss   = rP.hasLowFreqLoss  || lP.hasLowFreqLoss;
  const isFlat           = rP.isFlat          || lP.isFlat;

  // 쿠키바이트(U자형): 중간 주파수가 양 끝보다 15 dB 이상 높음
  const r500  = result.right[500]  ?? result.left[500]  ?? 0;
  const r2k   = result.right[2000] ?? result.left[2000] ?? 0;
  const r125  = result.right[125]  ?? result.left[125]  ?? 0;
  const r8k   = result.right[8000] ?? result.left[8000] ?? 0;
  const isCookieBite = r2k > 15 && (r2k - r125 >= 15) && (r2k - r8k >= 15);

  // Red Flag 목록
  const redFlags: string[] = [];
  if (asymmetry >= 15) redFlags.push(`⚠️ 양측 비대칭 ${asymmetry} dB — MRI 청신경 검사 즉시 필요`);
  if (avgPTA > 70)     redFlags.push('⚠️ 고도·심도 난청 — 보청기 적합 전문가 상담 필요');
  if (hasNotch4k && avgPTA <= 40) redFlags.push('⚠️ 4 kHz 소음성 노치 — 추가 소음 노출 차단 필수');
  if (hasLowFreqLoss && !isSenior) redFlags.push('⚠️ 저주파 손실 — 메니에르병/내림프수종 가능성 평가 필요');
  if (isFlat && avgPTA > 40) redFlags.push('⚠️ 광대역 평탄형 손실 — 전음성/혼합성 감별 이비인후과 진찰 필요');
  if (isCookieBite)    redFlags.push('⚠️ U자형(쿠키바이트) 패턴 — 유전성/선천성 난청 유전자 검사 고려');

  // ── 난청 유형 분류 ──────────────────────────────────────────────
  let hlType = '정상 청력';
  let hlTypeColor = '#2e7d32';

  if (avgPTA > 25) {
    // 단순 버전: PTA > 25이면 감각신경성으로 기본 분류
    // (모바일 앱은 골도검사가 없으므로 패턴으로 추정)
    if (isFlat && avgPTA >= 30 && avgPTA <= 60) {
      hlType = '전음성/혼합성 난청 의심';
      hlTypeColor = '#e65100';
    } else if (asymmetry >= 15) {
      hlType = '비대칭 감각신경성 난청';
      hlTypeColor = '#b71c1c';
    } else {
      hlType = '감각신경성 난청';
      hlTypeColor = '#c62828';
    }
  }

  // ── WHO 중증도 ────────────────────────────────────────────────
  let severity = '정상 (Normal, ≤25 dB HL)';
  let severityColor = '#2e7d32';
  if      (avgPTA <= 25) { severity = '정상 (Normal)';           severityColor = '#2e7d32'; }
  else if (avgPTA <= 40) { severity = '경도 (Mild, 26–40 dB)';   severityColor = '#f57f17'; }
  else if (avgPTA <= 55) { severity = '중도 (Moderate, 41–55 dB)'; severityColor = '#e65100'; }
  else if (avgPTA <= 70) { severity = '중고도 (Mod-severe, 56–70 dB)'; severityColor = '#bf360c'; }
  else if (avgPTA <= 90) { severity = '고도 (Severe, 71–90 dB)';  severityColor = '#b71c1c'; }
  else                   { severity = '심도 (Profound, 91+ dB)';  severityColor = '#880e4f'; }

  // ── 청력도 형태(Shape) ──────────────────────────────────────
  let shape = '다양한 주파수 손실';
  if (avgPTA <= 25)       shape = '정상 범위';
  else if (hasNotch4k)    shape = '4 kHz V자 노치형 (소음성 패턴)';
  else if (isCookieBite)  shape = 'U자형 / 쿠키바이트형 (중주파 손실)';
  else if (hasHighFreqSlope && hasLowFreqLoss) shape = '안장형 (저·고주파 손실)';
  else if (hasHighFreqSlope) shape = '고주파 하강형 (Downsloping)';
  else if (hasLowFreqLoss)   shape = '저주파 상승형 (Upsloping)';
  else if (isFlat)           shape = '광대역 평탄형 (Flat)';

  // ── 추정 원인/질환 ────────────────────────────────────────────
  let etiology = '원인 불명';
  if (avgPTA <= 25) {
    etiology = '정상 청력 — 이상 소견 없음';
  } else if (hasNotch4k) {
    etiology = '소음성 난청(NIHL) — 이어폰·직업 소음 노출 추정';
  } else if (isCookieBite) {
    etiology = '유전성/선천성 난청 (Connexin 26 등 유전자 변이 가능)';
  } else if (hasLowFreqLoss && !isSenior) {
    etiology = '메니에르병(Ménière) / 내림프수종 가능성';
  } else if (hasHighFreqSlope && (isSenior || isElderly)) {
    etiology = '노인성 난청(Presbycusis) — 달팽이관 기저부 퇴행';
  } else if (hasHighFreqSlope) {
    etiology = '감각신경성 고주파 하강 — 노화·소음·약물 등 복합 원인';
  } else if (isFlat && avgPTA >= 30) {
    etiology = '전음성 요소 가능성 (중이염·이경화증 등) 또는 급성 광범위 손상';
  } else if (asymmetry >= 15) {
    etiology = '편측성 병변 — 청신경종(전정신경초종) 배제 필수';
  } else {
    etiology = '감각신경성 난청 — 원인 감별 청각 정밀 검사 필요';
  }

  // ── 응급도 ────────────────────────────────────────────────────
  let urgency:      AudiogramAnalysis['urgency'] = 'normal';
  let urgencyLabel  = '✅ 이상 없음';
  let urgencyColor  = '#2e7d32';
  let urgencyReason = '현재 검사에서 즉각적인 응급 소견은 없습니다.';

  if (asymmetry >= 15 && avgPTA > 40) {
    urgency       = 'emergency';
    urgencyLabel  = '🚨 즉시 병원';
    urgencyColor  = '#b71c1c';
    urgencyReason = `좌우 ${asymmetry} dB 비대칭 + 고도 손실 — 전정신경초종·뇌졸중 배제를 위한 MRI(청신경 조영증강) 즉시 필요. 72시간 내 치료가 예후를 결정합니다.`;
  } else if (asymmetry >= 15) {
    urgency       = 'refer';
    urgencyLabel  = '🔴 전문의 의뢰';
    urgencyColor  = '#c62828';
    urgencyReason = `좌우 ${asymmetry} dB 비대칭 — 이비인후과 정밀 검사 및 MRI 청신경 영상 필요.`;
  } else if (avgPTA > 55 && !isSenior) {
    urgency       = 'refer';
    urgencyLabel  = '🔴 전문의 의뢰';
    urgencyColor  = '#c62828';
    urgencyReason = '중고도 이상 난청이 고연령 외 원인으로 의심됩니다. 이비인후과 정밀 검진 및 ABR·임피던스 검사 필요.';
  } else if (hasLowFreqLoss && !isSenior) {
    urgency       = 'refer';
    urgencyLabel  = '🟠 전문의 상담';
    urgencyColor  = '#e65100';
    urgencyReason = '저주파 손실 패턴은 메니에르병·내림프수종 가능성으로 이비인후과 진찰 및 MRI 필요.';
  } else if (avgPTA > 25) {
    urgency       = 'caution';
    urgencyLabel  = '🟡 주의 관찰';
    urgencyColor  = '#f57f17';
    urgencyReason = '경미한 청력 손실이 확인됩니다. 정기 모니터링과 이비인후과 검진을 권장합니다.';
  }

  // ── EQ 추천 (논문 NAL-NL2 / DSL v5.0) ───────────────────────
  let eqMode: AudiogramAnalysis['eqMode'] = 'none';
  let eqReason = '';
  if (avgPTA > 25 && avgPTA <= 55) {
    eqMode   = 'NAL-NL2';
    eqReason = '경도~중도 난청: NAL-NL2 처방 — 어음 명료도와 청취 편안함 균형. 일상 대화·음악 감상에 최적.';
  } else if (avgPTA > 55) {
    eqMode   = 'DSL v5.0';
    eqReason = '중고도~고도 난청: DSL v5.0 처방 — 전 주파수 가청 범위 진입 목표. 고주파 +7 dB, 저주파 +14 dB 적극 증폭. 소음 속 어음 인식 최우선.';
  }

  // ── 임상 해석 노트 ──────────────────────────────────────────
  let clinicalNote = '';
  if (avgPTA <= 25) {
    clinicalNote = '현재 청력은 WHO 기준 정상 범위입니다. 정기적인 청력 모니터링과 소음 노출 주의가 예방에 도움이 됩니다.';
  } else if (hasNotch4k) {
    clinicalNote = `4 kHz V자 노치는 소음성 난청의 병리학적 특징입니다. 달팽이관 기저부 유모세포의 비가역적 손상이 기전으로, 추가 소음 노출 시 손실이 가속됩니다. 청력 보호구 착용이 필수입니다.${isChild ? ' 소아·청소년은 이어폰 볼륨을 최대치의 60% 이하로 제한해야 합니다.' : ''}`;
  } else if (hasHighFreqSlope && isSenior) {
    clinicalNote = '고주파 하강형 패턴은 노인성 난청(Presbycusis)의 전형으로, 달팽이관 기저부 유모세포의 퇴행성 변화입니다. ㅅ·ㅊ·ㅍ 등 고주파 자음 분별이 어렵고 소음 속 대화가 힘든 특성이 있습니다.';
  } else if (hasLowFreqLoss) {
    clinicalNote = '저주파 손실 패턴은 메니에르병(내림프수종)의 초기 특징입니다. 이명, 귀 충만감, 발작성 어지럼증이 동반되면 즉시 전문의를 방문하십시오.';
  } else if (isCookieBite) {
    clinicalNote = 'U자형(쿠키바이트) 패턴은 중간 주파수(1–2 kHz) 손실로 음성 대화 이해에 가장 큰 영향을 줍니다. Connexin 26 등 유전성 난청과 관련성이 높으므로 유전자 검사를 권장합니다.';
  } else if (isFlat && avgPTA >= 30) {
    clinicalNote = '광대역 평탄형 손실은 전음성 요소(중이염·이소골 이상·이경화증)나 급성 광범위 감각신경성 손상 모두 가능합니다. 기도-골도 차이(Air-Bone Gap) 측정을 위한 임피던스 청력검사가 필요합니다.';
  } else if (asymmetry >= 15) {
    clinicalNote = '비대칭 난청은 청신경종(전정신경초종), 내이도 혈관 병변, 돌발성 난청 후유증 등 단측 병변의 주요 신호입니다. 즉시 이비인후과를 방문하여 MRI(내이도 조영증강) 검사를 받으십시오.';
  } else {
    clinicalNote = `양측 순음 역치 ${avgPTA} dB HL로 감각신경성 난청이 확인됩니다. 추가적인 청각 정밀 검사(ABR·DPOAE·어음 인지 검사)와 이비인후과 진찰을 권장합니다.`;
  }

  // ── 권고사항 ────────────────────────────────────────────────
  let recommendation = '';
  if (avgPTA <= 25 && asymmetry < 10) {
    recommendation = '정기 청력 검사(연 1회 권장) · 소음 환경 85 dB 초과 시 보호구 착용 · 이어폰 사용 60/60 규칙 준수';
  } else if (urgency === 'emergency') {
    recommendation = '즉시 이비인후과 또는 응급실 방문 → MRI 청신경 조영증강 검사 → 돌발성 난청 스테로이드 치료 72시간 이내';
  } else if (urgency === 'refer') {
    recommendation = '2주 이내 이비인후과 방문 → ABR·임피던스·DPOAE 정밀 검사 → 필요 시 MRI 청신경 영상';
  } else if (avgPTA > 40) {
    recommendation = '보청기 적합(Fitting) 상담 · 청각 재활 프로그램 · NAL-NL2 또는 DSL v5.0 처방 기반 EQ 보조';
  } else {
    recommendation = '이비인후과 정기 검진 · 소음 노출 최소화 · 이어폰 60% 이하 볼륨 사용 · 청력 악화 시 즉시 방문';
  }

  return {
    hlType, hlTypeColor, severity, severityColor,
    shape, etiology, urgency, urgencyLabel, urgencyColor, urgencyReason,
    eqMode, eqReason, clinicalNote, recommendation, redFlags,
  };
}

// ── 청력도 패턴 분석 ─────────────────────────────────────────────────

export interface HealthRisk {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  level: 'info' | 'caution' | 'warning' | 'alert';
  description: string;
  detail: string;
  source: string;
}

const LEVEL_CONFIG = {
  info:    { label: '참고',  bg: '#e3f2fd', border: '#1565c0', badge: '#1565c0', text: '#0d47a1' },
  caution: { label: '주의',  bg: '#fff8e1', border: '#f9a825', badge: '#f57f17', text: '#e65100' },
  warning: { label: '위험',  bg: '#fff3e0', border: '#e64a19', badge: '#e64a19', text: '#bf360c' },
  alert:   { label: '긴급',  bg: '#fce4ec', border: '#b71c1c', badge: '#b71c1c', text: '#880e4f' },
};

function detectPattern(thresholds: Partial<Record<TestFrequency, number>>) {
  const f125 = thresholds[125];
  const f250 = thresholds[250];
  const f500 = thresholds[500];
  const f1k  = thresholds[1000];
  const f2k  = thresholds[2000];
  const f4k  = thresholds[4000];
  const f8k  = thresholds[8000];

  // 4 kHz 노치: 4k가 2k와 8k보다 10 dB 이상 높음
  const hasNotch4k = Boolean(
    f4k !== undefined && f2k !== undefined && f8k !== undefined &&
    f4k >= f2k + 10 && f4k >= f8k + 10
  );

  // 고주파 경사: (4k+8k 평균)이 (500+1k 평균)보다 20 dB 이상 높음
  const lowAvg  = [f500, f1k].filter((v): v is number => v !== undefined);
  const highAvg = [f4k,  f8k].filter((v): v is number => v !== undefined);
  const hasHighFreqSlope = Boolean(
    lowAvg.length > 0 && highAvg.length > 0 &&
    (highAvg.reduce((a,b)=>a+b,0)/highAvg.length) -
    (lowAvg.reduce((a,b)=>a+b,0)/lowAvg.length) >= 20
  );

  // 저주파 손실: (125+250 평균)이 (2k+4k 평균)보다 20 dB 이상 높음
  const loFreqs = [f125, f250].filter((v): v is number => v !== undefined);
  const midFreqs = [f2k, f4k].filter((v): v is number => v !== undefined);
  const hasLowFreqLoss = Boolean(
    loFreqs.length > 0 && midFreqs.length > 0 &&
    (loFreqs.reduce((a,b)=>a+b,0)/loFreqs.length) -
    (midFreqs.reduce((a,b)=>a+b,0)/midFreqs.length) >= 20
  );

  // 평탄형: 전 주파수 표준편차 < 15 dB
  const allVals = [f125, f250, f500, f1k, f2k, f4k, f8k].filter((v): v is number => v !== undefined);
  let isFlat = false;
  if (allVals.length >= 4) {
    const mean = allVals.reduce((a,b)=>a+b,0)/allVals.length;
    const std  = Math.sqrt(allVals.reduce((a,b)=>a+(b-mean)**2,0)/allVals.length);
    isFlat = std < 15 && mean > 15;
  }

  return { hasNotch4k, hasHighFreqSlope, hasLowFreqLoss, isFlat };
}

function analyzeHealthRisks(result: TestResult, ageStr?: string, genderArg?: string): HealthRisk[] {
  // ── 기본 지표 ─────────────────────────────────────────────────────
  const rightPTA = getPTA(result.right);
  const leftPTA  = getPTA(result.left);
  const avgPTA   = (rightPTA !== null && leftPTA !== null)
    ? Math.round((rightPTA + leftPTA) / 2)
    : (rightPTA ?? leftPTA ?? 0);
  const asymmetry = (rightPTA !== null && leftPTA !== null)
    ? Math.abs(rightPTA - leftPTA) : 0;

  const rP = detectPattern(result.right);
  const lP = detectPattern(result.left);
  const hasNotch4k       = rP.hasNotch4k      || lP.hasNotch4k;
  const hasHighFreqSlope = rP.hasHighFreqSlope || lP.hasHighFreqSlope;
  const hasLowFreqLoss   = rP.hasLowFreqLoss  || lP.hasLowFreqLoss;
  const isFlat           = rP.isFlat          || lP.isFlat;

  // ── 주파수 대역별 평균 (논문 기반) ────────────────────────────────
  const _avg = (vals: (number|undefined)[]) => {
    const v = vals.filter((x): x is number => x !== undefined);
    return v.length > 0 ? v.reduce((a,b)=>a+b,0)/v.length : 0;
  };
  // 고주파 (3000~8000 Hz): 심혈관·말초신경병증 지표
  const highFreqAvg = _avg([
    result.right[4000], result.right[8000],
    result.left[4000],  result.left[8000],
  ]);
  // 저중주파 (500~2000 Hz): HDL·신기능·인지 지표
  const lowMidAvg = _avg([
    result.right[500], result.right[1000], result.right[2000],
    result.left[500],  result.left[1000],  result.left[2000],
  ]);
  // 초고주파 (4000+8000): CHD·SLE·골다공증 지표
  const ultraHighAvg = _avg([
    result.right[4000], result.right[8000],
    result.left[4000],  result.left[8000],
  ]);

  // ── 연령·성별 변수 ────────────────────────────────────────────────
  const age        = ageStr ? parseInt(ageStr, 10) : undefined;
  const hasAge     = age !== undefined && !isNaN(age) && age > 0;
  const isFemale   = genderArg === 'female';
  const isMale     = genderArg === 'male';

  const isChild          = hasAge && age! < 18;
  const isYoungAdult     = hasAge && age! >= 18 && age! < 40;
  const isMiddleAge      = hasAge && age! >= 40 && age! < 60;
  const isSenior         = hasAge && age! >= 60 && age! < 70;
  const isElderly        = hasAge && age! >= 70;
  const isSeniorPlus     = hasAge && age! >= 60;
  const isReproductiveF  = isFemale && hasAge && age! >= 15 && age! < 50;
  const isPostMenopausal = isFemale && hasAge && age! >= 50;

  const risks: HealthRisk[] = [];

  // ══════════════════════════════════════════════════════════════════
  // ① 비대칭 난청 — 긴급 (최우선)
  // ══════════════════════════════════════════════════════════════════
  if (asymmetry >= 15) {
    risks.push({
      id: 'asymmetry', icon: '🚨',
      title: '비대칭 난청 — 즉시 전문의 방문 권고',
      subtitle: `좌우 차이 ${asymmetry} dB HL`,
      level: 'alert',
      description: '양쪽 귀 15 dB 이상 차이는 청신경종·뇌졸중 가능성을 반드시 배제해야 합니다.',
      detail: `우측 ${rightPTA ?? '-'} dB HL vs 좌측 ${leftPTA ?? '-'} dB HL — ${asymmetry} dB 차이 확인. 비대칭 감각신경성 난청은 청신경종(전정신경초종), 뇌졸중, 내이도 혈관 병변의 가능성을 시사합니다. 이비인후과에서 MRI(청신경 조영증강) 및 정밀 청각검사를 즉시 받으시기 바랍니다.${isChild ? ' 소아의 경우 선천성 이상 여부도 함께 확인이 필요합니다.' : ''}`,
      source: 'ASHA 청력 선별 가이드라인 · 임상 청각학 기준',
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ② 소음성 난청 (4 kHz 노치)
  // ══════════════════════════════════════════════════════════════════
  if (hasNotch4k) {
    const ageNote = isChild
      ? ' 소아·청소년의 4 kHz 노치는 이어폰·헤드폰 과다 사용, 공연장 소음 노출이 주요 원인입니다.'
      : isYoungAdult
        ? ' 20~30대의 4 kHz 노치는 직업적 소음뿐 아니라 고음량 음악(이어폰, 클럽)에 의한 경우가 많습니다.'
        : '';
    risks.push({
      id: 'nihl', icon: '🏭',
      title: '소음성 난청(NIHL) 패턴',
      subtitle: '4 kHz 노치 — 소음 노출 확인 필요',
      level: 'warning',
      description: '4 kHz 급격한 역치 상승은 산업 소음·충격음 노출의 가장 특징적 소견입니다.',
      detail: `4 kHz "노치(notch)" 패턴이 감지되었습니다. 이는 광대역 산업 소음(기계·공구), 군사 충격음(총성·폭발음), 고음량 음악 노출에 의한 소음성 난청의 병리학적 특징입니다. 내유모세포 및 나선신경절의 비가역적 손상이 기전입니다. 더 이상의 소음 노출 차단과 청력 보호구 착용이 필수적입니다.${ageNote}`,
      source: 'Moore et al., Trends in Hearing 2022 · NHANES Noise Study',
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ③ 인지기능 저하 / 치매 — 연령별 위험도 정밀화
  // ══════════════════════════════════════════════════════════════════
  if (avgPTA > 25) {
    let demLevel: HealthRisk['level'] = 'caution';
    let baseHR = 1.89;
    if      (avgPTA <= 40) { baseHR = 1.89; demLevel = 'caution'; }
    else if (avgPTA <= 70) { baseHR = 3.00; demLevel = 'warning'; }
    else                   { baseHR = 4.94; demLevel = 'alert';   }
    const ageBonus = isSeniorPlus
      ? ` 60세 이상 고령자는 치매 발생 위험이 71% 추가 상승(HR 1.71, Framingham Heart Study). APOE ε4 보유자는 위험비 최대 2.86배.`
      : isMiddleAge
        ? ` 중장년(40~59세)에서 PTA 역치 10 dB 증가마다 치매 위험 1.27배 가중(95% CI 1.06~1.50).`
        : '';
    const wmhNote = isSeniorPlus ? ' 대뇌 백질 고신호 강도(WMHV) 증가와 선형 상관(β=0.02). 실행 기능 저하 β=−0.04.' : '';
    risks.push({
      id: 'dementia', icon: '🧠',
      title: '인지기능 저하 / 치매',
      subtitle: `치매 위험 HR ≈ ${baseHR}${isSeniorPlus ? ' (+연령 가중)' : ''}`,
      level: demLevel,
      description: '청력손실은 치매의 수정 가능한 최대 단일 위험인자. 10 dB 악화마다 위험 27% 증가.',
      detail: `순음평균 ${avgPTA} dB HL — 정상 청력 대비 치매 위험비 ${baseHR}. 저·중주파수(0.5~2 kHz) 손실은 기억력 저하, 실행 능력 저하와 가장 강한 상관관계(CLSA N=13,654).${ageBonus}${wmhNote} ACHIEVE 임상시험(Lancet 2023)에서 보청기 착용이 치매 위험 48% 감소. MoCA·MMSE 인지기능 선별검사를 권장합니다.`,
      source: 'Framingham Heart Study(N=2,178, 15yr) · Lin et al., JAMA 2011 · ACHIEVE Lancet 2023 · CLSA N=13,654',
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ④ 우울증·불안장애 — PTA 상관계수 r=0.792/0.781
  // ══════════════════════════════════════════════════════════════════
  if (avgPTA > 25) {
    const depLevel: HealthRisk['level'] =
      avgPTA > 55 ? 'warning' : avgPTA > 40 ? 'caution' : 'info';
    const ageNote = isChild
      ? ' 소아·청소년의 경우 사회적 고립, 학업 어려움으로 우울감이 더 빠르게 악화될 수 있습니다.'
      : isYoungAdult
        ? ' 젊은 성인은 주관적 청력 장애 인식(HHIA β≈0.37)이 우울 분산의 30%를 설명합니다.'
        : isSeniorPlus
          ? ' 노인의 청각 고립은 우울·인지 저하를 가속화합니다. 정기 정신건강 선별이 필요합니다.'
          : '';
    risks.push({
      id: 'depression', icon: '💙',
      title: '우울증 · 불안장애',
      subtitle: avgPTA > 55 ? 'PTA-SDS 상관 r=0.792 — 고위험' : avgPTA > 40 ? 'SAS r=0.781 불안 52.3% 공존' : '경도 난청도 우울 OR 1.35 상승',
      level: depLevel,
      description: '난청 환자 52.3% 불안·48.8% 우울 공존. PTA-우울 상관 r=0.792(p<0.001).',
      detail: `순음평균 ${avgPTA} dB HL — PTA 역치와 불안(SAS r=0.781)·우울(SDS r=0.792)·이명장애지수(THI r=0.808) 간 매우 강력한 정적 상관 입증(N=600). 달팽이관 손상으로 인한 청각 피질의 과잉 활성화가 변연계·편도체를 자극하는 것이 기전입니다. 주관적 청력 장애감이 클수록 우울 위험이 더 크게 증가합니다.${ageNote} PHQ-9·BAI 선별검사를 권장합니다.`,
      source: '이명·난청-기분장애 상관연구(N=600) · Frontiers Neurology 2024(N=254,466)',
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ⑤ 중증 정신질환(SMI) — 항정신병 약물 + PTA 역치 악화
  // ══════════════════════════════════════════════════════════════════
  if (avgPTA > 25 && (isMiddleAge || isSeniorPlus || isYoungAdult)) {
    risks.push({
      id: 'smi', icon: '🧩',
      title: '중증 정신질환(SMI) 관련성',
      subtitle: '항정신병 약물 사용자 PTA +3.75~4.49 dB 악화',
      level: 'info',
      description: '조현병·양극성장애 환자는 항정신병 약물 복용 시 청력 역치가 추가 악화됩니다.',
      detail: `HCHS/SOL 코호트 다변량 분석 결과, 항정신병 약물 복용 환자는 대조군 대비 더 좋은 귀(better ear)의 PTA 역치가 3.75 dB(95% CI 2.36~5.13) 더 나빴으며, 정신과 처방 항정신병 약물 사용자는 4.49 dB 더 악화(95% CI 2.56~6.43, p<.001). SMI 자체의 병태생리 또는 항정신병 약물의 잠재적 이독성이 기전으로 추정됩니다. 정신과 진료 중이라면 정기적 PTA 모니터링이 권장됩니다.`,
      source: 'HCHS/SOL 코호트 다변량 분석 · J Psychiatric Res 2023',
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ⑥ ADHD — 연령 특이적
  // ══════════════════════════════════════════════════════════════════
  if (isChild || (isYoungAdult && (avgPTA > 15 || hasHighFreqSlope))) {
    risks.push({
      id: 'adhd', icon: '⚡',
      title: isChild ? 'ADHD / 학습장애 배제 필요' : 'ADHD · 청각처리장애(APD)',
      subtitle: isChild ? '소아 PTA 정상이어도 청각처리 결함 가능' : '음조 감별·주의력 연관성',
      level: isChild ? 'caution' : 'info',
      description: isChild
        ? '청력 손실은 ADHD로 오진되기 쉽습니다. 청각처리장애(APD) 검사가 선행되어야 합니다.'
        : 'ADHD 환자 중 1/3이 청각 갭 탐지 점수와 TOVA 주의력 지수 상관관계를 보입니다.',
      detail: isChild
        ? `소아 청력 손실은 교실에서 부주의를 유발해 ADHD로 오진될 수 있습니다(진단적 덮어씌우기). 순음청력 정상이어도 ADHD 아동에서 청각 불일치 부정 전위(MMN) 이상, 주의력 전환 기능 결함 관찰. ADHD 평가 전 ABR·APD 검사 병행 필수. 메틸페니데이트 복용 시 드물게 돌발성 난청 부작용 보고 — 청력 모니터링 필요.`
        : `청각 갭 탐지(Gap Detection) 점수와 TOVA 주의력 검사 간 유의미한 상관관계 확인. 음조 변화 감지 능력이 전두엽 지속적 주의력 네트워크와 긴밀히 결합. 청각처리장애(APD) 정밀 평가를 권장합니다.`,
      source: 'ERP-ADHD 청각처리연구 · TOVA-청각갭탐지 상관연구',
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ⑦ 발달성 난독증 / 중추 청각 처리 장애 (APD)
  // ══════════════════════════════════════════════════════════════════
  // 조건: 소아이거나, 청소년/젊은 성인이며 PTA가 비교적 낮은(≤25 dB) 고주파 경사형
  if (isChild || (isYoungAdult && avgPTA <= 25)) {
    const normalPTA = avgPTA <= 20;
    risks.push({
      id: 'dyslexia', icon: '📖',
      title: '발달성 난독증 · 중추 청각 처리 장애(APD)',
      subtitle: normalPTA
        ? 'PTA 정상이어도 음운·주파수 변별 결함 가능'
        : '청각처리 결함 → 읽기·음운 인식 장애 연관',
      level: isChild ? 'caution' : 'info',
      description: '순음 역치가 정상 범위여도 대뇌 청각피질의 주파수 변별 능력이 저하되면 음운 인식이 어려워 발달성 난독증으로 이어질 수 있습니다.',
      detail: [
        normalPTA
          ? `현재 PTA ${avgPTA} dB HL로 정상 범위이지만, 발달성 난독증 아동은 역치가 정상임에도 순음 주파수 변별(Frequency Discrimination, FD) 능력이 유의미하게 저하됩니다.`
          : `PTA ${avgPTA} dB HL — 경계성 청력이라도 중추 청각 처리 능력 저하가 동반되면 음운 인식 결함이 심화될 수 있습니다.`,
        `EEG 연구에서 난독증 아동은 청각피질의 α(알파)·β(베타)·γ1(감마1) 신경 네트워크가 비정상 패턴을 보이며, 특히 전두엽-감각 영역 간 허브 연결(hub connectivity)이 소실됩니다.`,
        `음운 인식(phonemic awareness) 결함은 읽기 습득 실패의 핵심 기전으로, 청각적 주파수 변별 능력과 직접 연관됩니다.`,
        `권장 검사: ① 순음청력검사(PTA) + ② 순음 주파수 변별 검사(FD Test) 병행 → 조기 난독증 바이오마커로 활용 가능.`,
        isChild
          ? `소아에서 학습 부진·글자 인식 어려움이 동반된다면 APD 전문 청각사 또는 소아신경과 협진을 권장합니다.`
          : `청소년/성인에서도 지속적인 읽기 어려움이 있다면 중추 청각 처리 장애(APD) 정밀 평가를 고려하십시오.`,
      ].join(' '),
      source: 'EEG α·β·γ1 청각피질 연구 · Frontal-sensory hub connectivity 난독증 연구 · PTA+FD 조기 바이오마커 연구',
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ⑧ 심혈관질환 — 고주파 OR 4.39, 저중주파 HDL OR 2.20
  // ══════════════════════════════════════════════════════════════════
  const chdHighFreq = highFreqAvg > 40;
  const hdlLowMid   = lowMidAvg > 25;
  if (chdHighFreq || hdlLowMid || hasLowFreqLoss || avgPTA > 25) {
    let cvLevel: HealthRisk['level'] = 'info';
    let cvSubtitle = '';
    let cvDetail   = '';
    const ageNote  = (isMiddleAge || isSeniorPlus)
      ? ` ${hasAge ? age+'세' : '중장년'} 연령대에서 내피세포 기능 부전이 누적되어 내이 허혈 위험이 더 높습니다.`
      : '';
    if (chdHighFreq) {
      cvLevel    = 'warning';
      cvSubtitle = `고주파(${Math.round(highFreqAvg)} dB) — 관상동맥질환 OR 4.39`;
      cvDetail   = `고주파(3000~8000 Hz) 평균 역치 ${Math.round(highFreqAvg)} dB HL — 관상동맥심장질환(CHD) 병력 시 고주파 청력 손상 OR 4.39(NHANES N=536). 달팽이관 기저 회전부는 와우동맥 말단에 위치해 허혈에 가장 먼저 취약. 심전도·관상동맥 검사, HDL·LDL 지질 프로파일 확인을 권장합니다.${ageNote} 당뇨성 말초신경병증 동반 시 OR 4.42로 추가 상승.`;
    } else if (hdlLowMid) {
      cvLevel    = 'caution';
      cvSubtitle = `저중주파(${Math.round(lowMidAvg)} dB) — 저 HDL 콜레스테롤 OR 2.20`;
      cvDetail   = `저·중주파수(500~2000 Hz) 평균 역치 ${Math.round(lowMidAvg)} dB HL — HDL 콜레스테롤 40 mg/dL 미만에서 저·중주파 손상 OR 2.20(NHANES 분석). 달팽이관 첨부 모세포 대사 환경 악화 및 허혈성 괴사가 기전. 지질 패널(TC, LDL, HDL, TG) 검사와 순환기내과 상담을 권장합니다.${ageNote}`;
    } else {
      cvSubtitle = `뇌졸중 HR 1.33 · 관상동맥질환 OR 1.36`;
      cvDetail   = `순음평균 ${avgPTA} dB HL — 청력손실은 뇌졸중 HR 1.33, 관상동맥질환 OR 1.36과 독립적으로 연관됩니다. 내이 미세혈관이 전신 혈관 내피 기능 부전의 조기 지표로 작용합니다. 혈압·콜레스테롤·공복혈당 정기 검진을 권장합니다.${ageNote}`;
    }
    risks.push({
      id: 'cardiovascular', icon: '🫀',
      title: '심혈관질환 · HDL 이상지질혈증',
      subtitle: cvSubtitle, level: cvLevel,
      description: '내이 미세혈관은 전신 심혈관 기능 부전의 조기 탐지 센서입니다.',
      detail: cvDetail,
      source: 'NHANES 당뇨코호트(N=536) · OHN Meta-analysis 2024 · Framingham Cohort HDL Study',
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ⑨ 제2형 당뇨병 · 미세혈관병증
  // ══════════════════════════════════════════════════════════════════
  if (hasHighFreqSlope || avgPTA > 25) {
    const dmAgeNote = isMiddleAge
      ? ` 40~59세 중장년층은 제2형 당뇨 유병률이 높고, 조기 미세혈관 합병증으로 내이 손상이 진행될 수 있습니다.`
      : isSeniorPlus ? ` 고령자의 고주파 손실은 오랜 혈당 불량 관리에 따른 누적 와우 손상일 가능성이 있습니다.` : '';
    risks.push({
      id: 'diabetes', icon: '🩸',
      title: '제2형 당뇨병 · 미세혈관병증',
      subtitle: hasHighFreqSlope ? '고주파 하향 경사형 — 당뇨성 와우 손상 패턴' : '참고 수준 — HbA1c 확인 권장',
      level: hasHighFreqSlope ? 'caution' : 'info',
      description: '당뇨 환자 청력손실 발생률 정상인의 약 2배. 비타민 D 결핍이 당뇨성 청력손실 핵심 매개변수.',
      detail: hasHighFreqSlope
        ? `고주파(2~8 kHz) 하향 경사형 — 당뇨성 와우 미세혈관 손상(모세혈관벽 비후, AGEs 축적, 나선신경절 퇴행) 특징적 패턴. NHANES 분석에서 CHD 병력 시 OR 4.39, 말초신경병증 시 OR 4.42. 25(OH)D(비타민 D)가 고주파 역치 보호 독립 예측변수(β=−0.605, p=0.041). 공복혈당·HbA1c·25(OH)D 동시 검사를 권장합니다.${dmAgeNote}`
        : `청력손실과 제2형 당뇨병 간 독립적 연관성. 비타민 D 수치 확인 및 공복혈당 검사를 권장합니다.${dmAgeNote}`,
      source: 'NHANES T2DM 코호트(N=536) · Molecular Medicine 2023',
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ⑩ 만성 신장질환(CKD) — 병기별 유병률 매핑
  // ══════════════════════════════════════════════════════════════════
  if (avgPTA > 25 || highFreqAvg > 25) {
    let ckdStageGuess = '';
    let ckdLevel: HealthRisk['level'] = 'info';
    if      (highFreqAvg > 55) { ckdStageGuess = 'CKD Stage 4~5 수준 패턴 — 유병률 50~80%'; ckdLevel = 'warning'; }
    else if (highFreqAvg > 35) { ckdStageGuess = 'CKD Stage 3 수준 패턴 — 유병률 13.6%';    ckdLevel = 'caution'; }
    else                       { ckdStageGuess = '초기 신장기능 저하 가능성 — eGFR 확인 권장'; }
    const ckdAgeNote = isSeniorPlus ? ` 노인에서 eGFR은 연령만으로도 자연 감소하나, 청력 악화 동반 시 요독성 신경독성을 의심해야 합니다.` : '';
    risks.push({
      id: 'ckd', icon: '🫘',
      title: '만성 신장질환(CKD)',
      subtitle: ckdStageGuess, level: ckdLevel,
      description: 'CKD Stage 4~5에서 청력손실 유병률 50~80%. 신장·달팽이관 Na-K-ATPase 이온 수송 공유.',
      detail: `신장 사구체 기저막과 달팽이관 혈관조(Stria vascularis)는 동일한 Na-K-ATPase 이온 수송 기전을 공유합니다. 병기별 난청 유병률: Stage 2=0%, Stage 3=13.6%, Stage 4=50%, Stage 5=80%(N=70 전향적 연구). 확장 고주파수(8~18 kHz) 역치는 아임상 신장 기능 저하 예측 AUC 0.70 초과. 투석 기간이 길수록 이명·현기증 빈도 정비례 증가. 혈청 크레아티닌·eGFR·BUN 검사를 권장합니다.${ckdAgeNote}`,
      source: '한국 역학 데이터 · CKD 전향적 관찰연구(N=70) · Nature Reviews Nephrology 2024',
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ⑪ SLE(루푸스) · 자가면역 내이질환
  // ══════════════════════════════════════════════════════════════════
  const autoimmuneSuspect =
    (isFemale && (isYoungAdult || isMiddleAge)) ||
    (asymmetry >= 10 && avgPTA > 25) ||
    (avgPTA > 25 && hasHighFreqSlope && !hasNotch4k);
  if (autoimmuneSuspect) {
    const sleNote = isFemale && (isYoungAdult || isMiddleAge)
      ? ` 20~50세 여성에서 SLE 발병률 가장 높음(남성 대비 9:1). 감각신경성 난청이 장기 손상 조기 지표.`
      : '';
    risks.push({
      id: 'sle', icon: '🔴',
      title: 'SLE(루푸스) · 자가면역 내이질환',
      subtitle: 'SLE 난청 위험 OR 8배 · 표준 PTA 정상도 70% 고주파 손실',
      level: (isFemale && isYoungAdult) ? 'caution' : 'info',
      description: 'SLE 환자 난청 27.47% vs 대조군 3.3%. 9~16 kHz 초고주파에서 병리가 먼저 나타납니다.',
      detail: `SLE 환자(N=91) vs 대조군: 난청 발생률 27.47% vs 3.3%(OR 8배 이상). SDI 점수 ≥2: OR 9.13, 이차성 쇼그렌 증후군 동반: OR 8.20. 표준 PTA 정상인 SLE 환자의 약 70%가 확장 고주파수(9000~16000 Hz) 검사에서 감각신경성 손실 확인 — 면역복합체의 혈관조 침착과 미세 혈관염이 기전.${sleNote} 갑상선 자가면역질환(하시모토·그레이브스), 류마티스 관절염, 강직성 척추염도 4 kHz 이상 고주파 손실과 연관됩니다. ANA, anti-dsDNA 검사와 류마티스내과 상담을 권장합니다.`,
      source: 'SLE 통제연구(N=91) · EHFA 확장고주파수 분석 · 갑상선-청력연구',
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ⑫ 비타민 D 결핍 — 연령·성별 특이성
  // ══════════════════════════════════════════════════════════════════
  {
    let vitDLevel: HealthRisk['level'] = 'info';
    let vitDSubtitle = '';
    let vitDDetail   = '';
    if (isChild || isYoungAdult) {
      vitDSubtitle = '30세 미만 돌발성 난청(SSNHL) — 비타민 D 결핍 고위험';
      vitDDetail   = `30세 미만에서 비타민 D 결핍(< 20 ng/mL)은 돌발성 감각신경성 난청(SSNHL) 발병·재발 위험을 급격히 높입니다. 이명 환자의 66%가 심각한 비타민 D 결핍 상태임이 보고되었습니다. 혈청 25(OH)D 검사를 권장합니다.`;
    } else if (isMale && isSeniorPlus) {
      vitDLevel    = 'caution';
      vitDSubtitle = `고령 남성 노인성 난청(ARHL) — 비타민 D 결핍 OR 1.638`;
      vitDDetail   = `KNHANES 다변량 분석: 비타민 D 결핍 노인 남성의 노인성 난청 OR 1.638(95% CI 1.058~2.538, p=0.027). 대한민국 남성의 65.7%가 비타민 D 결핍(< 50 nmol/L). UK Biobank 분석에서도 비타민 D 결핍은 70세 이상에서 저주파(LFHL) 및 대화음 주파수(SFHL) 난청 확률 대폭 증가. 혈청 25(OH)D 검사와 전문의 상담을 강력 권장합니다.`;
    } else if (isPostMenopausal) {
      vitDSubtitle = '폐경 후 여성 — 비타민 D 결핍·골다공증 연관 청력 손실';
      vitDDetail   = `여성의 76.7%가 비타민 D 결핍(KNHANES). 폐경 후 비타민 D 부족은 골다공증과 함께 이낭(otic capsule) 탈석회화 및 와우 이온 항상성 파괴를 동반합니다. 제2형 당뇨 환자에서 25(OH)D가 고주파 역치 보호 독립 예측변수(β=−0.605, p=0.041). 혈청 25(OH)D와 골밀도(DXA) 동시 검사를 권장합니다.`;
    } else {
      vitDSubtitle = '비타민 D 결핍 — 이명·난청 위험 상승';
      vitDDetail   = `비타민 D 결핍(< 20 ng/mL)은 이명(환자 66% 결핍), 노인성 난청, 돌발성 난청과 강력하게 연관됩니다. 달팽이관 내 비타민 D 수용체(VDR) 확인. 혈청 25(OH)D 검사를 권장합니다.`;
    }
    risks.push({
      id: 'vitD', icon: '☀️',
      title: '비타민 D 결핍',
      subtitle: vitDSubtitle, level: vitDLevel,
      description: '국내 성인 65~77% 비타민 D 결핍. 이명·돌발성 난청·노인성 난청과 강력 연관.',
      detail: vitDDetail,
      source: 'KNHANES 비타민D-청력 다변량 분석(OR 1.638) · UK Biobank · SSNHL-비타민D 연구',
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ⑬ 철 결핍성 빈혈(IDA) — 연령·성별 특이성
  // ══════════════════════════════════════════════════════════════════
  if (isChild || isReproductiveF || avgPTA > 25) {
    const idaLevel: HealthRisk['level'] = (isReproductiveF || isChild) ? 'caution' : 'info';
    const idaNote = isChild
      ? `소아(4~21세) 혈청 페리틴·헤모글로빈 기준치 미달 시 감각신경성 난청 OR 3.67배(95% CI 1.60~7.30). 와우 나선신경절 세포 수 감소, 부동섬모 붕괴가 기전.`
      : isReproductiveF
        ? `가임기 여성 IDA 진단 후 첫 1년 내 청력 손실 HR 2.79(95% CI 2.00~3.88, TriNetX N=73,282). Hb < 10 g/dL 중증 빈혈에서 난청 유병률 62.9~64.3%. 철분 보충 치료가 청력 역치를 부분적으로 회복시킬 수 있습니다.`
        : `철 결핍성 빈혈은 혈관조 위축, 코르티 기관 나선신경절 세포 감소를 유발합니다. 중등도 빈혈 환자의 46.8%, 중증의 62.9%에서 감각신경성 난청 동반.`;
    risks.push({
      id: 'ida', icon: '🩺',
      title: '철 결핍성 빈혈(IDA)',
      subtitle: isChild ? '소아 IDA — 난청 OR 3.67배' : isReproductiveF ? '가임기 여성 1년 내 난청 HR 2.79' : '빈혈-난청 연관성',
      level: idaLevel,
      description: '산소 운반 능력 저하 → 고대사 활동 내이 직격. 중증 빈혈 환자 62.9% 감각신경성 난청 동반.',
      detail: idaNote + ` CBC·혈청 페리틴·헤모글로빈 검사를 시행하고, 원인 불명 청력 저하 시 철분 결핍을 반드시 배제하시기 바랍니다.`,
      source: 'TriNetX 코호트(N=73,282) · 빈혈-SNHL 임상연구(Fischer 검증) · 소아 IDA OR 3.67',
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ⑭ 골다공증 · 낙상·골절 위험
  // ══════════════════════════════════════════════════════════════════
  if (isPostMenopausal || isElderly) {
    const osteoLevel: HealthRisk['level'] =
      (isElderly && ultraHighAvg > 40) ? 'warning' :
      (isPostMenopausal && ultraHighAvg > 35) ? 'caution' : 'info';
    const fracNote = isElderly
      ? ` 25년 추적 종단 연구에서 고주파 PTA 역치 저하(p=0.007)·중주파 역치 저하(p=0.003)는 BMD(골밀도)보다 향후 골절을 더 예리하게 예측했습니다(체간 균형 상실 p=0.039 동반).`
      : '';
    risks.push({
      id: 'osteoporosis', icon: '🦴',
      title: '골다공증 · 낙상·골절 위험',
      subtitle: `고주파(8kHz) 손실 — 골다공증 OR 2.648(여성 50세 이상)`,
      level: osteoLevel,
      description: '골다공증 여성의 8 kHz 청력 손실 OR 2.648. PTA는 DXA(골밀도)보다 골절 예측력 높음.',
      detail: `폐경 후 여성 다중 로지스틱 회귀 분석: 골다공증 환자의 4 kHz 손실 OR 2.078(95% CI 1.092~3.954), 8 kHz 손실 OR 2.648(95% CI 1.543~4.544). 전정기관 감각 모세포 퇴행이 공간 지각 능력 상실·고유수용성 감각 결함으로 이어져 낙상 위험을 가중시킵니다.${fracNote} 비타민 D 혈중 농도, 칼슘 수치, DXA 골밀도 검사를 권장합니다.`,
      source: '골다공증-PTA 다중 로지스틱 회귀(OR 2.648) · 25년 종단연구(골절 예측) · 메타분석 OR 1.2~4.50',
    });
  } else if (isElderly && !isFemale && ultraHighAvg > 40) {
    risks.push({
      id: 'fall_risk', icon: '🦴',
      title: '고령 낙상·골절 위험',
      subtitle: '고주파 손실 — 전정 기능 저하·균형 감각 이상',
      level: 'info',
      description: '청각·전정기관 인접. 청력 손실은 균형 감각 저하로 이어질 수 있습니다.',
      detail: `고주파(4~8 kHz) 손실은 달팽이관과 인접한 전정기관의 감각 모세포 퇴행을 시사하며, 공간 지각 능력 저하 및 낙상 위험 증가와 연관됩니다. 25년 추적연구에서 PTA 역치가 BMD보다 낙상·골절을 더 예리하게 예측. 균형 기능 검사와 낙상 예방 프로그램 참여를 권장합니다.`,
      source: '25년 종단연구(골절 예측) · 전정기능-PTA 상관연구',
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ⑮ 노인성 난청 아형 분석
  // ══════════════════════════════════════════════════════════════════
  if (avgPTA > 20) {
    if (isFlat && isSeniorPlus) {
      risks.push({
        id: 'presbycusis_strial', icon: '📊',
        title: '노인성 난청 — 대사형(혈관조형)',
        subtitle: '평탄형 청력도 — 혈관조 위축 패턴',
        level: 'info',
        description: '달팽이관 혈관조 위축에 의한 대사형 패턴. 보청기 효과 우수.',
        detail: '평탄형(flat) 청력도는 달팽이관 혈관조(stria vascularis) 위축에 의한 노인성 난청 대사형 패턴입니다. 어음변별력이 비교적 보존되어 보청기 효과가 가장 우수합니다. 심혈관 및 대사 위험인자(혈압, 혈당, 지질)를 함께 관리하시기 바랍니다.',
        source: 'Schuknecht & Gacek, AONR 1993 · Int J Audiology 2009',
      });
    } else if (hasHighFreqSlope && isSeniorPlus) {
      risks.push({
        id: 'presbycusis_sensory', icon: '📊',
        title: '노인성 난청 — 감각형(유모세포 손실)',
        subtitle: '고주파 하향 경사형',
        level: 'info',
        description: '달팽이관 기저부 유모세포 소실. 고주파 자음(ㅅ, ㅈ, ㅊ) 인지 저하.',
        detail: '고주파 경사형 청력도는 달팽이관 기저부 유모세포 소실에 의한 감각형 노인성 난청 패턴입니다. 고주파 자음(ㅅ, ㅈ, ㅊ, ㅍ) 인지에 어려움을 겪으며, 말소리는 들려도 무슨 말인지 모르는 증상으로 나타납니다. 보청기 적합 및 청각 재활 치료사 상담을 권장합니다.',
        source: 'Schuknecht & Gacek, AONR 1993 · Journal of Neuroscience 2020',
      });
    } else if (isFlat && !isSeniorPlus) {
      risks.push({
        id: 'presbycusis_young', icon: '⚠️',
        title: '조기 대사성 청력 손실',
        subtitle: '젊은 연령대 평탄형 — 혈관·대사 원인 배제 필요',
        level: 'caution',
        description: '젊은 연령의 평탄형 손실은 혈관·대사·자가면역 원인을 먼저 배제해야 합니다.',
        detail: `${hasAge ? age+'세' : '현재 연령'}에서의 평탄형 청력 손실은 혈관조 이상, 대사증후군, 자가면역 내이질환, 이독성 약물 등의 원인을 먼저 배제해야 합니다. 내분비내과·이비인후과 정밀 검사를 권장합니다.`,
        source: '임상 청각학 가이드라인 · 자가면역 내이질환 진단 기준',
      });
    }
  }

  return risks;
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

  for (let db = -10; db <= 100; db += 10) {
    const y = yPos(db);
    svg += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#ccc" stroke-width="0.5"/>`;
    svg += `<text x="${left - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="#555">${db}</text>`;
  }

  freqs.forEach(f => {
    const x = xPos(f);
    svg += `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="#ccc" stroke-width="0.5"/>`;
    const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
    svg += `<text x="${x}" y="${top - 8}" text-anchor="middle" font-size="9" fill="#555">${label}</text>`;
  });

  svg += `<rect x="${left}" y="${top}" width="${plotW}" height="${plotH}" fill="none" stroke="#999" stroke-width="1"/>`;
  svg += `<text x="${left + plotW / 2}" y="${H - 4}" text-anchor="middle" font-size="10" fill="#333">주파수 (Hz)</text>`;
  svg += `<text transform="rotate(-90,12,${top + plotH / 2})" x="12" y="${top + plotH / 2}" text-anchor="middle" font-size="10" fill="#333">dB HL</text>`;

  const drawEar = (
    thresholds: Partial<Record<TestFrequency, number>>,
    color: string,
    symbol: 'O' | 'X'
  ) => {
    const pts = freqs
      .filter(f => thresholds[f as TestFrequency] !== undefined)
      .map(f => ({ x: xPos(f), y: yPos(thresholds[f as TestFrequency]!) }));

    if (pts.length > 1) {
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
      svg += `<path d="${d}" stroke="${color}" stroke-width="2" fill="none"/>`;
    }

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

// ── 건강 위험 지표 HTML (PDF용) ───────────────────────────────────────
function buildHealthRisksHtml(risks: HealthRisk[]): string {
  if (risks.length === 0) return '';

  const levelColor: Record<string, string> = {
    info:    '#1565c0',
    caution: '#f57f17',
    warning: '#e64a19',
    alert:   '#b71c1c',
  };
  const levelBg: Record<string, string> = {
    info:    '#e3f2fd',
    caution: '#fff8e1',
    warning: '#fff3e0',
    alert:   '#fce4ec',
  };
  const levelLabel: Record<string, string> = {
    info: '참고', caution: '주의', warning: '위험', alert: '긴급',
  };

  const cards = risks.map(r => `
    <div style="border:1.5px solid ${levelColor[r.level]};border-radius:8px;padding:12px;margin-bottom:10px;background:${levelBg[r.level]};">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-size:18px;">${r.icon}</span>
        <strong style="font-size:13px;color:#1a1a1a;">${r.title}</strong>
        <span style="margin-left:auto;background:${levelColor[r.level]};color:white;font-size:10px;font-weight:bold;padding:2px 8px;border-radius:10px;">${levelLabel[r.level]}</span>
      </div>
      <div style="font-size:11px;color:#555;margin-bottom:4px;">${r.subtitle}</div>
      <div style="font-size:11px;color:#333;line-height:1.7;margin-bottom:6px;">${r.detail}</div>
      <div style="font-size:10px;color:#888;font-style:italic;">📚 ${r.source}</div>
    </div>
  `).join('');

  return `
    <h2 style="font-size:13px;color:#1a237e;border-left:4px solid #1a237e;padding-left:8px;margin:16px 0 8px;">건강 연관 지표 분석 (학술 연구 기반)</h2>
    <div style="font-size:11px;color:#555;margin-bottom:10px;">
      순음청력검사 결과를 기반으로 관련 전신 질환 위험도를 분석합니다. 아래 내용은 임상 연구 결과를 참고 정보로 제공하는 것이며, 전문의 진단을 대체하지 않습니다.
    </div>
    ${cards}
  `;
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
  const risks = analyzeHealthRisks(result, result.user?.age, result.user?.gender);
  const healthRisksHtml = buildHealthRisksHtml(risks);

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
  .header { border-bottom: 3px solid #1a237e; padding-bottom: 10px; margin-bottom: 16px; display:flex; justify-content:space-between; align-items:flex-end; }
  .logo { font-size: 22px; font-weight: bold; color: #1a237e; letter-spacing:1px; }
  .sub-logo { font-size: 11px; color: #555; }
  .meta { text-align: right; font-size: 11px; color: #555; line-height: 1.8; }
  h2 { font-size: 13px; color: #1a237e; border-left: 4px solid #1a237e; padding-left: 8px; margin: 16px 0 8px; }
  .audiogram-box { border: 1px solid #ddd; border-radius: 6px; padding: 10px; background: #fafafa; margin-bottom: 16px; }
  .legend { display: flex; gap: 24px; justify-content: center; font-size: 11px; margin-top: 6px; }
  .summary { display: flex; gap: 16px; margin-bottom: 16px; }
  .card { flex: 1; border: 2px solid #ddd; border-radius: 8px; padding: 12px; text-align: center; }
  .card.right { border-color: #e53935; }
  .card.left  { border-color: #1565c0; }
  .card .ear  { font-size: 13px; font-weight: bold; margin-bottom: 4px; }
  .card .pta  { font-size: 24px; font-weight: bold; color: #1a237e; }
  .card .cls  { font-size: 12px; font-weight: bold; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
  th { background: #1a237e; color: white; padding: 6px; text-align: center; }
  td { padding: 5px 8px; text-align: center; border-bottom: 1px solid #eee; }
  tr:nth-child(even) td { background: #f5f7ff; }
  .legend-table td { text-align: left; }
  .disclaimer { border: 1px solid #ffe082; background: #fff8e1; border-radius: 6px; padding: 10px; font-size: 11px; color: #5d4037; line-height: 1.8; margin-top: 16px; }
  .sign { margin-top: 20px; display: flex; justify-content: flex-end; }
  .sign-box { border-top: 1px solid #333; width: 120px; text-align: center; padding-top: 4px; font-size: 11px; color: #555; }
  @media print { button { display: none; } }
</style>
</head>
<body>
<div class="report">

  <div class="header">
    <div>
      <div class="logo">HICOG 청력검사</div>
      <div class="sub-logo">Mobile Pure-Tone Audiometry System</div>
    </div>
    <div class="meta">
      ${result.user?.name ? `<div>검사자: <strong>${result.user.name}</strong>${result.user.age ? ` (${result.user.age}세)` : ''}${result.user.gender === 'male' ? ' · 남성' : result.user.gender === 'female' ? ' · 여성' : ''}</div>` : ''}
      <div>검사일: <strong>${dateStr}</strong></div>
      <div>검사 방법: 기도 순음 청력 검사 (Air Conduction)</div>
      <div>검사 장비: 모바일 자가 검사 (스크리닝)</div>
    </div>
  </div>

  <h2>순음 청력도 (Audiogram)</h2>
  <div class="audiogram-box">
    ${audiogramSvg}
    <div class="legend">
      <span><svg width="28" height="14"><line x1="0" y1="7" x2="18" y2="7" stroke="#e53935" stroke-width="2"/><circle cx="22" cy="7" r="5" fill="white" stroke="#e53935" stroke-width="2"/></svg> 우측 귀 (O)</span>
      <span><svg width="28" height="14"><line x1="0" y1="7" x2="18" y2="7" stroke="#1565c0" stroke-width="2"/><line x1="17" y1="2" x2="27" y2="12" stroke="#1565c0" stroke-width="2"/><line x1="27" y1="2" x2="17" y2="12" stroke="#1565c0" stroke-width="2"/></svg> 좌측 귀 (X)</span>
    </div>
  </div>

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

  <h2>주파수별 청력 역치 (Frequency-Specific Thresholds)</h2>
  <table>
    <thead><tr><th>주파수</th><th style="color:#ffcdd2;">우측 귀 (dB HL)</th><th style="color:#bbdefb;">좌측 귀 (dB HL)</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>

  ${healthRisksHtml}

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

  <div class="disclaimer">
    ⚠️ <strong>주의사항:</strong> 본 검사 결과는 모바일 기기를 이용한 자가 청력 스크리닝 결과로,
    방음 부스를 갖춘 임상 환경에서 청각 전문가(Audiologist)가 수행하는 공식 순음 청력 검사를 대체할 수 없습니다.
    건강 연관 지표는 학술 연구 결과를 바탕으로 한 참고 정보이며, 전문의의 진단을 대체하지 않습니다.
    이상 소견이 있거나 청력 저하, 이명, 귀 통증이 느껴지는 경우 이비인후과 전문의를 방문하시기 바랍니다.
  </div>

  <div class="sign">
    <div class="sign-box">검사자 확인<br><br></div>
  </div>

  <!-- 모바일 인쇄 버튼 (인쇄 시 숨김) -->
  <div class="no-print" style="text-align:center;margin:24px 0 8px;padding:16px;background:#f0f4ff;border-radius:10px;border:1px solid #c5cae9;">
    <p style="margin:0 0 10px;color:#37474f;font-size:12px;line-height:1.7;">
      📱 <strong>모바일:</strong> 아래 버튼 → 브라우저 공유 메뉴 → <strong>"PDF로 저장"</strong> 또는 <strong>"인쇄"</strong> 선택<br>
      🖥️ <strong>PC:</strong> 아래 버튼 → 인쇄 대화상자 → 대상: <strong>"PDF로 저장"</strong> 선택
    </p>
    <button onclick="window.print()" style="background:#1a237e;color:white;border:none;padding:13px 36px;border-radius:8px;font-size:15px;cursor:pointer;font-weight:bold;letter-spacing:0.5px;">
      🖨️ 인쇄 / PDF 저장
    </button>
  </div>

</div>
<script>
  // PC 브라우저에서만 자동 인쇄 다이얼로그
  var ua = navigator.userAgent;
  var isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  if (!isMobile) {
    window.onload = function() { setTimeout(function(){ window.print(); }, 400); };
  }
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

  const healthRisks  = analyzeHealthRisks(result, result.user?.age, result.user?.gender);
  const audioPattern = analyzeAudiogramPattern(result, result.user?.age, result.user?.gender);

  const handleExportPdf = () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      alert('PDF 내보내기는 웹 환경에서 지원됩니다.');
      return;
    }

    const html = buildPrintHtml(result);
    const ua = navigator.userAgent;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);

    // ── 방법 1: 동기적 window.open (팝업 차단 우회) ────────────────
    // 클릭 핸들러 내에서 즉시 호출하므로 모바일에서도 허용됨
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      return;
    }

    // ── 방법 2: 팝업 차단된 경우 → 파일 다운로드 폴백 ─────────────
    try {
      const dateStr = new Date().toLocaleDateString('ko-KR')
        .replace(/\.\s*/g, '-').replace(/-$/, '');
      const filename = `HICOG_청력검사_${dateStr}.html`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);

      if (isMobile) {
        alert('파일이 다운로드되었습니다.\n다운로드된 파일을 열고 브라우저 공유 메뉴에서 "인쇄"를 선택하면 PDF로 저장할 수 있습니다.');
      }
    } catch (e) {
      alert('저장에 실패했습니다.\n브라우저 설정에서 팝업 차단을 해제해 주세요.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>검사 결과</Text>

      {/* 사용자 정보 */}
      {result.user?.name ? (
        <View style={styles.userCard}>
          <Text style={styles.userName}>
            {result.user.name}
            {result.user.age ? ` (${result.user.age}세)` : ''}
            {result.user.gender === 'male' ? ' · 남성' : result.user.gender === 'female' ? ' · 여성' : result.user.gender === 'other' ? ' · 기타' : ''}
          </Text>
          <Text style={styles.userDate}>
            검사일: {new Date(result.date).toLocaleDateString('ko-KR', {
              year: 'numeric', month: 'long', day: 'numeric'
            })}
          </Text>
        </View>
      ) : (
        <Text style={styles.date}>
          {new Date(result.date).toLocaleDateString('ko-KR', {
            year: 'numeric', month: 'long', day: 'numeric'
          })}
        </Text>
      )}

      {/* ══════════════════════════════════════════════════════════════
          청력도 임상 분석 카드 — 논문 기반, 최상단 표시
          ══════════════════════════════════════════════════════════════ */}

      {/* 긴급 배너 */}
      {(audioPattern.urgency === 'emergency' || audioPattern.urgency === 'refer') && (
        <View style={[styles.urgencyBanner, { borderColor: audioPattern.urgencyColor, backgroundColor: audioPattern.urgency === 'emergency' ? '#fff0f0' : '#fff7f0' }]}>
          <Text style={[styles.urgencyBannerLabel, { color: audioPattern.urgencyColor }]}>
            {audioPattern.urgencyLabel}
          </Text>
          <Text style={styles.urgencyBannerText}>{audioPattern.urgencyReason}</Text>
        </View>
      )}

      {/* 임상 분석 메인 카드 */}
      <View style={styles.patternCard}>
        <Text style={styles.patternCardTitle}>🩺 청력도 임상 분석</Text>

        {/* 유형 / 중증도 / 형태 그리드 */}
        <View style={styles.patternGrid}>
          <View style={styles.patternCell}>
            <Text style={styles.patternCellLabel}>난청 유형</Text>
            <Text style={[styles.patternCellValue, { color: audioPattern.hlTypeColor }]}>{audioPattern.hlType}</Text>
          </View>
          <View style={styles.patternCell}>
            <Text style={styles.patternCellLabel}>WHO 중증도</Text>
            <Text style={[styles.patternCellValue, { color: audioPattern.severityColor }]}>{audioPattern.severity}</Text>
          </View>
          <View style={[styles.patternCell, { flex: 2 }]}>
            <Text style={styles.patternCellLabel}>청력도 패턴</Text>
            <Text style={styles.patternCellValue}>{audioPattern.shape}</Text>
          </View>
        </View>

        {/* 추정 원인 */}
        <View style={styles.patternRow}>
          <Text style={styles.patternRowLabel}>🔍 추정 원인</Text>
          <Text style={styles.patternRowValue}>{audioPattern.etiology}</Text>
        </View>

        {/* 임상 해석 */}
        <View style={[styles.patternNoteBox, { borderColor: audioPattern.urgencyColor + '55' }]}>
          <Text style={styles.patternNoteTitle}>📋 임상 해석</Text>
          <Text style={styles.patternNoteText}>{audioPattern.clinicalNote}</Text>
        </View>

        {/* EQ 추천 */}
        {audioPattern.eqMode !== 'none' && (
          <View style={styles.eqBox}>
            <View style={styles.eqBadge}>
              <Text style={styles.eqBadgeText}>🎧 {audioPattern.eqMode}</Text>
            </View>
            <Text style={styles.eqReason}>{audioPattern.eqReason}</Text>
          </View>
        )}

        {/* Red Flags */}
        {audioPattern.redFlags.length > 0 && (
          <View style={styles.redFlagBox}>
            <Text style={styles.redFlagTitle}>⚠️ Red Flag 주의 사항</Text>
            {audioPattern.redFlags.map((flag, i) => (
              <Text key={i} style={styles.redFlagItem}>{flag}</Text>
            ))}
          </View>
        )}

        {/* 권고사항 */}
        <View style={styles.recommendBox}>
          <Text style={styles.recommendTitle}>✅ 권고사항</Text>
          <Text style={styles.recommendText}>{audioPattern.recommendation}</Text>
        </View>

        {/* 응급도 배지 (일반/주의) */}
        {(audioPattern.urgency === 'normal' || audioPattern.urgency === 'caution') && (
          <View style={[styles.urgencySmallBadge, { backgroundColor: audioPattern.urgencyColor + '22', borderColor: audioPattern.urgencyColor }]}>
            <Text style={[styles.urgencySmallText, { color: audioPattern.urgencyColor }]}>
              {audioPattern.urgencyLabel} — {audioPattern.urgencyReason}
            </Text>
          </View>
        )}
      </View>

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

      {/* ── 건강 연관 지표 섹션 ────────────────────────────────────────── */}
      {healthRisks.length > 0 && (
        <View style={styles.healthSection}>
          <View style={styles.healthSectionHeader}>
            <Text style={styles.healthSectionTitle}>🔬 건강 연관 지표 분석</Text>
            <Text style={styles.healthSectionSub}>학술 연구 기반 · 참고 정보</Text>
          </View>
          <Text style={styles.healthSectionDesc}>
            순음청력검사 결과를 토대로 관련 전신 질환 연관성을 분석합니다.
            아래 내용은 전문의 진단을 대체하지 않으며, 참고 목적으로만 활용하세요.
          </Text>

          {healthRisks.map(risk => {
            const cfg = LEVEL_CONFIG[risk.level];
            return (
              <View
                key={risk.id}
                style={[styles.riskCard, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
              >
                {/* 카드 헤더 */}
                <View style={styles.riskCardHeader}>
                  <Text style={styles.riskIcon}>{risk.icon}</Text>
                  <Text style={styles.riskTitle}>{risk.title}</Text>
                  <View style={[styles.riskBadge, { backgroundColor: cfg.badge }]}>
                    <Text style={styles.riskBadgeText}>{cfg.label}</Text>
                  </View>
                </View>

                {/* 서브타이틀 */}
                <Text style={[styles.riskSubtitle, { color: cfg.text }]}>{risk.subtitle}</Text>

                {/* 간략 설명 */}
                <Text style={styles.riskDescription}>{risk.description}</Text>

                {/* 상세 설명 */}
                <Text style={styles.riskDetail}>{risk.detail}</Text>

                {/* 논문 출처 */}
                <View style={styles.riskSourceRow}>
                  <Text style={styles.riskSourceIcon}>📚</Text>
                  <Text style={styles.riskSource}>{risk.source}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          ⚠️ 본 결과는 임상적 스크리닝 목적이며, 건강 연관 지표는 학술 연구를 바탕으로 한 참고 정보입니다.
          이비인후과 전문의의 공식 진단을 대체하지 않습니다. 이상 소견이 있으면 전문 의료 기관을 방문하세요.
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

  // ── 청력도 임상 분석 카드 ──────────────────────────────────────────
  urgencyBanner: {
    borderWidth: 2, borderRadius: 12, padding: 14, marginBottom: 12,
  },
  urgencyBannerLabel: { fontSize: 16, fontWeight: '900', marginBottom: 6 },
  urgencyBannerText:  { fontSize: 13, color: '#333', lineHeight: 20 },

  patternCard: {
    backgroundColor: 'white', borderRadius: 16, padding: 18, marginBottom: 16,
    shadowColor: '#1a237e', shadowOpacity: 0.10, shadowRadius: 10, elevation: 4,
    borderWidth: 1.5, borderColor: '#c5cae9',
  },
  patternCardTitle: {
    fontSize: 17, fontWeight: '900', color: '#1a237e', marginBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#e8eaf6', paddingBottom: 8,
  },
  patternGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  patternCell: {
    flex: 1, minWidth: 100,
    backgroundColor: '#f5f7ff', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#e8eaf6',
  },
  patternCellLabel: {
    fontSize: 9, fontWeight: '700', color: '#78909c',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
  patternCellValue: { fontSize: 13, fontWeight: '700', color: '#212121', lineHeight: 18 },

  patternRow: {
    flexDirection: 'row', gap: 8, marginBottom: 10,
    backgroundColor: '#f0f4ff', borderRadius: 8, padding: 10,
  },
  patternRowLabel: { fontSize: 12, fontWeight: '700', color: '#3949ab', minWidth: 72 },
  patternRowValue: { fontSize: 12, color: '#333', flex: 1, lineHeight: 18 },

  patternNoteBox: {
    backgroundColor: '#fafbff', borderWidth: 1.5, borderRadius: 10,
    padding: 12, marginBottom: 10,
  },
  patternNoteTitle: { fontSize: 12, fontWeight: '800', color: '#1a237e', marginBottom: 6 },
  patternNoteText:  { fontSize: 12, color: '#37474f', lineHeight: 20 },

  eqBox: {
    backgroundColor: '#e8f5e9', borderRadius: 10, padding: 12, marginBottom: 10,
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderWidth: 1, borderColor: '#a5d6a7',
  },
  eqBadge: {
    backgroundColor: '#2e7d32', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    flexShrink: 0,
  },
  eqBadgeText:  { color: 'white', fontSize: 11, fontWeight: '800' },
  eqReason:     { fontSize: 11, color: '#1b5e20', flex: 1, lineHeight: 18 },

  redFlagBox: {
    backgroundColor: '#fff3e0', borderRadius: 10, padding: 12, marginBottom: 10,
    borderWidth: 1.5, borderColor: '#ffb74d',
  },
  redFlagTitle: { fontSize: 12, fontWeight: '800', color: '#e65100', marginBottom: 6 },
  redFlagItem:  { fontSize: 12, color: '#bf360c', lineHeight: 20, marginBottom: 2 },

  recommendBox: {
    backgroundColor: '#e3f2fd', borderRadius: 10, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#90caf9',
  },
  recommendTitle: { fontSize: 12, fontWeight: '800', color: '#0d47a1', marginBottom: 6 },
  recommendText:  { fontSize: 12, color: '#1565c0', lineHeight: 20 },

  urgencySmallBadge: {
    borderWidth: 1, borderRadius: 8, padding: 10,
  },
  urgencySmallText: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#1a237e', textAlign: 'center', marginTop: 20, marginBottom: 4 },
  date: { fontSize: 13, color: '#78909c', textAlign: 'center', marginBottom: 20 },
  userCard: {
    backgroundColor: '#e8eaf6', borderRadius: 12, padding: 12,
    alignItems: 'center', marginBottom: 16,
  },
  userName: { fontSize: 17, fontWeight: 'bold', color: '#1a237e' },
  userDate: { fontSize: 12, color: '#546e7a', marginTop: 4 },
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

  // ── 건강 연관 지표 ────────────────────────────────────────────────────
  healthSection: {
    marginBottom: 16,
  },
  healthSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a237e',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 10,
  },
  healthSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  healthSectionSub: {
    fontSize: 11,
    color: '#90caf9',
    fontStyle: 'italic',
  },
  healthSectionDesc: {
    fontSize: 12,
    color: '#546e7a',
    lineHeight: 18,
    marginBottom: 12,
    paddingHorizontal: 4,
  },

  // 개별 위험 카드
  riskCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 10,
  },
  riskCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  riskIcon: {
    fontSize: 20,
  },
  riskTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  riskBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  riskBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
  },
  riskSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  riskDescription: {
    fontSize: 13,
    color: '#37474f',
    fontWeight: '500',
    marginBottom: 6,
    lineHeight: 19,
  },
  riskDetail: {
    fontSize: 12,
    color: '#455a64',
    lineHeight: 19,
    marginBottom: 8,
  },
  riskSourceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.07)',
  },
  riskSourceIcon: {
    fontSize: 11,
  },
  riskSource: {
    flex: 1,
    fontSize: 10,
    color: '#90a4ae',
    fontStyle: 'italic',
    lineHeight: 15,
  },

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
