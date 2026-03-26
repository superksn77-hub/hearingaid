/**
 * DeviceGateScreen
 * 앱 진입 시 기기 인증 상태를 확인하고, 미승인 기기에는 접근을 차단합니다.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform, ScrollView,
} from 'react-native';
import { generateDeviceFingerprint } from '../utils/deviceFingerprint';
import { checkDeviceStatus, registerDevice, DeviceStatus, getBackendMode } from '../services/deviceLicense';
import { IS_FIREBASE_CONFIGURED } from '../config/firebaseConfig';

interface Props {
  onApproved:   () => void;   // 승인 완료 → 메인 앱 진입
  onAdminOpen:  () => void;   // 관리자 패널 열기
}

type GateState =
  | 'loading'   // 핑거프린트 생성 중
  | 'checking'  // Firebase/localStorage 확인 중
  | 'approved'  // 승인됨 (onApproved 호출)
  | 'pending'   // 승인 대기 중
  | 'blocked'   // 차단됨
  | 'error';    // 오류

const C = {
  bg:       '#0a1628',
  card:     '#0f1f3d',
  cardBdr:  '#1a3a5c',
  cyan:     '#00b8d4',
  blue:     '#1e88e5',
  red:      '#ef5350',
  redDark:  '#b71c1c',
  orange:   '#ff6f00',
  green:    '#00c853',
  white:    '#ffffff',
  muted:    '#546e7a',
  dim:      '#37474f',
  idBg:     '#071020',
  idBdr:    '#1a3a5c',
};

function copyToClipboard(text: string): void {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      return;
    }
    const { Clipboard } = require('react-native');
    Clipboard.setString(text);
  } catch (_) {}
}

export const DeviceGateScreen: React.FC<Props> = ({ onApproved, onAdminOpen }) => {
  const [deviceId,  setDeviceId]  = useState('');
  const [gateState, setGateState] = useState<GateState>('loading');
  const [copied,    setCopied]    = useState(false);
  const [mode,      setMode]      = useState<'firebase' | 'local'>('local');

  const init = useCallback(async () => {
    setGateState('loading');
    try {
      const id = await generateDeviceFingerprint();
      setDeviceId(id);
      setMode(getBackendMode());
      setGateState('checking');

      const status: DeviceStatus | null = await checkDeviceStatus(id);

      if (status === 'approved') {
        setGateState('approved');
        onApproved();
        return;
      }
      if (status === null) {
        await registerDevice(id);
        setGateState('pending');
      } else {
        setGateState(status);
      }
    } catch (e) {
      console.error('[DeviceGate] 오류:', e);
      setGateState('error');
    }
  }, [onApproved]);

  useEffect(() => { init(); }, [init]);

  const handleCopy = () => {
    copyToClipboard(deviceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // ── 로딩 ────────────────────────────────────────────────────────────────
  if (gateState === 'loading' || gateState === 'checking') {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.logoMini}>
          <View style={styles.logoRing} />
          <View style={styles.logoDot} />
        </View>
        <Text style={styles.logoText}>HICOG 청력검사</Text>
        <ActivityIndicator size="large" color={C.cyan} style={{ marginTop: 32 }} />
        <Text style={styles.loadingText}>
          {gateState === 'loading' ? '기기 식별 중...' : '접근 권한 확인 중...'}
        </Text>
      </View>
    );
  }

  // ── 차단 ────────────────────────────────────────────────────────────────
  if (gateState === 'blocked') {
    return (
      <View style={styles.centerContainer}>
        <View style={[styles.statusIcon, { backgroundColor: C.redDark, borderColor: C.red }]}>
          <Text style={styles.statusIconText}>✕</Text>
        </View>
        <Text style={styles.titleText}>접근 차단됨</Text>
        <Text style={styles.subText}>이 기기는 관리자에 의해 차단되었습니다.{'\n'}관리자에게 문의하세요.</Text>
        <DeviceIdBox deviceId={deviceId} copied={copied} onCopy={handleCopy} />
        <TouchableOpacity style={styles.adminBtn} onPress={onAdminOpen}>
          <Text style={styles.adminBtnText}>관리자 패널</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── 오류 ────────────────────────────────────────────────────────────────
  if (gateState === 'error') {
    return (
      <View style={styles.centerContainer}>
        <View style={[styles.statusIcon, { backgroundColor: '#4a0000', borderColor: C.red }]}>
          <Text style={styles.statusIconText}>!</Text>
        </View>
        <Text style={styles.titleText}>연결 오류</Text>
        <Text style={styles.subText}>서버에 연결할 수 없습니다.{'\n'}네트워크 연결을 확인하고 다시 시도하세요.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={init}>
          <Text style={styles.retryBtnText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── 대기 / 미등록 ────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.scrollBg} contentContainerStyle={styles.scrollContent}>

      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.logoMini}>
          <View style={styles.logoRing} />
          <View style={styles.logoDot} />
        </View>
        <Text style={styles.logoText}>HICOG 청력검사</Text>
        <Text style={styles.logoSub}>기기 인증 시스템</Text>
      </View>

      {/* 상태 카드 */}
      <View style={styles.card}>

        {/* 상태 아이콘 */}
        <View style={[styles.statusIcon, { backgroundColor: '#2e1500', borderColor: C.orange }]}>
          <Text style={styles.statusIconText}>🔒</Text>
        </View>

        <Text style={styles.titleText}>
          {gateState === 'pending' ? '승인 대기 중' : '미등록 기기'}
        </Text>

        <Text style={styles.subText}>
          {gateState === 'pending'
            ? '이 기기는 관리자의 승인을 기다리고 있습니다.\n아래 기기 번호를 관리자에게 전달하세요.'
            : '이 기기는 등록되지 않았습니다.\n아래 기기 번호를 관리자에게 전달하여\n접근 권한을 요청하세요.'}
        </Text>

        {/* 기기 번호 */}
        <DeviceIdBox deviceId={deviceId} copied={copied} onCopy={handleCopy} />

        {/* 안내 */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>등록 절차</Text>
          {[
            { n: '1', t: '위 기기 번호를 복사하세요' },
            { n: '2', t: '관리자에게 기기 번호를 전달하세요' },
            { n: '3', t: '관리자가 승인하면 아래 버튼을 눌러 확인하세요' },
          ].map(item => (
            <View key={item.n} style={styles.infoRow}>
              <View style={styles.infoNum}><Text style={styles.infoNumText}>{item.n}</Text></View>
              <Text style={styles.infoText}>{item.t}</Text>
            </View>
          ))}
        </View>

        {/* 승인 확인 버튼 */}
        <TouchableOpacity style={styles.retryBtn} onPress={init}>
          <Text style={styles.retryBtnText}>승인 완료 확인</Text>
        </TouchableOpacity>

        {/* 백엔드 모드 표시 */}
        <View style={styles.modeBadge}>
          <View style={[styles.modeDot, { backgroundColor: mode === 'firebase' ? C.green : C.orange }]} />
          <Text style={styles.modeText}>
            {mode === 'firebase' ? 'Firebase 서버 모드' : '로컬 테스트 모드 (Firebase 미설정)'}
          </Text>
        </View>
      </View>

      {/* 관리자 버튼 */}
      <TouchableOpacity style={styles.adminBtn} onPress={onAdminOpen}>
        <Text style={styles.adminBtnText}>관리자 패널 →</Text>
      </TouchableOpacity>

    </ScrollView>
  );
};

// ── 기기 번호 박스 컴포넌트 ────────────────────────────────────────────────
const DeviceIdBox: React.FC<{
  deviceId: string;
  copied:   boolean;
  onCopy:   () => void;
}> = ({ deviceId, copied, onCopy }) => (
  <View style={styles.idContainer}>
    <Text style={styles.idLabel}>이 컴퓨터의 고유 기기 번호</Text>
    <View style={styles.idBox}>
      <Text style={styles.idValue} selectable>{deviceId}</Text>
    </View>
    <TouchableOpacity style={[styles.copyBtn, copied && styles.copyBtnDone]} onPress={onCopy}>
      <Text style={styles.copyBtnText}>{copied ? '✓  복사 완료' : '번호 복사'}</Text>
    </TouchableOpacity>
  </View>
);

// ── 스타일 ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scrollBg:      { flex: 1, backgroundColor: C.bg },
  scrollContent: { padding: 24, paddingBottom: 60, alignItems: 'center' },
  centerContainer: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },

  // 로고
  logoMini: {
    width: 56, height: 56,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  logoRing: {
    position: 'absolute',
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 3, borderColor: C.cyan,
    borderRightColor: 'transparent', borderBottomColor: 'transparent',
    transform: [{ rotate: '-45deg' }],
    opacity: 0.7,
  },
  logoDot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: C.cyan,
  },
  logoText: {
    fontSize: 22, fontWeight: 'bold', color: C.white,
    letterSpacing: 0.4,
  },
  logoSub: {
    fontSize: 12, color: C.muted, marginTop: 4, letterSpacing: 0.8,
  },
  loadingText: {
    fontSize: 14, color: C.muted, marginTop: 14, letterSpacing: 0.3,
  },

  // 헤더
  header: { alignItems: 'center', marginBottom: 28, marginTop: 20 },

  // 카드
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.cardBdr,
    padding: 24,
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
  },

  // 상태 아이콘
  statusIcon: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    marginBottom: 16,
  },
  statusIconText: { fontSize: 28 },

  // 텍스트
  titleText: {
    fontSize: 20, fontWeight: '800', color: C.white,
    textAlign: 'center', marginBottom: 10, letterSpacing: 0.2,
  },
  subText: {
    fontSize: 14, color: C.muted, textAlign: 'center',
    lineHeight: 22, marginBottom: 24,
  },

  // 기기 번호
  idContainer: { width: '100%', marginBottom: 20 },
  idLabel: {
    fontSize: 11, color: C.muted, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
    textAlign: 'center',
  },
  idBox: {
    backgroundColor: C.idBg,
    borderWidth: 1, borderColor: C.idBdr,
    borderRadius: 10,
    paddingVertical: 16, paddingHorizontal: 12,
    alignItems: 'center', marginBottom: 10,
  },
  idValue: {
    fontSize: 22, fontWeight: '900', color: C.cyan,
    letterSpacing: 4, fontVariant: ['tabular-nums'],
  },
  copyBtn: {
    backgroundColor: C.blue,
    borderRadius: 10, paddingVertical: 12,
    alignItems: 'center',
  },
  copyBtnDone: { backgroundColor: '#1b5e20' },
  copyBtnText: { color: C.white, fontSize: 14, fontWeight: '700' },

  // 안내 박스
  infoBox: {
    backgroundColor: 'rgba(0,184,212,0.07)',
    borderWidth: 1, borderColor: 'rgba(0,184,212,0.20)',
    borderRadius: 12, padding: 16,
    width: '100%', marginBottom: 20,
  },
  infoTitle: {
    fontSize: 12, fontWeight: '700', color: C.cyan,
    letterSpacing: 0.8, marginBottom: 12, textTransform: 'uppercase',
  },
  infoRow:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  infoNum:  {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,184,212,0.25)', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
  },
  infoNumText: { fontSize: 11, fontWeight: '900', color: C.cyan },
  infoText:    { fontSize: 13, color: '#90a4ae', lineHeight: 20, flex: 1 },

  // 버튼
  retryBtn: {
    backgroundColor: C.blue, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 24,
    width: '100%', alignItems: 'center', marginBottom: 12,
  },
  retryBtnText: { color: C.white, fontSize: 15, fontWeight: '700' },

  // 백엔드 모드
  modeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4,
  },
  modeDot: { width: 7, height: 7, borderRadius: 4 },
  modeText: { fontSize: 11, color: C.dim },

  // 관리자 버튼
  adminBtn: {
    marginTop: 16, paddingVertical: 10, paddingHorizontal: 20,
    borderRadius: 8, borderWidth: 1, borderColor: C.dim,
  },
  adminBtnText: { color: C.muted, fontSize: 13, fontWeight: '500' },
});
