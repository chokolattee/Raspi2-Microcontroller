import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from './ThemeContext';

const BASE_URL = 'http://192.168.0.102:8000';
const LIVE_MS = 3000;
const HISTORY_MS = 10000;
const MAX_LIVE_PTS = 20;

// WHO UV Index classification
const UV_LEVELS = [
  { min: 0, max: 2, label: 'Low', color: '#4DB887', icon: 'checkmark-circle-outline' },
  { min: 3, max: 5, label: 'Moderate', color: '#F5C07A', icon: 'alert-circle-outline' },
  { min: 6, max: 7, label: 'High', color: '#F5A623', icon: 'warning-outline' },
  { min: 8, max: 10, label: 'Very High', color: '#E85D5D', icon: 'nuclear-outline' },
  { min: 11, max: 99, label: 'Extreme', color: '#A78BFA', icon: 'skull-outline' },
];

function getUVLevel(index) {
  return UV_LEVELS.find((l) => index >= l.min && index <= l.max) || UV_LEVELS[0];
}

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

// Sensor & Actuator Description Card
function SensorInfo({ theme }) {
  return (
    <View style={[styles.infoCard, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}>
      {/* UV Sensor */}
      <View style={styles.infoCardHeaderRow}>
        <MaterialCommunityIcons name="weather-sunny" size={20} color={theme.accent} style={{ marginRight: 8 }} />
        <Text style={[styles.infoCardTitle, { color: theme.text }]}>GUVA-S12SD UV Light Sensor (GPIO 34)</Text>
      </View>
      <Text style={[styles.infoCardDesc, { color: theme.textSecondary }]}>
        The GUVA-S12SD is an analog UV photodiode sensor sensitive to 240–370 nm (UVA + UVB). It
        outputs a voltage proportional to UV irradiance. The ESP32 ADC reads a 12-bit value
        (0–4095) at 3.3 V, then converts it to a UV Index using the formula:{'\n'}
        <Text style={styles.mono}>UV Index = (ADC / 4095 × 3300 mV) ÷ 100</Text>
      </Text>

      <View style={[styles.infoDivider, { borderColor: theme.cardBorder }]} />

      {/* Buzzer actuator */}
      <View style={styles.infoCardHeaderRow}>
        <Ionicons name="notifications-outline" size={20} color={theme.danger} style={{ marginRight: 8 }} />
        <Text style={[styles.infoCardTitle, { color: theme.text }]}>Active Buzzer (GPIO 18)</Text>
      </View>
      <Text style={[styles.infoCardDesc, { color: theme.textSecondary }]}>
        An active piezoelectric buzzer emits an audible tone when the ESP32 drives its pin HIGH.
        It provides an immediate audio alert when UV exposure reaches a potentially harmful level.
      </Text>

      {/* Logic box */}
      <View style={[styles.logicBox, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.logicTitle, { color: theme.primary }]}>Control Logic</Text>

        <View style={styles.logicRow}>
          <Ionicons name="arrow-forward-outline" size={14} color={theme.danger} style={{ marginRight: 6 }} />
          <Text style={[styles.logicText, { color: theme.text }]}>
            UV Index ≥ 3 (Moderate) → Buzzer{' '}
            <Text style={{ color: theme.danger, fontWeight: '700' }}>ON</Text>
            {' '}— alert for potentially harmful UV exposure
          </Text>
        </View>

        <View style={styles.logicRow}>
          <Ionicons name="arrow-forward-outline" size={14} color={theme.success} style={{ marginRight: 6 }} />
          <Text style={[styles.logicText, { color: theme.text }]}>
            UV Index {'<'} 3 (Low) → Buzzer{' '}
            <Text style={{ color: theme.success, fontWeight: '700' }}>OFF</Text>
            {' '}— safe UV level
          </Text>
        </View>

        <View style={styles.logicRow}>
          <Ionicons name="hand-left-outline" size={14} color={theme.warning} style={{ marginRight: 6 }} />
          <Text style={[styles.logicText, { color: theme.text }]}>
            Manual mode overrides automatic until "Automatic" is pressed again, which sends{' '}
            <Text style={styles.mono}>AUTO</Text> via MQTT to{' '}
            <Text style={styles.mono}>esp32/buzzer/cmd</Text>
          </Text>
        </View>
      </View>

      {/* UV scale reference */}
      <View style={[styles.scaleBox, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.logicTitle, { color: theme.primary }]}>WHO UV Index Scale</Text>
        {UV_LEVELS.map((l) => (
          <View key={l.label} style={styles.scaleRow}>
            <View style={[styles.scaleBar, { backgroundColor: l.color }]} />
            <Text style={[styles.scaleLabel, { color: theme.text }]}>{l.label}</Text>
            <Text style={[styles.scaleRange, { color: theme.textSecondary }]}>
              Index {l.min}–{l.max === 99 ? '11+' : l.max}
            </Text>
            {l.min >= 3 && (
              <View style={[styles.alertBadge, { backgroundColor: l.color + '22' }]}>
                <Ionicons name="notifications-outline" size={10} color={l.color} style={{ marginRight: 3 }} />
                <Text style={[styles.alertBadgeText, { color: l.color }]}>Buzzer ON</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

// UV Gauge (circular ring style)
function UVGauge({ value, theme }) {
  const uvIndex = value || 0;
  const level = getUVLevel(uvIndex);
  const pct = Math.min(uvIndex / 12, 1);

  return (
    <View style={styles.gaugeWrapper}>
      {/* Progress bar */}
      <View style={[styles.gaugeTrack, { backgroundColor: theme.cardBorder }]}>
        <View style={[styles.gaugeFill, { width: `${pct * 100}%`, backgroundColor: level.color }]} />
      </View>

      {/* Circular display */}
      <View style={[styles.gaugeCircle, { borderColor: level.color, backgroundColor: level.color + '15' }]}>
        <MaterialCommunityIcons name="weather-sunny" size={22} color={level.color} style={{ marginBottom: 2 }} />
        <Text style={[styles.gaugeValue, { color: level.color }]}>
          {uvIndex.toFixed(1)}
        </Text>
        <Text style={[styles.gaugeLabel, { color: level.color }]}>UV INDEX</Text>
      </View>

      {/* Level badge */}
      <View style={[styles.levelBadge, { backgroundColor: level.color + '22', borderColor: level.color }]}>
        <Ionicons name={level.icon} size={14} color={level.color} style={{ marginRight: 5 }} />
        <Text style={[styles.levelBadgeText, { color: level.color }]}>{level.label}</Text>
      </View>
    </View>
  );
}

// Buzzer Control Panel
function BuzzerControl({ mode, state, onAuto, onManualOn, onManualOff, theme }) {
  const isOn = state === 'on';
  const isAuto = mode === 'automatic';

  return (
    <View style={[styles.controlPanel, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      {/* Header */}
      <View style={styles.controlPanelHeader}>
        <View style={styles.controlPanelTitleRow}>
          <Ionicons name="notifications-outline" size={20} color={theme.primary} style={{ marginRight: 8 }} />
          <Text style={[styles.controlPanelTitle, { color: theme.text }]}>Active Buzzer Control</Text>
        </View>
        <View style={[styles.modeBadge, { backgroundColor: isAuto ? theme.successLight : theme.warningLight }]}>
          <Text style={[styles.modeBadgeText, { color: isAuto ? theme.success : theme.warning }]}>
            {isAuto ? 'AUTOMATIC' : 'MANUAL'}
          </Text>
        </View>
      </View>

      {/* State pill */}
      <View style={[styles.statePill, { backgroundColor: isOn ? theme.dangerLight : theme.cardBorder }]}>
        <View style={[styles.stateDot, { backgroundColor: isOn ? theme.danger : theme.textMuted }]} />
        <Ionicons
          name={isOn ? 'notifications' : 'notifications-off-outline'}
          size={16}
          color={isOn ? theme.danger : theme.textMuted}
          style={{ marginRight: 6 }}
        />
        <Text style={[styles.statePillText, { color: isOn ? theme.danger : theme.textMuted }]}>
          {isOn ? 'Buzzer Sounding' : 'Buzzer Silent'}
        </Text>
      </View>

      {/* Button row */}
      <View style={styles.btnRow}>
        {/* AUTO */}
        <TouchableOpacity
          style={[styles.primaryBtn, {
            backgroundColor: isAuto ? theme.primary : theme.card,
            borderColor: theme.primary,
          }]}
          onPress={onAuto}
        >
          <Ionicons name="sync-outline" size={18} color={isAuto ? '#fff' : theme.primary} />
          <Text style={[styles.primaryBtnText, { color: isAuto ? '#fff' : theme.primary }]}>Automatic</Text>
          <Text style={[styles.primaryBtnSub, { color: isAuto ? 'rgba(255,255,255,0.75)' : theme.textSecondary }]}>
            UV ≥ 3 → Buzzer ON
          </Text>
        </TouchableOpacity>

        {/* Manual ON */}
        <TouchableOpacity
          style={[styles.secondaryBtn, {
            backgroundColor: !isAuto && isOn ? theme.danger : theme.dangerLight,
            borderColor: theme.danger,
            opacity: isAuto ? 0.42 : 1,
          }]}
          onPress={onManualOn}
          disabled={isAuto}
        >
          <Ionicons name="notifications" size={18} color={!isAuto && isOn ? '#fff' : theme.danger} />
          <Text style={[styles.secondaryBtnText, { color: !isAuto && isOn ? '#fff' : theme.danger }]}>
            Manual ON
          </Text>
        </TouchableOpacity>

        {/* Manual OFF */}
        <TouchableOpacity
          style={[styles.secondaryBtn, {
            backgroundColor: !isAuto && !isOn ? theme.success : theme.successLight,
            borderColor: theme.success,
            opacity: isAuto ? 0.42 : 1,
          }]}
          onPress={onManualOff}
          disabled={isAuto}
        >
          <Ionicons name="notifications-off-outline" size={18} color={!isAuto && !isOn ? '#fff' : theme.success} />
          <Text style={[styles.secondaryBtnText, { color: !isAuto && !isOn ? '#fff' : theme.success }]}>
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
export default function UVScreen() {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const chartWidth = isWide ? (width - 80) / 2 - 20 : width - 48;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Live snapshot from MQTT (drives hero card + buzzer state)
  const [liveState, setLiveState] = useState(null);

  // Rolling graph arrays
  const [liveUV, setLiveUV] = useState([]);
  const [liveUVLbl, setLiveUVLbl] = useState([]);

  // DB history (for table only)
  const [uvHistory, setUvHistory] = useState([]);
  const [buzzerHistory, setBuzzerHistory] = useState([]);

  const fetchLive = useCallback(async () => {
    try {
      const data = await apiFetch('/api/sensors/live');
      setLiveState(data);
      if (data.last_updated && data.uv_index != null) {
        const label = new Date(data.last_updated).toLocaleTimeString([], {
          hour: '2-digit', minute: '2-digit',
        });
        setLiveUV((p) => [...p, data.uv_index].slice(-MAX_LIVE_PTS));
        setLiveUVLbl((p) => [...p, label].slice(-MAX_LIVE_PTS));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const [uh, bh] = await Promise.allSettled([
        apiFetch('/api/uv/history'),
        apiFetch('/api/buzzer/history'),
      ]);
      if (uh.status === 'fulfilled') setUvHistory(Array.isArray(uh.value) ? [...uh.value].reverse() : []);
      if (bh.status === 'fulfilled') setBuzzerHistory(Array.isArray(bh.value) ? [...bh.value].reverse() : []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchLive();
    fetchHistory();
    const t1 = setInterval(fetchLive, LIVE_MS);
    const t2 = setInterval(fetchHistory, HISTORY_MS);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [fetchLive, fetchHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([fetchLive(), fetchHistory()]);
    setRefreshing(false);
  }, [fetchLive, fetchHistory]);

  const controlBuzzer = async (mode, state = 'off') => {
    try {
      await apiPost('/api/buzzer/control', { mode, state });
      setLiveState((prev) => prev
        ? { ...prev, buzzer: state === 'on', buzzer_auto: mode === 'automatic' }
        : prev);
      fetchHistory();
    } catch (e) { console.error(e); }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const uvIndex = liveState?.uv_index ?? 0;
  // Reconstruct raw ADC from uv_index (back-calculate for display)
  const uvRaw = liveState?.uv_index != null
    ? Math.round((liveState.uv_index * 100.0 / 3300.0) * 4095.0)
    : null;
  const level = getUVLevel(uvIndex);
  const buzzerMode = liveState?.buzzer_auto === false ? 'manual' : 'automatic';
  const buzzerState = liveState?.buzzer ? 'on' : 'off';
  const lastUpdated = liveState?.last_updated;

  // Chart data — prefer live rolling points; fall back to DB history on first load
  const uvVals = liveUV.length > 0 ? liveUV : uvHistory.slice(-MAX_LIVE_PTS).map((r) => r.uv_index || 0);
  const uvLabels = liveUVLbl.length > 0 ? liveUVLbl : uvHistory.slice(-MAX_LIVE_PTS).map((r) => formatTs(r.timestamp).slice(0, 5));

  // Table rows from DB history
  const tableRows = uvHistory.slice(-20).map((r, i) => ({
    id: r.id || i,
    timestamp: formatTs(r.timestamp),
    uvRaw: r.value ?? '—',
    uvIndex: r.uv_index != null ? r.uv_index.toFixed(2) : '—',
    level: getUVLevel(r.uv_index || 0).label,
    buzzerState: buzzerHistory[i]?.state ?? '—',
    buzzerMode: buzzerHistory[i]?.mode ?? '—',
  }));

  const tableCols = [
    { key: 'timestamp', label: 'Timestamp', width: 150 },
    { key: 'uvRaw', label: 'Raw ADC', width: 90 },
    { key: 'uvIndex', label: 'UV Index', width: 90 },
    { key: 'level', label: 'Level', width: 90 },
    {
      key: 'buzzerState', label: 'Buzzer State', width: 110,
      style: (v) => ({ color: v === 'on' ? theme.danger : theme.success, fontWeight: '700' }),
    },
    {
      key: 'buzzerMode', label: 'Buzzer Mode', width: 110,
      style: (v) => ({ color: v === 'automatic' ? theme.primary : theme.warning, fontWeight: '600' }),
    },
  ];

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.bg }]}
      contentContainerStyle={[styles.content, isWide && styles.contentWide]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
    >
      {/* Sensor & actuator description */}
      <SensorInfo theme={theme} />

      {/* Hero reading card */}
      <View style={[
        styles.heroCard,
        { backgroundColor: theme.card, borderColor: theme.cardBorder, borderTopColor: level.color },
      ]}>
        <View style={styles.heroCardHeader}>
          <MaterialCommunityIcons name="weather-sunny" size={18} color={theme.textMuted} style={{ marginRight: 6 }} />
          <Text style={[styles.heroLabel, { color: theme.textMuted }]}>
            GUVA-S12SD — Live Reading via MQTT
          </Text>
          {lastUpdated ? (
            <Text style={{ color: theme.textMuted, fontSize: 11, marginLeft: 'auto' }}>
              {formatTs(lastUpdated)}
            </Text>
          ) : null}
        </View>

        <View style={[styles.heroBody, isWide && styles.heroBodyWide]}>
          <UVGauge value={uvIndex} theme={theme} />

          <View style={[styles.heroStats, isWide && { flexDirection: 'row', flexWrap: 'wrap' }]}>
            {/* UV Index */}
            <View style={[styles.statBox, { backgroundColor: level.color + '18', flex: isWide ? 1 : undefined, minWidth: 110 }]}>
              <View style={styles.statBoxHeader}>
                <MaterialCommunityIcons name="weather-sunny" size={13} color={level.color} style={{ marginRight: 4 }} />
                <Text style={[styles.statLabel, { color: level.color }]}>UV Index</Text>
              </View>
              <Text style={[styles.statValue, { color: level.color }]}>
                {uvIndex.toFixed(2)}
              </Text>
            </View>

            {/* Raw ADC */}
            <View style={[styles.statBox, { backgroundColor: theme.primaryLight, flex: isWide ? 1 : undefined, minWidth: 110 }]}>
              <View style={styles.statBoxHeader}>
                <Ionicons name="pulse-outline" size={13} color={theme.primary} style={{ marginRight: 4 }} />
                <Text style={[styles.statLabel, { color: theme.primary }]}>Raw ADC (est.)</Text>
              </View>
              <Text style={[styles.statValue, { color: theme.primary }]}>
                {uvRaw ?? '—'}
              </Text>
            </View>

            {/* Voltage estimate */}
            <View style={[styles.statBox, { backgroundColor: theme.accentLight, flex: isWide ? 1 : undefined, minWidth: 110 }]}>
              <View style={styles.statBoxHeader}>
                <Ionicons name="flash-outline" size={13} color={theme.accent} style={{ marginRight: 4 }} />
                <Text style={[styles.statLabel, { color: theme.accent }]}>Voltage (mV est.)</Text>
              </View>
              <Text style={[styles.statValue, { color: theme.accent }]}>
                {uvRaw != null ? ((uvRaw / 4095) * 3300).toFixed(0) : liveState?.uv_index != null ? (liveState.uv_index * 100).toFixed(0) : '—'}
              </Text>
            </View>

            {/* Buzzer alert status */}
            <View style={[
              styles.statBox,
              {
                backgroundColor: uvIndex >= 3 ? theme.dangerLight : theme.successLight,
                flex: isWide ? 1 : undefined,
                minWidth: 110,
              },
            ]}>
              <View style={styles.statBoxHeader}>
                <Ionicons
                  name={uvIndex >= 3 ? 'notifications' : 'notifications-off-outline'}
                  size={13}
                  color={uvIndex >= 3 ? theme.danger : theme.success}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.statLabel, { color: uvIndex >= 3 ? theme.danger : theme.success }]}>
                  Buzzer Alert
                </Text>
              </View>
              <Text style={[styles.statValue, { color: uvIndex >= 3 ? theme.danger : theme.success, fontSize: 14 }]}>
                {uvIndex >= 3 ? 'Triggered' : 'Safe Level'}
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.heroTs, { color: theme.textMuted }]}>
          Last updated: {formatTs(uvLatest?.timestamp)}
        </Text>
      </View>

      {/* Buzzer control */}
      <View style={styles.sectionHeaderRow}>
        <Ionicons name="notifications-outline" size={18} color={theme.primary} style={{ marginRight: 6 }} />
        <Text style={[styles.sectionHeader, { color: theme.text }]}>Buzzer Actuator Control</Text>
      </View>
      <BuzzerControl
        mode={buzzerMode}
        state={buzzerState}
        onAuto={() => controlBuzzer('automatic')}
        onManualOn={() => controlBuzzer('manual', 'on')}
        onManualOff={() => controlBuzzer('manual', 'off')}
        theme={theme}
      />

      {/* Chart */}
      <View style={styles.sectionHeaderRow}>
        <Ionicons name="bar-chart-outline" size={18} color={theme.primary} style={{ marginRight: 6 }} />
        <Text style={[styles.sectionHeader, { color: theme.text }]}>UV Index Trend</Text>
      </View>

      {uvVals.length > 0 ? (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>UV Index Over Time</Text>
          <LineChart
            data={{
              labels: uvLabels.slice(-10),
              datasets: [{ data: uvVals.slice(-10), color: () => theme.accent, strokeWidth: 2 }],
            }}
            width={chartWidth}
            height={220}
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
          {/* Threshold annotation */}
          <View style={styles.thresholdNote}>
            <View style={[styles.thresholdLine, { backgroundColor: theme.danger }]} />
            <Ionicons name="notifications-outline" size={12} color={theme.danger} style={{ marginHorizontal: 4 }} />
            <Text style={[styles.thresholdText, { color: theme.danger }]}>
              Buzzer threshold at UV Index 3
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>UV Index Over Time</Text>
          <View style={styles.emptyState}>
            <Ionicons name="bar-chart-outline" size={32} color={theme.textMuted} />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No UV data yet</Text>
          </View>
        </View>
      )}

      {/* Data table */}
      <View style={styles.sectionHeaderRow}>
        <Ionicons name="server-outline" size={18} color={theme.primary} style={{ marginRight: 6 }} />
        <Text style={[styles.sectionHeader, { color: theme.text }]}>Data Records</Text>
      </View>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <View style={styles.tableTitleRow}>
          <Ionicons name="list-outline" size={16} color={theme.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.cardTitle, { color: theme.text }]}>UV Sensor & Buzzer Log</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {/* Header */}
            <View style={[styles.tableRow, { backgroundColor: theme.primaryLight }]}>
              {tableCols.map((c) => (
                <View key={c.key} style={[styles.tableCell, { width: c.width }]}>
                  <Text style={[styles.tableHeaderText, { color: theme.primary }]}>{c.label}</Text>
                </View>
              ))}
            </View>
            {/* Rows */}
            {tableRows.length === 0 ? (
              <View style={styles.tableRow}>
                <Text style={[styles.emptyText, { color: theme.textMuted, paddingHorizontal: 12 }]}>
                  No records yet
                </Text>
              </View>
            ) : tableRows.map((row, i) => (
              <View
                key={row.id}
                style={[styles.tableRow, { backgroundColor: i % 2 === 0 ? theme.bg : theme.card }]}
              >
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

// Styles
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
  infoCardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  infoCardTitle: { fontSize: 13, fontWeight: '700', flex: 1, flexWrap: 'wrap' },
  infoCardDesc: { fontSize: 12, lineHeight: 18, marginBottom: 10 },
  infoDivider: { borderTopWidth: 1, marginVertical: 12 },
  logicBox: { borderRadius: 10, borderWidth: 1, padding: 12, marginTop: 10, marginBottom: 12 },
  scaleBox: { borderRadius: 10, borderWidth: 1, padding: 12 },
  logicTitle: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  logicRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  logicText: { fontSize: 12, lineHeight: 18, flex: 1 },
  mono: { fontFamily: 'monospace', fontWeight: '600' },
  scaleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  scaleBar: { width: 32, height: 8, borderRadius: 4, marginRight: 8 },
  scaleLabel: { fontSize: 12, fontWeight: '600', width: 70 },
  scaleRange: { fontSize: 11, flex: 1 },
  alertBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  alertBadgeText: { fontSize: 10, fontWeight: '700' },

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
  heroCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  heroLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  heroBody: { flexDirection: 'column', gap: 16, marginBottom: 10 },
  heroBodyWide: { flexDirection: 'row', alignItems: 'center' },
  heroStats: { flex: 1, gap: 8 },
  heroTs: { fontSize: 11, textAlign: 'right', marginTop: 6 },

  // Gauge
  gaugeWrapper: { alignItems: 'center', gap: 10 },
  gaugeTrack: {
    width: '100%', height: 10, borderRadius: 5, overflow: 'hidden',
  },
  gaugeFill: { height: '100%', borderRadius: 5 },
  gaugeCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeValue: { fontSize: 34, fontWeight: '900', lineHeight: 38 },
  gaugeLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  levelBadgeText: { fontSize: 13, fontWeight: '700' },

  // Stat boxes
  statBox: { borderRadius: 12, padding: 12, marginBottom: 4 },
  statBoxHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  statLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 20, fontWeight: '800' },

  // Section headers
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 10 },
  sectionHeader: { fontSize: 16, fontWeight: '700' },

  // Buzzer control panel
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
    flex: 1.5, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 10,
    alignItems: 'center', borderWidth: 2, gap: 4,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700' },
  primaryBtnSub: { fontSize: 11 },
  secondaryBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', borderWidth: 2, gap: 4,
  },
  secondaryBtnText: { fontSize: 12, fontWeight: '700' },
  autoNote: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  autoNoteText: { fontSize: 11, flex: 1 },

  // Chart card
  card: {
    flex: 1, minWidth: 240, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  thresholdNote: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  thresholdLine: { width: 24, height: 2, marginRight: 2 },
  thresholdText: { fontSize: 11 },
  emptyState: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 13, textAlign: 'center' },

  // Table
  tableTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  tableRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1 },
  tableCell: { paddingHorizontal: 10, justifyContent: 'center' },
  tableHeaderText: { fontSize: 11, fontWeight: '700' },
  tableCellText: { fontSize: 11 },
});
