import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform
} from 'react-native';
import { LatencyCalibrator, CalibrationEvent } from '../../engine/screening/LatencyCalibrator';
import { LatencyCalibration } from '../../types/screening';

interface Props {
  navigation: any;
  route: { params?: { user?: import('../../types').UserProfile } };
}

const C = {
  bg:         '#0a1628',
  bgCard:     '#0f1f3d',
  accentBlue: '#1e88e5',
  accentCyan: '#00b8d4',
  textWhite:  '#ffffff',
  textMuted:  '#78909c',
  success:    '#00c853',
  progressBg: '#132040',
};

export const ScreeningCalibrationScreen: React.FC<Props> = ({ navigation, route }) => {
  const user = route?.params?.user;
  const calibratorRef = useRef(new LatencyCalibrator());

  const [currentTrial, setCurrentTrial] = useState(0);
  const [totalTrials, setTotalTrials]   = useState(10);
  const [lastRT, setLastRT]             = useState<number | null>(null);
  const [isDone, setIsDone]             = useState(false);
  const [calibration, setCalibration]   = useState<LatencyCalibration | null>(null);
  const [started, setStarted]           = useState(false);

  useEffect(() => {
    const cal = calibratorRef.current;
    cal.setListener((e: CalibrationEvent) => {
      switch (e.type) {
        case 'trial_start':
          setCurrentTrial(e.trial);
          setTotalTrials(e.total);
          break;
        case 'response_recorded':
          setLastRT(Math.round(e.rt));
          break;
        case 'calibration_complete':
          setCalibration(e.result);
          setIsDone(true);
          break;
      }
    });
    return () => cal.dispose();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        calibratorRef.current.onUserResponse();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const handleStart = () => {
    setStarted(true);
    calibratorRef.current.start();
  };

  const handleNext = () => {
    if (calibration) {
      navigation.navigate('ScreeningTest', { user, calibration });
    }
  };

  const progress = totalTrials > 0 ? currentTrial / totalTrials : 0;

  return (
    <View style={s.container}>
      {!started ? (
        <View style={s.introCard}>
          <Text style={s.title}>하드웨어 지연 보정</Text>
          <Text style={s.desc}>
            검사 정확도를 높이기 위해 기기의 음향 지연 시간을 측정합니다.{'\n\n'}
            소리가 들리면 <Text style={s.highlight}>즉시</Text> 아래 버튼을 누르세요.{'\n'}
            총 10회 측정됩니다.
          </Text>
          <TouchableOpacity style={s.startBtn} onPress={handleStart} activeOpacity={0.8}>
            <Text style={s.startBtnText}>보정 시작</Text>
          </TouchableOpacity>
        </View>
      ) : !isDone ? (
        <View style={s.testArea}>
          {/* 진행 바 */}
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={s.progressText}>{currentTrial} / {totalTrials}</Text>

          <Text style={s.instruction}>소리가 들리면 즉시 누르세요</Text>

          {lastRT !== null && (
            <Text style={s.rtText}>반응 시간: {lastRT}ms</Text>
          )}

          <TouchableOpacity
            style={s.responseBtn}
            onPress={() => calibratorRef.current.onUserResponse()}
            activeOpacity={0.7}
          >
            <View style={s.responseBtnInner}>
              <Text style={s.responseBtnText}>누르기</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.doneCard}>
          <Text style={s.doneIcon}>&#10003;</Text>
          <Text style={s.doneTitle}>보정 완료</Text>
          <Text style={s.doneValue}>
            추정 하드웨어 지연: {calibration?.estimatedLatencyMs ?? 0}ms
          </Text>
          <Text style={s.doneDesc}>
            이 값은 모든 반응 시간 측정에서 자동으로 보정됩니다.
          </Text>
          <TouchableOpacity style={s.nextBtn} onPress={handleNext} activeOpacity={0.8}>
            <Text style={s.nextBtnText}>검사 시작</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', padding: 24 },
  introCard: { backgroundColor: C.bgCard, borderRadius: 20, padding: 32, alignItems: 'center', maxWidth: 440, width: '100%' },
  title: { color: C.textWhite, fontSize: 22, fontWeight: '700', marginBottom: 16 },
  desc: { color: C.textMuted, fontSize: 15, lineHeight: 24, textAlign: 'center', marginBottom: 28 },
  highlight: { color: C.accentCyan, fontWeight: '700' },
  startBtn: { backgroundColor: C.accentBlue, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 48 },
  startBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  testArea: { alignItems: 'center', width: '100%', maxWidth: 440 },
  progressBar: { width: '100%', height: 6, backgroundColor: C.progressBg, borderRadius: 3, marginBottom: 8 },
  progressFill: { height: 6, backgroundColor: C.accentBlue, borderRadius: 3 },
  progressText: { color: C.textMuted, fontSize: 13, marginBottom: 32 },
  instruction: { color: C.textWhite, fontSize: 18, fontWeight: '600', marginBottom: 24 },
  rtText: { color: C.accentCyan, fontSize: 15, marginBottom: 40 },
  responseBtn: { width: 140, height: 140, borderRadius: 70, borderWidth: 3, borderColor: C.accentBlue, justifyContent: 'center', alignItems: 'center' },
  responseBtnInner: { width: 120, height: 120, borderRadius: 60, backgroundColor: C.bgCard, justifyContent: 'center', alignItems: 'center' },
  responseBtnText: { color: C.textWhite, fontSize: 20, fontWeight: '700' },

  doneCard: { backgroundColor: C.bgCard, borderRadius: 20, padding: 32, alignItems: 'center', maxWidth: 440, width: '100%' },
  doneIcon: { color: C.success, fontSize: 48, marginBottom: 12 },
  doneTitle: { color: C.textWhite, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  doneValue: { color: C.accentCyan, fontSize: 16, fontWeight: '600', marginBottom: 12 },
  doneDesc: { color: C.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 28 },
  nextBtn: { backgroundColor: C.success, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 48 },
  nextBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
