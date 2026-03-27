import { ScreeningResult, ScreeningScores } from '../types/screening';
import { UserProfile } from '../types';

/**
 * Ollama AI 분석 서비스
 *
 * localhost:11434의 llama3 모델을 사용하여
 * 스크리닝 결과에 대한 전문적 임상 해석을 생성한다.
 */

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'llama3';
const TIMEOUT_MS = 30000;

export interface OllamaAnalysis {
  text: string;
  isStreaming: boolean;
  error: string | null;
}

/**
 * 스크리닝 결과를 Ollama AI로 분석하여 스트리밍 텍스트를 반환한다.
 * onChunk 콜백으로 실시간 텍스트가 전달된다.
 */
export async function generateScreeningAnalysis(
  result: ScreeningResult,
  scores: ScreeningScores,
  user?: UserProfile,
  onChunk?: (text: string) => void,
): Promise<string> {
  const prompt = buildPrompt(result, scores, user);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: true,
        options: {
          temperature: 0.3,
          num_predict: 1500,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`Ollama 응답 오류: ${response.status}`);
    }

    // Streaming 응답 처리
    const reader = response.body?.getReader();
    if (!reader) throw new Error('응답 스트림을 열 수 없습니다.');

    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // Ollama는 각 줄이 JSON 객체
      const lines = chunk.split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.response) {
            fullText += json.response;
            onChunk?.(fullText);
          }
        } catch (_) {
          // 부분 JSON 무시
        }
      }
    }

    return fullText || getFallbackAnalysis(scores);
  } catch (err: any) {
    console.warn('[Ollama] 연결 실패:', err.message);
    return getFallbackAnalysis(scores);
  }
}

/**
 * Ollama 연결 가능 여부 확인
 */
export async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── 프롬프트 구성 ─────────────────────────────────────────────

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
- 나이: ${age}세
- 성별: ${gender}

## 검사 결과 데이터

### 1. 주의력 검사 (CPT)
- 평균 반응 시간(RT): ${result.cpt.rtMean}ms
- RT 표준편차: ${result.cpt.rtStd}ms
- Ex-Gaussian τ (주의력 일탈 지표): ${result.cpt.rtTau}ms
- 오경보율(FPR): ${(result.cpt.falsePositiveRate * 100).toFixed(1)}%
- 누락률(OER): ${(result.cpt.omissionRate * 100).toFixed(1)}%
- 총 시행: ${result.cpt.totalTrials}회

### 2. 주파수 변별 (DLF)
- 1kHz 변별 임계치: ${result.dlf.dlf1k.toFixed(1)}%
- 6kHz 변별 임계치: ${result.dlf.dlf6k.toFixed(1)}%

### 3. 간격 탐지 (GDT)
- 간격 탐지 임계치: ${result.gdt.gdt.toFixed(1)}ms

### 4. 확장 고주파 청력 (EHFA)
- PTA_EHF: ${result.ehfa.ptaEHF} dB HL
- 10kHz: ${result.ehfa.thresholds[10000] ?? 'N/A'} dB
- 12.5kHz: ${result.ehfa.thresholds[12500] ?? 'N/A'} dB
- 16kHz: ${result.ehfa.thresholds[16000] ?? 'N/A'} dB

### 5. 산출 점수
- ADHD 위험 확률: ${(scores.pADHD * 100).toFixed(1)}% (${scores.adhdLevel})
- 난독증 위험 확률: ${(scores.pDyslexia * 100).toFixed(1)}% (${scores.dyslexiaLevel})
- 숨은 난청 위험: ${(scores.riskEHF * 100).toFixed(1)}%
- Z점수: RT_τ=${scores.zScores.rtTau.toFixed(1)}, FPR=${scores.zScores.fpr.toFixed(1)}, OER=${scores.zScores.oer.toFixed(1)}, DLF1k=${scores.zScores.dlf1k.toFixed(1)}, DLF6k=${scores.zScores.dlf6k.toFixed(1)}, GDT=${scores.zScores.gdt.toFixed(1)}

## 작성 요청사항
다음 구조로 작성해주세요:

1. **전반적 요약** (2-3문장)
2. **주의력/반응 억제 분석** (ADHD 관점 - RT_τ, FPR, OER 해석)
3. **청각 감각 처리 분석** (난독증 관점 - DLF, GDT 해석)
4. **청력 상태 분석** (EHFA 결과와 숨은 난청 가능성)
5. **종합 임상 의견** (동반이환 가능성, 감별 포인트)
6. **권고사항** (추가 검사, 치료적 개입, 환경 조정)

주의: 이 검사는 스크리닝이며 확정 진단이 아님을 반드시 명시하세요.`;
}

// ── Fallback (Ollama 미연결 시) ────────────────────────────────

function getFallbackAnalysis(scores: ScreeningScores): string {
  const parts: string[] = [];

  parts.push('## 전반적 요약');
  if (scores.adhdLevel === 'high' && scores.dyslexiaLevel === 'high') {
    parts.push('ADHD와 난독증 모두 높은 위험 수준이 감지되었습니다. 두 질환의 동반이환(Comorbidity) 가능성을 고려한 종합적 신경심리 평가가 필요합니다.');
  } else if (scores.adhdLevel === 'high') {
    parts.push('주의력 및 반응 억제 지표에서 ADHD 위험이 높게 나타났습니다. Ex-Gaussian τ 값과 오경보율의 상승이 전두엽 억제 통제 기능의 저하를 시사합니다.');
  } else if (scores.dyslexiaLevel === 'high') {
    parts.push('주파수 변별 및 시간 해상도 지표에서 난독증 위험이 높게 나타났습니다. 청각 피질의 감각 표상 체계 결함이 의심됩니다.');
  } else {
    parts.push('모든 청각-인지 지표가 연령 규준 대비 정상 또는 경계 범위 내에 있습니다.');
  }

  if (scores.ehfFlag) {
    parts.push('\n## 주의');
    parts.push('확장 고주파 대역에서 청력 저하가 감지되었습니다. 이는 숨은 난청으로 인한 청취 노력 증가를 유발할 수 있으며, ADHD 유사 증상의 원인이 될 수 있습니다.');
  }

  parts.push('\n## 권고사항');
  parts.push(scores.recommendations.map(r => `• ${r}`).join('\n'));

  parts.push('\n\n※ 본 분석은 AI 연결 없이 생성된 기본 해석입니다. Ollama AI 서버 연결 시 더 상세한 분석이 제공됩니다.');

  return parts.join('\n');
}
