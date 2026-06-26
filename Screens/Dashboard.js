import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from './ThemeContext';

const BASE_URL = 'http://192.168.0.102:8000'; // Windows machine running Flask
const LIVE_MS = 3000;   // poll /api/sensors/live
const HISTORY_MS = 10000;  // poll DB history for tables
const MAX_LIVE_PTS = 20;    // max rolling graph points

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

// Info Banner
function InfoBanner({ theme }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <View style={[styles.infoBanner, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}>
      <TouchableOpacity
        style={styles.infoBannerHeader}
        onPress={() => setCollapsed(!collapsed)}
        activeOpacity={0.7}
      >
        <View style={styles.infoBannerTitleRow}>
          <Ionicons name="information-circle-outline" size={18} color={theme.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.infoBannerTitle, { color: theme.primary }]}>
            System Overview
          </Text>
        </View>
        <Ionicons
          name={collapsed ? 'chevron-down-outline' : 'chevron-up-outline'}
          size={16}
          color={theme.primary}
        />
      </TouchableOpacity>

      {!collapsed && (
        <View style={styles.infoBannerBody}>
          <Text style={[styles.infoBannerText, { color: theme.text }]}>
            This dashboard monitors an ESP32 microcontroller connected via MQTT over Wi-Fi. Two sensors feed
            real-time data to the system:
          </Text>

          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="thermometer" size={16} color={theme.warning} style={styles.infoIcon} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, { color: theme.text }]}>DHT11 Temperature & Humidity Sensor</Text>
              <Text style={[styles.infoDesc, { color: theme.textSecondary }]}>
                Reads ambient temperature (0–50 °C) and relative humidity (20–90 %). Samples every second
                over a single-wire digital protocol.
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="weather-sunny" size={16} color={theme.accent} style={styles.infoIcon} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, { color: theme.text }]}>GUVA-S12SD UV Light Sensor</Text>
              <Text style={[styles.infoDesc, { color: theme.textSecondary }]}>
                Outputs an analog voltage (0–3.3 V) proportional to UV irradiance. The ESP32 ADC
                (0–4095 raw) converts this to a UV Index value (mV ÷ 100).
              </Text>
            </View>
          </View>

          <View style={[styles.infoDivider, { borderColor: theme.cardBorder }]} />

          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="fan" size={16} color={theme.success} style={styles.infoIcon} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, { color: theme.text }]}>5 V DC Fan — Single-Channel Relay</Text>
              <Text style={[styles.infoDesc, { color: theme.textSecondary }]}>
                <Text style={{ fontWeight: '700' }}>Automatic:</Text> Fan turns ON when temperature ≥ 30 °C to dissipate heat.{'\n'}
                <Text style={{ fontWeight: '700' }}>Manual:</Text> Override with ON / OFF buttons; commands sent via MQTT to{' '}
                <Text style={{ fontFamily: 'monospace' }}>esp32/fan/cmd</Text>.
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="notifications-outline" size={16} color={theme.danger} style={styles.infoIcon} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, { color: theme.text }]}>Active Buzzer</Text>
              <Text style={[styles.infoDesc, { color: theme.textSecondary }]}>
                <Text style={{ fontWeight: '700' }}>Automatic:</Text> Buzzer sounds when UV Index ≥ 3 (Moderate) to alert users of harmful UV exposure.{'\n'}
                <Text style={{ fontWeight: '700' }}>Manual:</Text> Override with ON / OFF buttons; commands sent via MQTT to{' '}
                <Text style={{ fontFamily: 'monospace' }}>esp32/buzzer/cmd</Text>.
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// Sensor Card
function SensorCard({ label, iconName, iconLib, value, unit, subLabel, subValue, color, theme, flex }) {
  const Icon = iconLib === 'mci' ? MaterialCommunityIcons : Ionicons;
  return (
    <View style={[
      styles.card,
      { borderLeftWidth: 4, borderLeftColor: color, backgroundColor: theme.card, borderColor: theme.cardBorder, flex: flex ?? 1 },
    ]}>
      <View style={styles.cardHeaderRow}>
        <Icon name={iconName} size={18} color={color} style={{ marginRight: 6 }} />
        <Text style={[styles.cardLabel, { color: theme.textMuted }]}>{label}</Text>
      </View>
      <View style={styles.cardValueRow}>
        <Text style={[styles.cardValue, { color }]}>{value ?? '—'}</Text>
        {unit ? <Text style={[styles.cardUnit, { color: theme.textSecondary }]}>{unit}</Text> : null}
      </View>
      {subLabel ? (
        <Text style={[styles.cardSub, { color: theme.textMuted }]}>
          {subLabel}:{' '}
          <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>{subValue ?? '—'}</Text>
        </Text>
      ) : null}
    </View>
  );
}

// Actuator Control Card 
function ActuatorControl({ label, iconName, iconLib, mode, state, onManualOn, onManualOff, onAuto, theme, flex }) {
  const Icon = iconLib === 'mci' ? MaterialCommunityIcons : Ionicons;
  const isOn = state === 'on';
  const isAuto = mode === 'automatic';
  return (
    <View style={[
      styles.actuatorCard,
      { backgroundColor: theme.card, borderColor: theme.cardBorder, flex: flex ?? 1 },
    ]}>
      {/* Header */}
      <View style={styles.actuatorHeader}>
        <View style={styles.actuatorTitleRow}>
          <Icon name={iconName} size={18} color={theme.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.actuatorLabel, { color: theme.text }]}>{label}</Text>
        </View>
        <View style={[
          styles.modeBadge,
          { backgroundColor: isAuto ? theme.successLight : theme.warningLight },
        ]}>
          <Text style={[styles.modeBadgeText, { color: isAuto ? theme.success : theme.warning }]}>
            {isAuto ? 'AUTO' : 'MANUAL'}
          </Text>
        </View>
      </View>

      {/* State indicator */}
      <View style={[styles.stateIndicator, { backgroundColor: isOn ? theme.successLight : theme.cardBorder }]}>
        <View style={[styles.stateCircle, { backgroundColor: isOn ? theme.success : theme.textMuted }]} />
        <Text style={[styles.stateText, { color: isOn ? theme.success : theme.textMuted }]}>
          {isOn ? 'ACTIVE' : 'INACTIVE'}
        </Text>
      </View>

      {/* Buttons */}
      <View style={styles.actuatorBtns}>
        <TouchableOpacity
          style={[styles.ctrlBtn, {
            backgroundColor: isAuto ? theme.primary : theme.primaryLight,
            borderColor: theme.primary,
          }]}
          onPress={onAuto}
        >
          <Ionicons name="sync-outline" size={14} color={isAuto ? '#fff' : theme.primary} style={{ marginBottom: 2 }} />
          <Text style={[styles.ctrlBtnText, { color: isAuto ? '#fff' : theme.primary }]}>AUTO</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ctrlBtn, {
            backgroundColor: !isAuto && isOn ? theme.success : theme.successLight,
            borderColor: theme.success,
            opacity: isAuto ? 0.4 : 1,
          }]}
          onPress={onManualOn}
          disabled={isAuto}
        >
          <Ionicons name="power" size={14} color={!isAuto && isOn ? '#fff' : theme.success} style={{ marginBottom: 2 }} />
          <Text style={[styles.ctrlBtnText, { color: !isAuto && isOn ? '#fff' : theme.success }]}>ON</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ctrlBtn, {
            backgroundColor: !isAuto && !isOn ? theme.danger : theme.dangerLight,
            borderColor: theme.danger,
            opacity: isAuto ? 0.4 : 1,
          }]}
          onPress={onManualOff}
          disabled={isAuto}
        >
          <Ionicons name="power-outline" size={14} color={!isAuto && !isOn ? '#fff' : theme.danger} style={{ marginBottom: 2 }} />
          <Text style={[styles.ctrlBtnText, { color: !isAuto && !isOn ? '#fff' : theme.danger }]}>OFF</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Sensor Chart
function SensorChart({ title, data, labels, color, unit, theme, chartWidth }) {
  if (!data || data.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        <View style={styles.emptyState}>
          <Ionicons name="bar-chart-outline" size={32} color={theme.textMuted} />
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>No data available yet</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <LineChart
        data={{
          labels: labels.slice(-10),
          datasets: [{ data: data.slice(-10), color: () => color, strokeWidth: 2 }],
        }}
        width={chartWidth}
        height={220}
        yAxisSuffix={unit}
        chartConfig={{
          backgroundGradientFrom: theme.chartBg,
          backgroundGradientTo: theme.chartBg,
          decimalPlaces: 1,
          color: () => color,
          labelColor: () => theme.textSecondary,
          propsForDots: { r: '4', strokeWidth: '2', stroke: color },
          propsForBackgroundLines: { stroke: theme.cardBorder },
        }}
        bezier
        style={{ borderRadius: 12 }}
        withShadow={false}
      />
    </View>
  );
}

// Data Table
function DataTable({ title, iconName, columns, rows, theme }) {
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <View style={styles.tableTitleRow}>
        <Ionicons name={iconName || 'list-outline'} size={16} color={theme.primary} style={{ marginRight: 6 }} />
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[styles.tableRow, { backgroundColor: theme.primaryLight }]}>
            {columns.map((col) => (
              <View key={col.key} style={[styles.tableCell, { width: col.width || 120 }]}>
                <Text style={[styles.tableHeaderText, { color: theme.primary }]}>{col.label}</Text>
              </View>
            ))}
          </View>
          {rows.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.emptyText, { color: theme.textMuted, paddingHorizontal: 12 }]}>No records yet</Text>
            </View>
          ) : rows.map((row, i) => (
            <View
              key={row.id || i}
              style={[styles.tableRow, { backgroundColor: i % 2 === 0 ? theme.bg : theme.card }]}
            >
              {columns.map((col) => (
                <View key={col.key} style={[styles.tableCell, { width: col.width || 120 }]}>
                  <Text style={[styles.tableCellText, { color: theme.text }, col.style?.(row[col.key])]}>
                    {row[col.key] ?? '—'}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// Main Screen ───────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const isVeryWide = width >= 1100;
  const chartWidth = isWide
    ? (isVeryWide ? (width - 320) / 2 - 32 : (width - 80) / 2 - 20)
    : width - 48;

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Live state (from /api/sensors/live — in-memory MQTT snapshot)
  const [liveState, setLiveState] = useState(null);

  // Rolling graph data (accumulated from live polling)
  const [liveTemp, setLiveTemp] = useState([]);
  const [liveTempLbl, setLiveTempLbl] = useState([]);
  const [liveUV, setLiveUV] = useState([]);
  const [liveUVLbl, setLiveUVLbl] = useState([]);

  // DB history (for data tables only)
  const [tempHistory, setTempHistory] = useState([]);
  const [uvHistory, setUvHistory] = useState([]);
  const [fanHistory, setFanHistory] = useState([]);
  const [buzzerHistory, setBuzzerHistory] = useState([]);

  // Poll /api/sensors/live at LIVE_MS — drives cards, actuator badges, rolling graph
  const fetchLive = useCallback(async () => {
    try {
      const data = await apiFetch('/api/sensors/live');
      setLiveState(data);
      if (data.last_updated) {
        const label = formatTs(data.last_updated).slice(0, 5);
        if (data.temperature != null) {
          setLiveTemp((prev) => {
            const next = [...prev, data.temperature];
            return next.slice(-MAX_LIVE_PTS);
          });
          setLiveTempLbl((prev) => {
            const next = [...prev, label];
            return next.slice(-MAX_LIVE_PTS);
          });
        }
        if (data.uv_index != null) {
          setLiveUV((prev) => {
            const next = [...prev, data.uv_index];
            return next.slice(-MAX_LIVE_PTS);
          });
          setLiveUVLbl((prev) => {
            const next = [...prev, label];
            return next.slice(-MAX_LIVE_PTS);
          });
        }
      }
    } catch (e) {
      console.error('fetchLive error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll DB history at HISTORY_MS — drives data tables only
  const fetchHistory = useCallback(async () => {
    try {
      const [th, uh, fh, bh] = await Promise.allSettled([
        apiFetch('/api/temperature/history'),
        apiFetch('/api/uv/history'),
        apiFetch('/api/fan/history'),
        apiFetch('/api/buzzer/history'),
      ]);
      if (th.status === 'fulfilled') setTempHistory(Array.isArray(th.value) ? [...th.value].reverse() : []);
      if (uh.status === 'fulfilled') setUvHistory(Array.isArray(uh.value) ? [...uh.value].reverse() : []);
      if (fh.status === 'fulfilled') setFanHistory(Array.isArray(fh.value) ? [...fh.value].reverse() : []);
      if (bh.status === 'fulfilled') setBuzzerHistory(Array.isArray(bh.value) ? [...bh.value].reverse() : []);
    } catch (e) {
      console.error('fetchHistory error', e);
    }
  }, []);

  useEffect(() => {
    fetchLive();
    fetchHistory();
    const liveTimer = setInterval(fetchLive, LIVE_MS);
    const historyTimer = setInterval(fetchHistory, HISTORY_MS);
    return () => { clearInterval(liveTimer); clearInterval(historyTimer); };
  }, [fetchLive, fetchHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([fetchLive(), fetchHistory()]);
    setRefreshing(false);
  }, [fetchLive, fetchHistory]);

  const controlFan = async (mode, state = 'off') => {
    try {
      const r = await apiPost('/api/fan/control', { mode, state });
      // Optimistically update liveState so the badge flips instantly
      setLiveState((prev) => prev
        ? { ...prev, fan: state === 'on', fan_auto: mode === 'automatic' }
        : prev);
      // Refresh history table
      fetchHistory();
    } catch (e) { console.error('Fan error', e); }
  };

  const controlBuzzer = async (mode, state = 'off') => {
    try {
      const r = await apiPost('/api/buzzer/control', { mode, state });
      setLiveState((prev) => prev
        ? { ...prev, buzzer: state === 'on', buzzer_auto: mode === 'automatic' }
        : prev);
      fetchHistory();
    } catch (e) { console.error('Buzzer error', e); }
  };

  // Chart data — rolling live points
  const tempVals = liveTemp.length > 0 ? liveTemp : tempHistory.slice(-MAX_LIVE_PTS).map((r) => r.value || 0);
  const tempLabels = liveTempLbl.length > 0 ? liveTempLbl : tempHistory.slice(-MAX_LIVE_PTS).map((r) => formatTs(r.timestamp).slice(0, 5));
  const uvVals = liveUV.length > 0 ? liveUV : uvHistory.slice(-MAX_LIVE_PTS).map((r) => r.uv_index || 0);
  const uvLabels = liveUVLbl.length > 0 ? liveUVLbl : uvHistory.slice(-MAX_LIVE_PTS).map((r) => formatTs(r.timestamp).slice(0, 5));

  // Table definitions
  const tempCols = [
    { key: 'timestamp', label: 'Timestamp', width: 160 },
    { key: 'value', label: 'Temp (°C)', width: 100 },
    { key: 'humidity', label: 'Humidity (%)', width: 110 },
  ];
  const uvCols = [
    { key: 'timestamp', label: 'Timestamp', width: 160 },
    { key: 'value', label: 'Raw ADC', width: 100 },
    { key: 'uv_index', label: 'UV Index', width: 100 },
  ];
  const actuatorCols = [
    { key: 'timestamp', label: 'Timestamp', width: 160 },
    {
      key: 'state', label: 'State', width: 90,
      style: (v) => ({ color: v === 'on' ? theme.success : theme.danger, fontWeight: '700' }),
    },
    {
      key: 'mode', label: 'Mode', width: 110,
      style: (v) => ({ color: v === 'automatic' ? theme.primary : theme.warning, fontWeight: '600' }),
    },
  ];

  const tempTableRows = tempHistory.slice(-20).map((r) => ({ ...r, timestamp: formatTs(r.timestamp) }));
  const uvTableRows = uvHistory.slice(-20).map((r) => ({ ...r, timestamp: formatTs(r.timestamp) }));
  const fanTableRows = fanHistory.slice(-20).map((r) => ({ ...r, timestamp: formatTs(r.timestamp) }));
  const buzzerTableRows = buzzerHistory.slice(-20).map((r) => ({ ...r, timestamp: formatTs(r.timestamp) }));

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.emptyText, { color: theme.textMuted, marginTop: 12 }]}>
          Connecting to backend…
        </Text>
      </View>
    );
  }

  // Actuator state driven from live MQTT snapshot
  const fanMode = liveState?.fan_auto === false ? 'manual' : 'automatic';
  const fanState = liveState?.fan ? 'on' : 'off';
  const buzzerMode = liveState?.buzzer_auto === false ? 'manual' : 'automatic';
  const buzzerState = liveState?.buzzer ? 'on' : 'off';
  const mqttOk = liveState?.connected === true;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.bg }]}
      contentContainerStyle={[styles.content, isWide && styles.contentWide]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
    >
      {/* Connection status banner */}
      <View style={[
        styles.statusBar,
        { backgroundColor: mqttOk ? theme.successLight : theme.dangerLight },
      ]}>
        <Ionicons
          name={mqttOk ? 'hardware-chip-outline' : 'warning-outline'}
          size={16}
          color={mqttOk ? theme.success : theme.danger}
          style={{ marginRight: 8 }}
        />
        <Text style={[styles.statusText, { color: mqttOk ? theme.success : theme.danger }]}>
          ESP32 {mqttOk ? 'Connected via MQTT' : 'Disconnected — check MQTT broker'}
          {liveState?.last_updated ? `  ·  Last: ${formatTs(liveState.last_updated)}` : ''}
        </Text>
      </View>

      {/* System info / description */}
      <InfoBanner theme={theme} />

      {/* ── Live Sensor Readings ────────────────────────────────── */}
      <View style={styles.sectionHeaderRow}>
        <Ionicons name="pulse-outline" size={18} color={theme.primary} style={{ marginRight: 6 }} />
        <Text style={[styles.sectionHeader, { color: theme.text }]}>Live Sensor Readings</Text>
      </View>
      <View style={[styles.row, isWide && styles.rowWide]}>
        <SensorCard
          label="Temperature"
          iconName="thermometer-outline"
          value={liveState?.temperature != null ? liveState.temperature.toFixed(1) : '—'}
          unit="°C"
          subLabel="Humidity"
          subValue={liveState?.humidity != null ? `${liveState.humidity.toFixed(1)} %` : null}
          color={theme.warning}
          theme={theme}
        />
        <SensorCard
          label="UV Index"
          iconName="sunny-outline"
          value={liveState?.uv_index != null ? liveState.uv_index.toFixed(2) : '—'}
          unit=""
          subLabel="via MQTT"
          subValue={liveState?.last_updated ? formatTs(liveState.last_updated) : '—'}
          color={theme.accent}
          theme={theme}
        />
        <SensorCard
          label="Humidity"
          iconName="water-outline"
          value={liveState?.humidity != null ? liveState.humidity.toFixed(1) : '—'}
          unit="%"
          subLabel="Sensor"
          subValue="DHT11"
          color={theme.primary}
          theme={theme}
        />
      </View>

      {/* ── Actuator Controls ────────────────────────────────────── */}
      <View style={styles.sectionHeaderRow}>
        <Ionicons name="settings-outline" size={18} color={theme.primary} style={{ marginRight: 6 }} />
        <Text style={[styles.sectionHeader, { color: theme.text }]}>Actuator Controls</Text>
      </View>
      <View style={[styles.row, isWide && styles.rowWide]}>
        <ActuatorControl
          label="DC Fan (Relay)"
          iconName="fan"
          iconLib="mci"
          mode={fanMode}
          state={fanState}
          onAuto={() => controlFan('automatic')}
          onManualOn={() => controlFan('manual', 'on')}
          onManualOff={() => controlFan('manual', 'off')}
          theme={theme}
        />
        <ActuatorControl
          label="Active Buzzer"
          iconName="notifications-outline"
          mode={buzzerMode}
          state={buzzerState}
          onAuto={() => controlBuzzer('automatic')}
          onManualOn={() => controlBuzzer('manual', 'on')}
          onManualOff={() => controlBuzzer('manual', 'off')}
          theme={theme}
        />
      </View>

      {/* ── Sensor Trends ───────────────────────────────────────── */}
      <View style={styles.sectionHeaderRow}>
        <Ionicons name="bar-chart-outline" size={18} color={theme.primary} style={{ marginRight: 6 }} />
        <Text style={[styles.sectionHeader, { color: theme.text }]}>Sensor Trends</Text>
      </View>
      <View style={[styles.row, isWide && styles.rowWide]}>
        <SensorChart
          title="Temperature History"
          data={tempVals}
          labels={tempLabels}
          color={theme.warning}
          unit="°C"
          theme={theme}
          chartWidth={chartWidth}
        />
        <SensorChart
          title="UV Index History"
          data={uvVals}
          labels={uvLabels}
          color={theme.accent}
          unit=""
          theme={theme}
          chartWidth={chartWidth}
        />
      </View>

      {/* ── Data Records ─────────────────────────────────────────── */}
      <View style={styles.sectionHeaderRow}>
        <Ionicons name="server-outline" size={18} color={theme.primary} style={{ marginRight: 6 }} />
        <Text style={[styles.sectionHeader, { color: theme.text }]}>Data Records</Text>
      </View>
      <View style={[styles.row, isWide && styles.rowWide]}>
        <DataTable
          title="Temperature Readings"
          iconName="thermometer-outline"
          columns={tempCols}
          rows={tempTableRows}
          theme={theme}
        />
        <DataTable
          title="UV Light Readings"
          iconName="sunny-outline"
          columns={uvCols}
          rows={uvTableRows}
          theme={theme}
        />
      </View>
      <View style={[styles.row, isWide && styles.rowWide]}>
        <DataTable
          title="Fan Logs"
          iconName="list-outline"
          columns={actuatorCols}
          rows={fanTableRows}
          theme={theme}
        />
        <DataTable
          title="Buzzer Logs"
          iconName="list-outline"
          columns={actuatorCols}
          rows={buzzerTableRows}
          theme={theme}
        />
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

  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  statusText: { fontSize: 13, fontWeight: '600' },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 10,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
  },

  // Row that becomes a flex-row on wide screens
  row: { flexDirection: 'column', gap: 12, marginBottom: 4 },
  rowWide: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap' },

  // Card shared base
  card: {
    flex: 1,
    minWidth: 260,
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

  // Sensor card
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cardLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  cardValueRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 },
  cardValue: { fontSize: 38, fontWeight: '800', lineHeight: 44 },
  cardUnit: { fontSize: 16, fontWeight: '600', marginBottom: 6, marginLeft: 4 },
  cardSub: { fontSize: 12 },

  // Actuator card
  actuatorCard: {
    flex: 1,
    minWidth: 260,
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
  actuatorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  actuatorTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  actuatorLabel: { fontSize: 14, fontWeight: '700' },
  modeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  modeBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  stateIndicator: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, padding: 8, marginBottom: 12 },
  stateCircle: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  stateText: { fontSize: 13, fontWeight: '700' },
  actuatorBtns: { flexDirection: 'row', gap: 8 },
  ctrlBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  ctrlBtnText: { fontSize: 11, fontWeight: '700' },

  // Chart / table shared
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  tableTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 13, textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1 },
  tableCell: { paddingHorizontal: 10, justifyContent: 'center' },
  tableHeaderText: { fontSize: 11, fontWeight: '700' },
  tableCellText: { fontSize: 11 },

  // Info banner
  infoBanner: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
  },
  infoBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  infoBannerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  infoBannerTitle: { fontSize: 14, fontWeight: '700' },
  infoBannerBody: { paddingHorizontal: 14, paddingBottom: 14 },
  infoBannerText: { fontSize: 13, lineHeight: 20, marginBottom: 12 },
  infoRow: { flexDirection: 'row', marginBottom: 10 },
  infoIcon: { marginRight: 8, marginTop: 2 },
  infoLabel: { fontSize: 13, fontWeight: '700', marginBottom: 3 },
  infoDesc: { fontSize: 12, lineHeight: 18 },
  infoDivider: { borderTopWidth: 1, marginVertical: 10 },
});
