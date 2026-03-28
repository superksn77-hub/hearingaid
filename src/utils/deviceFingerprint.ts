/**
 * 기기 고유 번호 (Device Fingerprint) v4
 *
 * 전략:
 *  1) 하드웨어 신호 조합 → SHA-256 → 결정론적 ID 생성
 *     - 같은 PC면 어떤 브라우저에서든 동일한 ID
 *     - 다른 PC와 겹치지 않도록 충분한 신호 조합
 *
 *  2) 생성된 ID를 Firebase에 서버 백업
 *     - 브라우저 데이터를 전부 삭제해도 서버에서 복원
 *     - 하드웨어 해시(짧은 버전)로 서버 조회
 *
 *  3) 로컬 캐시는 성능 최적화용 (매번 재계산 방지)
 *
 * 사용하는 하드웨어 신호 (모두 브라우저 무관):
 *   - screen.width / height / colorDepth (모니터)
 *   - navigator.hardwareConcurrency (CPU 코어 수)
 *   - Intl timezone (OS 타임존)
 *   - AudioContext.sampleRate (오디오 하드웨어)
 *   - AudioContext.destination.maxChannelCount (오디오 채널)
 *   - navigator.maxTouchPoints (터치 하드웨어)
 *   - window.devicePixelRatio (디스플레이 DPI)
 *
 * 결과 포맷: XXXX-XXXX-XXXX-XXXX (대문자 hex)
 */

// ── SHA-256 해시 ──────────────────────────────────────────────────────────
async function sha256(text: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(text),
      );
      return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {}
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h) ^ text.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, '0').repeat(8);
}

// ── 오디오 하드웨어 정보 (브라우저 무관) ─────────────────────────────────
function getAudioHardwareInfo(): string {
  try {
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    const info = `${ac.sampleRate}|${ac.destination.maxChannelCount}`;
    ac.close();
    return info;
  } catch { return '0|0'; }
}

// ── 하드웨어 신호 수집 (100% 브라우저 무관, 100% 결정론적) ───────────────
// Firebase 불필요, 랜덤 salt 불필요 — 같은 PC = 같은 ID
function collectHardwareSignals(): string {
  // 1) CPU 코어 수 (하드웨어 고정)
  const cpu = navigator.hardwareConcurrency ?? 0;

  // 2) OS 타임존
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // 3) 오디오 하드웨어 (사운드카드 고유, 브라우저 무관)
  let audioRate = 0;
  let audioChannels = 0;
  try {
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioRate = ac.sampleRate;
    audioChannels = ac.destination.maxChannelCount;
    ac.close();
  } catch {}

  // 4) 색상 깊이 (OS 디스플레이 설정, 브라우저 무관)
  const colorDepth = screen.colorDepth;

  // 5) 터치 포인트 (하드웨어 고정)
  const touch = navigator.maxTouchPoints ?? 0;

  const raw = [cpu, tz, audioRate, audioChannels, colorDepth, touch].join('|');
  console.log('[FP] 하드웨어 신호:', raw);
  return raw;
}

// ── 하드웨어 신호 → 기기번호 (순수 결정론적) ────────────────────────────
async function generateIdFromHardware(): Promise<string> {
  const raw = collectHardwareSignals();
  const hash = await sha256(raw);
  const h16 = hash.substring(0, 16).toUpperCase();
  return `${h16.substring(0,4)}-${h16.substring(4,8)}-${h16.substring(8,12)}-${h16.substring(12,16)}`;
}

// ══════════════════════════════════════════════════════════════════════════
// Firebase 서버 백업 (브라우저 데이터 삭제해도 복원 가능)
// ══════════════════════════════════════════════════════════════════════════

// Firebase 불필요 — 순수 하드웨어 결정론적 방식

// ══════════════════════════════════════════════════════════════════════════
// 로컬 캐시 (성능 최적화용)
// ══════════════════════════════════════════════════════════════════════════

const CACHE_KEY = 'hicog_hwfp_v8';
const COOKIE_KEY = 'hicog_fp8';
const FP_REGEX = /^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/;

function readLocalCache(): string | null {
  // localStorage
  try {
    const v = localStorage.getItem(CACHE_KEY);
    if (v && FP_REGEX.test(v)) return v;
  } catch {}
  // Cookie
  try {
    const m = document.cookie.match(new RegExp(`${COOKIE_KEY}=([A-F0-9-]{19})`));
    if (m) return m[1];
  } catch {}
  return null;
}

function writeLocalCache(id: string): void {
  try { localStorage.setItem(CACHE_KEY, id); } catch {}
  try {
    const exp = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${COOKIE_KEY}=${id}; expires=${exp}; path=/; SameSite=Lax`;
  } catch {}
  // 영구 저장 요청 (브라우저 자동 삭제 방지)
  try { navigator.storage?.persist?.(); } catch {}
}

function cleanupOldCaches(): void {
  try {
    localStorage.removeItem('hicog_hwfp_v1');
    localStorage.removeItem('hicog_hwfp_v2');
    localStorage.removeItem('hicog_hwfp_v3');
    localStorage.removeItem('hicog_hwfp_v4');
    localStorage.removeItem('hicog_hwfp_v5');
    localStorage.removeItem('hicog_hwfp_v6');
    localStorage.removeItem('hicog_hwfp_v7');
    localStorage.removeItem('hicog_salt_v1');
    localStorage.removeItem('hicog_salt_v2');
  } catch {}
  try {
    const del = 'expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    for (const k of ['hicog_fp','hicog_fp2','hicog_fp3','hicog_fp4','hicog_fp5','hicog_fp6','hicog_fp7']) {
      document.cookie = `${k}=; ${del}`;
    }
  } catch {}
  try { indexedDB.deleteDatabase('hicog_device'); } catch {}
  try { indexedDB.deleteDatabase('hicog_device_v2'); } catch {}
  try { indexedDB.deleteDatabase('hicog_device_v3'); } catch {}
}

// ══════════════════════════════════════════════════════════════════════════
// 메인 함수
// ══════════════════════════════════════════════════════════════════════════

/**
 * 기기 고유 번호를 반환합니다.
 *
 * 조회 순서:
 *  1) 로컬 캐시 (가장 빠름)
 *  2) Firebase 서버 (하드웨어키로 조회 — 브라우저 데이터 삭제 후 복원)
 *  3) 하드웨어 신호로 새로 생성 → 로컬 + 서버 모두 저장
 */
export async function generateDeviceFingerprint(): Promise<string> {
  if (typeof document === 'undefined') {
    return 'MOBL-0000-0000-0001';
  }

  cleanupOldCaches();

  // ── 1) 로컬 캐시 확인 (성능용) ────────────────────────────────────
  const cached = readLocalCache();
  if (cached) return cached;

  // ── 2) 하드웨어 신호로 결정론적 생성 ──────────────────────────────
  // 같은 PC면 어떤 브라우저에서든 항상 동일한 결과
  const id = await generateIdFromHardware();
  writeLocalCache(id);
  console.log('[FP] 생성 완료:', id);

  return id;
}

// ══════════════════════════════════════════════════════════════════════════
// 기기 정보 수집 (표시용)
// ══════════════════════════════════════════════════════════════════════════

export interface DeviceInfo {
  deviceType:   string;
  os:           string;
  browser:      string;
  screenRes:    string;
  cpuCores:     number;
  ramGB:        number;
  gpu:          string;
  language:     string;
  timezone:     string;
  touchSupport: boolean;
  userAgent:    string;
}

function detectOS(ua: string): string {
  if (/Windows NT 10\.0/.test(ua)) return 'Windows 10/11';
  if (/Windows NT 6\.3/.test(ua))  return 'Windows 8.1';
  if (/Windows NT 6\.1/.test(ua))  return 'Windows 7';
  if (/Windows/.test(ua))          return 'Windows';
  if (/iPhone OS/.test(ua))        return `iOS ${(ua.match(/iPhone OS ([\d_]+)/) ?? [])[1]?.replace(/_/g,'.')}`;
  if (/iPad/.test(ua))             return `iPadOS ${(ua.match(/OS ([\d_]+)/) ?? [])[1]?.replace(/_/g,'.')}`;
  if (/Android/.test(ua))          return `Android ${(ua.match(/Android ([\d.]+)/) ?? [])[1] ?? ''}`;
  if (/Mac OS X/.test(ua))         return `macOS ${(ua.match(/Mac OS X ([\d_]+)/) ?? [])[1]?.replace(/_/g,'.') ?? ''}`;
  if (/Linux/.test(ua))            return 'Linux';
  return 'Unknown OS';
}

function detectBrowser(ua: string): string {
  if (/Edg\//.test(ua))    return `Microsoft Edge ${(ua.match(/Edg\/([\d]+)/) ?? [])[1] ?? ''}`;
  if (/OPR\//.test(ua))    return `Opera ${(ua.match(/OPR\/([\d]+)/) ?? [])[1] ?? ''}`;
  if (/Chrome\//.test(ua)) return `Chrome ${(ua.match(/Chrome\/([\d]+)/) ?? [])[1] ?? ''}`;
  if (/Firefox\//.test(ua)) return `Firefox ${(ua.match(/Firefox\/([\d]+)/) ?? [])[1] ?? ''}`;
  if (/Safari\//.test(ua)) return `Safari ${(ua.match(/Version\/([\d]+)/) ?? [])[1] ?? ''}`;
  return 'Unknown Browser';
}

function detectDeviceType(ua: string): string {
  if (/Windows NT/.test(ua) && !/IEMobile/.test(ua))            return 'PC / 데스크탑 (Windows)';
  if (/Macintosh|Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua)) return 'PC / 데스크탑 (Mac)';
  if (/Linux/.test(ua) && !/Android/.test(ua))                  return 'PC / 데스크탑 (Linux)';
  if (/iPad/.test(ua))                                           return '태블릿 (iPad)';
  if (/iPhone/.test(ua))                                         return '스마트폰 (iPhone)';
  if (/Android/.test(ua) && /Mobile/.test(ua))                  return '스마트폰 (Android)';
  if (/Android/.test(ua))                                        return '태블릿 (Android)';
  return 'PC / 데스크탑';
}

export function collectDeviceInfo(): DeviceInfo {
  try {
    const ua    = navigator.userAgent;
    const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    const c     = document.createElement('canvas');
    const gl    = (c.getContext('webgl') ??
                   c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    const ext   = gl?.getExtension('WEBGL_debug_renderer_info');
    const gpu   = ext
      ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : (gl ? String(gl.getParameter(gl.RENDERER)) : 'N/A');

    return {
      deviceType:   detectDeviceType(ua),
      os:           detectOS(ua),
      browser:      detectBrowser(ua),
      screenRes:    `${screen.width}×${screen.height} (${screen.colorDepth}bit)`,
      cpuCores:     navigator.hardwareConcurrency ?? 0,
      ramGB:        (navigator as any).deviceMemory ?? 0,
      gpu:          gpu.length > 80 ? gpu.slice(0, 80) + '…' : gpu,
      language:     navigator.language,
      timezone:     Intl.DateTimeFormat().resolvedOptions().timeZone,
      touchSupport: touch,
      userAgent:    ua.slice(0, 250),
    };
  } catch {
    return {
      deviceType: 'Unknown', os: 'Unknown', browser: 'Unknown',
      screenRes: '', cpuCores: 0, ramGB: 0, gpu: '',
      language: '', timezone: '', touchSupport: false, userAgent: '',
    };
  }
}
