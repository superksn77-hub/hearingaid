import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Platform, Vibration
} from 'react-native';
import { ScreeningCoordinator } from '../../engine/screening/ScreeningCoordinator';
import { ScreeningEngineEvent, ScreeningModule, LatencyCalibration } from '../../types/screening';
import { UserProfile } from '../../types';

interface Props {
  navigation: any;
  route: { params: { user?: UserProfile; calibration: LatencyCalibration } };
}

const C = {
  bg:         '#0a1628',
  bgCard:     '#0f1f3d',
  accentBlue: '#1e88e5',
  accentCyan: '#00b8d4',
  accentPurple: '#7c4dff',
  success:    '#00c853',
  errorRed:   '#b71c1c',
  errorBorder:'#e53935',
  warning:    '#ffd740',
  textWhite:  '#ffffff',
  textMuted:  '#78909c',
  progressBg: '#132040',
};

const MODULE_INFO: Record<ScreeningModule, { icon: string; color: string; desc: string }> = {
  calibration: { icon: '\u2699', color: C.accentBlue, desc: '하드웨어 보정' },
  ehfa:        { icon: '\ud83d\udd0a', color: '#ff7043', desc: '확장 고주파 청력검사\n10kHz, 12.5kHz, 16kHz 순음 탐지' },
  cpt:         { icon: '\u26a1', color: '#ffd740', desc: '주의력 검사 (CPT)\n소리가 들리면 즉시 누르세요' },
  dlf:         { icon: '\ud83c\udfb5', color: C.accentPurple, desc: '주파수 변별력 검사\n두 소리가 같은지 다른지 판단하세요' },
  gdt:         { icon: '\u23f1', color: '#26c6da', desc: '시간 해상도 검사\n소음이 잠깐 끊기는 순간을 감지하세요\n끊김 없이 나오면 누르지 마세요' },
};

export const ScreeningTestScreen: React.FC<Props> = ({ navigation, route }) => {
  const { user, calibration } = route.params;
  const coordRef = useRef(new ScreeningCoordinator());

  const [currentModule, setCurrentModule] = useState<ScreeningModule>('ehfa');
  const [moduleLabel, setModuleLabel]     = useState('');
  const [progress, setProgress]           = useState(0);
  const [progressTotal, setProgressTotal] = useState(1);
  const [responseMode, setResponseMode]   = useState<'single' | 'dual'>('single');
  const [showModuleTransition, setShowModuleTransition] = useState(false);
  const [blockLabel, setBlockLabel]       = useState('');
  const [falsePosAlert, setFalsePosAlert] = useState(false);
  const [started, setStarted]             = useState(false);
  const [pressed, setPressed]             = useState(false);
  const [practiceMsg, setPracticeMsg]     = useState('');
  const [isPractice, setIsPractice]       = useState(false);

  const falsePosTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scaleAnim     = useRef(new Animated.Value(1)).current;
  const shakeAnim     = useRef(new Animated.Value(0)).current;

  /** 버튼 눌림 이펙트 (터치 + 스페이스바 공용) */
  const triggerPress = useCallback(() => {
    setPressed(true);
    if (pressTimer.current) clearTimeout(pressTimer.current);
    // 축소 → 복원 애니메이션
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.88, duration: 60, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    pressTimer.current = setTimeout(() => setPressed(false), 200);
  }, []);

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  };

  const showFalsePositive = useCallback(() => {
    if (falsePosTimer.current) clearTimeout(falsePosTimer.current);
    setFalsePosAlert(true);
    triggerShake();
    if (Platform.OS !== 'web') Vibration.vibrate([0, 80, 60, 80]);
    falsePosTimer.current = setTimeout(() => setFalsePosAlert(false), 1500);
  }, []);

  // 코디네이터 이벤트 리스너
  useEffect(() => {
    const coord = coordRef.current;
    coord.setListener((e: ScreeningEngineEvent) => {
      switch (e.type) {
        case 'module_switch':
          setCurrentModule(e.module);
          setModuleLabel(e.label);
          setProgress(0);
          setResponseMode(e.module === 'dlf' ? 'dual' : 'single');
          setShowModuleTransition(true);
          break;
        case 'progress':
          setProgress(e.current);
          setProgressTotal(e.total);
          // progress 이벤트가 오면 전환 오버레이 해제
          setShowModuleTransition(false);
          break;
        case 'block_switch':
          setBlockLabel(e.label);
          setShowModuleTransition(true);
          setTimeout(() => setShowModuleTransition(false), 2000);
          break;
        case 'practice_info':
          setPracticeMsg(e.message);
          setIsPractice(!e.passed);
          if (e.passed) {
            setTimeout(() => { setPracticeMsg(''); setIsPractice(false); }, 2000);
          }
          break;
        case 'false_positive':
          showFalsePositive();
          break;
        case 'awaiting_response':
          setResponseMode(e.mode);
          setShowModuleTransition(false);
          break;
        case 'tone_played':
        case 'noise_played':
          // 음향 재생 시 전환 오버레이 해제
          setShowModuleTransition(false);
          break;
        case 'screening_complete':
          navigation.navigate('ScreeningResult', { result: e.result, user });
          break;
      }
    });
    return () => coord.dispose();
  }, []);

  // 키보드 이벤트 — coordRef.current를 직접 참조하여 클로저 문제 방지
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.repeat) return; // 키 반복 무시
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        triggerPress();
        coordRef.current.onUserResponse();
      } else if (e.key === '1') {
        e.preventDefault();
        triggerPress();
        coordRef.current.onUserResponse('same');
      } else if (e.key === '2') {
        e.preventDefault();
        triggerPress();
        coordRef.current.onUserResponse('different');
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const handleStart = () => {
    setStarted(true);
    setShowModuleTransition(true);
    coordRef.current.start(calibration, user);
  };

  // 시작 전 인트로 화면
  if (!started) {
    return (
      <View style={s.container}>
        <View style={s.introCard}>
          <Text style={s.title}>HICOG 청각 스크린 검사</Text>
          <Text style={s.desc}>
            4단계 검사가 순차적으로 진행됩니다:{'\n\n'}
            1. 확장 고주파 청력검사 (~3분){'\n'}
            2. 주의력 검사 CPT (~3분){'\n'}
            3. 주파수 변별력 검사 (~4분){'\n'}
            4. 시간 해상도 검사 (~3분){'\n\n'}
            이어폰을 착용하고 조용한 환경에서 진행하세요.
          </Text>
          <TouchableOpacity style={s.startBtn} onPress={handleStart} activeOpacity={0.8}>
            <Text style={s.startBtnText}>검사 시작</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const info = MODULE_INFO[currentModule];
  const pct = progressTotal > 0 ? progress / progressTotal : 0;

  return (
    <View style={s.container}>
      {/* 모듈 전환 오버레이 — 키 이벤트는 여전히 수신됨 */}
      {showModuleTransition && (
        <View style={s.transitionOverlay}>
          <View style={[s.transitionCard, { borderColor: info.color }]}>
            <Text style={[s.transitionIcon, { color: info.color }]}>{info.icon}</Text>
            <Text style={s.transitionTitle}>{moduleLabel}</Text>
            <Text style={s.transitionDesc}>{info.desc}</Text>
            <Text style={s.transitionHint}>잠시 후 시작됩니다...</Text>
          </View>
        </View>
      )}

      {/* 모듈 표시 + 진행 바 */}
      {!showModuleTransition && (
        <>
          <View style={s.topBar}>
            <View style={s.moduleChip}>
              <Text style={[s.moduleIcon, { color: info.color }]}>{info.icon}</Text>
              <Text style={s.moduleLabel}>{moduleLabel}</Text>
            </View>
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${pct * 100}%`, backgroundColor: info.color }]} />
            </View>
            <Text style={s.progressText}>{progress} / {progressTotal}</Text>
          </View>

          {/* 연습 메시지 */}
          {practiceMsg !== '' && (
            <View style={[s.practiceBanner, isPractice ? s.practiceBannerActive : s.practiceBannerPassed]}>
              <Text style={s.practiceBannerLabel}>{isPractice ? '연습' : '준비 완료'}</Text>
              <Text style={s.practiceBannerText}>{practiceMsg}</Text>
            </View>
          )}

          {/* 오경보 경고 */}
          {falsePosAlert && (
            <Animated.View style={[s.fpAlert, { transform: [{ translateX: shakeAnim }] }]}>
              <Text style={s.fpAlertText}>아직 소리가 없습니다!</Text>
            </Animated.View>
          )}

          {/* 응답 영역 */}
          <View style={s.responseArea}>
            {responseMode === 'single' ? (
              <>
                <Text style={s.instruction}>
                  {currentModule === 'cpt' ? '소리가 들리면 누르세요' :
                   currentModule === 'gdt' ? '소음 중간에 끊김이 느껴지면 누르세요' :
                   '소리가 들리면 누르세요'}
                </Text>
                {currentModule === 'gdt' && (
                  <Text style={s.gdtHint}>
                    "쉬이이..." 소음이 잠깐 끊기는 순간을 감지하세요{'\n'}
                    끊김 없이 계속 나오면 누르지 마세요
                  </Text>
                )}
                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                  <TouchableOpacity
                    style={[s.responseBtn, falsePosAlert && s.responseBtnError]}
                    onPress={() => { triggerPress(); coordRef.current.onUserResponse(); }}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      s.responseBtnInner,
                      { borderColor: falsePosAlert ? C.errorBorder : info.color },
                      pressed && s.responseBtnPressed,
                    ]}>
                      <Text style={s.responseBtnText}>
                        {currentModule === 'gdt' ? '끊겼다!' : '들림!'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
                {Platform.OS === 'web' && (
                  <Text style={s.keyHint}>또는 스페이스바를 누르세요</Text>
                )}
              </>
            ) : (
              <>
                <Text style={s.instruction}>두 소리가 같은지 다른지 판단하세요</Text>
                <View style={s.dualBtnRow}>
                  <TouchableOpacity
                    style={[s.dualBtn, { borderColor: C.accentBlue }, pressed && s.dualBtnPressed]}
                    onPress={() => { triggerPress(); coordRef.current.onUserResponse('same'); }}
                    activeOpacity={0.7}
                  >
                    <Text style={s.dualBtnText}>같은 소리</Text>
                    {Platform.OS === 'web' && <Text style={s.dualKeyHint}>키: 1</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.dualBtn, { borderColor: C.accentPurple }, pressed && s.dualBtnPressed]}
                    onPress={() => { triggerPress(); coordRef.current.onUserResponse('different'); }}
                    activeOpacity={0.7}
                  >
                    <Text style={s.dualBtnText}>다른 소리</Text>
                    {Platform.OS === 'web' && <Text style={s.dualKeyHint}>키: 2</Text>}
                  </TouchableOpacity>
                </View>
                {Platform.OS === 'web' && (
                  <Text style={s.keyHint}>키보드 1 = 같은 소리, 2 = 다른 소리</Text>
                )}
              </>
            )}
          </View>
        </>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', padding: 20 },

  introCard: { backgroundColor: C.bgCard, borderRadius: 20, padding: 32, alignItems: 'center', maxWidth: 460, width: '100%' },
  title: { color: C.textWhite, fontSize: 22, fontWeight: '700', marginBottom: 16 },
  desc: { color: C.textMuted, fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 28 },
  startBtn: { backgroundColor: C.accentBlue, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 48 },
  startBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  transitionOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg, zIndex: 10 },
  transitionCard: { backgroundColor: C.bgCard, borderRadius: 24, padding: 40, alignItems: 'center', borderWidth: 2, maxWidth: 400, width: '90%' },
  transitionIcon: { fontSize: 52, marginBottom: 16 },
  transitionTitle: { color: C.textWhite, fontSize: 22, fontWeight: '700', marginBottom: 12 },
  transitionDesc: { color: C.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 24, marginBottom: 20 },
  transitionHint: { color: C.accentCyan, fontSize: 14, fontStyle: 'italic' },

  topBar: { position: 'absolute', top: 16, left: 20, right: 20, alignItems: 'center' },
  moduleChip: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  moduleIcon: { fontSize: 18, marginRight: 6 },
  moduleLabel: { color: C.textWhite, fontSize: 15, fontWeight: '600' },
  progressBar: { width: '100%', height: 5, backgroundColor: C.progressBg, borderRadius: 3 },
  progressFill: { height: 5, borderRadius: 3 },
  progressText: { color: C.textMuted, fontSize: 12, marginTop: 4 },

  practiceBanner: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20, marginBottom: 16, alignItems: 'center', width: '100%', maxWidth: 400 },
  practiceBannerActive: { backgroundColor: 'rgba(255,215,64,0.15)', borderWidth: 1, borderColor: 'rgba(255,215,64,0.4)' },
  practiceBannerPassed: { backgroundColor: 'rgba(0,200,83,0.15)', borderWidth: 1, borderColor: 'rgba(0,200,83,0.4)' },
  practiceBannerLabel: { color: C.warning, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  practiceBannerText: { color: C.textWhite, fontSize: 14, fontWeight: '600', textAlign: 'center' },

  fpAlert: { backgroundColor: C.errorRed, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 20, marginBottom: 24 },
  fpAlertText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  responseArea: { alignItems: 'center' },
  instruction: { color: C.textWhite, fontSize: 17, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  gdtHint: { color: C.accentCyan, fontSize: 12, lineHeight: 18, textAlign: 'center', marginBottom: 24 },

  responseBtn: { width: 150, height: 150, borderRadius: 75, justifyContent: 'center', alignItems: 'center' },
  responseBtnError: {},
  responseBtnInner: { width: 140, height: 140, borderRadius: 70, backgroundColor: C.bgCard, borderWidth: 3, justifyContent: 'center', alignItems: 'center' },
  responseBtnPressed: { backgroundColor: 'rgba(30,136,229,0.3)', borderWidth: 4 },
  responseBtnText: { color: C.textWhite, fontSize: 22, fontWeight: '700' },
  keyHint: { color: C.textMuted, fontSize: 12, marginTop: 16 },

  dualBtnRow: { flexDirection: 'row', gap: 20 },
  dualBtn: { width: 150, height: 100, borderRadius: 16, backgroundColor: C.bgCard, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  dualBtnPressed: { backgroundColor: 'rgba(30,136,229,0.2)', borderWidth: 3 },
  dualBtnText: { color: C.textWhite, fontSize: 17, fontWeight: '700' },
  dualKeyHint: { color: C.textMuted, fontSize: 11, marginTop: 6 },
});
