/**
 * Google Gemini AI 무료 API 서비스
 *
 * gemini-2.0-flash 모델 사용 (무료 티어: 15 RPM, 1500 RPD)
 * API 키는 localStorage에 저장하며, aistudio.google.com에서 무료 발급.
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const STORAGE_KEY = 'gemini_api_key';
const TIMEOUT_MS = 30000;

/** API 키 저장 */
export function setGeminiApiKey(key: string): void {
  try { localStorage.setItem(STORAGE_KEY, key.trim()); } catch {}
}

/** API 키 가져오기 */
export function getGeminiApiKey(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

/** API 키 삭제 */
export function clearGeminiApiKey(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

/** Gemini API 사용 가능 여부 (키가 설정되어 있는지) */
export function isGeminiConfigured(): boolean {
  const key = getGeminiApiKey();
  return !!key && key.length > 10;
}

/** Gemini API 연결 테스트 */
export async function testGeminiConnection(): Promise<{ ok: boolean; error?: string }> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return { ok: false, error: 'API 키가 설정되지 않았습니다.' };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: '연결 테스트입니다. "연결 성공"이라고만 답하세요.' }] }],
        generationConfig: { maxOutputTokens: 20 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: `API 오류 (${res.status}): ${err?.error?.message || '알 수 없는 오류'}` };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: `연결 실패: ${err.message}` };
  }
}

/**
 * Gemini API로 분석 텍스트 생성
 */
export async function callGemini(
  prompt: string,
  onChunk?: (text: string) => void,
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // 스트리밍 엔드포인트 사용
  const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(streamUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2500,
        topP: 0.8,
      },
    }),
    signal: controller.signal,
  });

  clearTimeout(timer);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini API 오류 (${response.status}): ${err?.error?.message || '알 수 없는 오류'}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('응답 스트림을 열 수 없습니다.');

  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const json = JSON.parse(data);
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          fullText += text;
          onChunk?.(fullText);
        }
      } catch {}
    }
  }

  return fullText;
}
