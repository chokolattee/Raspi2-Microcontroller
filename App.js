import React, { useState, useRef, useEffect } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  Platform,
  useWindowDimensions,
  Animated,
  Pressable,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { ThemeProvider, useTheme } from './Screens/ThemeContext';
import Dashboard         from './Screens/Dashboard';
import TemperatureScreen from './Screens/TemperatureScreen';
import UVScreen          from './Screens/UVScreen';

const Tab = createBottomTabNavigator();

// Tab icon map using Ionicons names
const TAB_ICON_MAP = {
  Dashboard:   { focused: 'grid',        outline: 'grid-outline'        },
  Temperature: { focused: 'thermometer', outline: 'thermometer-outline' },
  'UV Light':  { focused: 'sunny',       outline: 'sunny-outline'       },
};

const TABS = [
  { name: 'Dashboard',   label: 'Dashboard',   icon: 'grid-outline',        iconFocused: 'grid'        },
  { name: 'Temperature', label: 'Temperature', icon: 'thermometer-outline', iconFocused: 'thermometer' },
  { name: 'UV Light',    label: 'UV Light',    icon: 'sunny-outline',       iconFocused: 'sunny'       },
];

// ─── Dark-mode toggle ────────────────────────────────────────────────────────
function ThemeToggle() {
  const { isDark, toggleTheme, theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={toggleTheme}
      style={[styles.themeBtn, { backgroundColor: isDark ? '#2A2D3E' : '#EEF3FD' }]}
      accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <Ionicons
        name={isDark ? 'sunny-outline' : 'moon-outline'}
        size={20}
        color={isDark ? '#F5A623' : '#5B8DEF'}
      />
    </TouchableOpacity>
  );
}

// ─── Web Hamburger Drawer ────────────────────────────────────────────────────
function WebDrawer({ isOpen, onClose, currentRoute, onNavigate, theme }) {
  const slideAnim = useRef(new Animated.Value(-260)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue:         isOpen ? 0 : -260,
        useNativeDriver: true,
        tension:         80,
        friction:        12,
      }),
      Animated.timing(fadeAnim, {
        toValue:         isOpen ? 1 : 0,
        duration:        200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <Animated.View
          style={[styles.backdrop, { opacity: fadeAnim }]}
          pointerEvents={isOpen ? 'auto' : 'none'}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
      )}

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: theme.navBg,
            borderRightColor: theme.navBorder,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        {/* Drawer header */}
        <View style={[styles.drawerHeader, { borderBottomColor: theme.navBorder }]}>
          <View style={styles.drawerLogo}>
            <Ionicons name="leaf" size={22} color={theme.primary} />
            <Text style={[styles.drawerTitle, { color: theme.text }]}>Calungsod</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.drawerClose} accessibilityLabel="Close menu">
            <Ionicons name="close" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Nav items */}
        <View style={styles.drawerNav}>
          {TABS.map((tab) => {
            const active = currentRoute === tab.name;
            return (
              <TouchableOpacity
                key={tab.name}
                onPress={() => { onNavigate(tab.name); onClose(); }}
                style={[
                  styles.drawerItem,
                  active && { backgroundColor: theme.primaryLight },
                ]}
                accessibilityLabel={`Navigate to ${tab.label}`}
              >
                <Ionicons
                  name={active ? tab.iconFocused : tab.icon}
                  size={20}
                  color={active ? theme.navActive : theme.navInactive}
                  style={styles.drawerItemIcon}
                />
                <Text
                  style={[
                    styles.drawerItemLabel,
                    { color: active ? theme.navActive : theme.navInactive },
                    active && { fontWeight: '700' },
                  ]}
                >
                  {tab.label}
                </Text>
                {active && (
                  <View style={[styles.drawerActiveDot, { backgroundColor: theme.navActive }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Footer */}
        <View style={[styles.drawerFooter, { borderTopColor: theme.navBorder }]}>
          <Text style={[styles.drawerFooterText, { color: theme.textMuted }]}>
            Micro-Demo v1.0
          </Text>
        </View>
      </Animated.View>
    </>
  );
}

// ─── Main navigator ──────────────────────────────────────────────────────────
function AppNavigator() {
  const { theme }      = useTheme();
  const { width }      = useWindowDimensions();
  const isWeb          = Platform.OS === 'web';
  const isWide         = isWeb && width >= 768;

  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [currentRoute, setCurrentRoute] = useState('Dashboard');
  const navRef = useRef(null);

  // Hamburger button shown in header (web wide only)
  const HamburgerBtn = () => (
    <TouchableOpacity
      onPress={() => setDrawerOpen(true)}
      style={[styles.hamburgerBtn, { backgroundColor: theme.primaryLight }]}
      accessibilityLabel="Open navigation menu"
    >
      <Ionicons name="menu" size={22} color={theme.primary} />
    </TouchableOpacity>
  );

  return (
    <>
      <StatusBar style={theme.statusBar} />
      <NavigationContainer
        ref={navRef}
        onStateChange={(state) => {
          if (!state) return;
          const route = state.routes[state.index];
          setCurrentRoute(route.name);
        }}
      >
        <Tab.Navigator
          screenOptions={({ route }) => ({
            tabBarIcon: ({ focused, color, size }) => {
              const icons = TAB_ICON_MAP[route.name];
              const name  = focused ? icons.focused : icons.outline;
              return <Ionicons name={name} size={size ?? 24} color={color} />;
            },
            tabBarActiveTintColor:   theme.navActive,
            tabBarInactiveTintColor: theme.navInactive,
            tabBarLabelStyle: {
              fontSize:   11,
              fontWeight: '600',
              marginTop:  2,
            },
            // On web wide screens hide the bottom tab bar completely
            tabBarStyle: isWide
              ? { display: 'none' }
              : {
                  backgroundColor: theme.navBg,
                  borderTopColor:  theme.navBorder,
                  borderTopWidth:  1,
                  height:          Platform.OS === 'ios' ? 85 : 62,
                  paddingBottom:   Platform.OS === 'ios' ? 28 : 8,
                  paddingTop:      6,
                },
            headerStyle: {
              backgroundColor:    theme.card,
              borderBottomColor:  theme.cardBorder,
              borderBottomWidth:  1,
              elevation:          0,
              shadowOpacity:      0,
            },
            headerTintColor:  theme.text,
            headerTitleStyle: {
              fontWeight: '700',
              fontSize:   17,
              color:      theme.text,
            },
            // On web wide: show hamburger on left + theme toggle on right
            // On mobile/narrow: only show theme toggle
            headerLeft:  isWide ? () => <HamburgerBtn /> : undefined,
            headerRight: () => <ThemeToggle />,
          })}
        >
          <Tab.Screen name="Dashboard"   component={Dashboard}         options={{ title: 'Dashboard'   }} />
          <Tab.Screen name="Temperature" component={TemperatureScreen} options={{ title: 'Temperature' }} />
          <Tab.Screen name="UV Light"    component={UVScreen}          options={{ title: 'UV Light'    }} />
        </Tab.Navigator>
      </NavigationContainer>

      {/* Web hamburger drawer — rendered above NavigationContainer */}
      {isWide && (
        <WebDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          currentRoute={currentRoute}
          onNavigate={(name) => {
            navRef.current?.navigate(name);
            setCurrentRoute(name);
          }}
          theme={theme}
        />
      )}
    </>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
      <AppNavigator />
    </ThemeProvider>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  themeBtn: {
    width:          40,
    height:         40,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
    marginRight:    12,
  },
  hamburgerBtn: {
    width:          40,
    height:         40,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
    marginLeft:     12,
  },

  // Backdrop
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex:          999,
  },

  // Drawer panel
  drawer: {
    position:        'absolute',
    top:             0,
    left:            0,
    bottom:          0,
    width:           260,
    zIndex:          1000,
    borderRightWidth: 1,
    shadowColor:     '#000',
    shadowOffset:    { width: 4, height: 0 },
    shadowOpacity:   0.18,
    shadowRadius:    12,
    elevation:       20,
  },
  drawerHeader: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: 20,
    paddingVertical:   18,
    borderBottomWidth: 1,
  },
  drawerLogo: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  drawerTitle: {
    fontSize:   18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  drawerClose: {
    width:          32,
    height:         32,
    borderRadius:   8,
    alignItems:     'center',
    justifyContent: 'center',
  },
  drawerNav: {
    flex:            1,
    paddingTop:      12,
    paddingHorizontal: 12,
    gap:             4,
  },
  drawerItem: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius:   12,
    marginBottom:   2,
  },
  drawerItemIcon: {
    marginRight: 12,
  },
  drawerItemLabel: {
    flex:       1,
    fontSize:   15,
    fontWeight: '500',
  },
  drawerActiveDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  drawerFooter: {
    paddingHorizontal: 20,
    paddingVertical:   16,
    borderTopWidth:    1,
  },
  drawerFooterText: {
    fontSize: 12,
  },
});
