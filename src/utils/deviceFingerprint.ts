/**
 * 브라우저 환경에서 기기 고유 번호(Device Fingerprint)를 생성합니다.
 *
 * ▸ 핵심 원칙: 컴퓨터 하드웨어 신호만으로 결정론적(deterministic) ID를 생성합니다.
 *   사용자 이름·쿠키·localStorage 와 완전히 무관합니다.
 *   같은 컴퓨터라면 누가 접속해도, 언제 접속해도 항상 동일한 ID가 나옵니다.
 *
 * 구성 요소 (모두 하드웨어/시스템 고유값):
 *   WebGL GPU      – 그래픽카드 벤더·렌더러 (가장 고유하고 안정적)
 *   화면 해상도     – 가로×세로×색상깊이×픽셀깊이
 *   CPU 코어수      – navigator.hardwareConcurrency
 *   RAM 크기        – navigator.deviceMemory
 *   타임존          – Asia/Seoul 등 (OS 설정값)
 *   언어            – ko-KR 등 (OS/브라우저 설정)
 *   플랫폼          – Win32 / MacIntel / Linux x86_64
 *   WebGL 파라미터  – MAX_TEXTURE_SIZE 등 GPU 세부 스펙
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
  } catch (_) {}
  // 폴백: djb2 해시
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h) ^ text.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, '0').repeat(8);
}

// WebGL, Canvas2D 모두 제거 — 브라우저마다 다른 값을 반환함
// OS/하드웨어 레벨 값만 사용하여 100% 브라우저 무관 보장

// ── 상세 기기 정보 수집 ──────────────────────────────────────────────────
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

// ── 기기 핑거프린트 생성 (메인) ─────────────────────────────────────────
/**
 * 안정적인 기기 고유 ID를 반환합니다.
 *
 * 동작 방식 (2단계):
 *  1) localStorage에 저장된 ID가 있으면 무조건 그 값을 반환합니다.
 *     → 재부팅, 앱 업데이트, 브라우저 업데이트 후에도 동일한 ID 유지
 *  2) 최초 방문(캐시 없음): 하드웨어 신호로 ID를 생성하고 localStorage에 영구 저장합니다.
 *     → GPU + 해상도 + CPU코어 + RAM + 타임존 + 언어 + 플랫폼 → SHA-256
 *
 * ID가 바뀌는 유일한 경우: 브라우저 데이터를 직접 삭제한 경우
 */
const HWFP_CACHE_KEY = 'hicog_hwfp_v3';
const HWFP_COOKIE_KEY = 'hicog_fp3';
const HWFP_IDB_STORE = 'hicog_device_v3';

// ── 다중 저장소에서 읽기 (localStorage → cookie → IndexedDB) ────────
function readFromCookie(): string | null {
  try {
    const match = document.cookie.match(new RegExp(`${HWFP_COOKIE_KEY}=([A-F0-9-]{19})`));
    return match ? match[1] : null;
  } catch { return null; }
}

function writeToCookie(id: string): void {
  try {
    // 10년짜리 쿠키 — 브라우저 데이터 삭제해도 쿠키는 남는 경우 많음
    const expires = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${HWFP_COOKIE_KEY}=${id}; expires=${expires}; path=/; SameSite=Lax`;
  } catch {}
}

function readFromIndexedDB(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(HWFP_IDB_STORE, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config');
        }
      };
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction('config', 'readonly');
          const get = tx.objectStore('config').get('fingerprint');
          get.onsuccess = () => resolve(get.result || null);
          get.onerror = () => resolve(null);
        } catch { resolve(null); }
      };
      req.onerror = () => resolve(null);
      setTimeout(() => resolve(null), 2000); // 타임아웃
    } catch { resolve(null); }
  });
}

function writeToIndexedDB(id: string): void {
  try {
    const req = indexedDB.open(HWFP_IDB_STORE, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config');
      }
    };
    req.onsuccess = () => {
      try {
        const tx = req.result.transaction('config', 'readwrite');
        tx.objectStore('config').put(id, 'fingerprint');
      } catch {}
    };
  } catch {}
}

// ── 모든 저장소에 동시 저장 ──────────────────────────────────────────
function persistToAll(id: string): void {
  try { localStorage.setItem(HWFP_CACHE_KEY, id); } catch {}
  writeToCookie(id);
  writeToIndexedDB(id);
}

const FP_REGEX = /^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/;

// ── 이전 버전 캐시 모두 정리 ─────────────────────────────────────────
function cleanupOldCaches(): void {
  try {
    localStorage.removeItem('hicog_hwfp_v1');
    localStorage.removeItem('hicog_hwfp_v2');
  } catch {}
  try {
    document.cookie = 'hicog_fp=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    document.cookie = 'hicog_fp2=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  } catch {}
  try { indexedDB.deleteDatabase('hicog_device'); } catch {}
  try { indexedDB.deleteDatabase('hicog_device_v2'); } catch {}
}

export async function generateDeviceFingerprint(): Promise<string> {
  if (typeof document === 'undefined') {
    return 'MOBL-0000-0000-0001';
  }

  // 이전 버전 캐시 제거
  cleanupOldCaches();

  // ── 1단계: v2 캐시에서 확인 ────────────────────────────────────────
  let cached: string | null = null;

  // 1-a) localStorage (v2 키)
  try {
    cached = localStorage.getItem(HWFP_CACHE_KEY);
    if (cached && FP_REGEX.test(cached)) {
      persistToAll(cached);
      return cached;
    }
  } catch {}

  // 1-b) Cookie (v2 키)
  cached = readFromCookie();
  if (cached && FP_REGEX.test(cached)) {
    persistToAll(cached);
    return cached;
  }

  // 1-c) IndexedDB — v2는 별도 DB 이름 사용
  cached = await readFromIndexedDB();
  if (cached && FP_REGEX.test(cached)) {
    persistToAll(cached);
    return cached;
  }

  // ── 2단계: 최초 방문 — OS/하드웨어 레벨 값만 사용 ───────────────────
  // 이 값들은 Chrome/Edge/Firefox/Safari 어떤 브라우저든 100% 동일:
  const scr = `${screen.width}x${screen.height}x${screen.colorDepth}`;
  const cpu = `${navigator.hardwareConcurrency ?? 0}`;
  const tz  = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dpr = `${window.devicePixelRatio ?? 1}`;       // 디스플레이 배율 (OS 설정)
  const touch = `${navigator.maxTouchPoints ?? 0}`;    // 터치 포인트 수 (하드웨어)
  const availScr = `${screen.availWidth}x${screen.availHeight}`; // 작업 표시줄 제외 해상도

  // 완전 제외 목록 (브라우저마다 다를 수 있음):
  // ✗ WebGL 전부 (파라미터 포함)  ✗ Canvas2D
  // ✗ navigator.language          ✗ navigator.platform
  // ✗ navigator.deviceMemory      ✗ navigator.userAgent
  // ✗ screen.pixelDepth

  const raw = [scr, cpu, tz, dpr, touch, availScr].join('|||');
  console.log('[FP] 기기 신호:', raw);
  const hash = await sha256(raw);
  const h16  = hash.substring(0, 16).toUpperCase();
  const id   = `${h16.substring(0,4)}-${h16.substring(4,8)}-${h16.substring(8,12)}-${h16.substring(12,16)}`;

  // 3중 영구 저장
  persistToAll(id);

  return id;
}
