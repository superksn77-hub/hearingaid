/**
 * 기기 라이선스 서비스
 *
 * Firebase가 설정된 경우 → Firestore 사용 (다기기 간 공유)
 * Firebase 미설정 시     → localStorage 사용 (로컬 테스트용)
 */

import { FIREBASE_CONFIG, IS_FIREBASE_CONFIGURED } from '../config/firebaseConfig';

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
  userName?:    string;   // 사용자가 입력한 이름
  registeredAt: string;
  approvedAt?:  string;
  userAgent?:   string;
  screenInfo?:  string;
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

/** 기기를 pending 상태로 등록 */
export async function registerDevice(deviceId: string, userName?: string): Promise<void> {
  const record: DeviceRecord = {
    deviceId,
    status:       'pending',
    label:        '',
    userName:     userName ?? '',
    registeredAt: new Date().toISOString(),
    userAgent:    typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : '',
    screenInfo:   typeof screen    !== 'undefined' ? `${screen.width}x${screen.height}` : '',
  };

  const db = getDb();
  if (db) {
    try {
      const ref  = doc(db, 'devices', deviceId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { ...record, registeredAt: serverTimestamp() });
      } else {
        // 이미 등록된 경우 이름만 업데이트
        if (userName) {
          await updateDoc(ref, { userName });
        }
      }
      return;
    } catch (e) {
      console.error('[Firebase] registerDevice 오류:', e);
    }
  }

  const local = localRead();
  if (!local[deviceId]) {
    local[deviceId] = record;
  } else if (userName) {
    local[deviceId].userName = userName;
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
