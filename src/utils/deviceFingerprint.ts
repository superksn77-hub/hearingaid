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
