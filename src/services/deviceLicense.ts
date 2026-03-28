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
  collection, serverTimestamp, Firestore,
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

export interface DeviceRecord {
  deviceId:     string;
  status:       DeviceStatus;
  label:        string;
  userName?:    string;
  registeredAt: any;
  approvedAt?:  any;

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

/** 기기 승인 상태 조회 */
export async function checkDeviceStatus(deviceId: string): Promise<DeviceStatus | null> {
  const db = getDb();
  if (db) {
    try {
      const snap = await getDoc(doc(db, 'devices', deviceId));
      if (!snap.exists()) return null;
      return (snap.data() as DeviceRecord).status;
    } catch (e) {
      console.error('[Firebase] checkDeviceStatus 오류:', e);
    }
  }
  return localRead()[deviceId]?.status ?? null;
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

  const record: DeviceRecord = {
    deviceId,
    status:       'pending',
    label:        '',
    userName:     userName ?? '',
    registeredAt: new Date().toISOString(),
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
  };

  const db = getDb();
  if (db) {
    try {
      const ref  = doc(db, 'devices', deviceId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { ...record, registeredAt: serverTimestamp() });
      } else {
        // 이미 등록된 경우 이름 + 최신 기기 정보 업데이트
        const update: Partial<DeviceRecord> = { ...info };
        if (userName) update.userName = userName;
        await updateDoc(ref, update as any);
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

/** 기기 상태 변경 (관리자용) */
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
