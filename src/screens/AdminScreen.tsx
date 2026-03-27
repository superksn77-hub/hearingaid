/**
 * AdminScreen – 기기 인증 관리자 패널
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

type SearchField = 'all' | 'name' | 'deviceId' | 'deviceType' | 'os' | 'browser';

const SEARCH_FIELD_LABELS: Record<SearchField, string> = {
  all:        '전체 필드',
  name:       '이름',
  deviceId:   '기기 번호',
  deviceType: '기기 유형',
  os:         'OS',
  browser:    '브라우저',
};

export const AdminScreen: React.FC<Props> = ({ onClose }) => {
  const [phase,       setPhase]       = useState<'login' | 'panel'>('login');
  const [pw,          setPw]          = useState('');
  const [pwError,     setPwError]     = useState('');
  const [devices,     setDevices]     = useState<DeviceRecord[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState<DeviceStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchField, setSearchField] = useState<SearchField>('all');

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

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getAllDevices();
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

  const handleStatus = async (deviceId: string, status: DeviceStatus) => {
    try {
      await setDeviceStatus(deviceId, status);
      setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, status } : d));
    } catch {
      showAlert('오류', '상태 변경에 실패했습니다.');
    }
  };

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

  // ── 검색 + 상태 필터 복합 적용 ──────────────────────────────────────────
  const q = searchQuery.trim().toLowerCase();

  const matchesSearch = (d: DeviceRecord): boolean => {
    if (!q) return true;
    const check = (val?: string | null) =>
      (val ?? '').toLowerCase().includes(q);
    switch (searchField) {
      case 'name':       return check(d.userName);
      case 'deviceId':   return check(d.deviceId);
      case 'deviceType': return check(d.deviceType);
      case 'os':         return check(d.os);
      case 'browser':    return check(d.browser);
      case 'all':
      default:
        return (
          check(d.userName)   ||
          check(d.deviceId)   ||
          check(d.deviceType) ||
          check(d.os)         ||
          check(d.browser)    ||
          check(d.gpu)        ||
          check(d.language)   ||
          check(d.timezone)
        );
    }
  };

  const filtered = devices
    .filter(d => filter === 'all' || d.status === filter)
    .filter(matchesSearch);

  const counts = {
    all:      devices.length,
    pending:  devices.filter(d => d.status === 'pending').length,
    approved: devices.filter(d => d.status === 'approved').length,
    blocked:  devices.filter(d => d.status === 'blocked').length,
  };

  // ── 로그인 화면 ────────────────────────────────────────────────────────
  if (phase === 'login') {
    return (
      <View style={styles.center}>
        <View style={styles.loginCard}>
          <Text style={styles.loginTitle}>관리자 로그인</Text>
          <Text style={styles.loginSub}>관리자 비밀번호를 입력하세요.</Text>
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

  // ── 관리자 패널 ────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.panelBg} contentContainerStyle={styles.panelContent}>

      {/* 상단바 */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.panelTitle}>기기 관리</Text>
          <View style={styles.modeBadge}>
            <View style={[styles.modeDot, { backgroundColor: IS_FIREBASE_CONFIGURED ? C.green : C.orange }]} />
            <Text style={styles.modeText}>
              {IS_FIREBASE_CONFIGURED ? '🔥 Firebase 클라우드 모드' : '⚠️ 로컬 테스트 모드'}
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

      {/* 통계 */}
      <View style={styles.statsRow}>
        {(['all', 'pending', 'approved', 'blocked'] as const).map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.statCard, filter === s && styles.statCardActive]}
            onPress={() => setFilter(s)}
          >
            <Text style={[styles.statNum, s !== 'all' && { color: STATUS_COLOR[s as DeviceStatus] }]}>
              {counts[s]}
            </Text>
            <Text style={styles.statLabel}>
              {s === 'all' ? '전체' : STATUS_LABEL[s as DeviceStatus]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── 검색 ─────────────────────────────────────────────────── */}
      <View style={styles.searchSection}>
        {/* 검색 입력창 */}
        <View style={styles.searchInputWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={`${SEARCH_FIELD_LABELS[searchField]}으로 검색...`}
            placeholderTextColor={C.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClear}>
              <Text style={styles.searchClearText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 필드 선택 칩 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fieldChipScroll}>
          {(Object.keys(SEARCH_FIELD_LABELS) as SearchField[]).map(field => (
            <TouchableOpacity
              key={field}
              style={[styles.fieldChip, searchField === field && styles.fieldChipActive]}
              onPress={() => setSearchField(field)}
            >
              <Text style={[styles.fieldChipText, searchField === field && styles.fieldChipTextActive]}>
                {SEARCH_FIELD_LABELS[field]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 검색 결과 요약 */}
        {!!searchQuery && (
          <Text style={styles.searchResultText}>
            "{searchQuery}" 검색 결과: {filtered.length}건
            {filtered.length !== devices.length ? ` / 전체 ${devices.length}건` : ''}
          </Text>
        )}
      </View>

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={C.cyan} />
          <Text style={styles.loadingText}>기기 목록 불러오는 중...</Text>
        </View>
      )}
      {!loading && filtered.length === 0 && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            {searchQuery ? `"${searchQuery}"에 해당하는 기기가 없습니다.` : '등록된 기기가 없습니다.'}
          </Text>
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
  const [expanded, setExpanded] = useState(false);
  const col = STATUS_COLOR[device.status];
  const bg  = STATUS_BG[device.status];

  const dateStr = (ts: any): string => {
    if (!ts) return '-';
    try {
      return new Date(ts.seconds ? ts.seconds * 1000 : ts).toLocaleString('ko-KR');
    } catch { return String(ts); }
  };

  const deviceIcon = () => {
    const t = device.deviceType ?? '';
    if (t.includes('스마트폰') || t.includes('iPhone')) return '📱';
    if (t.includes('태블릿') || t.includes('iPad'))    return '📟';
    return '🖥️';
  };

  return (
    <View style={[styles.deviceCard, { borderLeftColor: col }]}>

      {/* 상태 배지 + 기기 ID */}
      <View style={styles.deviceHeader}>
        <View style={[styles.statusBadge, { backgroundColor: bg, borderColor: col }]}>
          <Text style={[styles.statusBadgeText, { color: col }]}>{STATUS_LABEL[device.status]}</Text>
        </View>
        <Text style={styles.deviceIdText} selectable>{device.deviceId}</Text>
      </View>

      {/* 사용자 이름 + 기기 종류 */}
      <View style={styles.userNameBox}>
        <Text style={styles.userNameIcon}>👤</Text>
        <Text style={styles.userNameText}>
          {device.userName || '이름 미입력'}
        </Text>
        {device.deviceType && (
          <View style={styles.deviceTypePill}>
            <Text style={styles.deviceTypePillText}>{deviceIcon()} {device.deviceType}</Text>
          </View>
        )}
      </View>

      {/* 핵심 정보 그리드 */}
      <View style={styles.infoGrid}>
        <InfoChip icon="💻" label="OS"       value={device.os ?? '-'} />
        <InfoChip icon="🌐" label="브라우저"  value={device.browser ?? '-'} />
        <InfoChip icon="🖥" label="해상도"    value={device.screenRes ?? '-'} />
        <InfoChip icon="⚙️" label="CPU 코어" value={device.cpuCores ? `${device.cpuCores}코어` : '-'} />
        <InfoChip icon="🧠" label="RAM"      value={device.ramGB ? `${device.ramGB} GB` : '-'} />
        <InfoChip icon="🌏" label="언어/시간대" value={
          device.language ? `${device.language} · ${device.timezone}` : '-'
        } />
      </View>

      {/* 등록/승인 시각 */}
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>📅 등록: {dateStr(device.registeredAt)}</Text>
        {device.approvedAt && (
          <Text style={styles.timeText}>✅ 승인: {dateStr(device.approvedAt)}</Text>
        )}
      </View>

      {/* 상세 정보 토글 */}
      <TouchableOpacity style={styles.expandBtn} onPress={() => setExpanded(e => !e)}>
        <Text style={styles.expandBtnText}>{expanded ? '▲ 상세 정보 숨기기' : '▼ GPU · UA 등 상세 보기'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.expandedBox}>
          <DetailRow label="GPU"      value={device.gpu ?? '-'} />
          <DetailRow label="터치 지원" value={device.touchSupport ? '✅ 지원' : '❌ 미지원'} />
          <DetailRow label="User-Agent" value={device.userAgent ?? '-'} mono />
        </View>
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

// ── 서브 컴포넌트 ─────────────────────────────────────────────────────────
const InfoChip: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
  <View style={styles.infoChip}>
    <Text style={styles.infoChipLabel}>{icon} {label}</Text>
    <Text style={styles.infoChipValue} numberOfLines={1}>{value}</Text>
  </View>
);

const DetailRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={[styles.detailValue, mono && styles.detailMono]} selectable>{value}</Text>
  </View>
);

// ── 스타일 ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  center:       { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  panelBg:      { flex: 1, backgroundColor: C.bg },
  panelContent: { padding: 20, paddingBottom: 60 },

  // 로그인
  loginCard: {
    backgroundColor: C.card, borderRadius: 20, padding: 28,
    width: '100%', maxWidth: 380, borderWidth: 1, borderColor: C.cardBdr,
  },
  loginTitle:   { fontSize: 22, fontWeight: '800', color: C.white, marginBottom: 8, textAlign: 'center' },
  loginSub:     { fontSize: 13, color: C.muted, textAlign: 'center', marginBottom: 24 },
  input: {
    backgroundColor: C.input, borderRadius: 10,
    borderWidth: 1, borderColor: C.cardBdr,
    color: C.white, fontSize: 16,
    paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8,
  },
  errorText:    { color: C.red, fontSize: 13, marginBottom: 12, textAlign: 'center' },
  loginBtn:     { backgroundColor: C.blue, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  loginBtnText: { color: C.white, fontSize: 15, fontWeight: '700' },
  backLink:     { marginTop: 16, alignItems: 'center' },
  backLinkText: { color: C.muted, fontSize: 13 },

  // 패널 상단
  topBar:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  panelTitle:    { fontSize: 22, fontWeight: '800', color: C.white },
  modeBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  modeDot:       { width: 7, height: 7, borderRadius: 4 },
  modeText:      { fontSize: 11, color: C.muted },
  topBarRight:   { flexDirection: 'row', gap: 8, alignItems: 'center' },
  refreshBtn:    { borderWidth: 1, borderColor: C.cardBdr, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  refreshBtnText:{ color: C.cyan, fontSize: 13, fontWeight: '600' },
  closeBtn:      { backgroundColor: '#1a0a0a', borderRadius: 8, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  closeBtnText:  { color: C.red, fontSize: 16, fontWeight: '700' },

  // 통계
  statsRow:      { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard:      { flex: 1, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.cardBdr, paddingVertical: 12, alignItems: 'center' },
  statCardActive:{ borderColor: C.cyan },
  statNum:       { fontSize: 22, fontWeight: '900', color: C.white },
  statLabel:     { fontSize: 10, color: C.muted, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },
  loadingBox:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 20, justifyContent: 'center' },
  loadingText:   { color: C.muted, fontSize: 14 },
  emptyBox:      { padding: 40, alignItems: 'center' },
  emptyText:     { color: C.muted, fontSize: 15 },

  // 검색
  searchSection: {
    marginBottom: 16,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBdr,
    padding: 14,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.cardBdr,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: {
    flex: 1,
    color: C.white,
    fontSize: 15,
    paddingVertical: 11,
  },
  searchClear: { padding: 4, marginLeft: 4 },
  searchClearText: { color: C.muted, fontSize: 14, fontWeight: '700' },
  fieldChipScroll: { marginBottom: 8 },
  fieldChip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.dim,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
    backgroundColor: 'transparent',
  },
  fieldChipActive: {
    borderColor: C.cyan,
    backgroundColor: 'rgba(0,184,212,0.15)',
  },
  fieldChipText:       { fontSize: 12, color: C.muted, fontWeight: '600' },
  fieldChipTextActive: { color: C.cyan },
  searchResultText:    { fontSize: 12, color: C.cyan, marginTop: 4, fontWeight: '600' },

  // 기기 카드
  deviceCard: {
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.cardBdr, borderLeftWidth: 4,
    padding: 16, marginBottom: 12,
  },
  deviceHeader:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  statusBadge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  deviceIdText:    { fontSize: 13, fontWeight: '700', color: C.cyan, letterSpacing: 1, flex: 1 },

  // 사용자 이름
  userNameBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    backgroundColor: 'rgba(30,136,229,0.10)',
    borderWidth: 1, borderColor: 'rgba(30,136,229,0.25)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  userNameIcon:     { fontSize: 16 },
  userNameText:     { fontSize: 17, fontWeight: '800', color: C.white, flex: 1 },
  deviceTypePill:   { backgroundColor: 'rgba(0,184,212,0.15)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(0,184,212,0.30)' },
  deviceTypePillText:{ fontSize: 11, color: C.cyan, fontWeight: '600' },

  // 정보 그리드
  infoGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  infoChip:      { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', minWidth: 120, flex: 1 },
  infoChipLabel: { fontSize: 9, color: C.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  infoChipValue: { fontSize: 12, color: C.white, fontWeight: '600' },

  // 시간
  timeRow:  { flexDirection: 'row', gap: 16, marginBottom: 8, flexWrap: 'wrap' },
  timeText: { fontSize: 11, color: C.muted },

  // 상세 토글
  expandBtn:     { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 10, marginTop: 4, marginBottom: 4, alignItems: 'center' },
  expandBtnText: { fontSize: 11, color: C.cyan, fontWeight: '600' },
  expandedBox:   { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  detailRow:     { marginBottom: 8 },
  detailLabel:   { fontSize: 10, color: C.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  detailValue:   { fontSize: 12, color: '#90a4ae', lineHeight: 18 },
  detailMono:    { fontFamily: 'monospace', fontSize: 10 },

  // 액션
  actionRow:     { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  actionBtn:     { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'transparent' },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
});
