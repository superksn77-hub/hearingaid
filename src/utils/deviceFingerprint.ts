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

// ── WebGL 상세 핑거프린트 ────────────────────────────────────────────────
function webglFp(): string {
  try {
    const c  = document.createElement('canvas');
    const gl = (c.getContext('webgl') ??
                c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return 'no-webgl';

    const ext      = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    const vendor   = ext
      ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL))
      : String(gl.getParameter(gl.VENDOR));

    // GPU 세부 스펙 — 같은 모델이라도 드라이버 수준에서 차이 발생
    const maxTex   = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxVert  = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    const maxFrag  = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);

    return `${vendor}|${renderer}|${maxTex}|${maxVert}|${maxFrag}`;
  } catch (_) { return 'no-webgl'; }
}

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
 * 컴퓨터 하드웨어 신호만으로 결정론적 기기 ID를 반환합니다.
 * 사용자 이름·쿠키·localStorage 와 완전히 무관합니다.
 *
 * 동일한 컴퓨터라면:
 *  - 사용자가 달라도  → 같은 ID
 *  - 쿠키를 지워도   → 같은 ID
 *  - 앱을 업데이트해도 → 같은 ID
 *  - 브라우저를 업데이트해도 → 같은 ID
 */
export async function generateDeviceFingerprint(): Promise<string> {
  if (typeof document === 'undefined') {
    return 'MOBL-0000-0000-0001';
  }

  const gpu  = webglFp();   // GPU 벤더 + 렌더러 + 스펙 파라미터
  const scr  = `${screen.width}x${screen.height}x${screen.colorDepth}x${screen.pixelDepth ?? 0}`;
  const cpu  = `${navigator.hardwareConcurrency ?? 0}`;
  const ram  = `${(navigator as any).deviceMemory ?? 0}`;
  const tz   = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const lang = navigator.language;
  // userAgentData.platform이 더 정확 (Win32→Windows, 아이폰→iPhone)
  const plat = ((navigator as any).userAgentData?.platform ?? navigator.platform ?? '');

  const raw  = [gpu, scr, cpu, ram, tz, lang, plat].join('|||');
  const hash = await sha256(raw);
  const h16  = hash.substring(0, 16).toUpperCase();

  return `${h16.substring(0,4)}-${h16.substring(4,8)}-${h16.substring(8,12)}-${h16.substring(12,16)}`;
}
