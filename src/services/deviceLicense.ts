/**
 * 기기 라이선스 서비스
 *
 * Firebase가 설정된 경우 → Firestore 사용 (다기기 간 공유)
 * Firebase 미설정 시     → localStorage 사용 (로컬 테스트용)
 */

import { FIREBASE_CONFIG, IS_FIREBASE_CONFIGURED } from '../config/firebaseConfig';
import { collectDeviceInfo, DeviceInfo } from '../utils/deviceFingerprint';

// Firebase 정적 imports (트리쉐이킹 적용)
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore, doc, getDoc, setDoc, getDocs, updateDoc, deleteDoc,
  collection, serverTimestamp, arrayUnion, Firestore,
} from 'firebase/firestore';

// ── Firebase 싱글톤 ──────────────────────────────────────────────────────
let _db: Firestore | null = null;

function getDb(): Firestore | null {
  if (!IS_FIREBASE_CONFIGURED) return null;
  if (_db) return _db;
  try {
    const app: FirebaseApp =
      getApps().length > 0 ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
    _db = getFirestore(app);
    return _db;
  } catch (e) {
    console.error('[Firebase] 초기화 실패:', e);
    return null;
  }
}

// ── 타입 정의 ─────────────────────────────────────────────────────────────
export type DeviceStatus = 'pending' | 'approved' | 'blocked';

export type AppName = string; // 'hearingaid' | 'wmemory' | 향후 추가 앱

export type AppStatusMap = Record<AppName, DeviceStatus>;
export type AppTimestampMap = Record<AppName, any>;

export interface DeviceRecord {
  deviceId:     string;
  /** @deprecated 구버전 레코드 호환용. 새 코드는 appStatus를 사용. */
  status?:      DeviceStatus;
  label?:       string;
  userName?:    string;
  registeredBy?: AppName;
  registeredAt: any;
  /** @deprecated 구버전. 새 코드는 appApprovedAt 사용. */
  approvedAt?:  any;

  // 앱별 승인 상태 맵 — 고유 기기 ID(하나의 DeviceRecord)에 대해
  // 여러 앱이 각각 독립적으로 pending/approved/blocked 상태를 가짐
  appStatus?:        AppStatusMap;
  appRegisteredAt?:  AppTimestampMap;
  appApprovedAt?:    AppTimestampMap;

  // ── 상세 기기 정보 ──
  deviceType?:   string;   // PC / 스마트폰 / 태블릿
  os?:           string;   // Windows 10/11 / macOS / iOS / Android
  browser?:      string;   // Chrome 120 / Safari / Edge
  screenRes?:    string;   // 1920×1080 (32bit)
  cpuCores?:     number;   // 논리 CPU 코어 수
  ramGB?:        number;   // GB
  gpu?:          string;   // GPU 렌더러
  language?:     string;   // ko-KR
  timezone?:     string;   // Asia/Seoul
  touchSupport?: boolean;
  userAgent?:    string;

  // 이 기기에서 등록된 앱 목록 (예: ['hearingaid'], ['hearingaid','wmemory']).
  // 두 앱이 동일 Firestore 'devices' 컬렉션과 동일 기기 ID를 공유하며,
  // 한 번의 승인으로 두 앱 모두 사용 가능하도록 기기 단위로 통합 관리한다.
  apps?:         string[];

  // 하위호환: 구버전 레코드에서 사용하던 필드. 새 레코드는 apps[]를 사용.
  appName?:      string;
}

// ── localStorage 폴백 ────────────────────────────────────────────────────
const LS_KEY = 'hicog_license_v1';

function localRead(): Record<string, DeviceRecord> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const s = localStorage.getItem(LS_KEY);
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}

function localWrite(data: Record<string, DeviceRecord>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    }
  } catch {}
}

// ── 공개 API ──────────────────────────────────────────────────────────────

/** 이 앱의 이름 (checkDeviceStatus 기본값) */
const MY_APP: AppName = 'hearingaid';

/**
 * 이 기기에 대한 특정 앱의 상태를 꺼낸다.
 * 최신 스키마: rec.appStatus[appName]
 * 구버전 폴백: rec.apps[]에 appName이 포함되어 있으면 top-level status 사용
 */
export function getAppStatus(rec: DeviceRecord | undefined, appName: AppName = MY_APP): DeviceStatus | null {
  if (!rec) return null;
  if (rec.appStatus && rec.appStatus[appName]) return rec.appStatus[appName];
  const apps: string[] = Array.isArray(rec.apps) ? rec.apps : (rec.appName ? [rec.appName] : []);
  if (apps.includes(appName) && rec.status) return rec.status;
  return null;
}

/** 기기 승인 상태 조회 (이 앱 기준) */
export async function checkDeviceStatus(deviceId: string): Promise<DeviceStatus | null> {
  const db = getDb();
  if (db) {
    try {
      const snap = await getDoc(doc(db, 'devices', deviceId));
      if (!snap.exists()) return null;
      return getAppStatus(snap.data() as DeviceRecord, MY_APP);
    } catch (e) {
      console.error('[Firebase] checkDeviceStatus 오류:', e);
    }
  }
  return getAppStatus(localRead()[deviceId], MY_APP);
}

/** 기기 정보만 최신으로 업데이트 (상태/이름 변경 없음) */
export async function refreshDeviceInfo(deviceId: string): Promise<void> {
  let info: Partial<DeviceInfo> = {};
  try {
    if (typeof window !== 'undefined') info = collectDeviceInfo();
  } catch (_) { return; }

  if (!info.os) return; // 수집 실패 시 스킵

  const db = getDb();
  if (db) {
    try {
      const ref = doc(db, 'devices', deviceId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, info as any);
      }
      return;
    } catch (e) {
      console.error('[Firebase] refreshDeviceInfo 오류:', e);
    }
  }
  // localStorage 폴백
  const local = localRead();
  if (local[deviceId]) {
    Object.assign(local[deviceId], info);
    localWrite(local);
  }
}

/** 기기를 pending 상태로 등록 (상세 기기 정보 포함) */
export async function registerDevice(deviceId: string, userName?: string): Promise<void> {
  // 상세 기기 정보 수집
  let info: Partial<DeviceInfo> = {};
  try {
    if (typeof window !== 'undefined') {
      info = collectDeviceInfo();
    }
  } catch (_) {}

  const nowIso = new Date().toISOString();
  const record: DeviceRecord = {
    deviceId,
    userName:     userName ?? '',
    registeredBy: MY_APP,
    registeredAt: nowIso,
    // 상세 정보
    deviceType:   info.deviceType,
    os:           info.os,
    browser:      info.browser,
    screenRes:    info.screenRes,
    cpuCores:     info.cpuCores,
    ramGB:        info.ramGB,
    gpu:          info.gpu,
    language:     info.language,
    timezone:     info.timezone,
    touchSupport: info.touchSupport,
    userAgent:    info.userAgent,
    apps:         [MY_APP],
    appStatus:       { [MY_APP]: 'pending' },
    appRegisteredAt: { [MY_APP]: nowIso },
  };

  const db = getDb();
  if (db) {
    try {
      const ref  = doc(db, 'devices', deviceId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        // 최초 등록
        await setDoc(ref, {
          ...record,
          registeredAt: serverTimestamp(),
          apps: arrayUnion(MY_APP),
        });
      } else {
        // 이미 등록된 경우: 정보만 갱신 + apps에 'hearingaid' 추가.
        // 이 앱이 아직 appStatus에 없을 때만 pending으로 추가 (기존 승인 상태 보존).
        const data = snap.data() as DeviceRecord;
        const alreadyHasAppStatus = !!(data.appStatus && data.appStatus[MY_APP]);
        const update: Record<string, any> = { ...info, apps: arrayUnion(MY_APP) };
        if (userName) update.userName = userName;
        if (!alreadyHasAppStatus) {
          update['appStatus.' + MY_APP]       = 'pending';
          update['appRegisteredAt.' + MY_APP] = nowIso;
        }
        await updateDoc(ref, update);
      }
      return;
    } catch (e) {
      console.error('[Firebase] registerDevice 오류:', e);
    }
  }

  const local = localRead();
  if (!local[deviceId]) {
    local[deviceId] = record;
  } else {
    Object.assign(local[deviceId], info);
    if (userName) local[deviceId].userName = userName;
    const apps = Array.isArray(local[deviceId].apps) ? local[deviceId].apps : [];
    if (!apps.includes(MY_APP)) apps.push(MY_APP);
    local[deviceId].apps = apps;
    const appStatus = local[deviceId].appStatus || {};
    if (!appStatus[MY_APP]) {
      appStatus[MY_APP] = 'pending';
      const appReg = local[deviceId].appRegisteredAt || {};
      appReg[MY_APP] = nowIso;
      local[deviceId].appRegisteredAt = appReg;
    }
    local[deviceId].appStatus = appStatus;
  }
  localWrite(local);
}

/** 전체 기기 목록 (관리자용) */
export async function getAllDevices(): Promise<DeviceRecord[]> {
  const db = getDb();
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'devices'));
      return snap.docs.map(d => ({ ...d.data() } as DeviceRecord));
    } catch (e) {
      console.error('[Firebase] getAllDevices 오류:', e);
    }
  }
  return Object.values(localRead());
}

/** 동일한 이름이 다른 기기에 이미 등록되어 있는지 확인 */
export async function checkNameExists(
  userName: string,
  excludeDeviceId?: string,
): Promise<boolean> {
  const name = userName.trim().toLowerCase();
  if (!name) return false;

  const db = getDb();
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'devices'));
      return snap.docs.some(d => {
        if (excludeDeviceId && d.id === excludeDeviceId) return false;
        const rec = d.data() as DeviceRecord;
        return (rec.userName ?? '').trim().toLowerCase() === name;
      });
    } catch (e) {
      console.error('[Firebase] checkNameExists 오류:', e);
    }
  }
  // localStorage 폴백
  return Object.entries(localRead()).some(([id, r]) => {
    if (excludeDeviceId && id === excludeDeviceId) return false;
    return (r.userName ?? '').trim().toLowerCase() === name;
  });
}

/**
 * 특정 앱의 상태만 변경 (관리자용) — 기기 ID는 유지하면서
 * 그 기기에 대한 하나의 앱만 승인/대기/차단 전환.
 */
export async function setAppStatus(
  deviceId: string,
  appName:  AppName,
  status:   DeviceStatus,
): Promise<void> {
  const db = getDb();
  if (db) {
    try {
      const update: Record<string, any> = {
        ['appStatus.' + appName]: status,
        apps: arrayUnion(appName), // 앱 관리 대상임을 명시
      };
      if (status === 'approved') {
        update['appApprovedAt.' + appName] = serverTimestamp();
      }
      await updateDoc(doc(db, 'devices', deviceId), update);
      return;
    } catch (e) {
      console.error('[Firebase] setAppStatus 오류:', e);
    }
  }

  const local = localRead();
  if (local[deviceId]) {
    const r = local[deviceId];
    const appStatus = r.appStatus || {};
    appStatus[appName] = status;
    r.appStatus = appStatus;
    const apps: string[] = Array.isArray(r.apps) ? r.apps : [];
    if (!apps.includes(appName)) apps.push(appName);
    r.apps = apps;
    if (status === 'approved') {
      const appApp = r.appApprovedAt || {};
      appApp[appName] = new Date().toISOString();
      r.appApprovedAt = appApp;
    }
    localWrite(local);
  }
}

/** @deprecated setAppStatus를 사용할 것. 구버전 호환용으로 유지. */
export async function setDeviceStatus(
  deviceId: string,
  status:   DeviceStatus,
  label?:   string,
): Promise<void> {
  const db = getDb();
  if (db) {
    try {
      const update: Record<string, any> = { status };
      if (label !== undefined)   update.label      = label;
      if (status === 'approved') update.approvedAt = serverTimestamp();
      await updateDoc(doc(db, 'devices', deviceId), update);
      return;
    } catch (e) {
      console.error('[Firebase] setDeviceStatus 오류:', e);
    }
  }

  const local = localRead();
  if (local[deviceId]) {
    local[deviceId].status = status;
    if (label !== undefined)   local[deviceId].label      = label;
    if (status === 'approved') local[deviceId].approvedAt = new Date().toISOString();
    localWrite(local);
  }
}

/** 기기 삭제 (관리자용) */
export async function deleteDevice(deviceId: string): Promise<void> {
  const db = getDb();
  if (db) {
    try {
      await deleteDoc(doc(db, 'devices', deviceId));
      return;
    } catch (e) {
      console.error('[Firebase] deleteDevice 오류:', e);
    }
  }

  const local = localRead();
  delete local[deviceId];
  localWrite(local);
}

/** 현재 백엔드 모드 */
export function getBackendMode(): 'firebase' | 'local' {
  return IS_FIREBASE_CONFIGURED ? 'firebase' : 'local';
}
