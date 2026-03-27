import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { HomeScreen }        from './src/screens/HomeScreen';
import { CalibrationScreen } from './src/screens/CalibrationScreen';
import { TestScreen }        from './src/screens/TestScreen';
import { ResultScreen }      from './src/screens/ResultScreen';
import { DeviceGateScreen }  from './src/screens/DeviceGateScreen';
import { AdminScreen }       from './src/screens/AdminScreen';
import { ScreeningCalibrationScreen } from './src/screens/screening/ScreeningCalibrationScreen';
import { ScreeningTestScreen }        from './src/screens/screening/ScreeningTestScreen';
import { ScreeningResultScreen }      from './src/screens/screening/ScreeningResultScreen';

const Stack = createNativeStackNavigator();
type AppPhase = 'gate' | 'admin' | 'app';

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('gate');

  if (phase === 'gate') {
    return (
      <>
        <StatusBar style="light" />
        <DeviceGateScreen
          onApproved={()  => setPhase('app')}
          onAdminOpen={() => setPhase('admin')}
        />
      </>
    );
  }

  if (phase === 'admin') {
    return (
      <>
        <StatusBar style="light" />
        <AdminScreen onClose={() => setPhase('gate')} />
      </>
    );
  }

  const goToGate = () => setPhase('gate');

  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen
          name="Home"
          options={{ title: 'HICOG 청력검사', headerStyle: { backgroundColor: '#1a237e' }, headerTintColor: 'white' }}
        >
          {(props) => <HomeScreen {...props} onGoToGate={goToGate} />}
        </Stack.Screen>
        <Stack.Screen name="Calibration" component={CalibrationScreen} options={{ title: '볼륨 설정',       headerStyle: { backgroundColor: '#1a237e' }, headerTintColor: 'white' }} />
        <Stack.Screen name="Test"        component={TestScreen}        options={{ title: '검사 진행 중',    headerStyle: { backgroundColor: '#0d1b2a' }, headerTintColor: 'white', headerBackVisible: false }} />
        <Stack.Screen name="Result"      component={ResultScreen}      options={{ title: '검사 결과',       headerStyle: { backgroundColor: '#1a237e' }, headerTintColor: 'white', headerBackVisible: false }} />
        <Stack.Screen name="ScreeningCalibration" component={ScreeningCalibrationScreen} options={{ title: '하드웨어 보정',      headerStyle: { backgroundColor: '#0d1b2a' }, headerTintColor: 'white' }} />
        <Stack.Screen name="ScreeningTest"        component={ScreeningTestScreen}        options={{ title: '스크리닝 검사',      headerStyle: { backgroundColor: '#0d1b2a' }, headerTintColor: 'white', headerBackVisible: false }} />
        <Stack.Screen name="ScreeningResult"      component={ScreeningResultScreen}      options={{ title: '스크리닝 결과',      headerStyle: { backgroundColor: '#0d1b2a' }, headerTintColor: 'white', headerBackVisible: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
