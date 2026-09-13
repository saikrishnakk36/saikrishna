import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet,
  SafeAreaView, ActivityIndicator, StatusBar,
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as api from './src/api';
import Tile from './src/Tile';

const LAYOUTS = [1, 2, 4, 6];

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [sites, setSites] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [activeSite, setActiveSite] = useState('all');
  const [layout, setLayout] = useState(4);
  const [page, setPage] = useState(0);
  const [focused, setFocused] = useState(null);
  const [error, setError] = useState(null);

  const viewerId = useMemo(() => `m_${Math.random().toString(36).slice(2, 10)}`, []);

  useEffect(() => {
    api.restore().then((s) => {
      if (s.token) setUser(s.user);
      setBooting(false);
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api.getSites(), api.getCameras()]);
      setSites(s);
      setCameras(c);
      setError(null);
    } catch (err) {
      if (err.status === 401) setUser(null);
      else setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [user, refresh]);

  const visible = useMemo(
    () => (activeSite === 'all' ? cameras : cameras.filter((c) => c.siteId === activeSite)),
    [cameras, activeSite],
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / layout));
  const safePage = Math.min(page, pageCount - 1);
  const tiles = visible.slice(safePage * layout, safePage * layout + layout);

  useEffect(() => setPage(0), [activeSite, layout]);

  // Keep the server-side leases for on-screen tiles alive.
  useEffect(() => {
    if (!user || tiles.length === 0) return;
    const ping = () =>
      api.heartbeat(viewerId, tiles.map((c) => ({ cameraId: c.id, quality: 'sub' }))).catch(() => {});
    ping();
    const timer = setInterval(ping, 8000);
    return () => clearInterval(timer);
  }, [user, viewerId, tiles.map((t) => t.id).join(',')]);

  // A single camera is worth watching in landscape; the grid is not.
  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
  }, [focused]);

  if (booting) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color="#3b9eff" />
      </View>
    );
  }

  if (!user) return <Login onLogin={setUser} />;

  if (focused) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.topbar}>
          <Pressable style={styles.btn} onPress={() => setFocused(null)}>
            <Text style={styles.btnText}>‹ Wall</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {focused.name} · {focused.siteName}
          </Text>
        </View>
        <Tile camera={focused} quality="main" viewerId={viewerId} muted={false} />
      </SafeAreaView>
    );
  }

  // Fill the grid row by row so tiles keep a sane aspect on a phone.
  const cols = layout === 1 ? 1 : 2;
  const rows = [];
  for (let i = 0; i < tiles.length; i += cols) rows.push(tiles.slice(i, i + cols));

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />

      <View style={styles.topbar}>
        <Text style={styles.brand}>CamWall</Text>
        <Text style={styles.meta}>{visible.length} cams</Text>
        <View style={{ flex: 1 }} />
        {LAYOUTS.map((n) => (
          <Pressable key={n} style={[styles.seg, layout === n && styles.segOn]} onPress={() => setLayout(n)}>
            <Text style={[styles.segText, layout === n && styles.segTextOn]}>{n}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.btn} onPress={() => api.logout().then(() => setUser(null))}>
          <Text style={styles.btnText}>Out</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sites} contentContainerStyle={styles.sitesInner}>
        <Chip label="All locations" active={activeSite === 'all'} onPress={() => setActiveSite('all')} />
        {sites.map((s) => (
          <Chip
            key={s.id}
            label={s.name}
            active={activeSite === s.id}
            offline={s.health?.online === false}
            onPress={() => setActiveSite(s.id)}
          />
        ))}
      </ScrollView>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.grid}>
        {rows.map((row, i) => (
          <View key={i} style={styles.row}>
            {row.map((cam) => (
              <Tile key={cam.id} camera={cam} viewerId={viewerId} onPress={setFocused} />
            ))}
            {row.length < cols && <View style={{ flex: cols - row.length, margin: 2 }} />}
          </View>
        ))}
        {tiles.length === 0 && <Text style={styles.meta}>No cameras for this selection.</Text>}
      </View>

      {pageCount > 1 && (
        <View style={styles.pager}>
          <Pressable style={styles.btn} onPress={() => setPage((p) => (p - 1 + pageCount) % pageCount)}>
            <Text style={styles.btnText}>‹</Text>
          </Pressable>
          <Text style={styles.meta}>{safePage + 1} / {pageCount}</Text>
          <Pressable style={styles.btn} onPress={() => setPage((p) => (p + 1) % pageCount)}>
            <Text style={styles.btnText}>›</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function Chip({ label, active, offline, onPress }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipOn]} onPress={onPress}>
      {offline && <View style={styles.chipDot} />}
      <Text style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function Login({ onLogin }) {
  const [base, setBase] = useState(api.state.base || 'http://192.168.1.10:8080');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onLogin(await api.login(base, username, password));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, styles.center]}>
      <StatusBar barStyle="light-content" />
      <View style={styles.card}>
        <Text style={styles.cardTitle}>CamWall</Text>
        <Text style={styles.meta}>All sites. One screen.</Text>

        <Text style={styles.label}>Server</Text>
        <TextInput style={styles.input} value={base} onChangeText={setBase} autoCapitalize="none" autoCorrect={false} />

        <Text style={styles.label}>Username</Text>
        <TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" />

        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={[styles.primary, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
          <Text style={styles.primaryText}>{busy ? 'Signing in...' : 'Sign in'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b0f14' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 16 },

  topbar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: '#121820', borderBottomWidth: 1, borderBottomColor: '#253040',
  },
  brand: { color: '#e6edf5', fontWeight: '700', fontSize: 15 },
  title: { color: '#e6edf5', fontWeight: '600', flexShrink: 1 },
  meta: { color: '#8b9bb0', fontSize: 12 },

  seg: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: '#182029' },
  segOn: { backgroundColor: '#3b9eff' },
  segText: { color: '#8b9bb0', fontSize: 12 },
  segTextOn: { color: '#04121f', fontWeight: '700' },

  btn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#182029' },
  btnText: { color: '#e6edf5', fontSize: 13 },

  sites: { flexGrow: 0, backgroundColor: '#121820' },
  sitesInner: { paddingHorizontal: 8, paddingVertical: 6, gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14,
    backgroundColor: '#182029', maxWidth: 200,
  },
  chipOn: { backgroundColor: '#3b9eff' },
  chipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ff5d5d' },
  chipText: { color: '#8b9bb0', fontSize: 12 },
  chipTextOn: { color: '#04121f', fontWeight: '600' },

  grid: { flex: 1, padding: 2 },
  row: { flex: 1, flexDirection: 'row' },

  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 8 },

  card: { width: '100%', maxWidth: 380, backgroundColor: '#121820', borderRadius: 12, padding: 20, gap: 6 },
  cardTitle: { color: '#e6edf5', fontSize: 22, fontWeight: '700' },
  label: { color: '#8b9bb0', fontSize: 12, marginTop: 8 },
  input: {
    backgroundColor: '#182029', borderRadius: 6, borderWidth: 1, borderColor: '#253040',
    color: '#e6edf5', paddingHorizontal: 10, paddingVertical: 9,
  },
  primary: { backgroundColor: '#3b9eff', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  primaryText: { color: '#04121f', fontWeight: '700' },

  error: { color: '#ffb3b3', fontSize: 12, marginTop: 8 },
});
