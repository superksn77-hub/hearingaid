import { ScreeningResult, ScreeningScores } from '../types/screening';
import { UserProfile } from '../types';
import { isGeminiConfigured, callGemini } from './geminiService';

/** Ollama AI 분석 서비스
 *
 * localhost:11434의 gemma3:4b 모델을 사용하여
 * 스크리닝 결과에 대한 전문적 임상 해석을 생성한다.
 * Ollama 미연결 시 규칙 기반 전문 분석(임상 보고서 형식)을 제공한다.
 *
 * 출력 형식 참조: HICOG 청력 검사 결과 분석 보고서 (2026-03-30)
 * - 정상 범위에서도 잠재적 기능 제한 항목을 반드시 명시
 * - 임상 수준의 구조화된 섹션으로 구성
 */

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'gemma3:4b';
const TIMEOUT_MS = 60000;

export interface OllamaAnalysis {
  text: string;
  isStreaming: boolean;
  error: string | null;
}

/**스크리닝 결과를 분석하여 텍스트를 반환한다.
 * Ollama 연결 시 AI 분석, 미연결 시 규칙 기반 전문 분석.
 */
export async function generateScreeningAnalysis(
  result: ScreeningResult,
  scores: ScreeningScores,
  user?: UserProfile,
  onChunk?: (text: string) => void,
): Promise<string> {
  // 1순위: Ollama 로컬 서버
  const ollamaOk = await checkOllamaAvailable();
  if (ollamaOk) {
    try {
      return await callOllama(result, scores, user, onChunk);
    } catch (err: any) {
      console.warn('[AI] Ollama 실패:', err.message);
    }
  }

  // 2순위: Google Gemini 무료 API (선택적)
  if (isGeminiConfigured()) {
    try {
      const prompt = buildPrompt(result, scores, user);
      return await callGemini(prompt, onChunk);
    } catch (err: any) {
      console.warn('[AI] Gemini 실패:', err.message);
    }
  }

  // 3순위: 규칙 기반 전문 분석
  const analysis = buildDetailedAnalysis(result, scores, user);
  onChunk?.(analysis);
  return analysis;
}

/** 현재 AI 분석 엔진 상태 확인 */
export async function getAiEngineStatus(): Promise<'ollama' | 'gemini' | 'fallback'> {
  if (await checkOllamaAvailable()) return 'ollama';
  if (isGeminiConfigured()) return 'gemini';
  return 'fallback';
}

/**Ollama 연결 가능 여부 확인 */
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
      options: { temperature: 0.3, num_predict: 2500 },
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

/**
 * Ollama AI 프롬프트 생성
 * 참조 형식: HICOG 청력 검사 결과 분석 보고서
 * - 정상 범위에서도 잠재적 기능 제한을 반드시 제시
 */
function buildPrompt(
  result: ScreeningResult,
  scores: ScreeningScores,
  user?: UserProfile,
): string {
  const age = user?.age || '알 수 없음';
  const gender = user?.gender === 'male' ? '남성' : user?.gender === 'female' ? '여성' : '미지정';
  const name = user?.name || '피검사자';

  return `당신은 청각-인지 신경과학 전문 임상심리사 및 청각사입니다.
아래는 HICOG 모바일 순음 청력 기반 ADHD/난독증 스크리닝 검사 결과입니다.
한국어로 전문적이고 임상 수준의 구조화된 분석 보고서를 작성하세요.

**핵심 지침**: 결과가 정상 범위라도 반드시 잠재적 기능 제한, 경계선 수치의 의미, 특정 환경에서의 취약성을 구체적으로 분석하세요.

## 피검사자 정보
- 이름: ${name}, 나이: ${age}세, 성별: ${gender}

## 검사 결과 데이터

### 주의력 지속 검사 (CPT)
- 평균 반응속도: ${result.cpt.rtMean}ms (정상 기준: 250~450ms)
- 반응속도 표준편차(σ): ${result.cpt.rtStd}ms (정상 기준: <120ms)
- Ex-Gaussian τ (주의력 일탈): ${result.cpt.rtTau}ms (정상 기준: <80ms)
- 오경보율(충동성): ${(result.cpt.falsePositiveRate * 100).toFixed(1)}% (정상 기준: <10%)
- 누락률(부주의): ${(result.cpt.omissionRate * 100).toFixed(1)}% (정상 기준: <15%)
- 반응속도 μ: ${result.cpt.rtMu}ms

### 주파수 변별 임계치 (DLF)
- 1kHz 대역: ${result.dlf.dlf1k.toFixed(1)}% (정상 기준: <2.5%)
- 6kHz 대역: ${result.dlf.dlf6k.toFixed(1)}% (정상 기준: <5.0%)

### 시간 해상도 / 간격 탐지 (GDT)
- 탐지 임계치: ${result.gdt.gdt.toFixed(1)}ms (정상 기준: 4~6ms)

### 확장 고주파 청력 (EHFA)
- 10kHz: ${result.ehfa.thresholds[10000] ?? 'N/A'} dB HL
- 12.5kHz: ${result.ehfa.thresholds[12500] ?? 'N/A'} dB HL
- 16kHz: ${result.ehfa.thresholds[16000] ?? 'N/A'} dB HL
- 평균(PTA_EHF): ${result.ehfa.ptaEHF} dB HL (정상 기준: <20 dB HL)

### 산출 위험도
- ADHD 위험도: ${(scores.pADHD * 100).toFixed(1)}% (${scores.adhdLevel === 'high' ? '높음' : scores.adhdLevel === 'moderate' ? '중등도' : '낮음'})
- 난독증 위험도: ${(scores.pDyslexia * 100).toFixed(1)}% (${scores.dyslexiaLevel === 'high' ? '높음' : scores.dyslexiaLevel === 'moderate' ? '중등도' : '낮음'})
- Z점수: τ=${scores.zScores.rtTau.toFixed(2)}, FPR=${scores.zScores.fpr.toFixed(2)}, OER=${scores.zScores.oer.toFixed(2)}, DLF1k=${scores.zScores.dlf1k.toFixed(2)}, DLF6k=${scores.zScores.dlf6k.toFixed(2)}, GDT=${scores.zScores.gdt.toFixed(2)}

## 보고서 작성 구조 (반드시 아래 순서로 작성)

### 1. 검사 개요 및 종합 평가
전반적 결과를 2~3문장으로 요약하되, 정상이더라도 주목해야 할 수치를 언급하세요.

### 2. 검사별 세부 분석
각 검사(CPT, DLF, GDT, EHFA)에 대해 수치 해석과 임상적 의미를 설명하세요.

### 3. 예상되는 기능적 제한 영역
**정상 범위이더라도** 다음 영역에서 어떤 상황에서 어떤 어려움이 발생할 수 있는지 구체적으로 설명하세요:
- 주의집중 및 학습 환경
- 소음 속 언어 이해
- 읽기·음운 처리
- 청각 피로 및 인지 부하
(각 항목은 아이콘과 소제목으로 구분)

### 4. 종합 임상 의견
감별 진단, 동반이환 가능성, 스크리닝 한계를 포함하세요.

### 5. 권고사항
구체적이고 실행 가능한 권고를 번호 목록으로 제시하세요.

---
⚠️ 본 분석은 스크리닝 결과에 대한 참고 자료이며 확정 진단을 대체하지 않습니다.`;
}

// ══════════════════════════════════════════════════════════════
// 규칙 기반 전문 분석 (Ollama/Gemini 미연결 시)
// 참조: HICOG 청력 검사 결과 분석 보고서 형식
// ══════════════════════════════════════════════════════════════

export function buildDetailedAnalysis(
  result: ScreeningResult,
  scores: ScreeningScores,
  user?: UserProfile,
): string {
  const parts: string[] = [];

  const age = user?.age ? parseInt(user.age, 10) : null;
  const adhdHigh = scores.adhdLevel === 'high';
  const adhdMid = scores.adhdLevel === 'moderate';
  const dysHigh = scores.dyslexiaLevel === 'high';
  const dysMid = scores.dyslexiaLevel === 'moderate';
  const anyRisk = adhdHigh || adhdMid || dysHigh || dysMid;

  const tauZ = scores.zScores.rtTau;
  const fprZ = scores.zScores.fpr;
  const oerZ = scores.zScores.oer;
  const dlf1kZ = scores.zScores.dlf1k;
  const dlf6kZ = scores.zScores.dlf6k;
  const gdtZ = scores.zScores.gdt;

  // ── 1. 검사 개요 및 종합 평가 ──────────────────────────
  parts.push('## 1. 검사 개요 및 종합 평가\n');

  if (adhdHigh && dysHigh) {
    parts.push(
      `ADHD 위험도 **${(scores.pADHD * 100).toFixed(0)}%**, 난독증 위험도 **${(scores.pDyslexia * 100).toFixed(0)}%**로, ` +
      `두 영역 모두에서 임상적으로 유의미한 수준의 결함 패턴이 감지되었습니다. ` +
      `이는 ADHD와 난독증의 **동반이환(Comorbidity)** 가능성을 시사하며, 전체 인구의 약 3~5%에서 나타나는 신경발달적 중복 패턴에 부합합니다. ` +
      `조속한 종합 신경심리 평가가 강력히 권장됩니다.`,
    );
  } else if (adhdHigh) {
    parts.push(
      `주의력 및 반응 억제 지표에서 ADHD 위험도 **${(scores.pADHD * 100).toFixed(0)}%**가 기준치를 초과하였습니다. ` +
      `Ex-Gaussian τ 및 오경보율 패턴은 전두엽 기반 하향식 억제 통제 기능의 저하를 반영합니다. ` +
      `청각 감각 처리 지표(DLF, GDT)의 동향과 함께 종합 평가가 필요합니다.`,
    );
  } else if (dysHigh) {
    parts.push(
      `청각 감각 처리 지표에서 난독증 위험도 **${(scores.pDyslexia * 100).toFixed(0)}%**가 기준치를 초과하였습니다. ` +
      `DLF와 GDT의 저하는 음운 표상 체계의 근본적 결함을 시사하며, ` +
      `언어 처리 전문 기관에서의 추가 평가가 권장됩니다.`,
    );
  } else if (adhdMid || dysMid) {
    parts.push(
      `일부 지표에서 경계선 수준의 결함 패턴이 관찰됩니다 ` +
      `(ADHD ${(scores.pADHD * 100).toFixed(0)}%, 난독증 ${(scores.pDyslexia * 100).toFixed(0)}%). ` +
      `확정적 판단을 내리기에는 이른 시점이나, 경계선 수치가 복합적으로 나타난 경우 ` +
      `특정 환경(소음, 시험, 고부하 학습 상황)에서 어려움이 가시화될 수 있습니다. ` +
      `3~6개월 후 재검사 및 추적 관찰이 권장됩니다.`,
    );
  } else {
    parts.push(
      `ADHD 위험도 **${(scores.pADHD * 100).toFixed(0)}%**, 난독증 위험도 **${(scores.pDyslexia * 100).toFixed(0)}%**로, ` +
      `모든 핵심 지표가 연령 규준 대비 정상 범위 내에 있습니다. ` +
      `현재 시점에서 임상적으로 유의미한 중추 청각-인지 처리 결함은 관찰되지 않습니다. ` +
      `다만, 일부 지표의 경계선 수치 및 고주파 청력 상태를 면밀히 살펴볼 필요가 있습니다.`,
    );
  }

  // ── 2. 검사별 세부 분석 ──────────────────────────────────
  parts.push('\n\n## 2. 검사별 세부 분석\n');

  // ── 2-1. CPT ──
  parts.push('### ① 주의력 지속 검사 (CPT)\n');

  parts.push(
    `| 지표 | 측정값 | Z점수 | 정상 기준 | 평가 |\n` +
    `|------|--------|-------|-----------|------|\n` +
    `| 평균 반응속도 | ${result.cpt.rtMean}ms | — | 250~450ms | ${result.cpt.rtMean >= 250 && result.cpt.rtMean <= 450 ? '✅ 정상' : result.cpt.rtMean < 250 ? '⚡ 빠름' : '⚠ 느림'} |\n` +
    `| 반응속도 σ | ${result.cpt.rtStd}ms | — | <120ms | ${result.cpt.rtStd < 120 ? '✅ 정상' : result.cpt.rtStd < 160 ? '🟡 경계' : '🔴 상승'} |\n` +
    `| Ex-Gaussian τ | ${result.cpt.rtTau}ms | ${tauZ >= 0 ? '+' : ''}${tauZ.toFixed(2)} | <80ms | ${tauZ < 1.0 ? '✅ 정상' : tauZ < 2.0 ? '🟡 경계' : '🔴 상승'} |\n` +
    `| 오경보율(FPR) | ${(result.cpt.falsePositiveRate * 100).toFixed(1)}% | ${fprZ >= 0 ? '+' : ''}${fprZ.toFixed(2)} | <10% | ${fprZ < 1.0 ? '✅ 정상' : fprZ < 1.5 ? '🟡 경계' : '🔴 상승'} |\n` +
    `| 누락률(OER) | ${(result.cpt.omissionRate * 100).toFixed(1)}% | ${oerZ >= 0 ? '+' : ''}${oerZ.toFixed(2)} | <15% | ${oerZ < 1.0 ? '✅ 정상' : oerZ < 1.5 ? '🟡 경계' : '🔴 상승'} |`,
  );
  parts.push('');

  if (tauZ > 2.0) {
    parts.push(
      `**τ(주의력 일탈 지수)** ${result.cpt.rtTau}ms로 정상 상한을 크게 초과하였습니다. ` +
      `이는 검사 수행 중 반복적인 주의력 일탈(Attention Lapses)이 발생한 것으로, ` +
      `디폴트 모드 네트워크(DMN)의 간섭에 의해 과제 수행 네트워크가 주기적으로 붕괴되는 ` +
      `ADHD의 핵심 신경학적 기전과 일치합니다.`,
    );
  } else if (tauZ > 1.0) {
    parts.push(
      `**τ** 값이 다소 상승(Z=${tauZ.toFixed(2)})하여 간헐적 주의력 동요가 관찰됩니다. ` +
      `일반 환경에서는 기능 유지가 가능하나, 고부하 과제(시험, 장시간 집중 학습)에서 ` +
      `수행 저하가 나타날 수 있습니다.`,
    );
  } else {
    parts.push(
      `**τ** 값(${result.cpt.rtTau}ms, Z=${tauZ.toFixed(2)})이 정상 범위로, ` +
      `검사 수행 중 일관된 주의력 유지가 확인됩니다. ` +
      `단, σ=${result.cpt.rtStd}ms의 반응속도 변산성은 ` +
      `${result.cpt.rtStd > 100 ? '주의가 필요한 수준으로, 피로나 스트레스 상황에서 수행이 불안정해질 수 있습니다.' : '안정적인 수준입니다.'}`,
    );
  }

  if (fprZ > 1.5) {
    parts.push(
      `\n오경보율(FPR) ${(result.cpt.falsePositiveRate * 100).toFixed(1)}%의 상승은 ` +
      `**행동 반응 억제(Response Inhibition)** 기능의 저하를 시사합니다. ` +
      `충동적 반응이 잦아 실수를 교정하는 데 어려움을 겪을 수 있습니다.`,
    );
  }

  if (oerZ > 1.5) {
    parts.push(
      `\n누락률(OER) ${(result.cpt.omissionRate * 100).toFixed(1)}%의 상승은 ` +
      `**지속적 주의력(Sustained Attention)** 저하를 반영하며, ` +
      `ADHD 부주의형 프로필과 일치합니다.`,
    );
  }

  // ── 2-2. DLF ──
  parts.push('\n### ② 주파수 변별 임계치 (DLF)\n');

  parts.push(
    `| 주파수 | 임계치 | Z점수 | 정상 기준 | 평가 |\n` +
    `|--------|--------|-------|-----------|------|\n` +
    `| 1kHz (위상잠금 대역) | ${result.dlf.dlf1k.toFixed(1)}% | ${dlf1kZ >= 0 ? '+' : ''}${dlf1kZ.toFixed(2)} | <2.5% | ${dlf1kZ < 1.0 ? '✅ 정상' : dlf1kZ < 1.5 ? '🟡 경계' : '🔴 상승'} |\n` +
    `| 6kHz (위상잠금 불가) | ${result.dlf.dlf6k.toFixed(1)}% | ${dlf6kZ >= 0 ? '+' : ''}${dlf6kZ.toFixed(2)} | <5.0% | ${dlf6kZ < 1.0 ? '✅ 정상' : dlf6kZ < 1.5 ? '🟡 경계' : '🔴 상승'} |`,
  );
  parts.push('');

  if (dlf1kZ > 1.5 && dlf6kZ > 1.5) {
    parts.push(
      `1kHz와 6kHz 모두에서 변별 임계치가 상승하였습니다. ` +
      `위상잠금 가능(1kHz)·불가(6kHz) 두 경로 모두에서 결함이 나타나므로, ` +
      `이는 **대뇌 피질 수준의 전반적 주파수 해상도 결함**을 시사합니다. ` +
      `음운 인식 능력에 직접적 영향을 미칩니다.`,
    );
  } else if (dlf1kZ > 1.5) {
    parts.push(
      `1kHz 대역에서 변별 임계치가 상승(${result.dlf.dlf1k.toFixed(1)}%)하였습니다. ` +
      `이는 위상잠금 의존 처리 경로의 이상으로, 음소 식별과 음운 처리에 영향을 줄 수 있습니다.`,
    );
  } else if (dlf6kZ > 1.5) {
    parts.push(
      `6kHz 대역에서 변별 임계치가 상승(${result.dlf.dlf6k.toFixed(1)}%)하였습니다. ` +
      `고주파 감각 표상의 정밀도가 저하되어 있으며, 자음 변별 능력에 영향을 줄 수 있습니다.`,
    );
  } else {
    const maxDlfZ = Math.max(dlf1kZ, dlf6kZ);
    parts.push(
      `두 주파수 대역(1kHz: ${result.dlf.dlf1k.toFixed(1)}%, 6kHz: ${result.dlf.dlf6k.toFixed(1)}%) ` +
      `모두 정상 범위에 있습니다. ` +
      `${maxDlfZ > 0.5
        ? `다만 Z=${maxDlfZ.toFixed(2)} 수준으로 규준 평균보다 다소 높으며, 소음 환경이나 빠른 발화 속도에서 ` +
          `미세한 음소 변별 오류가 발생할 가능성이 있습니다.`
        : `주파수 해상도가 우수한 수준으로 유지되고 있습니다.`}`,
    );
  }

  // ── 2-3. GDT ──
  parts.push('\n### ③ 시간 해상도 / 간격 탐지 (GDT)\n');

  const gdtNorm = gdtZ < 1.0 ? '✅ 정상' : gdtZ < 1.5 ? '🟡 경계' : '🔴 저하';
  parts.push(
    `| 지표 | 측정값 | Z점수 | 정상 기준 | 평가 |\n` +
    `|------|--------|-------|-----------|------|\n` +
    `| GDT 임계치 | ${result.gdt.gdt.toFixed(1)}ms | ${gdtZ >= 0 ? '+' : ''}${gdtZ.toFixed(2)} | 4~6ms | ${gdtNorm} |`,
  );
  parts.push('');

  if (gdtZ > 1.5) {
    parts.push(
      `시간 해상도(GDT ${result.gdt.gdt.toFixed(1)}ms)가 저하되어 있습니다. ` +
      `이는 청각 피질 간 P1 반응 비동기화의 증가와 관련되며, ` +
      `언어의 **시간적 미세구조(Temporal Fine Structure)** 처리에 어려움을 유발합니다. ` +
      `빠른 발화 속도에서 음절 경계 인식이 저하될 수 있습니다.`,
    );
  } else if (gdtZ > 0.7) {
    parts.push(
      `GDT ${result.gdt.gdt.toFixed(1)}ms는 정상 범위이나 Z=${gdtZ.toFixed(2)}로 규준보다 다소 높습니다. ` +
      `일반 속도의 언어 처리는 문제없으나, 매우 빠른 발화·방언·외국어 등 ` +
      `음운 처리 부하가 높은 상황에서 어려움이 나타날 수 있습니다.`,
    );
  } else {
    parts.push(
      `GDT ${result.gdt.gdt.toFixed(1)}ms는 정상 범위로, 청각 시간 해상도가 양호합니다. ` +
      `빠른 청각 정보의 시간적 분절 능력이 잘 유지되고 있습니다.`,
    );
  }

  // ── 2-4. EHFA ──
  parts.push('\n### ④ 확장 고주파 청력 (EHFA)\n');

  const ehfa10 = result.ehfa.thresholds[10000] ?? 0;
  const ehfa12 = result.ehfa.thresholds[12500] ?? 0;
  const ehfa16 = result.ehfa.thresholds[16000] ?? 0;

  parts.push(
    `| 주파수 | 역치 | 평가 |\n` +
    `|--------|------|------|\n` +
    `| 10kHz | ${ehfa10} dB HL | ${ehfa10 <= 20 ? '✅ 정상' : ehfa10 <= 30 ? '🟡 경계' : '🔴 손실'} |\n` +
    `| 12.5kHz | ${ehfa12} dB HL | ${ehfa12 <= 20 ? '✅ 정상' : ehfa12 <= 30 ? '🟡 경계' : '🔴 손실'} |\n` +
    `| 16kHz | ${ehfa16} dB HL | ${ehfa16 <= 20 ? '✅ 정상' : ehfa16 <= 30 ? '🟡 경계' : '🔴 손실'} |\n` +
    `| **PTA_EHF 평균** | **${result.ehfa.ptaEHF} dB HL** | ${result.ehfa.ptaEHF <= 20 ? '✅ 정상' : result.ehfa.ptaEHF <= 30 ? '🟡 경계' : '🔴 손실'} |`,
  );
  parts.push('');

  if (scores.ehfFlag) {
    parts.push(
      `⚠️ **확장 고주파 청력 저하 감지** (위험도 ${(scores.riskEHF * 100).toFixed(0)}%)\n` +
      `PTA_EHF ${result.ehfa.ptaEHF} dB HL은 초기 **숨은 난청(Hidden Hearing Loss)** 위험 범위에 해당합니다. ` +
      `확장 고주파 손실은 와우 외유모세포(OHC) 또는 청각신경섬유 시냅스의 초기 손상을 반영할 수 있으며, ` +
      `일상 환경에서는 두드러지지 않으나 소음 환경에서 **청취 노력(Listening Effort)**이 급격히 증가합니다. ` +
      `이는 인지적 과부하를 유발하여 집중력 저하, 지시사항 망각 등 ADHD 유사 증상으로 나타날 수 있습니다.`,
    );
  } else {
    const maxEhfa = Math.max(ehfa10, ehfa12, ehfa16);
    if (maxEhfa > 15) {
      parts.push(
        `PTA_EHF ${result.ehfa.ptaEHF} dB HL은 정상 범위이나, ` +
        `일부 고주파(${maxEhfa === ehfa10 ? '10kHz' : maxEhfa === ehfa12 ? '12.5kHz' : '16kHz'}: ${maxEhfa} dB HL)에서 ` +
        `정상 상한에 근접한 수치가 확인됩니다. ` +
        `소음 노출 이력이 있거나 이어폰 사용이 잦은 경우 정기적 청력 모니터링이 권장됩니다.`,
      );
    } else {
      parts.push(
        `확장 고주파 청력이 정상 범위(PTA_EHF ${result.ehfa.ptaEHF} dB HL)로, ` +
        `숨은 난청에 의한 인지적 과부하 가능성은 낮습니다.`,
      );
    }
  }

  // ── 3. 예상되는 기능적 제한 영역 ──────────────────────
  parts.push('\n\n## 3. 예상되는 기능적 제한 영역\n');
  parts.push(
    anyRisk
      ? `검사 결과에서 나타난 결함 패턴을 고려할 때, 다음 영역에서 기능적 어려움이 발생할 수 있습니다.`
      : `전반적 지표는 정상 범위이나, 아래 영역에서 특정 상황이나 환경에 따라 어려움이 나타날 수 있습니다. 이는 예방적 관점에서 주의가 필요한 사항입니다.`,
  );
  parts.push('');

  // 기능 제한 1: 주의집중
  const attnLevel = adhdHigh ? '높음' : adhdMid ? '중등도' : tauZ > 0.5 ? '경미' : '낮음';
  const attnSymbol = adhdHigh ? '🔴' : adhdMid ? '🟡' : tauZ > 0.5 ? '🟡' : '🟢';
  parts.push(`${attnSymbol} **① 지속적 주의집중 및 학습 환경** (위험 수준: ${attnLevel})`);
  if (adhdHigh) {
    parts.push(
      `CPT 결과에서 주의력 일탈(τ=${result.cpt.rtTau}ms)과 충동성(FPR=${(result.cpt.falsePositiveRate*100).toFixed(1)}%)이 ` +
      `현저히 상승하여, 장시간 집중이 필요한 수업·시험·독서 환경에서 상당한 어려움이 예상됩니다. ` +
      `주의가 자주 분산되고, 실수가 빈번하며, 과제를 끝까지 완수하는 데 어려움을 겪을 수 있습니다.`,
    );
  } else if (tauZ > 0.5 || fprZ > 0.5) {
    parts.push(
      `현재 수치(τ=${result.cpt.rtTau}ms, FPR=${(result.cpt.falsePositiveRate*100).toFixed(1)}%)는 정상 범위이나, ` +
      `수면 부족, 높은 스트레스, 소음 환경에서 수행이 불안정해질 수 있습니다. ` +
      `특히 지루하거나 단조로운 과제에서 주의력 유지가 어려울 수 있으니 ` +
      `주기적 휴식과 환경 조절이 도움이 됩니다.`,
    );
  } else {
    parts.push(
      `주의력 지표가 안정적이나, 고부하 멀티태스킹 상황에서는 누구나 수행 저하가 발생할 수 있습니다. ` +
      `충분한 수면과 규칙적인 생활 패턴 유지를 권장합니다.`,
    );
  }
  parts.push('');

  // 기능 제한 2: 소음 속 언어 이해
  const noiseLevel = (scores.ehfFlag || dlf1kZ > 1.0 || gdtZ > 1.0) ? '중등도' : '낮음';
  const noiseSymbol = scores.ehfFlag || dlf1kZ > 1.5 ? '🔴' : noiseLevel === '중등도' ? '🟡' : '🟢';
  parts.push(`${noiseSymbol} **② 소음 속 언어 이해 (Speech-in-Noise)** (위험 수준: ${noiseLevel})`);
  if (scores.ehfFlag) {
    parts.push(
      `확장 고주파 청력 저하로 인해 소음 환경에서 말소리를 분리하는 데 상당한 청취 노력이 소요됩니다. ` +
      `교실·식당·대중교통 등 배경 소음이 높은 환경에서 언어 이해력이 저하되며, ` +
      `청각 피로 누적으로 수업 후 극심한 피로감을 호소할 수 있습니다.`,
    );
  } else if (dlf1kZ > 0.5 || gdtZ > 0.5) {
    parts.push(
      `주파수 변별 및 시간 해상도는 정상 범위이나, 빠른 발화 속도, ` +
      `여러 사람이 동시에 말하는 환경에서 선별적 청취가 다소 어려울 수 있습니다. ` +
      `'양이 합산(Binaural Summation)' 효과를 최대화하기 위해 음원 쪽으로 몸을 향하거나 ` +
      `화자와 가까운 자리에 앉는 것이 도움이 됩니다.`,
    );
  } else {
    parts.push(
      `소음 환경에서의 언어 이해력은 양호합니다. ` +
      `그러나 매우 소란한 환경(공사장 소음, 콘서트 수준)이나 극심한 피로 상태에서는 ` +
      `누구나 청각 처리 성능이 저하될 수 있습니다.`,
    );
  }
  parts.push('');

  // 기능 제한 3: 읽기·음운 처리
  const readLevel = dysHigh ? '높음' : dysMid ? '중등도' : (dlf1kZ > 0.5 || gdtZ > 0.5) ? '경미' : '낮음';
  const readSymbol = dysHigh ? '🔴' : dysMid ? '🟡' : readLevel === '경미' ? '🟡' : '🟢';
  parts.push(`${readSymbol} **③ 읽기 및 음운 처리** (위험 수준: ${readLevel})`);
  if (dysHigh) {
    parts.push(
      `DLF(1kHz: ${result.dlf.dlf1k.toFixed(1)}%, 6kHz: ${result.dlf.dlf6k.toFixed(1)}%)와 ` +
      `GDT(${result.gdt.gdt.toFixed(1)}ms)의 동시 저하는 **음운 인식(Phonological Awareness)** 결함을 시사합니다. ` +
      `받아쓰기 오류, 유사음 혼동(ㅂ/ㅍ, ㄷ/ㅌ), 음절 분절 어려움, 독해 속도 저하 등이 나타날 수 있습니다. ` +
      `체계적 음운 훈련 프로그램이 강력히 권장됩니다.`,
    );
  } else if (dlf1kZ > 0.5 || gdtZ > 0.5) {
    parts.push(
      `음운 처리 지표가 정상 범위이나 일부 Z점수(DLF1k Z=${dlf1kZ.toFixed(2)}, GDT Z=${gdtZ.toFixed(2)})가 ` +
      `평균 이상으로 나타났습니다. 일반적인 읽기·쓰기에는 지장이 없으나, ` +
      `외국어 학습(특히 영어 받아쓰기)이나 복잡한 음운 규칙 습득 시 ` +
      `또래 대비 다소 더 많은 연습이 필요할 수 있습니다.`,
    );
  } else {
    parts.push(
      `음운 처리 및 주파수 변별 능력이 양호하여 읽기·쓰기 관련 지표는 안정적입니다. ` +
      `다양한 독서 경험과 언어 자극이 지속적으로 이 능력을 강화하는 데 도움이 됩니다.`,
    );
  }
  parts.push('');

  // 기능 제한 4: 청각 피로 / 인지 부하
  const fatLevel = (scores.ehfFlag || adhdMid || adhdHigh) ? '중등도' : (tauZ > 0.5 || dlf1kZ > 0.5) ? '경미' : '낮음';
  const fatSymbol = (scores.ehfFlag && adhdHigh) ? '🔴' : fatLevel === '중등도' ? '🟡' : fatLevel === '경미' ? '🟡' : '🟢';
  parts.push(`${fatSymbol} **④ 청각 피로 및 인지 부하** (위험 수준: ${fatLevel})`);
  if (scores.ehfFlag && adhdHigh) {
    parts.push(
      `숨은 난청에 의한 청취 노력 증가와 ADHD에 의한 집행 기능 저하가 복합되면, ` +
      `하루 종일 수업 후 극심한 인지적 탈진(Cognitive Fatigue)이 발생할 수 있습니다. ` +
      `방과 후 과외 활동 부하를 줄이고, 조용한 환경에서의 휴식 시간을 반드시 확보해야 합니다.`,
    );
  } else if (scores.ehfFlag || adhdMid) {
    parts.push(
      `소음 환경에서의 청취 노력 또는 주의력 조절에 추가적 인지 자원이 소요됩니다. ` +
      `장시간 수업·회의 후 피로감이 또래보다 빠르게 누적될 수 있으며, ` +
      `오후 시간대 집중력 저하가 나타날 수 있습니다. 규칙적인 휴식이 중요합니다.`,
    );
  } else {
    parts.push(
      `청각 피로 위험도가 낮은 편입니다. ` +
      `그러나 이어폰·헤드폰 장시간 사용, 음악 감상 시 높은 볼륨 사용 등은 ` +
      `확장 고주파 청력에 누적적 영향을 줄 수 있으므로 주의가 필요합니다.`,
    );
  }

  // ── 4. 종합 임상 의견 ──────────────────────────────────
  parts.push('\n\n## 4. 종합 임상 의견\n');

  if (adhdHigh && dysHigh) {
    parts.push(
      `본 검사에서 ADHD와 난독증의 **동반이환(Comorbidity)** 패턴이 강하게 시사됩니다. ` +
      `연구에 따르면 ADHD 아동의 31~45%가 특정 학습장애(SLD)를 동반하며, ` +
      `이 중 상당수에서 중추청각처리장애(CAPD)가 함께 나타납니다. ` +
      `이는 '다중 결함 모델(Multiple Deficit Model)'에 부합하는 프로필로, ` +
      `단일 개입보다는 다학제적 치료 접근이 필요합니다. ` +
      `스크리닝 결과이므로 종합 신경심리 평가를 통한 확진이 선행되어야 합니다.`,
    );
  } else if (adhdHigh && scores.ehfFlag) {
    parts.push(
      `ADHD 위험 지표 상승과 확장 고주파 청력 저하가 동시에 나타났습니다. ` +
      `이 경우 반드시 이비인후과 정밀 청력 검사를 먼저 시행하여, ` +
      `ADHD 유사 증상이 숨은 난청에 의한 2차적 현상인지 감별하는 것이 우선입니다. ` +
      `청력 문제 해결만으로도 주의력 관련 증상이 상당 부분 개선될 수 있습니다.`,
    );
  } else if (!anyRisk) {
    parts.push(
      `현재 검사 결과상 ADHD 및 난독증의 임상적 소견이 관찰되지 않습니다. ` +
      `다만, 본 스크리닝은 민감도(Sensitivity)를 높이기 위해 설계된 도구로, ` +
      `일부 경계선 수치(Z점수 0.5~1.0 범위)는 미래 발현 가능성을 배제하지 않습니다. ` +
      `지속적인 학업 또는 행동 문제가 관찰된다면 전문 기관 평가를 권장합니다.`,
    );
  } else {
    parts.push(
      `${adhdMid || adhdHigh ? 'ADHD' : ''}${(adhdMid || adhdHigh) && (dysMid || dysHigh) ? '와 ' : ''}${dysMid || dysHigh ? '난독증' : ''} 방향의 결함 양상이 감지되었습니다. ` +
      `본 스크리닝 결과는 진단을 확정하기 위한 것이 아니라, ` +
      `추가 평가의 필요성을 판단하기 위한 참고 자료입니다. ` +
      `해당 영역에 대한 표준화 평가 도구를 사용한 심층 평가가 필요합니다.`,
    );
  }

  // ── 5. 권고사항 ────────────────────────────────────────
  parts.push('\n\n## 5. 권고사항\n');

  const recs: string[] = [];

  if (scores.ehfFlag) {
    recs.push('**이비인후과 정밀 청력검사** 시행 (확장 고주파 포함, OAE 및 ABR 검사 고려)');
    recs.push('소음 환경 노출 이력 확인 및 이어폰·헤드폰 사용 시간 제한');
  }

  if (adhdHigh) {
    recs.push('**전문 신경심리 평가** 실시 (CPT-II, K-ARS, SNAP-IV 등 표준화 ADHD 평가 도구)');
    recs.push('**소아정신과 또는 신경과 전문의 상담** (약물 치료 및 행동 치료 옵션 검토)');
    recs.push('학습 환경 조성: 조용한 공간, 짧은 과제 단위, 시각적 일정표 활용');
  } else if (adhdMid || tauZ > 1.0) {
    recs.push('**전문 신경심리 평가** 고려 (3~6개월 경과 후 증상 지속 시)');
    recs.push('수면 규칙성, 운동 습관, 화면 시간 관리 등 생활 습관 점검');
  }

  if (dysHigh) {
    recs.push('**음운 인식 및 읽기 능력 정밀 평가** (언어치료사 또는 특수교육 전문가)');
    recs.push('**청각 훈련(Auditory Training) 프로그램** 도입 (Fast ForWord, D-Sound 등)');
    recs.push('**교육 지원 및 특수교육 서비스** 연계 검토');
  } else if (dysMid || dlf1kZ > 1.0) {
    recs.push('**음운 인식 강화 활동**: 운율 맞추기, 음절 나누기, 받아쓰기 훈련');
    recs.push('외국어(영어) 학습 시 음성 자료 반복 청취 및 파닉스 중심 접근 권장');
  }

  if (!anyRisk && !scores.ehfFlag) {
    recs.push('6~12개월 주기의 정기 재검사를 통한 추적 관찰 권장');
    recs.push('이어폰 사용 시 60/60 규칙 준수 (최대 볼륨의 60% 이하, 하루 60분 이내)');
    recs.push('규칙적인 수면(7~9시간), 유산소 운동이 인지 기능 유지에 도움');
  }

  if (scores.ehfFlag) {
    recs.push('학습 환경 내 **FM 시스템 또는 보조 청취 기기** 활용 가능성 평가');
  }

  recs.forEach((rec, i) => parts.push(`${i + 1}. ${rec}`));

  // ── 면책 ───────────────────────────────────────────────
  parts.push('\n\n---');
  parts.push(
    `\n⚠️ **유의사항**: 본 분석은 순음 청력 기반 스크리닝 결과에 대한 자동 해석 참고 자료이며, 의학적 진단을 대체하지 않습니다. ` +
    `정확한 진단 및 치료 방향은 반드시 자격을 갖춘 임상심리사, 청각사, 소아정신과 전문의와 상담하여 결정하시기 바랍니다.`,
  );

  return parts.join('\n');
}
