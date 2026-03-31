import { ScreeningResult, ScreeningScores, RiskLevel } from '../../types/screening';

/**
 * 스크리닝 결과 점수 산출기
 *
 * 1. 연령별 Z점수 변환
 * 2. Risk_EHF (숨은 난청 필터)
 * 3. P_ADHD (로지스틱 회귀)
 * 4. P_DYS (로지스틱 회귀)
 */

// ── 연령별 규준 데이터 (논문 메타분석 기반 근사치) ─────────────
interface NormEntry { mean: number; std: number; }
type MetricKey = 'rtTau' | 'fpr' | 'oer' | 'dlf1k' | 'dlf6k' | 'gdt' | 'rtMean' | 'ptaEHF';

const NORMS: Record<string, Record<MetricKey, NormEntry>> = {
  // 정규값 근거: Kofler et al.(2013) CPT, Moore(2003) DLF, Musiek(2005)/Shinn(2009) GDT
  // DLF 6kHz > 1kHz: 위상잠금(phase-locking) 불가 대역이므로 변별력이 더 나쁨 (Moore, 2003)
  // GDT 아동: 정상 아동 ~5ms (Shinn et al., 2009), 이전 8.0ms는 CAPD 수준
  '6-11': {
    rtTau:  { mean: 180, std: 60 },
    fpr:    { mean: 0.12, std: 0.08 },
    oer:    { mean: 0.08, std: 0.06 },
    dlf1k:  { mean: 3.5, std: 1.5 },
    dlf6k:  { mean: 6.0, std: 2.5 },   // 1kHz의 ~1.7배 (위상잠금 불가)
    gdt:    { mean: 5.5, std: 2.5 },   // 8.0→5.5 (Shinn 2009: 정상 아동 ~4.5-5ms)
    rtMean: { mean: 450, std: 80 },
    ptaEHF: { mean: 5, std: 8 },
  },
  '12-17': {
    rtTau:  { mean: 150, std: 50 },
    fpr:    { mean: 0.08, std: 0.06 },
    oer:    { mean: 0.05, std: 0.04 },
    dlf1k:  { mean: 2.5, std: 1.3 },
    dlf6k:  { mean: 4.5, std: 2.0 },   // 1kHz의 ~1.8배
    gdt:    { mean: 5.0, std: 2.0 },   // 6.0→5.0 (Shinn 2009)
    rtMean: { mean: 380, std: 60 },
    ptaEHF: { mean: 3, std: 6 },
  },
  '18-29': {
    rtTau:  { mean: 120, std: 40 },
    fpr:    { mean: 0.05, std: 0.04 },
    oer:    { mean: 0.03, std: 0.03 },
    dlf1k:  { mean: 1.5, std: 1.2 },
    dlf6k:  { mean: 3.5, std: 1.5 },   // 1kHz의 ~2.3배 (Moore 2003)
    gdt:    { mean: 4.5, std: 2.0 },
    rtMean: { mean: 320, std: 50 },
    ptaEHF: { mean: 5, std: 6 },       // 2→5 (실측치 반영)
  },
  '30-49': {
    rtTau:  { mean: 140, std: 45 },
    fpr:    { mean: 0.06, std: 0.05 },
    oer:    { mean: 0.04, std: 0.03 },
    dlf1k:  { mean: 2.0, std: 1.2 },
    dlf6k:  { mean: 4.0, std: 1.8 },   // 1kHz의 2배
    gdt:    { mean: 5.5, std: 2.0 },
    rtMean: { mean: 350, std: 55 },
    ptaEHF: { mean: 8, std: 8 },
  },
  '50+': {
    rtTau:  { mean: 170, std: 55 },
    fpr:    { mean: 0.07, std: 0.05 },
    oer:    { mean: 0.06, std: 0.05 },
    dlf1k:  { mean: 3.0, std: 1.5 },
    dlf6k:  { mean: 5.5, std: 2.5 },   // 1kHz의 ~1.8배
    gdt:    { mean: 7.0, std: 2.5 },
    rtMean: { mean: 400, std: 70 },
    ptaEHF: { mean: 20, std: 12 },
  },
};

// ── 로지스틱 회귀 계수 ──────────────────────────────────────
// ADHD: RT_τ, FPR, OER에 양의 가중치; DLF, GDT에 음의 가중치
const BETA_ADHD = {
  intercept: -3.5,
  rtTau: 1.2,
  fpr: 0.9,
  oer: 0.8,
  dlf1k: -0.4,
  gdt: -0.3,
};

// 난독증: DLF, GDT에 양의 가중치 + rtTau 보상 음수 가중치
// intercept -4.0 (보수적), 가중치 축소 → 100% 포화 방지
const ALPHA_DYS = {
  intercept: -4.0,
  dlf1k: 0.85,
  dlf6k: 0.75,
  gdt: 0.7,
  rtMean: 0.3,
  rtTau: -0.25,  // 주의력 일탈 크면 → ADHD 가능성 ↑, 난독증 점수 ↓
};

// EHF 필터
const LAMBDA_EHF = {
  intercept: -2.0,
  ptaEHF: 0.08,
};

export function scoreScreening(result: ScreeningResult, ageStr?: string): ScreeningScores {
  const ageGroup = getAgeGroup(ageStr);

  // Z점수 변환
  const z = {
    rtTau:  zScore(result.cpt.rtTau, ageGroup, 'rtTau'),
    fpr:    zScore(result.cpt.falsePositiveRate, ageGroup, 'fpr'),
    oer:    zScore(result.cpt.omissionRate, ageGroup, 'oer'),
    dlf1k:  zScore(result.dlf.dlf1k, ageGroup, 'dlf1k'),
    dlf6k:  zScore(result.dlf.dlf6k, ageGroup, 'dlf6k'),
    gdt:    zScore(result.gdt.gdt, ageGroup, 'gdt'),
    rtMean: zScore(result.cpt.rtMean, ageGroup, 'rtMean'),
    ptaEHF: zScore(result.ehfa.ptaEHF, ageGroup, 'ptaEHF'),
  };

  // Risk_EHF: 숨은 난청 위험도
  const riskEHF = sigmoid(
    LAMBDA_EHF.intercept + LAMBDA_EHF.ptaEHF * result.ehfa.ptaEHF
  );
  const ehfFlag = riskEHF > 0.5;

  // P_ADHD
  const logitADHD = BETA_ADHD.intercept
    + BETA_ADHD.rtTau * z.rtTau
    + BETA_ADHD.fpr * z.fpr
    + BETA_ADHD.oer * z.oer
    + BETA_ADHD.dlf1k * z.dlf1k
    + BETA_ADHD.gdt * z.gdt;
  let pADHD = sigmoid(logitADHD);
  // EHF 감쇠: 숨은 난청 시 ADHD 확률 하향
  if (ehfFlag) pADHD *= (1 - riskEHF * 0.5);

  // P_DYS (보수적: intercept -4.0, 가중치 축소, rtTau 보상)
  const logitDYS = ALPHA_DYS.intercept
    + ALPHA_DYS.dlf1k * z.dlf1k
    + ALPHA_DYS.dlf6k * z.dlf6k
    + ALPHA_DYS.gdt * z.gdt
    + ALPHA_DYS.rtMean * z.rtMean
    + ALPHA_DYS.rtTau * z.rtTau;
  const pDyslexia = sigmoid(logitDYS);

  // 위험 수준 분류
  const adhdLevel = classifyLevel(pADHD);
  const dyslexiaLevel = classifyLevel(pDyslexia);

  // 해석 생성
  const interpretation = generateInterpretation(pADHD, pDyslexia, ehfFlag, adhdLevel, dyslexiaLevel);
  const recommendations = generateRecommendations(adhdLevel, dyslexiaLevel, ehfFlag);

  return {
    riskEHF,
    pADHD,
    pDyslexia,
    zScores: z,
    adhdLevel,
    dyslexiaLevel,
    ehfFlag,
    interpretation,
    recommendations,
  };
}

// ── 유틸리티 ─────────────────────────────────────────────────

function getAgeGroup(ageStr?: string): string {
  if (!ageStr) return '18-29';
  const age = parseInt(ageStr, 10);
  if (isNaN(age) || age < 6) return '6-11';
  if (age <= 11) return '6-11';
  if (age <= 17) return '12-17';
  if (age <= 29) return '18-29';
  if (age <= 49) return '30-49';
  return '50+';
}

function zScore(value: number, ageGroup: string, metric: MetricKey): number {
  const norm = NORMS[ageGroup]?.[metric] ?? NORMS['18-29'][metric];
  if (norm.std === 0) return 0;
  return (value - norm.mean) / norm.std;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function classifyLevel(p: number): RiskLevel {
  if (p < 0.3) return 'low';
  if (p < 0.6) return 'moderate';
  return 'high';
}

function generateInterpretation(
  pADHD: number, pDYS: number, ehfFlag: boolean,
  adhdLv: RiskLevel, dysLv: RiskLevel
): string {
  const parts: string[] = [];

  if (ehfFlag) {
    parts.push('확장 고주파수 청력 저하가 감지되었습니다. 고주파 난청으로 인한 청취 노력 증가가 주의력 결핍 증상을 유발할 수 있어, ADHD 지표의 해석에 주의가 필요합니다.');
  }

  if (adhdLv === 'high' && dysLv === 'high') {
    parts.push(`ADHD(${(pADHD*100).toFixed(0)}%)와 난독증(${(pDYS*100).toFixed(0)}%) 모두 높은 위험이 감지되었습니다. 동반이환(Comorbidity) 가능성이 있으며, 종합적인 신경심리 평가가 권장됩니다.`);
  } else if (adhdLv === 'high') {
    parts.push(`반응 시간 변동성(τ)과 오경보율이 유의미하게 높아 ADHD 위험(${(pADHD*100).toFixed(0)}%)이 시사됩니다. 전두엽 억제 통제 기능의 저하가 의심됩니다.`);
  } else if (dysLv === 'high') {
    parts.push(`주파수 변별 및 시간 해상도 지표가 유의미하게 저하되어 난독증 위험(${(pDYS*100).toFixed(0)}%)이 시사됩니다. 음운 표상 및 청각 피질 네트워크의 결함이 의심됩니다.`);
  } else if (adhdLv === 'moderate' || dysLv === 'moderate') {
    parts.push('일부 지표에서 경계선 수준의 결함이 관찰됩니다. 정기적인 추적 관찰이 권장됩니다.');
  } else {
    parts.push('모든 청각-인지 지표가 정상 범위 내에 있습니다.');
  }

  return parts.join('\n\n');
}

function generateRecommendations(
  adhdLv: RiskLevel, dysLv: RiskLevel, ehfFlag: boolean
): string[] {
  const recs: string[] = [];

  if (ehfFlag) {
    recs.push('이비인후과 정밀 청력검사 (확장 고주파 포함) 권장');
    recs.push('소음 환경 노출 이력 확인 및 청각 보호 조치');
  }

  if (adhdLv !== 'low') {
    recs.push('전문 신경심리 평가 (CPT-II, SNAP-IV 등) 실시 권장');
    if (adhdLv === 'high') {
      recs.push('소아정신과 또는 신경과 전문의 상담 권장');
    }
  }

  if (dysLv !== 'low') {
    recs.push('음운 인식 및 읽기 능력 정밀 평가 권장');
    recs.push('청각 훈련(Auditory Training) 프로그램 고려');
    if (dysLv === 'high') {
      recs.push('교육 지원 및 특수교육 서비스 연계 검토');
    }
  }

  if (recs.length === 0) {
    recs.push('현재 특별한 조치가 필요하지 않으나, 6~12개월 후 재검사를 권장합니다.');
  }

  recs.push('본 검사는 스크리닝 목적이며, 확정 진단은 전문 의료기관에서 받으십시오.');

  return recs;
}
