/**
 * DeviceGateScreen
 * 앱 진입 시 기기 인증 상태를 확인하고, 미승인 기기에는 접근을 차단합니다.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform, ScrollView, TextInput,
} from 'react-native';
import { generateDeviceFingerprint } from '../utils/deviceFingerprint';
import { checkDeviceStatus, registerDevice, refreshDeviceInfo, DeviceStatus, getBackendMode } from '../services/deviceLicense';

interface Props {
  onApproved:   () => void;   // 승인 완료 → 메인 앱 진입
  onAdminOpen:  () => void;   // 관리자 패널 열기
}

type GateState =
  | 'loading'   // 핑거프린트 생성 중
  | 'checking'  // Firebase/localStorage 확인 중
  | 'approved'  // 승인됨 — 버튼 클릭 대기
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
  greenDark:'#1b5e20',
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
  const [deviceId,      setDeviceId]      = useState('');
  const [gateState,     setGateState]     = useState<GateState>('loading');
  const [copied,        setCopied]        = useState(false);
  const [mode,          setMode]          = useState<'firebase' | 'local'>('local');
  const [userName,      setUserName]      = useState('');
  const [nameError,     setNameError]     = useState('');
  const [submitting,    setSubmitting]    = useState(false);
  const [nameSubmitted, setNameSubmitted] = useState(false);

  // 이름 유효성 검사 (관리자 식별용)
  const validateName = (name: string): string | null => {
    if (!name) return '이름을 입력해주세요.';
    if (name.length < 2) return '이름은 2글자 이상 입력해주세요.';
    if (name.length > 20) return '이름은 20자 이하로 입력해주세요.';
    if (/^[\u3131-\u318E\s]+$/.test(name)) return '올바른 이름을 입력해주세요. (예: 홍길동)';
    if (/^\d+$/.test(name)) return '이름에는 문자가 포함되어야 합니다.';
    return null;
  };

  // 초기화: 하드웨어 기반 ID 즉시 생성 (이름 불필요)
  const init = useCallback(async () => {
    setGateState('loading');
    try {
      const hwId = await generateDeviceFingerprint(); // 하드웨어만 사용
      setDeviceId(hwId);
      setMode(getBackendMode());
      setGateState('checking');

      const status: DeviceStatus | null = await checkDeviceStatus(hwId);
      if (status !== null) refreshDeviceInfo(hwId).catch(() => {});

      if (status === 'approved') {
        setGateState('approved');
        return;
      }
      setGateState(status === null ? 'pending' : status);
    } catch (e) {
      console.error('[DeviceGate] 오류:', e);
      setGateState('error');
    }
  }, []);

  // 이름 입력 후 등록 신청 — ID는 이미 하드웨어로 확정, 이름은 관리자 식별용
  const handleSubmitName = useCallback(async () => {
    const name = userName.trim();
    const err = validateName(name);
    if (err) {
      setNameError(err);
      return;
    }
    setNameError('');
    setSubmitting(true);
    try {
      await registerDevice(deviceId, name); // deviceId는 하드웨어 기반으로 이미 확정
      setNameSubmitted(true);
    } catch (e) {
      console.error('[DeviceGate] 등록 오류:', e);
    } finally {
      setSubmitting(false);
    }
  }, [deviceId, userName]);

  // 승인 완료 재확인
  const handleCheckApproval = useCallback(async () => {
    setGateState('checking');
    try {
      const status = await checkDeviceStatus(deviceId);
      if (status !== null) refreshDeviceInfo(deviceId).catch(() => {});
      if (status === 'approved') {
        setGateState('approved');
      } else {
        setGateState(status ?? 'pending');
      }
    } catch {
      setGateState('error');
    }
  }, [deviceId]);

  useEffect(() => { init(); }, [init]);

  const handleCopy = () => {
    copyToClipboard(deviceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // ── 로딩 / 확인 중 ──────────────────────────────────────────────────────
  if (gateState === 'loading' || gateState === 'checking') {
    return (
      <View style={styles.centerContainer}>
        <Logo />
        <Text style={styles.logoText}>HICOG 청력검사</Text>
        <ActivityIndicator size="large" color={C.cyan} style={{ marginTop: 32 }} />
        <Text style={styles.loadingText}>
          {gateState === 'loading' ? '기기 식별 중...' : '접근 권한 확인 중...'}
        </Text>
      </View>
    );
  }

  // ── 승인됨 ──────────────────────────────────────────────────────────────
  if (gateState === 'approved') {
    return (
      <ScrollView style={styles.scrollBg} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Logo />
          <Text style={styles.logoText}>HICOG 청력검사</Text>
          <Text style={styles.logoSub}>기기 인증 시스템</Text>
        </View>

        <View style={[styles.card, { borderColor: C.green }]}>
          {/* 승인 아이콘 */}
          <View style={[styles.statusIcon, { backgroundColor: '#0a2a10', borderColor: C.green }]}>
            <Text style={styles.statusIconText}>✓</Text>
          </View>

          <Text style={styles.titleText}>승인된 기기</Text>
          <Text style={styles.subText}>
            이 기기는 관리자에 의해 승인되었습니다.{'\n'}
            아래 버튼을 눌러 청력검사를 시작하세요.
          </Text>

          {/* 기기 번호 */}
          <DeviceIdBox deviceId={deviceId} copied={copied} onCopy={handleCopy} />

          {/* 메인으로 가기 버튼 */}
          <TouchableOpacity style={styles.enterBtn} onPress={onApproved}>
            <Text style={styles.enterBtnText}>🏠 메인으로 가기</Text>
          </TouchableOpacity>

          {/* 백엔드 모드 */}
          <ModeBadge mode={mode} />
        </View>

        <TouchableOpacity style={styles.adminBtn} onPress={onAdminOpen}>
          <Text style={styles.adminBtnText}>관리자 패널 →</Text>
        </TouchableOpacity>
      </ScrollView>
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

      <View style={styles.header}>
        <Logo />
        <Text style={styles.logoText}>HICOG 청력검사</Text>
        <Text style={styles.logoSub}>기기 인증 시스템</Text>
      </View>

      <View style={styles.card}>
        <View style={[styles.statusIcon, { backgroundColor: '#2e1500', borderColor: C.orange }]}>
          <Text style={styles.statusIconText}>🔒</Text>
        </View>

        <Text style={styles.titleText}>
          {nameSubmitted ? '승인 대기 중' : '접근 권한 신청'}
        </Text>

        <Text style={styles.subText}>
          {nameSubmitted
            ? '등록 신청이 완료되었습니다.\n관리자 승인 후 아래 버튼을 눌러 확인하세요.'
            : '이름을 입력하고 등록 신청을 하세요.\n관리자가 이름과 기기 번호를 확인 후 승인합니다.'}
        </Text>

        {/* 이름 입력 */}
        {!nameSubmitted && (
          <View style={styles.nameSection}>
            <Text style={styles.nameLabel}>사용자 이름</Text>
            <TextInput
              style={[styles.nameInput, !!nameError && styles.nameInputError]}
              placeholder="이름을 입력하세요 (예: 홍길동)"
              placeholderTextColor={C.muted}
              value={userName}
              onChangeText={text => { setUserName(text); setNameError(''); }}
              returnKeyType="done"
              onSubmitEditing={handleSubmitName}
            />
            {!!nameError && <Text style={styles.nameErrorText}>{nameError}</Text>}
          </View>
        )}

        {/* 이름 확인 */}
        {nameSubmitted && (
          <View style={styles.nameConfirmed}>
            <Text style={styles.nameConfirmedLabel}>등록 이름</Text>
            <Text style={styles.nameConfirmedValue}>👤 {userName.trim()}</Text>
          </View>
        )}

        {/* 기기 번호 — 하드웨어 기반, 항상 표시 */}
        <DeviceIdBox deviceId={deviceId} copied={copied} onCopy={handleCopy} />

        {/* 안내 */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>등록 절차</Text>
          {[
            { n: '1', t: '이름을 입력하고 [등록 신청] 버튼을 누르세요' },
            { n: '2', t: '관리자가 이름과 기기 번호를 확인 후 승인합니다' },
            { n: '3', t: '승인 후 [승인 확인] 버튼을 눌러 입장하세요' },
          ].map(item => (
            <View key={item.n} style={styles.infoRow}>
              <View style={styles.infoNum}><Text style={styles.infoNumText}>{item.n}</Text></View>
              <Text style={styles.infoText}>{item.t}</Text>
            </View>
          ))}
        </View>

        {/* 등록 신청 버튼 */}
        {!nameSubmitted && (
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmitName}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator size="small" color={C.white} />
              : <Text style={styles.submitBtnText}>📋 등록 신청</Text>
            }
          </TouchableOpacity>
        )}

        {/* 승인 확인 버튼 */}
        {nameSubmitted && (
          <TouchableOpacity style={styles.retryBtn} onPress={handleCheckApproval}>
            <Text style={styles.retryBtnText}>✓ 승인 완료 확인</Text>
          </TouchableOpacity>
        )}

        <ModeBadge mode={mode} />
      </View>

      <TouchableOpacity style={styles.adminBtn} onPress={onAdminOpen}>
        <Text style={styles.adminBtnText}>관리자 패널 →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

// ── 서브 컴포넌트 ────────────────────────────────────────────────────────────
const Logo: React.FC = () => (
  <View style={styles.logoMini}>
    <View style={styles.logoRing} />
    <View style={styles.logoDot} />
  </View>
);

const ModeBadge: React.FC<{ mode: 'firebase' | 'local' }> = ({ mode }) => (
  <View style={styles.modeBadge}>
    <View style={[styles.modeDot, { backgroundColor: mode === 'firebase' ? C.green : C.orange }]} />
    <Text style={styles.modeText}>
      {mode === 'firebase' ? 'Firebase 서버 모드' : '로컬 테스트 모드 (Firebase 미설정)'}
    </Text>
  </View>
);

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
    flex: 1, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },

  // 로고
  logoMini: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  logoRing: {
    position: 'absolute', width: 56, height: 56, borderRadius: 28,
    borderWidth: 3, borderColor: C.cyan,
    borderRightColor: 'transparent', borderBottomColor: 'transparent',
    transform: [{ rotate: '-45deg' }], opacity: 0.7,
  },
  logoDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: C.cyan },
  logoText: { fontSize: 22, fontWeight: 'bold', color: C.white, letterSpacing: 0.4 },
  logoSub:  { fontSize: 12, color: C.muted, marginTop: 4, letterSpacing: 0.8 },
  loadingText: { fontSize: 14, color: C.muted, marginTop: 14, letterSpacing: 0.3 },

  // 헤더
  header: { alignItems: 'center', marginBottom: 28, marginTop: 20 },

  // 카드
  card: {
    backgroundColor: C.card, borderRadius: 20,
    borderWidth: 1, borderColor: C.cardBdr,
    padding: 24, width: '100%', maxWidth: 440, alignItems: 'center',
  },

  // 상태 아이콘
  statusIcon: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, marginBottom: 16,
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
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, textAlign: 'center',
  },
  idBox: {
    backgroundColor: C.idBg, borderWidth: 1, borderColor: C.idBdr,
    borderRadius: 10, paddingVertical: 16, paddingHorizontal: 12,
    alignItems: 'center', marginBottom: 10,
  },
  idValue: {
    fontSize: 22, fontWeight: '900', color: C.cyan,
    letterSpacing: 4, fontVariant: ['tabular-nums'],
  },
  copyBtn: {
    backgroundColor: C.blue, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  copyBtnDone: { backgroundColor: C.greenDark },
  copyBtnText: { color: C.white, fontSize: 14, fontWeight: '700' },

  // 안내 박스
  infoBox: {
    backgroundColor: 'rgba(0,184,212,0.07)',
    borderWidth: 1, borderColor: 'rgba(0,184,212,0.20)',
    borderRadius: 12, padding: 16, width: '100%', marginBottom: 20,
  },
  infoTitle: {
    fontSize: 12, fontWeight: '700', color: C.cyan,
    letterSpacing: 0.8, marginBottom: 12, textTransform: 'uppercase',
  },
  infoRow:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  infoNum:     {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,184,212,0.25)', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
  },
  infoNumText: { fontSize: 11, fontWeight: '900', color: C.cyan },
  infoText:    { fontSize: 13, color: '#90a4ae', lineHeight: 20, flex: 1 },

  // 이름 입력
  nameSection: { width: '100%', marginBottom: 16 },
  nameLabel: {
    fontSize: 11, color: C.muted, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
  },
  nameInput: {
    backgroundColor: C.idBg, borderWidth: 1.5, borderColor: C.idBdr,
    borderRadius: 10, color: C.white, fontSize: 16,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  nameInputError:  { borderColor: C.red },
  nameErrorText:   { color: C.red, fontSize: 12, marginTop: 6, textAlign: 'center' },

  nameConfirmed: {
    width: '100%',
    backgroundColor: 'rgba(0,200,83,0.08)',
    borderWidth: 1, borderColor: 'rgba(0,200,83,0.30)',
    borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 16,
  },
  nameConfirmedLabel: {
    fontSize: 10, color: C.green, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
  },
  nameConfirmedValue: { fontSize: 18, fontWeight: '800', color: C.white },

  // 버튼들
  enterBtn: {
    backgroundColor: C.green, borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 24,
    width: '100%', alignItems: 'center', marginBottom: 12,
    shadowColor: C.green, shadowOpacity: 0.35, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  enterBtnText: { color: '#001a00', fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },

  submitBtn: {
    backgroundColor: C.cyan, borderRadius: 12,
    paddingVertical: 14, width: '100%', alignItems: 'center',
    marginBottom: 12, minHeight: 50, justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: C.bg, fontSize: 15, fontWeight: '800' },

  retryBtn: {
    backgroundColor: C.blue, borderRadius: 12,
    paddingVertical: 14, width: '100%', alignItems: 'center', marginBottom: 12,
  },
  retryBtnText: { color: C.white, fontSize: 15, fontWeight: '700' },

  // 모드 배지
  modeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  modeDot:   { width: 7, height: 7, borderRadius: 4 },
  modeText:  { fontSize: 11, color: C.dim },

  // 관리자 버튼
  adminBtn: {
    marginTop: 16, paddingVertical: 10, paddingHorizontal: 20,
    borderRadius: 8, borderWidth: 1, borderColor: C.dim,
  },
  adminBtnText: { color: C.muted, fontSize: 13, fontWeight: '500' },
});
