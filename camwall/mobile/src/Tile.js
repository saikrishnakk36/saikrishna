import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as api from './api';

/**
 * A single live tile. expo-av plays HLS natively on both platforms, so the
 * mobile app consumes exactly the same server-side stream as the web wall.
 */
export default function Tile({ camera, quality = 'sub', viewerId, onPress, muted = true }) {
  const videoRef = useRef(null);
  const [uri, setUri] = useState(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);

    api
      .startStream(camera.id, quality, viewerId)
      .then((info) => {
        if (cancelled) return;
        if (info.status === 'error' && info.fatal) throw new Error(info.error);
        setUri(api.mediaUrl(info.playlist));
      })
      .catch((err) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
      api.stopStream(camera.id, quality, viewerId).catch(() => {});
    };
  }, [camera.id, quality, viewerId]);

  return (
    <Pressable style={styles.tile} onPress={() => onPress?.(camera)}>
      {uri && (
        <Video
          ref={videoRef}
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
          isMuted={muted}
          isLooping={false}
          onReadyForDisplay={() => setReady(true)}
          onError={(e) => setError(String(e))}
        />
      )}

      {!ready && (
        <View style={styles.overlay}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color="#3b9eff" />}
        </View>
      )}

      <View style={styles.bar}>
        <View style={[styles.dot, { backgroundColor: error ? '#ff5d5d' : ready ? '#35d07f' : '#f5a623' }]} />
        <Text style={styles.name} numberOfLines={1}>{camera.name}</Text>
        <Text style={styles.site} numberOfLines={1}>{camera.siteName}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, margin: 2, backgroundColor: '#000', borderRadius: 6, overflow: 'hidden', minHeight: 110 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 8 },
  error: { color: '#ffb3b3', fontSize: 11, textAlign: 'center' },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 6, paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  name: { color: '#e6edf5', fontSize: 11, fontWeight: '600', flexShrink: 1 },
  site: { color: '#8b9bb0', fontSize: 10, flexShrink: 1 },
});
