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
  query, orderBy, Firestore, deleteDoc,
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
  const db = getDb();
  if (!db) {
    // localStorage fallback
    try {
      const existing = JSON.parse(localStorage.getItem('test_history') || '[]');
      existing.push(record);
      // 최대 500건 유지
      if (existing.length > 500) existing.splice(0, existing.length - 500);
      localStorage.setItem('test_history', JSON.stringify(existing));
      return true;
    } catch {
      return false;
    }
  }

  try {
    await setDoc(doc(db, 'test_history', record.id), {
      ...record,
      createdAt: new Date().toISOString(),
    });
    return true;
  } catch (e) {
    console.error('[TestHistory] 저장 실패:', e);
    return false;
  }
}

// ── 모든 검사 이력 조회 (관리자용) ──────────────────────────────
export async function getAllTestHistory(): Promise<TestHistoryRecord[]> {
  const db = getDb();
  if (!db) {
    try {
      return JSON.parse(localStorage.getItem('test_history') || '[]');
    } catch {
      return [];
    }
  }

  try {
    const snap = await getDocs(
      query(collection(db, 'test_history'), orderBy('date', 'desc'))
    );
    return snap.docs.map(d => d.data() as TestHistoryRecord);
  } catch (e) {
    console.error('[TestHistory] 조회 실패:', e);
    // fallback to localStorage
    try {
      return JSON.parse(localStorage.getItem('test_history') || '[]');
    } catch {
      return [];
    }
  }
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
