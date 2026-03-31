/**
 * 검사 이력 저장 서비스
 *
 * Firebase Firestore에 PTA/스크리닝 검사 이력을 저장하고
 * 관리자 페이지에서 조회할 수 있도록 한다.
 */

import { FIREBASE_CONFIG, IS_FIREBASE_CONFIGURED } from '../config/firebaseConfig';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore, doc, setDoc, getDocs, collection,
  Firestore, deleteDoc,
} from 'firebase/firestore';

// ── Firebase 싱글톤 ──────────────────────────────────────────────
let _db: Firestore | null = null;

function getDb(): Firestore | null {
  if (!IS_FIREBASE_CONFIGURED) return null;
  if (_db) return _db;
  try {
    const app: FirebaseApp =
      getApps().length > 0 ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
    _db = getFirestore(app);
    return _db;
  } catch {
    return null;
  }
}

// ── 검사 이력 타입 ──────────────────────────────────────────────
export interface TestHistoryRecord {
  id: string;
  deviceId: string;
  userName: string;
  testType: 'pta' | 'screening';
  date: string;              // ISO string
  duration?: number;          // 소요시간 (초)

  // PTA 결과 요약
  ptaSummary?: {
    leftAvg: number;          // 좌측 4분법 평균
    rightAvg: number;         // 우측 4분법 평균
    hearingLevel: string;     // 정상/경도/중등도 등
  };

  // 스크리닝 결과 요약
  screeningSummary?: {
    adhdPct: number;
    dyslexiaPct: number;
    adhdLevel: string;
    dyslexiaLevel: string;
    ehfFlag: boolean;
    rtTau: number;
    dlf1k: number;
    dlf6k: number;
    gdt: number;
    ptaEHF: number;
  };
}

// ── 검사 이력 저장 ──────────────────────────────────────────────
export async function saveTestHistory(record: TestHistoryRecord): Promise<boolean> {
  // 항상 localStorage에 저장 (로컬 캐시)
  try {
    const existing = JSON.parse(localStorage.getItem('test_history') || '[]');
    existing.push(record);
    if (existing.length > 500) existing.splice(0, existing.length - 500);
    localStorage.setItem('test_history', JSON.stringify(existing));
  } catch {}

  // Firebase에도 저장 (다른 기기에서 조회 가능)
  const db = getDb();
  if (db) {
    try {
      await setDoc(doc(db, 'test_history', record.id), {
        ...record,
        createdAt: new Date().toISOString(),
      });
      console.log('[TestHistory] Firebase 저장 성공:', record.id);
    } catch (e) {
      console.warn('[TestHistory] Firebase 저장 실패 (localStorage에는 저장됨):', e);
    }
  }

  return true;
}

// ── 모든 검사 이력 조회 (관리자용) ──────────────────────────────
export async function getAllTestHistory(): Promise<TestHistoryRecord[]> {
  // localStorage에서 로컬 데이터
  let local: TestHistoryRecord[] = [];
  try {
    local = JSON.parse(localStorage.getItem('test_history') || '[]');
  } catch {}

  // Firebase에서 클라우드 데이터
  const db = getDb();
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'test_history'));
      const cloud = snap.docs.map(d => d.data() as TestHistoryRecord);

      // 병합: id 기준 중복 제거 (클라우드 우선)
      const idSet = new Set(cloud.map(r => r.id));
      const merged = [...cloud, ...local.filter(r => !idSet.has(r.id))];

      // 날짜 내림차순 정렬
      merged.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      return merged;
    } catch (e) {
      console.warn('[TestHistory] Firebase 조회 실패, localStorage만 사용:', e);
    }
  }

  // Firebase 실패 시 localStorage만
  local.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return local;
}

// ── 검사 이력 삭제 ──────────────────────────────────────────────
export async function deleteTestHistory(id: string): Promise<boolean> {
  const db = getDb();
  if (!db) {
    try {
      const existing = JSON.parse(localStorage.getItem('test_history') || '[]');
      const filtered = existing.filter((r: TestHistoryRecord) => r.id !== id);
      localStorage.setItem('test_history', JSON.stringify(filtered));
      return true;
    } catch {
      return false;
    }
  }

  try {
    await deleteDoc(doc(db, 'test_history', id));
    return true;
  } catch {
    return false;
  }
}

// ── 고유 ID 생성 ───────────────────────────────────────────────
export function generateTestId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).substring(2, 8);
  return `${ts}-${rnd}`;
}
