import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from './ThemeContext';

const BASE_URL = 'http://192.168.1.100:8000'; // ← Update to your PC's local IP
const POLL_MS = 2000;

// Helpers 

function formatTs(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return ts; }
}

async function apiFetch(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Sensor Description Card
function SensorInfo({ theme }) {
  return (
    <View style={[styles.infoCard, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}>
      <View style={styles.infoCardHeaderRow}>
        <MaterialCommunityIcons name="thermometer" size={20} color={theme.warning} style={{ marginRight: 8 }} />
        <Text style={[styles.infoCardTitle, { color: theme.text }]}>DHT11 Temperature & Humidity Sensor</Text>
      </View>
      <Text style={[styles.infoCardDesc, { color: theme.textSecondary }]}>
        The DHT11 is a digital sensor that measures ambient temperature (0–50 °C, ±2 °C accuracy)
        and relative humidity (20–90 %, ±5 % RH). It communicates via a single-wire protocol,
        sampling once per second. Connected to the ESP32 on <Text style={styles.mono}>GPIO 4</Text>.
      </Text>

      <View style={[styles.infoDivider, { borderColor: theme.cardBorder }]} />

      <View style={styles.infoCardHeaderRow}>
        <MaterialCommunityIcons name="fan" size={20} color={theme.success} style={{ marginRight: 8 }} />
        <Text style={[styles.infoCardTitle, { color: theme.text }]}>5 V DC Fan — Single-Channel Relay (GPIO 5)</Text>
      </View>
      <Text style={[styles.infoCardDesc, { color: theme.textSecondary }]}>
        A single-channel relay switches the 5 V DC fan circuit. The relay is{' '}
        <Text style={{ fontWeight: '700' }}>active LOW</Text> — the ESP32 drives the pin LOW to energise
        the coil and close the circuit (fan ON).
      </Text>
      <View style={[styles.logicBox, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.logicTitle, { color: theme.primary }]}>Automatic Logic</Text>
        <View style={styles.logicRow}>
          <Ionicons name="arrow-forward-outline" size={14} color={theme.success} style={{ marginRight: 6 }} />
          <Text style={[styles.logicText, { color: theme.text }]}>
            Temperature ≥ 30 °C → Fan <Text style={{ color: theme.success, fontWeight: '700' }}>ON</Text>
          </Text>
        </View>
        <View style={styles.logicRow}>
          <Ionicons name="arrow-forward-outline" size={14} color={theme.danger} style={{ marginRight: 6 }} />
          <Text style={[styles.logicText, { color: theme.text }]}>
            Temperature {'<'} 30 °C → Fan <Text style={{ color: theme.danger, fontWeight: '700' }}>OFF</Text>
          </Text>
        </View>
        <View style={styles.logicRow}>
          <Ionicons name="hand-left-outline" size={14} color={theme.warning} style={{ marginRight: 6 }} />
          <Text style={[styles.logicText, { color: theme.text }]}>
            Manual mode overrides automatic until "Automatic" is pressed again
          </Text>
        </View>
      </View>
    </View>
  );
}

// Vertical Thermometer Gauge
function TempGauge({ value, theme }) {
  const clamp = Math.min(Math.max(value || 0, 0), 60);
  const pct = clamp / 60;
  const color = clamp >= 35 ? theme.danger : clamp >= 30 ? theme.warning : theme.primary;
  return (
    <View style={styles.gaugeWrapper}>
      <View style={[styles.gaugeTrack, { backgroundColor: theme.cardBorder }]}>
        <View style={[styles.gaugeFill, { height: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
      <MaterialCommunityIcons name="thermometer" size={28} color={color} style={{ marginTop: 8 }} />
    </View>
  );
}

// Fan Control Panel
function FanControl({ mode, state, onAuto, onManualOn, onManualOff, theme }) {
  const isOn = state === 'on';
  const isAuto = mode === 'automatic';
  return (
    <View style={[styles.controlPanel, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      {/* Header */}
      <View style={styles.controlPanelHeader}>
        <View style={styles.controlPanelTitleRow}>
          <MaterialCommunityIcons name="fan" size={20} color={theme.primary} style={{ marginRight: 8 }} />
          <Text style={[styles.controlPanelTitle, { color: theme.text }]}>5 V DC Fan Control</Text>
        </View>
        <View style={[styles.modeBadge, { backgroundColor: isAuto ? theme.successLight : theme.warningLight }]}>
          <Text style={[styles.modeBadgeText, { color: isAuto ? theme.success : theme.warning }]}>
            {isAuto ? 'AUTOMATIC' : 'MANUAL'}
          </Text>
        </View>
      </View>

      {/* State pill */}
      <View style={[styles.statePill, { backgroundColor: isOn ? theme.successLight : theme.cardBorder }]}>
        <View style={[styles.stateDot, { backgroundColor: isOn ? theme.success : theme.textMuted }]} />
        <MaterialCommunityIcons
          name={isOn ? 'fan' : 'fan-off'}
          size={16}
          color={isOn ? theme.success : theme.textMuted}
          style={{ marginRight: 6 }}
        />
        <Text style={[styles.statePillText, { color: isOn ? theme.success : theme.textMuted }]}>
          {isOn ? 'Fan Running' : 'Fan Stopped'}
        </Text>
      </View>

      {/* Button row */}
      <View style={styles.btnRow}>
        {/* AUTO */}
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: isAuto ? theme.primary : theme.card, borderColor: theme.primary }]}
          onPress={onAuto}
        >
          <Ionicons name="sync-outline" size={18} color={isAuto ? '#fff' : theme.primary} />
          <Text style={[styles.primaryBtnText, { color: isAuto ? '#fff' : theme.primary }]}>Automatic</Text>
          <Text style={[styles.primaryBtnSub, { color: isAuto ? 'rgba(255,255,255,0.75)' : theme.textSecondary }]}>
            Temp ≥ 30 °C → ON
          </Text>
        </TouchableOpacity>

        {/* Manual ON */}
        <TouchableOpacity
          style={[styles.secondaryBtn, {
            backgroundColor: !isAuto && isOn ? theme.success : theme.successLight,
            borderColor: theme.success,
            opacity: isAuto ? 0.42 : 1,
          }]}
          onPress={onManualOn}
          disabled={isAuto}
        >
          <Ionicons name="power" size={18} color={!isAuto && isOn ? '#fff' : theme.success} />
          <Text style={[styles.secondaryBtnText, { color: !isAuto && isOn ? '#fff' : theme.success }]}>
            Manual ON
          </Text>
        </TouchableOpacity>

        {/* Manual OFF */}
        <TouchableOpacity
          style={[styles.secondaryBtn, {
            backgroundColor: !isAuto && !isOn ? theme.danger : theme.dangerLight,
            borderColor: theme.danger,
            opacity: isAuto ? 0.42 : 1,
          }]}
          onPress={onManualOff}
          disabled={isAuto}
        >
          <Ionicons name="power-outline" size={18} color={!isAuto && !isOn ? '#fff' : theme.danger} />
          <Text style={[styles.secondaryBtnText, { color: !isAuto && !isOn ? '#fff' : theme.danger }]}>
            Manual OFF
          </Text>
        </TouchableOpacity>
      </View>

      {isAuto && (
        <View style={styles.autoNote}>
          <Ionicons name="information-circle-outline" size={14} color={theme.textMuted} style={{ marginRight: 4 }} />
          <Text style={[styles.autoNoteText, { color: theme.textMuted }]}>
            Manual controls are disabled while in Automatic mode.
          </Text>
        </View>
      )}
    </View>
  );
}

// Main Screen
export default function TemperatureScreen() {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const chartWidth = isWide ? (width - 80) / 2 - 20 : width - 48;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tempLatest, setTempLatest] = useState(null);
  const [fanLatest, setFanLatest] = useState(null);
  const [tempHistory, setTempHistory] = useState([]);
  const [fanHistory, setFanHistory] = useState([]);

  const fetchAll = useCallback(async () => {
    try {
      const [tl, fl, th, fh] = await Promise.allSettled([
        apiFetch('/api/temperature/latest'),
        apiFetch('/api/fan/latest'),
        apiFetch('/api/temperature/history'),
        apiFetch('/api/fan/history'),
      ]);
      if (tl.status === 'fulfilled') setTempLatest(tl.value);
      if (fl.status === 'fulfilled') setFanLatest(fl.value);
      if (th.status === 'fulfilled') setTempHistory(Array.isArray(th.value) ? [...th.value].reverse() : []);
      if (fh.status === 'fulfilled') setFanHistory(Array.isArray(fh.value) ? [...fh.value].reverse() : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(t);
  }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const controlFan = async (mode, state = 'off') => {
    try {
      const r = await apiPost('/api/fan/control', { mode, state });
      setFanLatest({ state: r.state, mode: r.mode, timestamp: new Date().toISOString() });
    } catch (e) { console.error(e); }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const temp = tempLatest?.value;
  const hum = tempLatest?.humidity;
  const fanMode = fanLatest?.mode || 'automatic';
  const fanState = fanLatest?.state || 'off';
  const tempColor = temp >= 35 ? theme.danger : temp >= 30 ? theme.warning : theme.primary;

  // Chart arrays
  const tempVals = tempHistory.map((r) => r.value || 0);
  const humVals = tempHistory.map((r) => r.humidity || 0);
  const tempLabels = tempHistory.map((r) => formatTs(r.timestamp).slice(0, 5));

  // Combined table rows
  const tableRows = tempHistory.slice(-20).map((r, i) => ({
    id: r.id || i,
    timestamp: formatTs(r.timestamp),
    temperature: r.value != null ? `${r.value.toFixed(1)} °C` : '—',
    humidity: r.humidity != null ? `${r.humidity.toFixed(1)} %` : '—',
    fanState: fanHistory[i]?.state ?? '—',
    fanMode: fanHistory[i]?.mode ?? '—',
  }));

  const tableCols = [
    { key: 'timestamp', label: 'Timestamp', width: 150 },
    { key: 'temperature', label: 'Temp (°C)', width: 100 },
    { key: 'humidity', label: 'Humidity (%)', width: 110 },
    {
      key: 'fanState', label: 'Fan State', width: 100,
      style: (v) => ({ color: v === 'on' ? theme.success : theme.danger, fontWeight: '700' }),
    },
    {
      key: 'fanMode', label: 'Fan Mode', width: 110,
      style: (v) => ({ color: v === 'automatic' ? theme.primary : theme.warning, fontWeight: '600' }),
    },
  ];

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.bg }]}
      contentContainerStyle={[styles.content, isWide && styles.contentWide]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
    >
      {/* Sensor description */}
      <SensorInfo theme={theme} />

      {/* Hero reading card */}
      <View style={[
        styles.heroCard,
        { backgroundColor: theme.card, borderColor: theme.cardBorder, borderTopColor: tempColor },
      ]}>
        <View style={styles.heroCardHeader}>
          <MaterialCommunityIcons name="thermometer" size={18} color={theme.textMuted} style={{ marginRight: 6 }} />
          <Text style={[styles.heroLabel, { color: theme.textMuted }]}>
            DHT11 — Live Reading
          </Text>
        </View>

        <View style={[styles.heroBody, isWide && styles.heroBodyWide]}>
          <TempGauge value={temp} theme={theme} />

          <View style={[styles.heroStats, isWide && { flexDirection: 'row', flexWrap: 'wrap' }]}>
            {/* Temperature */}
            <View style={[styles.statBox, { backgroundColor: tempColor + '18', flex: isWide ? 1 : undefined, minWidth: 120 }]}>
              <View style={styles.statBoxHeader}>
                <MaterialCommunityIcons name="thermometer" size={14} color={tempColor} style={{ marginRight: 4 }} />
                <Text style={[styles.statLabel, { color: tempColor }]}>Temperature</Text>
              </View>
              <Text style={[styles.statValue, { color: tempColor }]}>
                {temp != null ? `${temp.toFixed(1)} °C` : '—'}
              </Text>
            </View>

            {/* Humidity */}
            <View style={[styles.statBox, { backgroundColor: theme.accentLight, flex: isWide ? 1 : undefined, minWidth: 120 }]}>
              <View style={styles.statBoxHeader}>
                <Ionicons name="water-outline" size={14} color={theme.accent} style={{ marginRight: 4 }} />
                <Text style={[styles.statLabel, { color: theme.accent }]}>Humidity</Text>
              </View>
              <Text style={[styles.statValue, { color: theme.accent }]}>
                {hum != null ? `${hum.toFixed(1)} %` : '—'}
              </Text>
            </View>

            {/* Status */}
            <View style={[styles.statBox, { backgroundColor: temp >= 30 ? theme.dangerLight : theme.successLight, flex: isWide ? 1 : undefined, minWidth: 120 }]}>
              <View style={styles.statBoxHeader}>
                <Ionicons
                  name={temp >= 35 ? 'flame-outline' : temp >= 30 ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                  size={14}
                  color={temp >= 30 ? theme.danger : theme.success}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.statLabel, { color: temp >= 30 ? theme.danger : theme.success }]}>Status</Text>
              </View>
              <Text style={[styles.statValue, { color: temp >= 30 ? theme.danger : theme.success, fontSize: 15 }]}>
                {temp >= 35 ? 'Very Hot' : temp >= 30 ? 'Hot — Fan ON' : 'Normal'}
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.heroTs, { color: theme.textMuted }]}>
          Last updated: {formatTs(tempLatest?.timestamp)}
        </Text>
      </View>

      {/* Actuator control */}
      <View style={styles.sectionHeaderRow}>
        <MaterialCommunityIcons name="fan" size={18} color={theme.primary} style={{ marginRight: 6 }} />
        <Text style={[styles.sectionHeader, { color: theme.text }]}>Fan Actuator Control</Text>
      </View>
      <FanControl
        mode={fanMode}
        state={fanState}
        onAuto={() => controlFan('automatic')}
        onManualOn={() => controlFan('manual', 'on')}
        onManualOff={() => controlFan('manual', 'off')}
        theme={theme}
      />

      {/* Charts */}
      <View style={styles.sectionHeaderRow}>
        <Ionicons name="bar-chart-outline" size={18} color={theme.primary} style={{ marginRight: 6 }} />
        <Text style={[styles.sectionHeader, { color: theme.text }]}>Temperature Trends</Text>
      </View>

      <View style={[styles.chartRow, isWide && styles.chartRowWide]}>
        {tempVals.length > 0 ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Temperature Over Time</Text>
            <LineChart
              data={{
                labels: tempLabels.slice(-10),
                datasets: [{ data: tempVals.slice(-10), color: () => theme.warning, strokeWidth: 2 }],
              }}
              width={chartWidth}
              height={210}
              yAxisSuffix="°C"
              chartConfig={{
                backgroundGradientFrom: theme.chartBg,
                backgroundGradientTo: theme.chartBg,
                decimalPlaces: 1,
                color: () => theme.warning,
                labelColor: () => theme.textSecondary,
                propsForDots: { r: '4', strokeWidth: '2', stroke: theme.warning },
                propsForBackgroundLines: { stroke: theme.cardBorder },
              }}
              bezier
              style={{ borderRadius: 12 }}
              withShadow={false}
            />
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Temperature Over Time</Text>
            <View style={styles.emptyState}>
              <Ionicons name="bar-chart-outline" size={32} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>No data yet</Text>
            </View>
          </View>
        )}

        {humVals.length > 0 ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Humidity Over Time</Text>
            <LineChart
              data={{
                labels: tempLabels.slice(-10),
                datasets: [{ data: humVals.slice(-10), color: () => theme.accent, strokeWidth: 2 }],
              }}
              width={chartWidth}
              height={210}
              yAxisSuffix="%"
              chartConfig={{
                backgroundGradientFrom: theme.chartBg,
                backgroundGradientTo: theme.chartBg,
                decimalPlaces: 1,
                color: () => theme.accent,
                labelColor: () => theme.textSecondary,
                propsForDots: { r: '4', strokeWidth: '2', stroke: theme.accent },
                propsForBackgroundLines: { stroke: theme.cardBorder },
              }}
              bezier
              style={{ borderRadius: 12 }}
              withShadow={false}
            />
          </View>
        ) : null}
      </View>

      {/* Data table */}
      <View style={styles.sectionHeaderRow}>
        <Ionicons name="server-outline" size={18} color={theme.primary} style={{ marginRight: 6 }} />
        <Text style={[styles.sectionHeader, { color: theme.text }]}>Data Records</Text>
      </View>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <View style={styles.tableTitleRow}>
          <Ionicons name="list-outline" size={16} color={theme.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.cardTitle, { color: theme.text }]}>Temperature & Fan Log</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={[styles.tableRow, { backgroundColor: theme.primaryLight }]}>
              {tableCols.map((c) => (
                <View key={c.key} style={[styles.tableCell, { width: c.width }]}>
                  <Text style={[styles.tableHeaderText, { color: theme.primary }]}>{c.label}</Text>
                </View>
              ))}
            </View>
            {tableRows.length === 0 ? (
              <View style={styles.tableRow}>
                <Text style={[styles.emptyText, { color: theme.textMuted, paddingHorizontal: 12 }]}>No records yet</Text>
              </View>
            ) : tableRows.map((row, i) => (
              <View key={row.id} style={[styles.tableRow, { backgroundColor: i % 2 === 0 ? theme.bg : theme.card }]}>
                {tableCols.map((c) => (
                  <View key={c.key} style={[styles.tableCell, { width: c.width }]}>
                    <Text style={[styles.tableCellText, { color: theme.text }, c.style?.(row[c.key])]}>
                      {row[c.key]}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingTop: 8 },
  contentWide: { paddingHorizontal: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Info card
  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  infoCardHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  infoCardTitle: { fontSize: 14, fontWeight: '700', flex: 1, flexWrap: 'wrap' },
  infoCardDesc: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  infoDivider: { borderTopWidth: 1, marginVertical: 12 },
  logicBox: { borderRadius: 10, borderWidth: 1, padding: 12, marginTop: 10 },
  logicTitle: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  logicRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  logicText: { fontSize: 12, lineHeight: 18, flex: 1 },
  mono: { fontFamily: 'monospace', fontWeight: '600' },

  // Hero card
  heroCard: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderTopWidth: 5,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  heroCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  heroLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  heroBody: { flexDirection: 'column', gap: 16, marginBottom: 10 },
  heroBodyWide: { flexDirection: 'row', alignItems: 'center' },
  heroStats: { flex: 1, gap: 10 },
  heroTs: { fontSize: 11, textAlign: 'right', marginTop: 6 },

  // Gauge
  gaugeWrapper: { alignItems: 'center' },
  gaugeTrack: {
    width: 18,
    height: 140,
    borderRadius: 9,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  gaugeFill: { width: '100%', borderRadius: 9 },

  // Stat boxes
  statBox: { borderRadius: 12, padding: 12, marginBottom: 4 },
  statBoxHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  statLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  statValue: { fontSize: 22, fontWeight: '800' },

  // Section headers
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 10 },
  sectionHeader: { fontSize: 16, fontWeight: '700' },

  // Fan control
  controlPanel: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  controlPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  controlPanelTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  controlPanelTitle: { fontSize: 15, fontWeight: '700' },
  modeBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  modeBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  statePill: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 10, marginBottom: 14 },
  stateDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statePillText: { fontSize: 13, fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    flex: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 2,
    gap: 4,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700' },
  primaryBtnSub: { fontSize: 11 },
  secondaryBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 2,
    gap: 4,
  },
  secondaryBtnText: { fontSize: 12, fontWeight: '700' },
  autoNote: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  autoNoteText: { fontSize: 11, flex: 1 },

  // Charts
  chartRow: { flexDirection: 'column', gap: 12, marginBottom: 4 },
  chartRowWide: { flexDirection: 'row', flexWrap: 'wrap' },

  // Cards
  card: {
    flex: 1,
    minWidth: 240,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 13 },

  // Table
  tableTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  tableRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1 },
  tableCell: { paddingHorizontal: 10, justifyContent: 'center' },
  tableHeaderText: { fontSize: 11, fontWeight: '700' },
  tableCellText: { fontSize: 11 },
});
