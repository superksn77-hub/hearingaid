/**
 * 브라우저 환경에서 기기 고유 번호(Device Fingerprint)를 생성합니다.
 *
 * ▸ 핵심 원칙: 한 번 생성된 ID는 localStorage에 저장되어 영구적으로 고정됩니다.
 *   브라우저 업데이트·앱 재배포·Canvas 렌더링 변화의 영향을 받지 않습니다.
 *
 * 결과 포맷: XXXX-XXXX-XXXX-XXXX (대문자 hex 16자를 4자리씩 묶음)
 */

/** localStorage 저장 키 — 최종 포맷된 기기 ID를 직접 저장 */
const LS_DEVICE_ID_KEY = 'hicog_device_id_v2';
/** localStorage 저장 키 — 내부 랜덤 시드 (하위 호환) */
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
  // 폴백: djb2 해시
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h) ^ text.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, '0').repeat(8);
}

// ── 랜덤 UUID (localStorage 영구 보관) ──────────────────────────────────
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

// ── WebGL 핑거프린트 (GPU 정보 — 비교적 안정적) ────────────────────────
function webglFp(): string {
  try {
    const c  = document.createElement('canvas');
    const gl = c.getContext('webgl') as WebGLRenderingContext | null
      || c.getContext('experimental-webgl') as WebGLRenderingContext | null;
    if (!gl) return 'no-webgl';
    const ext      = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const vendor   = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)   : gl.getParameter(gl.VENDOR);
    return `${vendor}|${renderer}`;
  } catch (_) { return ''; }
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
    const ua  = navigator.userAgent;
    const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    const c   = document.createElement('canvas');
    const gl  = c.getContext('webgl') as WebGLRenderingContext | null
                || c.getContext('experimental-webgl') as WebGLRenderingContext | null;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const gpu = ext
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
 * 최초 호출 시 기기 ID를 생성하고 localStorage에 저장합니다.
 * 이후 모든 호출은 저장된 값을 그대로 반환합니다.
 * → 앱 업데이트·브라우저 업데이트·Canvas 렌더링 변화에 영향받지 않음.
 */
export async function generateDeviceFingerprint(): Promise<string> {
  // 웹 환경이 아닌 경우 고정 폴백
  if (typeof document === 'undefined' || typeof localStorage === 'undefined') {
    return 'MOBL-0000-0000-0001';
  }

  // ① 이미 저장된 기기 ID가 있으면 변경하지 않고 그대로 반환
  try {
    const saved = localStorage.getItem(LS_DEVICE_ID_KEY);
    if (saved && /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(saved)) {
      return saved;
    }
  } catch (_) {}

  // ② 최초 생성: 안정적인 하드웨어 시그널 + localStorage UUID 조합
  //    Canvas/UA 는 제외 — 브라우저·앱 업데이트 시 변하기 때문
  const uuid    = getOrCreateLocalUUID();
  const webgl   = webglFp();                                          // GPU (안정적)
  const scr     = `${screen.width}x${screen.height}x${screen.colorDepth}`;  // 해상도 (안정적)
  const hw      = `${navigator.hardwareConcurrency ?? 0}|${(navigator as any).deviceMemory ?? 0}`; // CPU·RAM
  const tz      = Intl.DateTimeFormat().resolvedOptions().timeZone;  // 타임존 (안정적)

  const raw     = [uuid, webgl, scr, hw, tz].join('|||');
  const hash    = await sha256(raw);
  const h16     = hash.substring(0, 16).toUpperCase();
  const deviceId = `${h16.substring(0,4)}-${h16.substring(4,8)}-${h16.substring(8,12)}-${h16.substring(12,16)}`;

  // ③ 생성된 ID를 localStorage에 영구 저장 (이후 항상 이 값을 반환)
  try {
    localStorage.setItem(LS_DEVICE_ID_KEY, deviceId);
  } catch (_) {}

  return deviceId;
}
