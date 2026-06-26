import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext();

export const LIGHT_THEME = {
  dark: false,
  bg: '#F7F8FC',
  card: '#FFFFFF',
  cardBorder: '#E8EBF5',
  text: '#1A1D2E',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  primary: '#5B8DEF',
  primaryLight: '#EEF3FD',
  success: '#4DB887',
  successLight: '#E8F7F0',
  warning: '#F5A623',
  warningLight: '#FEF3E2',
  danger: '#E85D5D',
  dangerLight: '#FDEAEA',
  accent: '#A78BFA',
  accentLight: '#F3F0FF',
  navBg: '#FFFFFF',
  navBorder: '#E8EBF5',
  navActive: '#5B8DEF',
  navInactive: '#9CA3AF',
  statusBar: 'dark',
  chartBg: '#FFFFFF',
  shadow: '#000000',
  chartColors: ['#7BB8F0', '#7DDBB3', '#F5C07A', '#E89797', '#B4A6F5', '#7ECAD6'],
  gradientStart: '#7BB8F0',
  gradientEnd: '#A8D8F0',
};

export const DARK_THEME = {
  dark: true,
  bg: '#0F1117',
  card: '#1A1D2E',
  cardBorder: '#252836',
  text: '#F1F3F9',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  primary: '#5B8DEF',
  primaryLight: '#1A2140',
  success: '#4DB887',
  successLight: '#0D2A1E',
  warning: '#F5A623',
  warningLight: '#2A1E0A',
  danger: '#E85D5D',
  dangerLight: '#2A0F0F',
  accent: '#A78BFA',
  accentLight: '#1E1535',
  navBg: '#1A1D2E',
  navBorder: '#252836',
  navActive: '#5B8DEF',
  navInactive: '#6B7280',
  statusBar: 'light',
  chartBg: '#1A1D2E',
  shadow: '#000000',
  chartColors: ['#7BB8F0', '#7DDBB3', '#F5C07A', '#E89797', '#B4A6F5', '#7ECAD6'],
  gradientStart: '#5B8DEF',
  gradientEnd: '#7BB8F0',
};

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('colorScheme').then((val) => {
      if (val === 'dark') setIsDark(true);
    });
  }, []);

  const toggleTheme = async () => {
    const next = !isDark;
    setIsDark(next);
    await AsyncStorage.setItem('colorScheme', next ? 'dark' : 'light');
  };

  const theme = isDark ? DARK_THEME : LIGHT_THEME;

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
