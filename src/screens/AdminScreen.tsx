/**
 * AdminScreen – 기기 인증 관리자 패널
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import {
  getAllDevices, setAppStatus, deleteDevice, getAppStatus,
  DeviceRecord, DeviceStatus, AppName, getBackendMode,
} from '../services/deviceLicense';
import { IS_FIREBASE_CONFIGURED } from '../config/firebaseConfig';
import { getAllTestHistory, deleteTestHistory, TestHistoryRecord } from '../services/testHistoryService';
import {
  verifyAdminPassword, isLockedOut, getLockoutRemainingMs,
  isAdminSessionValid, clearAdminSession, touchAdminSession,
} from '../utils/adminAuth';
import { changeAdminPassword } from '../services/adminConfig';

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

type AdminTab = 'devices' | 'history';

// 이 기기에 등록된 앱 목록 (apps[] + appStatus 키 + 구버전 appName 모두 고려)
const appsOf = (d: DeviceRecord): string[] => {
  const set = new Set<string>();
  if (Array.isArray(d.apps)) d.apps.forEach(a => set.add(a));
  if (d.appStatus) Object.keys(d.appStatus).forEach(a => set.add(a));
  if (d.appName) set.add(d.appName);
  if (set.size === 0) set.add('hearingaid'); // 구버전 레코드 기본값
  return Array.from(set);
};

const APP_META: Record<string, { label: string; color: string; bg: string }> = {
  hearingaid:  { label: '🎧 청각앱',        color: '#00b8d4', bg: 'rgba(0,184,212,0.12)' },
  wmemory:     { label: '🧠 Working Memory', color: '#7c4dff', bg: 'rgba(124,77,255,0.12)' },
  smartswitch: { label: '🔀 스위칭마스터',    color: '#ff8a65', bg: 'rgba(255,138,101,0.12)' },
};

// 같은 물리 기기로 추정되는 레코드를 묶기 위한 linkKey — device-auth.js는 건드리지 않고
// Firebase에 이미 저장된 정보 필드만으로 계산
function computeLinkKey(d: DeviceRecord): string | null {
  const parts = [
    d.cpuCores ?? '',
    d.ramGB ?? '',
    d.screenRes ?? '',
    d.timezone ?? '',
    d.os ?? '',
    d.gpu ?? '',
  ];
  // 너무 비어있으면 grouping에 사용하지 않음
  const nonEmpty = parts.filter(p => p !== '' && p !== 0 && p != null);
  if (nonEmpty.length < 4) return null;
  return parts.join('|');
}

export const AdminScreen: React.FC<Props> = ({ onClose }) => {
  const [phase,       setPhase]       = useState<'login' | 'panel'>('login');
  const [pw,          setPw]          = useState('');
  const [pwError,     setPwError]     = useState('');
  const [devices,     setDevices]     = useState<DeviceRecord[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState<DeviceStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchField, setSearchField] = useState<SearchField>('all');

  // 탭 상태
  const [activeTab, setActiveTab] = useState<AdminTab>('devices');

  // 비밀번호 변경 모달
  const [showPwChange, setShowPwChange] = useState(false);
  const [pwCurrent,    setPwCurrent]    = useState('');
  const [pwNew,        setPwNew]        = useState('');
  const [pwConfirm,    setPwConfirm]    = useState('');
  const [pwMsg,        setPwMsg]        = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pwBusy,       setPwBusy]       = useState(false);

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (!pwCurrent || !pwNew || !pwConfirm) {
      setPwMsg({ type: 'err', text: '모든 필드를 입력하세요.' });
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwMsg({ type: 'err', text: '새 비밀번호 확인이 일치하지 않습니다.' });
      return;
    }
    if (pwNew === pwCurrent) {
      setPwMsg({ type: 'err', text: '새 비밀번호는 현재와 달라야 합니다.' });
      return;
    }
    setPwBusy(true);
    try {
      const res = await changeAdminPassword({ currentPlain: pwCurrent, newPlain: pwNew });
      if (res.ok) {
        setPwMsg({ type: 'ok', text: '✓ 변경되었습니다. 다음 로그인부터 새 비번을 사용하세요.' });
        setPwCurrent(''); setPwNew(''); setPwConfirm('');
        setTimeout(() => { setShowPwChange(false); setPwMsg(null); }, 2000);
      } else {
        setPwMsg({ type: 'err', text: res.reason });
      }
    } finally {
      setPwBusy(false);
    }
  };

  // 검사 이력 상태
  const [testHistory, setTestHistory] = useState<TestHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'pta' | 'screening'>('all');

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const list = await getAllTestHistory();
      list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setTestHistory(list);
    } catch (e) {
      console.error('[History]', e);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleDeleteHistory = async (id: string) => {
    if (Platform.OS === 'web') {
      if (!window.confirm('이 검사 기록을 삭제하시겠습니까?')) return;
    }
    await deleteTestHistory(id);
    setTestHistory(prev => prev.filter(r => r.id !== id));
  };

  const handleLogin = async () => {
    if (isLockedOut()) {
      const sec = Math.ceil(getLockoutRemainingMs() / 1000);
      setPwError(`너무 많은 시도로 ${sec}초간 잠겼습니다.`);
      return;
    }
    const res = await verifyAdminPassword(pw);
    if (res.ok) {
      setPwError('');
      setPw('');
      setPhase('panel');
      loadDevices();
      loadHistory();
    } else if (res.reason === 'LOCKED') {
      const sec = Math.ceil((res.remainingMs ?? 0) / 1000);
      setPwError(`너무 많은 시도로 ${sec}초간 잠겼습니다.`);
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

  const handleAppStatus = async (deviceId: string, appName: AppName, status: DeviceStatus) => {
    try {
      await setAppStatus(deviceId, appName, status);
      setDevices(prev => prev.map(d => {
        if (d.deviceId !== deviceId) return d;
        const apps = Array.isArray(d.apps) ? [...d.apps] : [];
        if (!apps.includes(appName)) apps.push(appName);
        return {
          ...d,
          apps,
          appStatus: { ...(d.appStatus || {}), [appName]: status },
          appApprovedAt: status === 'approved'
            ? { ...(d.appApprovedAt || {}), [appName]: new Date().toISOString() }
            : d.appApprovedAt,
        };
      }));
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

  // linkKey별로 같은 물리 기기로 추정되는 레코드들을 인덱싱
  const linkGroups = useMemo(() => {
    const map = new Map<string, DeviceRecord[]>();
    devices.forEach(d => {
      const key = computeLinkKey(d);
      if (!key) return;
      const arr = map.get(key) || [];
      arr.push(d);
      map.set(key, arr);
    });
    return map;
  }, [devices]);

  // 기기의 앱별 상태 중 하나라도 조건을 만족하는지
  const hasAnyStatus = (d: DeviceRecord, s: DeviceStatus): boolean =>
    appsOf(d).some(app => getAppStatus(d, app) === s);

  const filtered = devices
    .filter(d => filter === 'all' || hasAnyStatus(d, filter as DeviceStatus))
    .filter(matchesSearch);

  const counts = {
    all:      devices.length,
    pending:  devices.filter(d => hasAnyStatus(d, 'pending')).length,
    approved: devices.filter(d => hasAnyStatus(d, 'approved')).length,
    blocked:  devices.filter(d => hasAnyStatus(d, 'blocked')).length,
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
          <TouchableOpacity style={styles.refreshBtn} onPress={() => { loadDevices(); loadHistory(); }}>
            <Text style={styles.refreshBtnText}>↻ 새로고침</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.refreshBtn, { borderColor: C.orange }]}
            onPress={() => { setShowPwChange(true); setPwMsg(null); }}
          >
            <Text style={[styles.refreshBtnText, { color: C.orange }]}>🔐 비번 변경</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 탭 전환 ── */}
      <View style={{ flexDirection: 'row', marginBottom: 16, gap: 8 }}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'devices' && styles.tabBtnActive]}
          onPress={() => setActiveTab('devices')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'devices' && styles.tabBtnTextActive]}>
            🖥 기기 관리 ({devices.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'history' && styles.tabBtnTextActive]}>
            📊 검사 이력 ({testHistory.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* ══════ 검사 이력 탭 ══════ */}
      {activeTab === 'history' && (
        <View>
          {/* 필터 */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {(['all', 'pta', 'screening'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.statCard, historyFilter === f && styles.statCardActive, { flex: 1 }]}
                onPress={() => setHistoryFilter(f)}
              >
                <Text style={[styles.statNum, { fontSize: 18 }]}>
                  {f === 'all' ? testHistory.length
                    : testHistory.filter(r => r.testType === f).length}
                </Text>
                <Text style={styles.statLabel}>
                  {f === 'all' ? '전체' : f === 'pta' ? '순음검사' : '스크리닝'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {historyLoading && <ActivityIndicator color={C.cyan} style={{ marginVertical: 20 }} />}

          {!historyLoading && testHistory
            .filter(r => historyFilter === 'all' || r.testType === historyFilter)
            .map(record => {
              const d = new Date(record.date);
              const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

              return (
                <View key={record.id} style={[styles.deviceCard, { borderLeftWidth: 3, borderLeftColor: record.testType === 'pta' ? C.cyan : '#7c4dff' }]}>
                  {/* 헤더 */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[styles.statusBadge, {
                        backgroundColor: record.testType === 'pta' ? 'rgba(0,184,212,0.15)' : 'rgba(124,77,255,0.15)',
                      }]}>
                        <Text style={[styles.statusBadgeText, {
                          color: record.testType === 'pta' ? C.cyan : '#7c4dff',
                        }]}>
                          {record.testType === 'pta' ? '순음 청력검사' : 'ADHD/난독증 스크리닝'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => handleDeleteHistory(record.id)}>
                      <Text style={{ color: C.red, fontSize: 12 }}>삭제</Text>
                    </TouchableOpacity>
                  </View>

                  {/* 사용자 정보 */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ color: C.white, fontSize: 14, fontWeight: '600' }}>
                      {record.userName}
                    </Text>
                    <Text style={{ color: C.muted, fontSize: 11 }}>{dateStr}</Text>
                  </View>

                  <Text style={{ color: C.muted, fontSize: 10, marginBottom: 8 }}>
                    기기: {record.deviceId}
                  </Text>

                  {/* PTA 결과 */}
                  {record.ptaSummary && (
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={styles.histMetric}>
                        <Text style={styles.histMetricLabel}>좌측 평균</Text>
                        <Text style={styles.histMetricValue}>{record.ptaSummary.leftAvg.toFixed(0)} dB</Text>
                      </View>
                      <View style={styles.histMetric}>
                        <Text style={styles.histMetricLabel}>우측 평균</Text>
                        <Text style={styles.histMetricValue}>{record.ptaSummary.rightAvg.toFixed(0)} dB</Text>
                      </View>
                      <View style={styles.histMetric}>
                        <Text style={styles.histMetricLabel}>판정</Text>
                        <Text style={[styles.histMetricValue, { color: C.green }]}>{record.ptaSummary.hearingLevel}</Text>
                      </View>
                    </View>
                  )}

                  {/* 스크리닝 결과 */}
                  {record.screeningSummary && (
                    <View>
                      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 6 }}>
                        <View style={styles.histMetric}>
                          <Text style={styles.histMetricLabel}>ADHD</Text>
                          <Text style={[styles.histMetricValue, {
                            color: record.screeningSummary.adhdLevel === 'high' ? C.red
                              : record.screeningSummary.adhdLevel === 'moderate' ? C.orange : C.green
                          }]}>
                            {record.screeningSummary.adhdPct.toFixed(0)}%
                          </Text>
                        </View>
                        <View style={styles.histMetric}>
                          <Text style={styles.histMetricLabel}>난독증</Text>
                          <Text style={[styles.histMetricValue, {
                            color: record.screeningSummary.dyslexiaLevel === 'high' ? C.red
                              : record.screeningSummary.dyslexiaLevel === 'moderate' ? C.orange : C.green
                          }]}>
                            {record.screeningSummary.dyslexiaPct.toFixed(0)}%
                          </Text>
                        </View>
                        <View style={styles.histMetric}>
                          <Text style={styles.histMetricLabel}>RT τ</Text>
                          <Text style={styles.histMetricValue}>{record.screeningSummary.rtTau.toFixed(0)}ms</Text>
                        </View>
                        <View style={styles.histMetric}>
                          <Text style={styles.histMetricLabel}>GDT</Text>
                          <Text style={styles.histMetricValue}>{record.screeningSummary.gdt.toFixed(1)}ms</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 12 }}>
                        <View style={styles.histMetric}>
                          <Text style={styles.histMetricLabel}>DLF 1k</Text>
                          <Text style={styles.histMetricValue}>{record.screeningSummary.dlf1k.toFixed(1)}%</Text>
                        </View>
                        <View style={styles.histMetric}>
                          <Text style={styles.histMetricLabel}>DLF 6k</Text>
                          <Text style={styles.histMetricValue}>{record.screeningSummary.dlf6k.toFixed(1)}%</Text>
                        </View>
                        <View style={styles.histMetric}>
                          <Text style={styles.histMetricLabel}>PTA EHF</Text>
                          <Text style={styles.histMetricValue}>{record.screeningSummary.ptaEHF} dB</Text>
                        </View>
                        {record.screeningSummary.ehfFlag && (
                          <View style={styles.histMetric}>
                            <Text style={[styles.histMetricLabel, { color: C.orange }]}>⚠ 숨은난청</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              );
            })
          }

          {!historyLoading && testHistory.length === 0 && (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Text style={{ color: C.muted, fontSize: 14 }}>아직 검사 이력이 없습니다.</Text>
            </View>
          )}
        </View>
      )}

      {/* ══════ 기기 관리 탭 ══════ */}
      {activeTab === 'devices' && <>

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

      {filtered.map(device => {
        const key = computeLinkKey(device);
        const siblings = key
          ? (linkGroups.get(key) || []).filter(d => d.deviceId !== device.deviceId)
          : [];
        return (
          <DeviceCard
            key={device.deviceId}
            device={device}
            linkedDevices={siblings}
            history={testHistory.filter(h => h.deviceId === device.deviceId || h.userName === device.userName)}
            onSetApp={(app, status) => handleAppStatus(device.deviceId, app, status)}
            onDelete={()  => handleDelete(device.deviceId)}
          />
        );
      })}

      </>}

      {/* ── 비밀번호 변경 모달 ── */}
      {showPwChange && (
        <View style={pwStyles.overlay}>
          <View style={pwStyles.modal}>
            <Text style={pwStyles.title}>🔐 관리자 비밀번호 변경</Text>
            <Text style={pwStyles.desc}>
              새 비밀번호는 최소 8자, 문자+숫자 포함이어야 합니다.
            </Text>

            <Text style={pwStyles.label}>현재 비밀번호</Text>
            <TextInput
              style={pwStyles.input}
              secureTextEntry
              value={pwCurrent}
              onChangeText={setPwCurrent}
              placeholder="현재 비밀번호"
              placeholderTextColor={C.muted}
              autoComplete="current-password"
            />

            <Text style={pwStyles.label}>새 비밀번호</Text>
            <TextInput
              style={pwStyles.input}
              secureTextEntry
              value={pwNew}
              onChangeText={setPwNew}
              placeholder="새 비밀번호 (8자 이상, 문자+숫자)"
              placeholderTextColor={C.muted}
              autoComplete="new-password"
            />

            <Text style={pwStyles.label}>새 비밀번호 확인</Text>
            <TextInput
              style={pwStyles.input}
              secureTextEntry
              value={pwConfirm}
              onChangeText={setPwConfirm}
              placeholder="새 비밀번호 확인"
              placeholderTextColor={C.muted}
              autoComplete="new-password"
              onSubmitEditing={handleChangePassword}
            />

            {pwMsg && (
              <Text style={[
                pwStyles.msg,
                { color: pwMsg.type === 'ok' ? C.green : C.red },
              ]}>
                {pwMsg.text}
              </Text>
            )}

            <View style={pwStyles.btnRow}>
              <TouchableOpacity
                style={[pwStyles.btn, pwStyles.btnCancel]}
                onPress={() => {
                  setShowPwChange(false);
                  setPwCurrent(''); setPwNew(''); setPwConfirm(''); setPwMsg(null);
                }}
                disabled={pwBusy}
              >
                <Text style={pwStyles.btnCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[pwStyles.btn, pwStyles.btnOk, pwBusy && { opacity: 0.5 }]}
                onPress={handleChangePassword}
                disabled={pwBusy}
              >
                <Text style={pwStyles.btnOkText}>{pwBusy ? '변경 중...' : '변경'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const pwStyles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 1000,
    padding: 16,
  },
  modal: {
    width: '100%', maxWidth: 420,
    backgroundColor: C.card, borderColor: C.cardBdr, borderWidth: 1,
    borderRadius: 12, padding: 20,
  },
  title: { color: C.white, fontSize: 18, fontWeight: '700', marginBottom: 6 },
  desc: { color: C.muted, fontSize: 12, marginBottom: 14 },
  label: { color: C.white, fontSize: 13, marginBottom: 4, marginTop: 8 },
  input: {
    backgroundColor: C.input, borderColor: C.cardBdr, borderWidth: 1,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    color: C.white, fontSize: 14,
  },
  msg: { fontSize: 13, marginTop: 12, textAlign: 'center' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnCancel: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.cardBdr },
  btnCancelText: { color: C.muted, fontWeight: '600' },
  btnOk: { backgroundColor: C.cyan },
  btnOkText: { color: '#001018', fontWeight: '700' },
});

// ── 기기 카드 ──────────────────────────────────────────────────────────────
const DeviceCard: React.FC<{
  device:         DeviceRecord;
  linkedDevices:  DeviceRecord[];
  history:        TestHistoryRecord[];
  onSetApp:       (appName: AppName, status: DeviceStatus) => void;
  onDelete:       () => void;
}> = ({ device, linkedDevices, history, onSetApp, onDelete }) => {
  const [expanded, setExpanded] = useState(false);

  // 기기 전체 레벨 상태 = 등록된 앱 중 하나라도 approved면 일부 승인,
  // 모두 approved면 전체 승인, 아니면 가장 보수적인 상태로 표시 (차단>대기>승인)
  const apps = appsOf(device);
  const appStatuses = apps.map(a => getAppStatus(device, a) || 'pending');
  const anyBlocked  = appStatuses.some(s => s === 'blocked');
  const anyPending  = appStatuses.some(s => s === 'pending');
  const allApproved = appStatuses.every(s => s === 'approved');
  const overall: DeviceStatus = anyBlocked ? 'blocked' : anyPending ? 'pending' : allApproved ? 'approved' : 'pending';
  const col = STATUS_COLOR[overall];
  const bg  = STATUS_BG[overall];

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

      {/* 기기 고유번호 (강조) + 삭제 버튼 */}
      <View style={styles.deviceHeader}>
        <View style={[styles.statusBadge, { backgroundColor: bg, borderColor: col }]}>
          <Text style={[styles.statusBadgeText, { color: col }]}>{STATUS_LABEL[overall]}</Text>
        </View>
        <Text
          selectable
          style={{
            flex: 1, marginLeft: 10,
            color: C.white, fontSize: 15, fontWeight: '700',
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            letterSpacing: 0.5,
          }}
        >
          {device.deviceId}
        </Text>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#1a0a0a', paddingHorizontal: 10, paddingVertical: 6 }]}
          onPress={onDelete}
        >
          <Text style={[styles.actionBtnText, { color: '#78909c', fontSize: 11 }]}>🗑 삭제</Text>
        </TouchableOpacity>
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

      {/* 최초 등록 시각 + 등록자 */}
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>📅 최초 등록: {dateStr(device.registeredAt)}</Text>
        {device.registeredBy && (
          <Text style={styles.timeText}>
            · {APP_META[device.registeredBy]?.label ?? device.registeredBy}에서 등록
          </Text>
        )}
      </View>

      {/* ── 검사 이력 요약 ── */}
      {history.length > 0 && (() => {
        const ptaCount = history.filter(h => h.testType === 'pta').length;
        const scrCount = history.filter(h => h.testType === 'screening').length;
        const sorted = [...history].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const lastTest = sorted[0];
        const lastDate = lastTest ? new Date(lastTest.date) : null;
        const lastDateStr = lastDate
          ? `${lastDate.getFullYear()}.${lastDate.getMonth()+1}.${lastDate.getDate()} ${String(lastDate.getHours()).padStart(2,'0')}:${String(lastDate.getMinutes()).padStart(2,'0')}`
          : '';

        return (
          <View style={{
            backgroundColor: 'rgba(0,184,212,0.06)', borderRadius: 10,
            padding: 10, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(0,184,212,0.15)',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ color: C.cyan, fontSize: 12, fontWeight: '700' }}>📊 검사 이력</Text>
              <Text style={{ color: C.muted, fontSize: 11, marginLeft: 8 }}>
                총 {history.length}회
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.cyan }} />
                <Text style={{ color: C.white, fontSize: 12 }}>순음검사 {ptaCount}회</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#7c4dff' }} />
                <Text style={{ color: C.white, fontSize: 12 }}>스크리닝 {scrCount}회</Text>
              </View>
            </View>
            {lastTest && (
              <Text style={{ color: C.muted, fontSize: 10 }}>
                최근: {lastDateStr} ({lastTest.testType === 'pta' ? '순음검사' : '스크리닝'})
                {lastTest.ptaSummary && ` — ${lastTest.ptaSummary.hearingLevel}`}
                {lastTest.screeningSummary && ` — ADHD ${lastTest.screeningSummary.adhdPct.toFixed(0)}% / 난독증 ${lastTest.screeningSummary.dyslexiaPct.toFixed(0)}%`}
              </Text>
            )}

            {/* 최근 3건 리스트 */}
            {sorted.slice(0, 3).map((h, i) => {
              const dt = new Date(h.date);
              const ds = `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
              return (
                <View key={h.id || i} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: h.testType === 'pta' ? C.cyan : '#7c4dff' }} />
                  <Text style={{ color: C.dim, fontSize: 10, width: 80 }}>{ds}</Text>
                  <Text style={{ color: C.dim, fontSize: 10, flex: 1 }}>
                    {h.testType === 'pta'
                      ? `좌 ${h.ptaSummary?.leftAvg.toFixed(0)}dB / 우 ${h.ptaSummary?.rightAvg.toFixed(0)}dB (${h.ptaSummary?.hearingLevel})`
                      : `ADHD ${h.screeningSummary?.adhdPct.toFixed(0)}% · 난독증 ${h.screeningSummary?.dyslexiaPct.toFixed(0)}%`
                    }
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })()}

      {history.length === 0 && (
        <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, marginBottom: 8 }}>
          <Text style={{ color: C.muted, fontSize: 11, textAlign: 'center' }}>검사 이력 없음</Text>
        </View>
      )}

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

      {/* ── 동일 하드웨어로 추정되는 다른 레코드 ── */}
      {linkedDevices.length > 0 && (
        <View style={{
          marginTop: 4, marginBottom: 8, padding: 10, borderRadius: 10,
          backgroundColor: 'rgba(255,193,7,0.08)', borderWidth: 1, borderColor: 'rgba(255,193,7,0.3)',
        }}>
          <Text style={{ color: '#ffc107', fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
            🔗 같은 하드웨어로 추정 ({linkedDevices.length}개 연결)
          </Text>
          {linkedDevices.map(ld => {
            const ldApps = appsOf(ld);
            return (
              <View key={ld.deviceId} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                <Text style={{ color: C.muted, fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                  {ld.deviceId}
                </Text>
                {ld.userName ? (
                  <Text style={{ color: C.white, fontSize: 11 }}>· 👤 {ld.userName}</Text>
                ) : null}
                {ldApps.map(app => {
                  const m = APP_META[app] ?? { label: app, color: C.muted, bg: 'rgba(255,255,255,0.05)' };
                  return (
                    <View key={app} style={{
                      paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
                      backgroundColor: m.bg, borderWidth: 1, borderColor: m.color,
                    }}>
                      <Text style={{ color: m.color, fontSize: 9, fontWeight: '700' }}>{m.label}</Text>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      )}

      {/* ── 앱별 승인/대기/차단 토글 ── */}
      <View style={{ marginTop: 4 }}>
        <Text style={{ color: C.muted, fontSize: 11, marginBottom: 6, fontWeight: '600' }}>
          📦 프로그램별 승인 상태
        </Text>
        {apps.map(app => {
          const meta = APP_META[app] ?? { label: app, color: C.muted, bg: 'rgba(255,255,255,0.05)' };
          const cur = getAppStatus(device, app) || 'pending';
          const approvedAt = device.appApprovedAt && device.appApprovedAt[app];
          return (
            <View key={app} style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: meta.bg,
              borderWidth: 1, borderColor: meta.color,
              borderRadius: 10, padding: 10, marginBottom: 6, gap: 8, flexWrap: 'wrap',
            }}>
              <Text style={{ color: meta.color, fontWeight: '700', fontSize: 13, minWidth: 140 }}>
                {meta.label}
              </Text>
              <View style={{
                paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
                backgroundColor: STATUS_BG[cur], borderWidth: 1, borderColor: STATUS_COLOR[cur],
              }}>
                <Text style={{ color: STATUS_COLOR[cur], fontSize: 10, fontWeight: '700' }}>
                  {STATUS_LABEL[cur]}
                </Text>
              </View>
              {approvedAt && cur === 'approved' && (
                <Text style={{ color: C.muted, fontSize: 9 }}>승인: {dateStr(approvedAt)}</Text>
              )}
              <View style={{ flexDirection: 'row', gap: 4, marginLeft: 'auto' }}>
                <AppToggleBtn active={cur === 'approved'} label="✓" color={C.green}  bg="#0d3320"   onPress={() => onSetApp(app, 'approved')} />
                <AppToggleBtn active={cur === 'pending'}  label="⏳" color={C.orange} bg={C.orangeBg} onPress={() => onSetApp(app, 'pending')} />
                <AppToggleBtn active={cur === 'blocked'}  label="🚫" color={C.red}    bg={C.redBg}    onPress={() => onSetApp(app, 'blocked')} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const AppToggleBtn: React.FC<{
  active: boolean; label: string; color: string; bg: string; onPress: () => void;
}> = ({ active, label, color, bg, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
      backgroundColor: active ? bg : 'transparent',
      borderWidth: 1.5, borderColor: active ? color : 'rgba(255,255,255,0.12)',
      opacity: active ? 1 : 0.55,
    }}
  >
    <Text style={{ color: active ? color : C.muted, fontSize: 12, fontWeight: '700' }}>{label}</Text>
  </TouchableOpacity>
);

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

  // 탭
  tabBtn:         { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBdr, alignItems: 'center' },
  tabBtnActive:   { backgroundColor: 'rgba(0,184,212,0.15)', borderColor: C.cyan },
  tabBtnText:     { color: C.muted, fontSize: 13, fontWeight: '600' },
  tabBtnTextActive: { color: C.cyan },

  // 검사 이력
  histMetric:      { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: 6, alignItems: 'center' },
  histMetricLabel: { fontSize: 9, color: C.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  histMetricValue: { fontSize: 14, color: C.white, fontWeight: '700' },
});
