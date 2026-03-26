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

function analyzeHealthRisks(result: TestResult): HealthRisk[] {
  const rightPTA = getPTA(result.right);
  const leftPTA  = getPTA(result.left);
  const avgPTA   = (rightPTA !== null && leftPTA !== null)
    ? Math.round((rightPTA + leftPTA) / 2)
    : (rightPTA ?? leftPTA ?? 0);
  const asymmetry = (rightPTA !== null && leftPTA !== null)
    ? Math.abs(rightPTA - leftPTA) : 0;

  const rP = detectPattern(result.right);
  const lP = detectPattern(result.left);

  const hasNotch4k      = rP.hasNotch4k      || lP.hasNotch4k;
  const hasHighFreqSlope = rP.hasHighFreqSlope || lP.hasHighFreqSlope;
  const hasLowFreqLoss   = rP.hasLowFreqLoss  || lP.hasLowFreqLoss;
  const isFlat           = rP.isFlat          || lP.isFlat;

  const risks: HealthRisk[] = [];

  // ① 비대칭 난청 — 긴급 (최우선)
  if (asymmetry >= 15) {
    risks.push({
      id: 'asymmetry',
      icon: '🚨',
      title: '비대칭 난청 — 전문의 즉시 방문 권고',
      subtitle: `좌우 청력 차이 ${asymmetry} dB`,
      level: 'alert',
      description: '양쪽 귀 청력 차이가 15 dB 이상이면 청신경종·뇌졸중 가능성을 반드시 배제해야 합니다.',
      detail: `우측 ${rightPTA ?? '-'} dB HL vs 좌측 ${leftPTA ?? '-'} dB HL로 ${asymmetry} dB 차이가 확인되었습니다. 비대칭 감각신경성 난청은 청신경종(전정신경초종), 뇌졸중, 혈관 병변 등의 가능성을 시사합니다. 이비인후과에서 MRI(청신경 조영증강) 및 정밀 청각 검사를 받으시기 바랍니다.`,
      source: 'ASHA 청력 선별 가이드라인 · 임상 청각학 기준',
    });
  }

  // ② 소음성 난청 (4 kHz 노치)
  if (hasNotch4k) {
    risks.push({
      id: 'nihl',
      icon: '🏭',
      title: '소음성 난청(NIHL) 패턴 감지',
      subtitle: '4 kHz 노치 패턴',
      level: 'warning',
      description: '4 kHz에서 급격한 역치 상승이 감지되었습니다. 직업적 또는 일상 소음 노출 여부를 확인하세요.',
      detail: '4 kHz "노치(notch)" 패턴은 광대역 산업 소음 노출에 의한 소음성 난청의 가장 특징적인 소견입니다. 소음 환경 작업 시 청력 보호구(귀마개·귀덮개) 착용이 필수이며, 더 이상의 청력 손실을 방지하는 것이 중요합니다. 군사 충격음의 경우 4–6 kHz에서 주로 발생합니다.',
      source: 'Moore et al., Trends in Hearing 2022 · PMC Cluster Analysis 2021',
    });
  }

  // ③ 치매 / 인지기능
  if (avgPTA > 25) {
    let level: HealthRisk['level'] = 'caution';
    let detail = '';
    let subtitle = '';
    if (avgPTA <= 40) {
      level    = 'caution';
      subtitle = `치매 위험 HR ≈ 1.89`;
      detail   = `순음평균 ${avgPTA} dB HL (경도 난청)은 정상 청력 대비 치매 위험 HR 1.89에 해당합니다. 10 dB 청력손실마다 치매 위험이 27% 증가합니다. 인지기능 선별검사(MoCA)를 권장합니다.`;
    } else if (avgPTA <= 55) {
      level    = 'warning';
      subtitle = `치매 위험 HR ≈ 3.00`;
      detail   = `순음평균 ${avgPTA} dB HL (중도 난청)은 치매 위험 HR 3.00에 해당합니다. 인지기능 선별검사(MMSE, MoCA)와 이비인후과 전문 청력검사를 받아보시기를 강력 권장합니다.`;
    } else {
      level    = 'alert';
      subtitle = `치매 위험 HR ≈ 4.94`;
      detail   = `순음평균 ${avgPTA} dB HL (고도 이상 난청)은 치매 위험 HR 4.94로 매우 높습니다. ACHIEVE 임상시험(Lancet 2023)에서 보청기 착용과 청각 재활이 치매 위험을 48% 줄인 것으로 입증되었습니다. 즉시 청각 재활을 시작하시기 바랍니다.`;
    }
    risks.push({
      id: 'dementia',
      icon: '🧠',
      title: '인지기능 저하 / 치매',
      subtitle,
      level,
      description: '청력손실은 치매의 수정 가능한 최대 단일 위험인자입니다. 10 dB 악화마다 치매 위험 27% 증가.',
      detail,
      source: 'Lin et al., JAMA Neurology 2011 · ACHIEVE Trial, The Lancet 2023 · Ageing Research Reviews 2024(N=1,548,754)',
    });
  }

  // ④ 심혈관질환
  if (avgPTA > 25 || hasLowFreqLoss) {
    const isHighRisk = hasLowFreqLoss;
    risks.push({
      id: 'cardiovascular',
      icon: '🫀',
      title: '심혈관질환 연관성',
      subtitle: isHighRisk ? '저주파 손실 — 주의' : '참고 수준',
      level: isHighRisk ? 'warning' : 'caution',
      description: isHighRisk
        ? '저주파 청력손실 패턴은 심혈관질환·뇌졸중과 독립적으로 연관됩니다.'
        : '청력손실은 뇌졸중 위험 OR 1.26, 관상동맥질환 OR 1.36과 연관됩니다.',
      detail: isHighRisk
        ? '저주파(250–1000 Hz) 청력손실 패턴이 감지되었습니다. 이 패턴은 뇌혈관질환, 말초혈관질환, 관상동맥질환과 독립적 연관성을 보입니다. 혈압·콜레스테롤 정기 검진 및 순환기내과 상담을 권장합니다.'
        : `순음평균 ${avgPTA} dB HL의 청력손실은 뇌졸중 HR 1.33, 관상동맥질환 OR 1.36과 연관됩니다. 심혈관 위험인자(혈압, 혈당, 콜레스테롤) 정기 검진을 권장합니다.`,
      source: 'OHN Meta-analysis 2024 · Scientific Reports 2021 · PubMed 2009(Audiometric Pattern as CVD Predictor)',
    });
  }

  // ⑤ 당뇨병
  if (hasHighFreqSlope || avgPTA > 25) {
    risks.push({
      id: 'diabetes',
      icon: '🩸',
      title: '당뇨병 연관성',
      subtitle: hasHighFreqSlope ? '고주파 손실 패턴 일치' : '참고 수준',
      level: hasHighFreqSlope ? 'caution' : 'info',
      description: '당뇨 환자의 청력손실 발생률은 정상인의 약 5배입니다(9.2 vs 1.8건/1000인년).',
      detail: hasHighFreqSlope
        ? '고주파(2–8 kHz) 하향 경사형 청력도 패턴이 감지되었습니다. 이 패턴은 당뇨성 와우 미세혈관 손상(모세혈관벽 비후, 나선신경절 퇴행)의 특징적 소견입니다. 공복혈당·HbA1c 검사를 권장합니다.'
        : '청력손실과 당뇨병은 독립적 연관성을 보입니다. 혈당 이상 여부를 확인하시기 바랍니다.',
      source: 'Molecular Medicine 2023 · Int J Epidemiology 2017(N=253,301)',
    });
  }

  // ⑥ 만성 신장질환(CKD)
  if (avgPTA > 25) {
    risks.push({
      id: 'ckd',
      icon: '🫘',
      title: '만성 신장질환(CKD) 연관성',
      subtitle: '참고 수준',
      level: 'info',
      description: 'CKD 환자 청력손실 유병률은 일반 인구 대비 85% 높습니다.',
      detail: '신장과 달팽이관은 공통 형태발생학적 기원을 가지며 동일한 이온 수송 기전(Na-K-ATPase)을 공유합니다. CKD 단계가 높을수록 청력손실이 심화됩니다(eGFR↓ ↔ 고주파 역치↑, r=−0.47). 신장 기능 검사(eGFR, 혈청 크레아티닌)를 권장합니다.',
      source: 'Nature Reviews Nephrology 2024 · Renal Failure 2025 · Frontiers in Medicine 2024(NHANES, N=5,131)',
    });
  }

  // ⑦ 우울증 / 정신건강
  if (avgPTA > 40) {
    risks.push({
      id: 'depression',
      icon: '💙',
      title: '우울증 / 정신건강',
      subtitle: avgPTA > 55 ? '주의 수준' : '참고 수준',
      level: avgPTA > 55 ? 'caution' : 'info',
      description: '청력손실은 우울증 발생 OR 1.35와 독립적으로 연관됩니다.',
      detail: `중등도 이상 청력손실(${avgPTA} dB HL)은 사회적 고립, 의사소통 어려움을 통해 우울·불안 위험을 높입니다. 주관적 청력 장애감이 클수록 우울 위험이 더 크게 증가합니다. 청각 재활과 함께 정신건강의학과 상담도 고려하시기 바랍니다.`,
      source: 'Frontiers in Neurology 2024(N=254,466) · MDPI Healthcare 2025',
    });
  }

  // ⑧ 노인성 난청 아형 분석
  if (avgPTA > 20) {
    if (isFlat) {
      risks.push({
        id: 'presbycusis_strial',
        icon: '📊',
        title: '노인성 난청 — 대사형(혈관조형) 패턴',
        subtitle: '평탄형 청력도',
        level: 'info',
        description: '평탄형 패턴은 달팽이관 혈관조 위축에 의한 노인성 난청의 특징입니다.',
        detail: '평탄형(flat) 청력도는 달팽이관 혈관조(stria vascularis)의 위축으로 인한 노인성 난청(대사형) 패턴입니다. 이 아형은 어음변별력이 비교적 보존되어 보청기 효과가 우수합니다. 청각 재활 전문가 상담을 권장합니다.',
        source: 'Schuknecht & Gacek, AONR 1993 · Int J Audiology 2009',
      });
    } else if (hasHighFreqSlope) {
      risks.push({
        id: 'presbycusis_sensory',
        icon: '📊',
        title: '노인성 난청 — 감각형 패턴',
        subtitle: '고주파 하향 경사형',
        level: 'info',
        description: '고주파 경사는 달팽이관 유모세포 손실에 의한 가장 흔한 노인성 난청 패턴입니다.',
        detail: '고주파 경사형 청력도는 달팽이관 기저부 유모세포(hair cell) 소실에 의한 감각형 노인성 난청 패턴입니다. 고주파 자음(ㅅ, ㅈ, ㅊ 등) 인지에 어려움을 겪을 수 있습니다. 보청기 적합을 통해 의사소통 능력을 개선할 수 있습니다.',
        source: 'Schuknecht & Gacek, AONR 1993 · Journal of Neuroscience 2020',
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
  const risks = analyzeHealthRisks(result);
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

</div>
<script>
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

  const healthRisks = analyzeHealthRisks(result);

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
