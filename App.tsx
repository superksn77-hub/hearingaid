import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { HomeScreen } from './src/screens/HomeScreen';
import { CalibrationScreen } from './src/screens/CalibrationScreen';
import { TestScreen } from './src/screens/TestScreen';
import { ResultScreen } from './src/screens/ResultScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'HICOG 청력검사', headerStyle: { backgroundColor: '#1a237e' }, headerTintColor: 'white' }}
        />
        <Stack.Screen
          name="Calibration"
          component={CalibrationScreen}
          options={{ title: '볼륨 설정', headerStyle: { backgroundColor: '#1a237e' }, headerTintColor: 'white' }}
        />
        <Stack.Screen
          name="Test"
          component={TestScreen}
          options={{ title: '검사 진행 중', headerStyle: { backgroundColor: '#0d1b2a' }, headerTintColor: 'white', headerBackVisible: false }}
        />
        <Stack.Screen
          name="Result"
          component={ResultScreen}
          options={{ title: '검사 결과', headerStyle: { backgroundColor: '#1a237e' }, headerTintColor: 'white', headerBackVisible: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
