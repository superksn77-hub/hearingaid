/**
 * AdminScreen – 기기 인증 관리자 패널
 * 비밀번호 확인 후 등록된 기기 목록을 조회하고 승인/차단/삭제할 수 있습니다.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import {
  getAllDevices, setDeviceStatus, deleteDevice,
  DeviceRecord, DeviceStatus, getBackendMode,
} from '../services/deviceLicense';
import { ADMIN_PASSWORD, IS_FIREBASE_CONFIGURED } from '../config/firebaseConfig';

interface Props {
  onClose: () => void;
}

const C = {
  bg:       '#0a1628',
  card:     '#0f1f3d',
  cardBdr:  '#1a3a5c',
  cyan:     '#00b8d4',
  blue:     '#1e88e5',
  red:      '#ef5350',
  redBg:    '#2a0a0a',
  green:    '#00c853',
  greenBg:  '#0a2010',
  orange:   '#ff6f00',
  orangeBg: '#1a0e00',
  white:    '#ffffff',
  muted:    '#546e7a',
  dim:      '#37474f',
  input:    '#071020',
};

const STATUS_COLOR: Record<DeviceStatus, string> = {
  approved: C.green,
  pending:  C.orange,
  blocked:  C.red,
};
const STATUS_BG: Record<DeviceStatus, string> = {
  approved: C.greenBg,
  pending:  C.orangeBg,
  blocked:  C.redBg,
};
const STATUS_LABEL: Record<DeviceStatus, string> = {
  approved: '승인됨',
  pending:  '대기중',
  blocked:  '차단됨',
};

export const AdminScreen: React.FC<Props> = ({ onClose }) => {
  const [phase,    setPhase]    = useState<'login' | 'panel'>('login');
  const [pw,       setPw]       = useState('');
  const [pwError,  setPwError]  = useState('');
  const [devices,  setDevices]  = useState<DeviceRecord[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState<DeviceStatus | 'all'>('all');

  // ── 로그인 ────────────────────────────────────────────────────────────
  const handleLogin = () => {
    if (pw === ADMIN_PASSWORD) {
      setPwError('');
      setPhase('panel');
      loadDevices();
    } else {
      setPwError('비밀번호가 올바르지 않습니다.');
      setPw('');
    }
  };

  // ── 기기 목록 로드 ────────────────────────────────────────────────────
  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getAllDevices();
      // registeredAt 기준 최신순 정렬
      list.sort((a, b) => {
        const ta = typeof a.registeredAt === 'string' ? a.registeredAt : '';
        const tb = typeof b.registeredAt === 'string' ? b.registeredAt : '';
        return tb.localeCompare(ta);
      });
      setDevices(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── 상태 변경 ─────────────────────────────────────────────────────────
  const handleStatus = async (deviceId: string, status: DeviceStatus) => {
    try {
      await setDeviceStatus(deviceId, status);
      setDevices(prev =>
        prev.map(d => d.deviceId === deviceId ? { ...d, status } : d)
      );
    } catch (e) {
      showAlert('오류', '상태 변경에 실패했습니다.');
    }
  };

  // ── 기기 삭제 ─────────────────────────────────────────────────────────
  const handleDelete = async (deviceId: string) => {
    const confirm = () => {
      deleteDevice(deviceId)
        .then(() => setDevices(prev => prev.filter(d => d.deviceId !== deviceId)))
        .catch(() => showAlert('오류', '삭제에 실패했습니다.'));
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`기기 ${deviceId} 를 삭제하시겠습니까?`)) confirm();
    } else {
      Alert.alert('기기 삭제', `기기 ${deviceId} 를 삭제하시겠습니까?`, [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: confirm },
      ]);
    }
  };

  function showAlert(title: string, msg: string) {
    if (Platform.OS === 'web') { alert(`${title}: ${msg}`); }
    else { Alert.alert(title, msg); }
  }

  const filtered = filter === 'all' ? devices : devices.filter(d => d.status === filter);
  const counts = {
    all:      devices.length,
    pending:  devices.filter(d => d.status === 'pending').length,
    approved: devices.filter(d => d.status === 'approved').length,
    blocked:  devices.filter(d => d.status === 'blocked').length,
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 로그인 화면
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (phase === 'login') {
    return (
      <View style={styles.center}>
        <View style={styles.loginCard}>
          <Text style={styles.loginTitle}>관리자 로그인</Text>
          <Text style={styles.loginSub}>
            관리자 비밀번호를 입력하세요.{'\n'}
            <Text style={{ color: C.muted, fontSize: 11 }}>
              (기본값: hicog2024 — 환경변수 EXPO_PUBLIC_ADMIN_KEY 로 변경)
            </Text>
          </Text>

          <TextInput
            style={styles.input}
            placeholder="비밀번호"
            placeholderTextColor={C.muted}
            secureTextEntry
            value={pw}
            onChangeText={setPw}
            onSubmitEditing={handleLogin}
            returnKeyType="done"
          />

          {!!pwError && <Text style={styles.errorText}>{pwError}</Text>}

          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
            <Text style={styles.loginBtnText}>로그인</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backLink} onPress={onClose}>
            <Text style={styles.backLinkText}>← 돌아가기</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 관리자 패널
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <ScrollView style={styles.panelBg} contentContainerStyle={styles.panelContent}>

      {/* 상단바 */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.panelTitle}>기기 관리</Text>
          <View style={styles.modeBadge}>
            <View style={[styles.modeDot, { backgroundColor: IS_FIREBASE_CONFIGURED ? C.green : C.orange }]} />
            <Text style={styles.modeText}>
              {IS_FIREBASE_CONFIGURED ? 'Firebase 서버 모드' : '로컬 테스트 모드'}
            </Text>
          </View>
        </View>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.refreshBtn} onPress={loadDevices}>
            <Text style={styles.refreshBtnText}>↻ 새로고침</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 통계 카드 */}
      <View style={styles.statsRow}>
        {([ 'all', 'pending', 'approved', 'blocked' ] as const).map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.statCard, filter === s && styles.statCardActive]}
            onPress={() => setFilter(s)}
          >
            <Text style={[
              styles.statNum,
              s !== 'all' && { color: STATUS_COLOR[s as DeviceStatus] },
            ]}>
              {counts[s]}
            </Text>
            <Text style={styles.statLabel}>
              {s === 'all' ? '전체' : STATUS_LABEL[s as DeviceStatus]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 로딩 */}
      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={C.cyan} />
          <Text style={styles.loadingText}>기기 목록 불러오는 중...</Text>
        </View>
      )}

      {/* 기기 목록 */}
      {!loading && filtered.length === 0 && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>등록된 기기가 없습니다.</Text>
        </View>
      )}

      {filtered.map(device => (
        <DeviceCard
          key={device.deviceId}
          device={device}
          onApprove={() => handleStatus(device.deviceId, 'approved')}
          onBlock={()   => handleStatus(device.deviceId, 'blocked')}
          onPending={()  => handleStatus(device.deviceId, 'pending')}
          onDelete={()  => handleDelete(device.deviceId)}
        />
      ))}

    </ScrollView>
  );
};

// ── 기기 카드 ──────────────────────────────────────────────────────────────
const DeviceCard: React.FC<{
  device:    DeviceRecord;
  onApprove: () => void;
  onBlock:   () => void;
  onPending: () => void;
  onDelete:  () => void;
}> = ({ device, onApprove, onBlock, onPending, onDelete }) => {
  const col = STATUS_COLOR[device.status];
  const bg  = STATUS_BG[device.status];

  const dateStr = (ts: any): string => {
    if (!ts) return '-';
    try {
      return new Date(ts.seconds ? ts.seconds * 1000 : ts).toLocaleString('ko-KR');
    } catch { return String(ts); }
  };

  return (
    <View style={[styles.deviceCard, { borderLeftColor: col }]}>
      {/* 상태 배지 + 기기 ID */}
      <View style={styles.deviceHeader}>
        <View style={[styles.statusBadge, { backgroundColor: bg, borderColor: col }]}>
          <Text style={[styles.statusBadgeText, { color: col }]}>
            {STATUS_LABEL[device.status]}
          </Text>
        </View>
        <Text style={styles.deviceId} selectable>{device.deviceId}</Text>
      </View>

      {/* 사용자 이름 */}
      {device.userName ? (
        <View style={styles.userNameBox}>
          <Text style={styles.userNameIcon}>👤</Text>
          <Text style={styles.userNameText}>{device.userName}</Text>
        </View>
      ) : (
        <View style={styles.userNameBoxEmpty}>
          <Text style={styles.userNameEmptyText}>이름 미입력</Text>
        </View>
      )}

      {/* 메타 정보 */}
      <Text style={styles.deviceMeta}>등록: {dateStr(device.registeredAt)}</Text>
      {device.approvedAt && (
        <Text style={styles.deviceMeta}>승인: {dateStr(device.approvedAt)}</Text>
      )}
      {device.screenInfo && (
        <Text style={styles.deviceMeta}>화면: {device.screenInfo}</Text>
      )}
      {device.userAgent && (
        <Text style={styles.deviceUA} numberOfLines={2}>{device.userAgent}</Text>
      )}

      {/* 액션 버튼 */}
      <View style={styles.actionRow}>
        {device.status !== 'approved' && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#0d3320' }]} onPress={onApprove}>
            <Text style={[styles.actionBtnText, { color: C.green }]}>✓ 승인</Text>
          </TouchableOpacity>
        )}
        {device.status !== 'blocked' && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.redBg }]} onPress={onBlock}>
            <Text style={[styles.actionBtnText, { color: C.red }]}>✕ 차단</Text>
          </TouchableOpacity>
        )}
        {device.status !== 'pending' && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.orangeBg }]} onPress={onPending}>
            <Text style={[styles.actionBtnText, { color: C.orange }]}>↩ 대기</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#1a0a0a' }]} onPress={onDelete}>
          <Text style={[styles.actionBtnText, { color: '#78909c' }]}>🗑 삭제</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── 스타일 ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  center:      { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  panelBg:     { flex: 1, backgroundColor: C.bg },
  panelContent:{ padding: 20, paddingBottom: 60 },

  // 로그인
  loginCard: {
    backgroundColor: C.card, borderRadius: 20, padding: 28,
    width: '100%', maxWidth: 380, borderWidth: 1, borderColor: C.cardBdr,
  },
  loginTitle: { fontSize: 22, fontWeight: '800', color: C.white, marginBottom: 8, textAlign: 'center' },
  loginSub:   { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  input: {
    backgroundColor: C.input, borderRadius: 10,
    borderWidth: 1, borderColor: C.cardBdr,
    color: C.white, fontSize: 16,
    paddingHorizontal: 14, paddingVertical: 13,
    marginBottom: 8,
  },
  errorText: { color: C.red, fontSize: 13, marginBottom: 12, textAlign: 'center' },
  loginBtn: {
    backgroundColor: C.blue, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  loginBtnText: { color: C.white, fontSize: 15, fontWeight: '700' },
  backLink: { marginTop: 16, alignItems: 'center' },
  backLinkText: { color: C.muted, fontSize: 13 },

  // 패널 상단바
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 16,
  },
  panelTitle: { fontSize: 22, fontWeight: '800', color: C.white },
  modeBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  modeDot:    { width: 7, height: 7, borderRadius: 4 },
  modeText:   { fontSize: 11, color: C.muted },
  topBarRight:{ flexDirection: 'row', gap: 8, alignItems: 'center' },
  refreshBtn: {
    borderWidth: 1, borderColor: C.cardBdr, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  refreshBtnText: { color: C.cyan, fontSize: 13, fontWeight: '600' },
  closeBtn: {
    backgroundColor: '#1a0a0a', borderRadius: 8,
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: C.red, fontSize: 16, fontWeight: '700' },

  // 통계
  statsRow:     { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: C.card, borderRadius: 12,
    borderWidth: 1, borderColor: C.cardBdr,
    paddingVertical: 12, alignItems: 'center',
  },
  statCardActive: { borderColor: C.cyan },
  statNum:   { fontSize: 22, fontWeight: '900', color: C.white },
  statLabel: { fontSize: 10, color: C.muted, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },

  // 로딩 / 빈 상태
  loadingBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 20, justifyContent: 'center' },
  loadingText: { color: C.muted, fontSize: 14 },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyText: { color: C.muted, fontSize: 15 },

  // 기기 카드
  deviceCard: {
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.cardBdr,
    borderLeftWidth: 4,
    padding: 16, marginBottom: 12,
  },
  deviceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  statusBadge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  deviceId: { fontSize: 14, fontWeight: '700', color: C.cyan, letterSpacing: 1, flex: 1 },
  userNameBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(30,136,229,0.12)',
    borderWidth: 1, borderColor: 'rgba(30,136,229,0.30)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    marginBottom: 10, alignSelf: 'flex-start',
  },
  userNameIcon: { fontSize: 14 },
  userNameText: { fontSize: 15, fontWeight: '800', color: C.white },
  userNameBoxEmpty: {
    backgroundColor: 'rgba(84,110,122,0.10)',
    borderWidth: 1, borderColor: 'rgba(84,110,122,0.20)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    marginBottom: 10, alignSelf: 'flex-start',
  },
  userNameEmptyText: { fontSize: 11, color: C.muted, fontStyle: 'italic' },
  deviceMeta: { fontSize: 11, color: C.muted, marginBottom: 2 },
  deviceUA: { fontSize: 10, color: C.dim, marginTop: 4, marginBottom: 8, lineHeight: 14 },

  // 액션 버튼
  actionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  actionBtn: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: 'transparent',
  },
  actionBtnText: { fontSize: 12, fontWeight: '700' },

});
