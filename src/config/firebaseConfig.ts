/**
 * Firebase 설정 파일
 *
 * ─── 설정 방법 ───────────────────────────────────────────────────────────
 * 1. https://console.firebase.google.com 에서 프로젝트 생성
 * 2. 프로젝트 설정 > 일반 > 앱 추가(웹) > Firebase SDK 구성 복사
 * 3. 아래 PLACEHOLDER 값들을 실제 값으로 교체하거나
 *    .env 파일에 환경 변수로 설정하세요.
 *
 * ─── 환경 변수 방식 (.env 파일 생성) ────────────────────────────────────
 * EXPO_PUBLIC_FB_API_KEY=AIza...
 * EXPO_PUBLIC_FB_AUTH_DOMAIN=yourproject.firebaseapp.com
 * EXPO_PUBLIC_FB_PROJECT_ID=yourproject
 * EXPO_PUBLIC_FB_STORAGE_BUCKET=yourproject.appspot.com
 * EXPO_PUBLIC_FB_MESSAGING_SENDER_ID=123456789
 * EXPO_PUBLIC_FB_APP_ID=1:123456789:web:abc123
 *
 * ─── 미설정 시 동작 ─────────────────────────────────────────────────────
 * Firebase가 설정되지 않으면 localStorage를 사용하는 로컬 모드로 작동합니다.
 * 로컬 모드에서는 같은 브라우저에서만 인증이 유지됩니다.
 * ────────────────────────────────────────────────────────────────────────
 */

export const FIREBASE_CONFIG = {
  apiKey:            process.env.EXPO_PUBLIC_FB_API_KEY             || 'AIzaSyB4WLEEmyqMIqHumu0t1N-8KQIXihwB9M',
  authDomain:        process.env.EXPO_PUBLIC_FB_AUTH_DOMAIN         || 'hicog-hearing.firebaseapp.com',
  projectId:         process.env.EXPO_PUBLIC_FB_PROJECT_ID          || 'hicog-hearing',
  storageBucket:     process.env.EXPO_PUBLIC_FB_STORAGE_BUCKET      || 'hicog-hearing.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FB_MESSAGING_SENDER_ID || '974786570936',
  appId:             process.env.EXPO_PUBLIC_FB_APP_ID              || '1:974786570936:web:e4886fb8588a83f86d624d',
};

/** Firebase가 실제로 설정되어 있는지 여부 */
export const IS_FIREBASE_CONFIGURED =
  !!FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.projectId !== '';

/**
 * 관리자 비밀번호
 * 운영 환경에서는 환경 변수(EXPO_PUBLIC_ADMIN_KEY)로 설정하세요.
 * 기본값: hicog2024
 */
export const ADMIN_PASSWORD =
  process.env.EXPO_PUBLIC_ADMIN_KEY || 'hicog2024';
