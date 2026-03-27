import { ScreeningResult, ScreeningScores } from '../types/screening';
import { UserProfile } from '../types';

/**
 * Ollama AI 분석 서비스
 *
 * localhost:11434의 llama3 모델을 사용하여
 * 스크리닝 결과에 대한 전문적 임상 해석을 생성한다.
 * Ollama 미연결 시 규칙 기반 전문 분석을 제공한다.
 */

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'llama3';
const TIMEOUT_MS = 60000;

export interface OllamaAnalysis {
  text: string;
  isStreaming: boolean;
  error: string | null;
}

/**
 * 스크리닝 결과를 분석하여 텍스트를 반환한다.
 * Ollama 연결 시 AI 분석, 미연결 시 규칙 기반 전문 분석.
 */
export async function generateScreeningAnalysis(
  result: ScreeningResult,
  scores: ScreeningScores,
  user?: UserProfile,
  onChunk?: (text: string) => void,
): Promise<string> {
  // Ollama 연결 시도
  const available = await checkOllamaAvailable();

  if (available) {
    try {
      return await callOllama(result, scores, user, onChunk);
    } catch (err: any) {
      console.warn('[Ollama] AI 분석 실패, fallback 사용:', err.message);
    }
  }

  // Ollama 미연결 또는 실패 → 규칙 기반 전문 분석
  const analysis = buildDetailedAnalysis(result, scores, user);
  onChunk?.(analysis);
  return analysis;
}

/**
 * Ollama 연결 가능 여부 확인
 */
export async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('http://localhost:11434/api/tags', {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// Ollama API 호출
// ══════════════════════════════════════════════════════════════

async function callOllama(
  result: ScreeningResult,
  scores: ScreeningScores,
  user?: UserProfile,
  onChunk?: (text: string) => void,
): Promise<string> {
  const prompt = buildPrompt(result, scores, user);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: true,
      options: { temperature: 0.3, num_predict: 2000 },
    }),
    signal: controller.signal,
  });

  clearTimeout(timer);
  if (!response.ok) throw new Error(`Ollama 응답 오류: ${response.status}`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error('응답 스트림을 열 수 없습니다.');

  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.response) {
          fullText += json.response;
          onChunk?.(fullText);
        }
      } catch (_) {}
    }
  }

  return fullText || buildDetailedAnalysis(result, scores, user);
}

function buildPrompt(
  result: ScreeningResult,
  scores: ScreeningScores,
  user?: UserProfile,
): string {
  const age = user?.age || '알 수 없음';
  const gender = user?.gender === 'male' ? '남성' : user?.gender === 'female' ? '여성' : '미지정';

  return `당신은 청각-인지 신경과학 전문 임상심리사입니다.
아래는 순음 청력검사 기반 ADHD/난독증 스크리닝 검사 결과입니다.
한국어로 전문적이고 이해하기 쉬운 종합 분석 보고서를 작성해주세요.

## 검사자 정보
- 나이: ${age}세, 성별: ${gender}

## 검사 결과 데이터

### 주의력 검사 (CPT)
- 평균 RT: ${result.cpt.rtMean}ms, RT σ: ${result.cpt.rtStd}ms
- Ex-Gaussian τ: ${result.cpt.rtTau}ms (주의력 일탈)
- 오경보율: ${(result.cpt.falsePositiveRate * 100).toFixed(1)}%, 누락률: ${(result.cpt.omissionRate * 100).toFixed(1)}%

### 주파수 변별 (DLF)
- 1kHz: ${result.dlf.dlf1k.toFixed(1)}%, 6kHz: ${result.dlf.dlf6k.toFixed(1)}%

### 간격 탐지 (GDT): ${result.gdt.gdt.toFixed(1)}ms

### 확장 고주파 (EHFA)
- PTA_EHF: ${result.ehfa.ptaEHF} dB HL

### 산출 점수
- ADHD: ${(scores.pADHD * 100).toFixed(1)}% (${scores.adhdLevel}), 난독증: ${(scores.pDyslexia * 100).toFixed(1)}% (${scores.dyslexiaLevel})
- Z점수: τ=${scores.zScores.rtTau.toFixed(1)}, FPR=${scores.zScores.fpr.toFixed(1)}, OER=${scores.zScores.oer.toFixed(1)}, DLF1k=${scores.zScores.dlf1k.toFixed(1)}, DLF6k=${scores.zScores.dlf6k.toFixed(1)}, GDT=${scores.zScores.gdt.toFixed(1)}

## 작성 구조
1. **전반적 요약** (2-3문장)
2. **주의력/반응 억제 분석** (ADHD - τ, FPR, OER 해석)
3. **청각 감각 처리 분석** (난독증 - DLF, GDT 해석)
4. **청력 상태 분석** (EHFA, 숨은 난청)
5. **종합 임상 의견** (동반이환, 감별 포인트)
6. **권고사항** (추가 검사, 치료, 환경 조정)

스크리닝이며 확정 진단이 아님을 명시하세요.`;
}

// ══════════════════════════════════════════════════════════════
// 규칙 기반 전문 분석 (Ollama 미연결 시)
// ══════════════════════════════════════════════════════════════

function buildDetailedAnalysis(
  result: ScreeningResult,
  scores: ScreeningScores,
  user?: UserProfile,
): string {
  const age = user?.age ? parseInt(user.age, 10) : null;
  const parts: string[] = [];

  // ── 1. 전반적 요약 ──
  parts.push('## 전반적 요약\n');
  if (scores.adhdLevel === 'high' && scores.dyslexiaLevel === 'high') {
    parts.push(`ADHD 위험도 ${(scores.pADHD*100).toFixed(0)}%와 난독증 위험도 ${(scores.pDyslexia*100).toFixed(0)}%로, 두 영역 모두에서 임상적으로 유의미한 수준의 결함이 감지되었습니다. 이는 ADHD와 난독증의 동반이환(Comorbidity) 가능성을 시사하며, 전체 인구의 약 3~5%에서 나타나는 신경발달적 중복 패턴과 일치합니다. 조속한 종합 신경심리 평가가 강력히 권장됩니다.`);
  } else if (scores.adhdLevel === 'high') {
    parts.push(`주의력 및 반응 억제 지표에서 ADHD 위험(${(scores.pADHD*100).toFixed(0)}%)이 유의미하게 상승하였습니다. Ex-Gaussian τ 값의 증가와 오경보율 상승은 전두엽 기반 하향식(Top-down) 억제 통제 기능의 저하를 반영합니다. 반면 청각 감각 처리 지표(DLF, GDT)는 상대적으로 보존되어 있어, 순수 주의력 결핍형 프로필에 부합합니다.`);
  } else if (scores.dyslexiaLevel === 'high') {
    parts.push(`주파수 변별 및 시간 해상도 지표에서 난독증 위험(${(scores.pDyslexia*100).toFixed(0)}%)이 유의미하게 상승하였습니다. DLF와 GDT의 동시적 저하는 음운 표상 체계(Phonological Representation System)의 근본적 결함을 시사하며, 좌측 상두정소엽(SPL)과 전전두엽 간 기능적 연결성 약화와 관련됩니다.`);
  } else if (scores.adhdLevel === 'moderate' || scores.dyslexiaLevel === 'moderate') {
    parts.push(`일부 지표에서 경계선 수준의 결함이 관찰됩니다. 현재 수치만으로는 확정적 판단이 어려우나, 환경적 요인(수면 부족, 스트레스, 소음 노출 등)에 의한 일시적 저하일 가능성과 초기 단계의 신경발달적 차이일 가능성을 모두 고려해야 합니다. 3~6개월 후 재검사를 통한 추적 관찰이 권장됩니다.`);
  } else {
    parts.push(`모든 청각-인지 지표가 해당 연령 규준 대비 정상 범위 내에 있습니다. ADHD(${(scores.pADHD*100).toFixed(0)}%) 및 난독증(${(scores.pDyslexia*100).toFixed(0)}%) 위험도가 모두 낮은 수준으로, 현재 시점에서 임상적으로 유의미한 중추 청각-인지 처리 결함은 관찰되지 않습니다.`);
  }

  // ── 2. 주의력/반응 억제 분석 ──
  parts.push('\n\n## 주의력 및 반응 억제 분석 (ADHD 관점)\n');

  const tauZ = scores.zScores.rtTau;
  const fprZ = scores.zScores.fpr;
  const oerZ = scores.zScores.oer;

  parts.push(`**Ex-Gaussian τ (주의력 일탈 지표)**: ${result.cpt.rtTau}ms (Z = ${tauZ >= 0 ? '+' : ''}${tauZ.toFixed(1)})`);
  if (tauZ > 2.0) {
    parts.push(`τ 값이 규준 대비 2 표준편차 이상 상승하여, 검사 수행 중 반복적인 주의력 일탈(Attention Lapses)이 발생한 것으로 판단됩니다. 이는 작업 긍정 신경망(Task-Positive Network)의 활성화가 디폴트 모드 네트워크(DMN)의 간섭에 의해 주기적으로 붕괴되는 ADHD의 핵심 신경학적 기전과 일치합니다.`);
  } else if (tauZ > 1.0) {
    parts.push(`τ 값이 다소 상승하여, 간헐적인 주의력 동요가 관찰됩니다. 이는 ADHD 경계선에 해당할 수 있으나, 검사 환경(소음, 피로도)에 의한 영향도 고려해야 합니다.`);
  } else {
    parts.push(`τ 값이 정상 범위로, 검사 수행 중 일관된 주의력 유지가 확인됩니다.`);
  }

  parts.push(`\n**오경보율(FPR)**: ${(result.cpt.falsePositiveRate*100).toFixed(1)}% (Z = ${fprZ >= 0 ? '+' : ''}${fprZ.toFixed(1)})`);
  if (fprZ > 1.5) {
    parts.push(`오경보율의 상승은 행동 반응 억제(Response Inhibition)의 실패를 나타내며, ADHD의 충동성(Impulsivity) 차원과 직접 관련됩니다. 전두엽 하향식 억제 통제 기능의 저하가 시사됩니다.`);
  } else {
    parts.push(`오경보율이 정상 범위로, 충동적 반응 억제 기능이 양호합니다.`);
  }

  parts.push(`\n**누락률(OER)**: ${(result.cpt.omissionRate*100).toFixed(1)}% (Z = ${oerZ >= 0 ? '+' : ''}${oerZ.toFixed(1)})`);
  if (oerZ > 1.5) {
    parts.push(`누락률의 상승은 지속적 주의력(Sustained Attention)의 저하를 반영하며, ADHD 부주의형(Predominantly Inattentive) 프로필과 관련됩니다.`);
  } else {
    parts.push(`누락률이 정상 범위로, 지속적 주의력 유지에 문제가 없습니다.`);
  }

  parts.push(`\n**반응 시간 프로필**: 평균 RT ${result.cpt.rtMean}ms, μ=${result.cpt.rtMu}ms, σ=${result.cpt.rtStd}ms`);
  if (result.cpt.rtStd > result.cpt.rtMu * 0.4) {
    parts.push(`반응 시간의 변산성(σ/μ 비율)이 높아, 수행의 비일관성이 관찰됩니다. 이는 ADHD에서 전형적으로 나타나는 '시행 간 변동성(Intra-individual Variability)' 증가 패턴입니다.`);
  }

  // ── 3. 청각 감각 처리 분석 ──
  parts.push('\n\n## 청각 감각 처리 분석 (난독증 관점)\n');

  const dlf1kZ = scores.zScores.dlf1k;
  const dlf6kZ = scores.zScores.dlf6k;
  const gdtZ = scores.zScores.gdt;

  parts.push(`**주파수 변별 임계치(DLF)**:`);
  parts.push(`- 1kHz: ${result.dlf.dlf1k.toFixed(1)}% (Z = ${dlf1kZ >= 0 ? '+' : ''}${dlf1kZ.toFixed(1)}) — 위상잠금(Phase-locking) 가능 대역`);
  parts.push(`- 6kHz: ${result.dlf.dlf6k.toFixed(1)}% (Z = ${dlf6kZ >= 0 ? '+' : ''}${dlf6kZ.toFixed(1)}) — 위상잠금 불가 대역`);

  if (dlf1kZ > 1.5 && dlf6kZ > 1.5) {
    parts.push(`\n두 주파수 대역 모두에서 변별 임계치가 상승하였습니다. 위상잠금 가능 대역(1kHz)과 불가 대역(6kHz) 모두에서 결함이 나타나므로, 이는 단순한 말초 신경 전달 문제가 아닌 **대뇌 피질 수준의 전반적 주파수 해상도(Frequency Resolution) 결함**을 시사합니다. 난독증 환자에서 보고되는 상두정소엽(SPL)-전전두엽 네트워크 단절 패턴과 일치합니다.`);
  } else if (dlf1kZ > 1.5) {
    parts.push(`\n1kHz 대역에서 선택적 결함이 나타났으며, 이는 위상잠금 의존적 처리 경로의 이상을 시사합니다. 음운 인식(Phonological Awareness)에 직접적 영향을 미칠 수 있습니다.`);
  } else if (dlf6kZ > 1.5) {
    parts.push(`\n6kHz 대역에서 선택적 결함이 나타났으며, 고주파 감각 표상의 정밀도 저하가 의심됩니다.`);
  } else {
    parts.push(`\n두 주파수 대역 모두에서 변별 능력이 정상 범위에 있습니다. 주파수 해상도는 양호합니다.`);
  }

  parts.push(`\n**간격 탐지 임계치(GDT)**: ${result.gdt.gdt.toFixed(1)}ms (Z = ${gdtZ >= 0 ? '+' : ''}${gdtZ.toFixed(1)})`);
  if (gdtZ > 1.5) {
    parts.push(`시간 해상도가 저하되어 있습니다. 정상 학령기 아동/성인의 GDT는 4~5ms이나, 본 검사에서 ${result.gdt.gdt.toFixed(1)}ms로 측정되었습니다. 이는 좌우 청각 피질 간 P1 반응 비동기화(Asynchrony)의 증가와 관련될 수 있으며, 언어의 시간적 미세구조(Temporal Fine Structure) 처리에 어려움을 겪을 가능성이 있습니다.`);
  } else {
    parts.push(`시간 해상도가 정상 범위에 있어, 빠른 청각 정보의 시간적 분절 능력은 양호합니다.`);
  }

  // ── 4. 청력 상태 분석 ──
  parts.push('\n\n## 청력 상태 분석 (EHFA)\n');
  parts.push(`확장 고주파 평균 역치(PTA_EHF): ${result.ehfa.ptaEHF} dB HL`);
  parts.push(`- 10kHz: ${result.ehfa.thresholds[10000] ?? 'N/A'} dB, 12.5kHz: ${result.ehfa.thresholds[12500] ?? 'N/A'} dB, 16kHz: ${result.ehfa.thresholds[16000] ?? 'N/A'} dB`);

  if (scores.ehfFlag) {
    parts.push(`\n**⚠ 숨은 난청(Hidden Hearing Loss) 위험 감지** (Risk: ${(scores.riskEHF*100).toFixed(0)}%)`);
    parts.push(`확장 고주파 대역의 청력 저하는 와우(Cochlea)의 외유모세포(OHC) 또는 내유모세포-청각신경섬유 시냅스의 초기 손상을 반영할 수 있습니다. 이러한 손상은 조용한 환경에서는 의사소통에 큰 영향이 없으나, **소음 환경에서 말소리를 분리하기 위해 전두엽 집행 기능을 한계치까지 동원하는 '청취 노력(Listening Effort)'**을 유발합니다.`);
    parts.push(`\n이 극심한 인지적 과부하는 작업 기억 저하, 지시사항 망각, 산만함을 유발하여 **ADHD와 동일한 행동 양상**으로 표출될 수 있습니다. 따라서 위 ADHD 지표의 상승이 진정한 신경발달적 ADHD인지, 숨은 난청에 의한 2차적 증상(가짜 ADHD)인지 감별이 필요합니다.`);
  } else {
    parts.push(`\n확장 고주파 대역 청력이 정상 범위로, 숨은 난청에 의한 인지적 과부하 가능성은 낮습니다.`);
  }

  // ── 5. 종합 임상 의견 ──
  parts.push('\n\n## 종합 임상 의견\n');

  if (scores.adhdLevel === 'high' && scores.dyslexiaLevel === 'high') {
    parts.push(`ADHD와 난독증의 동반이환 가능성이 높습니다. 연구에 따르면 ADHD 아동의 31~45%가 특정 학습장애(SLD)를 동반하며, 이 중 상당수가 중추청각처리장애(CAPD)를 함께 나타냅니다. 이는 '다중 결함 모델(Multiple Deficit Model)'에 부합하며, 유전적·환경적 요인이 복합 작용하여 여러 인지 영역에 걸쳐 결함을 유발한 것으로 해석됩니다.`);
  } else if (scores.adhdLevel !== 'low' && scores.ehfFlag) {
    parts.push(`ADHD 지표 상승과 확장 고주파 난청이 동시에 관찰되었습니다. 이 경우 반드시 이비인후과 정밀 청력검사를 먼저 시행하여, ADHD 유사 증상이 숨은 난청에 의한 2차적 현상인지 감별하는 것이 우선입니다.`);
  } else if (scores.adhdLevel === 'low' && scores.dyslexiaLevel === 'low') {
    parts.push(`현재 검사 결과상 ADHD 및 난독증의 임상적 소견이 관찰되지 않습니다. 다만, 본 검사는 스크리닝이므로 증상이 지속되는 경우 전문 기관에서의 종합 평가를 고려하시기 바랍니다.`);
  } else {
    parts.push(`현재 결과에서 ${scores.adhdLevel !== 'low' ? 'ADHD' : '난독증'} 방향의 결함 양상이 감지되었습니다. 해당 영역에 대한 추가 심층 평가가 필요합니다.`);
  }

  // ── 6. 권고사항 ──
  parts.push('\n\n## 권고사항\n');

  if (scores.ehfFlag) {
    parts.push(`1. **이비인후과 정밀 청력검사** (확장 고주파 포함, OAE/ABR 검사 고려)`);
    parts.push(`2. **소음 환경 노출 이력 확인** 및 청각 보호 조치`);
  }

  if (scores.adhdLevel !== 'low') {
    parts.push(`${scores.ehfFlag ? '3' : '1'}. **전문 신경심리 평가** (CPT-II, SNAP-IV, K-ARS 등 표준화 ADHD 평가 도구 실시)`);
    if (scores.adhdLevel === 'high') {
      parts.push(`${scores.ehfFlag ? '4' : '2'}. **소아정신과/신경과 전문의 상담** 권장 (약물 치료 및 행동 치료 고려)`);
    }
  }

  if (scores.dyslexiaLevel !== 'low') {
    const n = scores.ehfFlag ? (scores.adhdLevel !== 'low' ? 5 : 3) : (scores.adhdLevel !== 'low' ? 3 : 1);
    parts.push(`${n}. **음운 인식(Phonological Awareness) 및 읽기 능력** 정밀 평가`);
    parts.push(`${n+1}. **청각 훈련(Auditory Training) 프로그램** 도입 고려`);
    if (scores.dyslexiaLevel === 'high') {
      parts.push(`${n+2}. **교육 지원 및 특수교육 서비스** 연계 검토`);
    }
  }

  if (scores.adhdLevel === 'low' && scores.dyslexiaLevel === 'low' && !scores.ehfFlag) {
    parts.push(`1. 현재 특별한 조치가 필요하지 않습니다.`);
    parts.push(`2. 6~12개월 후 재검사를 통한 추적 관찰을 권장합니다.`);
  }

  // ── 면책 ──
  parts.push('\n\n---');
  parts.push(`\n⚠ **본 분석은 순음 청력검사 기반 스크리닝 결과에 대한 자동 해석이며, 확정 진단을 위한 것이 아닙니다.** 확정 진단은 반드시 전문 의료기관의 종합적인 신경심리 평가, 임상 면담, 행동 관찰 등을 통해 이루어져야 합니다.`);

  return parts.join('\n');
}
