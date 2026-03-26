/**
 * 브라우저 환경에서 기기 고유 번호(Device Fingerprint)를 생성합니다.
 *
 * 구성 요소:
 *  1) 로컬 UUID – localStorage에 영구 저장되는 랜덤 값
 *  2) Canvas 핑거프린트 – GPU/드라이버 고유 렌더링 패턴
 *  3) WebGL 정보 – 그래픽 카드 정보
 *  4) 화면/시스템 정보 – 해상도, 타임존, 언어, 코어 수
 *
 * 결과 포맷: XXXX-XXXX-XXXX-XXXX (16 hex 문자를 4자리씩 묶음)
 */

const LS_UUID_KEY = 'hicog_device_uuid_v1';

// ── SHA-256 해시 ──────────────────────────────────────────────────────────
async function sha256(text: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch (_) {}
  // 폴백: 간단한 해시
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h) ^ text.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, '0').repeat(8);
}

// ── 로컬 UUID (localStorage 영구 보관) ─────────────────────────────────────
function getOrCreateLocalUUID(): string {
  try {
    let id = localStorage.getItem(LS_UUID_KEY);
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(LS_UUID_KEY, id);
    }
    return id;
  } catch (_) {
    return `fb-${Date.now().toString(36)}`;
  }
}

// ── Canvas 핑거프린트 ────────────────────────────────────────────────────
async function canvasFp(): Promise<string> {
  try {
    const c = document.createElement('canvas');
    c.width = 220; c.height = 60;
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#1a237e';
    ctx.fillRect(0, 0, 220, 60);
    ctx.font = '15px "Arial"';
    ctx.fillStyle = '#00b8d4';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('HICOG 청력검사 Audiometry', 4, 28);
    ctx.fillStyle = 'rgba(239,83,80,0.75)';
    ctx.fillText('DeviceID:9Qz#2024$HICOG', 4, 50);
    return c.toDataURL('image/png').slice(-60);
  } catch (_) { return ''; }
}

// ── WebGL 핑거프린트 ────────────────────────────────────────────────────
function webglFp(): string {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') as WebGLRenderingContext | null
      || c.getContext('experimental-webgl') as WebGLRenderingContext | null;
    if (!gl) return 'no-webgl';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const vendor   = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)   : gl.getParameter(gl.VENDOR);
    return `${vendor}|${renderer}`;
  } catch (_) { return ''; }
}

// ── 상세 기기 정보 수집 ──────────────────────────────────────────────────
export interface DeviceInfo {
  deviceType:   string;   // PC / 스마트폰 / 태블릿
  os:           string;   // Windows 11 / macOS / iOS / Android
  browser:      string;   // Chrome 120 / Safari / Edge
  screenRes:    string;   // 1920x1080
  cpuCores:     number;   // 논리 코어 수
  ramGB:        number;   // GB (일부 브라우저 지원)
  gpu:          string;   // GPU 렌더러
  language:     string;   // ko-KR
  timezone:     string;   // Asia/Seoul
  touchSupport: boolean;  // 터치 지원 여부
  userAgent:    string;   // 전체 UA
}

function detectOS(ua: string): string {
  if (/Windows NT 10\.0/.test(ua)) {
    // Windows 11은 UA가 같지만 platform 힌트로 구분
    return 'Windows 10/11';
  }
  if (/Windows NT 6\.3/.test(ua)) return 'Windows 8.1';
  if (/Windows NT 6\.1/.test(ua)) return 'Windows 7';
  if (/Windows/.test(ua))         return 'Windows';
  if (/iPhone OS/.test(ua))       return `iOS ${(ua.match(/iPhone OS ([\d_]+)/) ?? [])[1]?.replace(/_/g,'.')}`;
  if (/iPad/.test(ua))            return `iPadOS ${(ua.match(/OS ([\d_]+)/) ?? [])[1]?.replace(/_/g,'.')}`;
  if (/Android/.test(ua))         return `Android ${(ua.match(/Android ([\d.]+)/) ?? [])[1] ?? ''}`;
  if (/Mac OS X/.test(ua))        return `macOS ${(ua.match(/Mac OS X ([\d_]+)/) ?? [])[1]?.replace(/_/g,'.') ?? ''}`;
  if (/Linux/.test(ua))           return 'Linux';
  return 'Unknown OS';
}

function detectBrowser(ua: string): string {
  if (/Edg\//.test(ua)) {
    const v = (ua.match(/Edg\/([\d.]+)/) ?? [])[1]?.split('.')[0];
    return `Microsoft Edge ${v ?? ''}`;
  }
  if (/OPR\/|Opera/.test(ua)) {
    const v = (ua.match(/OPR\/([\d.]+)/) ?? [])[1]?.split('.')[0];
    return `Opera ${v ?? ''}`;
  }
  if (/Chrome\//.test(ua)) {
    const v = (ua.match(/Chrome\/([\d.]+)/) ?? [])[1]?.split('.')[0];
    return `Chrome ${v ?? ''}`;
  }
  if (/Firefox\//.test(ua)) {
    const v = (ua.match(/Firefox\/([\d.]+)/) ?? [])[1]?.split('.')[0];
    return `Firefox ${v ?? ''}`;
  }
  if (/Safari\//.test(ua)) {
    const v = (ua.match(/Version\/([\d.]+)/) ?? [])[1]?.split('.')[0];
    return `Safari ${v ?? ''}`;
  }
  return 'Unknown Browser';
}

function detectDeviceType(ua: string): string {
  // 데스크탑 OS는 터치 여부와 무관하게 PC로 확정
  if (/Windows NT/.test(ua) && !/IEMobile/.test(ua)) return 'PC / 데스크탑 (Windows)';
  if (/Macintosh|Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua)) return 'PC / 데스크탑 (Mac)';
  if (/Linux/.test(ua) && !/Android/.test(ua)) return 'PC / 데스크탑 (Linux)';
  // 모바일/태블릿
  if (/iPad/.test(ua))                          return '태블릿 (iPad)';
  if (/iPhone/.test(ua))                        return '스마트폰 (iPhone)';
  if (/Android/.test(ua) && /Mobile/.test(ua))  return '스마트폰 (Android)';
  if (/Android/.test(ua))                       return '태블릿 (Android)';
  return 'PC / 데스크탑';
}

export function collectDeviceInfo(): DeviceInfo {
  try {
    const ua      = navigator.userAgent;
    const touch   = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    const c       = document.createElement('canvas');
    const gl      = c.getContext('webgl') as WebGLRenderingContext | null
                    || c.getContext('experimental-webgl') as WebGLRenderingContext | null;
    const ext     = gl?.getExtension('WEBGL_debug_renderer_info');
    const gpu     = ext
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
export async function generateDeviceFingerprint(): Promise<string> {
  // 웹 환경이 아닐 경우 폴백
  if (typeof document === 'undefined' || typeof localStorage === 'undefined') {
    return 'MOBL-0000-0000-0001';
  }

  const uuid   = getOrCreateLocalUUID();
  const canvas = await canvasFp();
  const webgl  = webglFp();
  const screen_= `${screen.width}x${screen.height}x${screen.colorDepth}`;
  const tz     = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const lang   = navigator.language;
  const hw     = `${navigator.hardwareConcurrency ?? 0}|${(navigator as any).deviceMemory ?? 0}`;
  const ua     = navigator.userAgent.slice(0, 100);
  const plat   = navigator.platform ?? '';

  const raw  = [uuid, canvas, webgl, screen_, tz, lang, hw, ua, plat].join('|||');
  const hash = await sha256(raw);
  const h16  = hash.substring(0, 16).toUpperCase();

  return `${h16.substring(0,4)}-${h16.substring(4,8)}-${h16.substring(8,12)}-${h16.substring(12,16)}`;
}
