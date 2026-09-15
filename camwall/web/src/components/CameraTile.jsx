import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import * as api from '../lib/api.js';

/**
 * One live tile.
 *
 * Starts a server-side stream on mount, attaches HLS, and tears the lease down
 * on unmount so the recorder is not pulled for tiles nobody is looking at.
 * Safari/iOS play HLS natively; everything else goes through hls.js.
 */
export default function CameraTile({
  camera,
  quality = 'sub',
  viewerId,
  selected,
  muted = true,
  onSelect,
  onFullscreen,
  streamStatus,
}) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [state, setState] = useState({ phase: 'connecting', error: null });
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;

    async function attach() {
      setState({ phase: 'connecting', error: null });
      try {
        const info = await api.startStream(camera.id, quality, viewerId);
        if (cancelled) return;
        if (info.status === 'error' && info.fatal) {
          setState({ phase: 'error', error: info.error });
          return;
        }
        const url = api.mediaUrl(info.playlist);

        if (Hls.isSupported()) {
          const hls = new Hls({
            lowLatencyMode: true,
            liveSyncDurationCount: 2,     // stay close to the live edge
            maxBufferLength: 6,           // 16 tiles x small buffers, not few x large
            backBufferLength: 0,
            manifestLoadingMaxRetry: 8,
            manifestLoadingRetryDelay: 1000,
            fragLoadingMaxRetry: 6,
          });
          hlsRef.current = hls;
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal) return;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            else setState({ phase: 'error', error: data.details });
          });
          hls.on(Hls.Events.FRAG_BUFFERED, () => setState({ phase: 'live', error: null }));
          hls.loadSource(url);
          hls.attachMedia(video);
        } else {
          // Native HLS (Safari, iOS)
          video.src = url;
          video.addEventListener('playing', () => setState({ phase: 'live', error: null }), { once: true });
        }
        video.play?.().catch(() => { /* autoplay blocked until a user gesture */ });
      } catch (err) {
        if (!cancelled) setState({ phase: 'error', error: err.message });
      }
    }

    attach();

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      if (video) { video.removeAttribute('src'); video.load?.(); }
      api.stopStream(camera.id, quality, viewerId).catch(() => {});
    };
  }, [camera.id, quality, viewerId]);

  // A tile that stops advancing is worse than one that visibly fails - a frozen
  // frame looks like a working camera. Watch playback progress and flag it.
  useEffect(() => {
    let lastTime = -1;
    let strikes = 0;
    const timer = setInterval(() => {
      const v = videoRef.current;
      if (!v || state.phase !== 'live') return;
      strikes = v.currentTime === lastTime ? strikes + 1 : 0;
      lastTime = v.currentTime;
      setStale(strikes >= 3); // ~9s without a new frame
      if (strikes === 6) hlsRef.current?.startLoad();
    }, 3000);
    return () => clearInterval(timer);
  }, [state.phase]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  const offline = camera.health?.online === false;
  const badge =
    state.phase === 'error' ? 'error' : stale ? 'stalled' : state.phase === 'live' ? 'live' : 'connecting';

  return (
    <div
      className={`tile ${selected ? 'tile--selected' : ''} tile--${badge}`}
      onClick={() => onSelect?.(camera.id)}
      onDoubleClick={() => onFullscreen?.(camera.id)}
      title={`${camera.siteName} - ${camera.name}`}
    >
      <video ref={videoRef} playsInline autoPlay muted={muted} preload="none" />

      {state.phase !== 'live' && (
        <div className="tile__overlay">
          {state.phase === 'error' ? (
            <>
              <span className="tile__icon">!</span>
              <span className="tile__msg">{state.error}</span>
            </>
          ) : (
            <span className="tile__spinner" />
          )}
        </div>
      )}

      <div className="tile__bar">
        <span className={`dot dot--${badge}`} />
        <span className="tile__name">{camera.name}</span>
        <span className="tile__site">{camera.siteName}</span>
        {offline && <span className="tile__flag">offline</span>}
        {streamStatus?.mode === 'transcode' && <span className="tile__flag tile__flag--warn">transcoding</span>}
        {quality === 'main' && <span className="tile__flag">HD</span>}
      </div>
    </div>
  );
}
