import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from './lib/api.js';
import Login from './components/Login.jsx';
import Sidebar from './components/Sidebar.jsx';
import CameraTile from './components/CameraTile.jsx';
import Fullscreen from './components/Fullscreen.jsx';

const LAYOUTS = [1, 4, 6, 9, 16, 25];
const isDesktopShell = Boolean(window.camwall?.isDesktop);

/** Stable per-tab viewer id so stream leases survive reloads sanely. */
function useViewerId() {
  return useMemo(() => {
    let id = sessionStorage.getItem('camwall.viewer');
    if (!id) {
      id = `v_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem('camwall.viewer', id);
    }
    return id;
  }, []);
}

export default function App() {
  const viewerId = useViewerId();
  const [user, setUser] = useState(api.state.user);
  const [sites, setSites] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [streamStatus, setStreamStatus] = useState({});
  const [activeSite, setActiveSite] = useState(localStorage.getItem('camwall.site') ?? 'all');
  const [layout, setLayout] = useState(Number(localStorage.getItem('camwall.layout')) || 9);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);
  const [fullscreenId, setFullscreenId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 900);
  const [rotate, setRotate] = useState(false);
  const [error, setError] = useState(null);
  const rootRef = useRef(null);
  const refreshRef = useRef(null);

  // ---- data -------------------------------------------------------------
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
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [user, refresh]);

  // Live status: stream state + camera/site health, pushed from the server.
  useEffect(() => {
    if (!user) return;
    return api.connectEvents(({ type, payload }) => {
      if (type === 'snapshot') {
        setStreamStatus(Object.fromEntries(payload.streams.map((s) => [`${s.cameraId}__${s.quality}`, s])));
      } else if (type === 'stream') {
        setStreamStatus((prev) => ({ ...prev, [`${payload.cameraId}__${payload.quality}`]: payload }));
      } else if (type === 'camera') {
        setCameras((prev) =>
          prev.map((c) => (c.id === payload.cameraId ? { ...c, health: payload } : c)),
        );
      } else if (type === 'recorder') {
        // One DVR changing state changes its site's rollup - refetch rather
        // than recomputing the aggregate in two places.
        setSites((prev) =>
          prev.map((s) =>
            s.id === payload.siteId
              ? {
                  ...s,
                  recorders: s.recorders?.map((r) =>
                    r.id === payload.recorderId ? { ...r, health: payload } : r,
                  ),
                }
              : s,
          ),
        );
        refreshRef.current?.();
      }
    });
  }, [user]);

  // ---- which cameras are on screen --------------------------------------
  const visible = useMemo(
    () => (activeSite === 'all' ? cameras : cameras.filter((c) => c.siteId === activeSite)),
    [cameras, activeSite],
  );

  const pageCount = Math.max(1, Math.ceil(visible.length / layout));
  const safePage = Math.min(page, pageCount - 1);
  const tiles = visible.slice(safePage * layout, safePage * layout + layout);

  useEffect(() => setPage(0), [activeSite, layout]);
  useEffect(() => localStorage.setItem('camwall.layout', String(layout)), [layout]);
  useEffect(() => localStorage.setItem('camwall.site', activeSite), [activeSite]);

  // Keep every on-screen lease alive with a single request.
  useEffect(() => {
    if (!user || tiles.length === 0) return;
    const ping = () =>
      api
        .heartbeat(viewerId, tiles.map((c) => ({ cameraId: c.id, quality: 'sub' })))
        .catch(() => {});
    ping();
    const timer = setInterval(ping, 8000);
    return () => clearInterval(timer);
  }, [user, viewerId, tiles.map((t) => t.id).join(',')]);

  // Auto-rotate through pages - for the wall-mounted screen in reception.
  useEffect(() => {
    if (!rotate || pageCount < 2) return;
    const timer = setInterval(() => setPage((p) => (p + 1) % pageCount), 15_000);
    return () => clearInterval(timer);
  }, [rotate, pageCount]);

  // ---- keyboard ---------------------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') setPage((p) => (p + 1) % pageCount);
      else if (e.key === 'ArrowLeft') setPage((p) => (p - 1 + pageCount) % pageCount);
      else if (e.key === 'f') toggleBrowserFullscreen();
      else if (e.key === 'r') setRotate((r) => !r);
      else if (/^[1-6]$/.test(e.key)) setLayout(LAYOUTS[Number(e.key) - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pageCount]);

  function toggleBrowserFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  }

  function openCamera(id) {
    const cam = cameras.find((c) => c.id === id);
    if (!cam || cam.unreachable) return;
    // Jump to the page holding the camera, then open it full screen.
    const index = visible.findIndex((c) => c.id === id);
    if (index >= 0) setPage(Math.floor(index / layout));
    setFullscreenId(id);
  }

  // ---- render -----------------------------------------------------------
  if (!user) return <Login onLogin={setUser} showServer={isDesktopShell} />;

  const fullscreenCam = cameras.find((c) => c.id === fullscreenId);
  if (fullscreenCam) {
    return (
      <Fullscreen
        camera={fullscreenCam}
        viewerId={viewerId}
        isAdmin={user.role === 'admin'}
        onClose={() => setFullscreenId(null)}
      />
    );
  }

  const cols = Math.ceil(Math.sqrt(layout));
  const offline = cameras.filter((c) => c.health?.online === false).length;

  return (
    <div className="app" ref={rootRef}>
      <header className="topbar">
        <button className="btn btn--icon" onClick={() => setSidebarOpen((o) => !o)} title="Toggle sidebar">≡</button>
        <span className="brand">CamWall</span>

        <span className="topbar__stat">
          {visible.length} cameras
          {offline > 0 && <span className="topbar__alert"> · {offline} offline</span>}
        </span>

        <div className="spacer" />

        <div className="seg">
          {LAYOUTS.map((n) => (
            <button
              key={n}
              className={`seg__btn ${layout === n ? 'is-active' : ''}`}
              onClick={() => setLayout(n)}
              title={`${n}-up layout`}
            >
              {n}
            </button>
          ))}
        </div>

        {pageCount > 1 && (
          <div className="pager">
            <button className="btn btn--icon" onClick={() => setPage((p) => (p - 1 + pageCount) % pageCount)}>‹</button>
            <span>{safePage + 1}/{pageCount}</span>
            <button className="btn btn--icon" onClick={() => setPage((p) => (p + 1) % pageCount)}>›</button>
          </div>
        )}

        <button className={`btn ${rotate ? 'btn--on' : ''}`} onClick={() => setRotate((r) => !r)} title="Auto-rotate pages (r)">
          Rotate
        </button>
        <button className="btn btn--icon" onClick={toggleBrowserFullscreen} title="Fullscreen (f)">⛶</button>
        <button className="btn" onClick={() => { api.logout(); setUser(null); }}>Sign out</button>
      </header>

      {error && <div className="banner banner--error">{error}</div>}

      <div className="body">
        <Sidebar
          sites={sites}
          cameras={cameras}
          activeSite={activeSite}
          onSite={setActiveSite}
          onCamera={openCamera}
          pinned={tiles.map((t) => t.id)}
          open={sidebarOpen}
        />

        <main className="wall" style={{ '--cols': cols }}>
          {tiles.length === 0 && <div className="empty">No cameras for this selection.</div>}
          {tiles.map((cam) =>
            cam.unreachable ? (
              <div key={cam.id} className="tile tile--error">
                <div className="tile__overlay">
                  <span className="tile__icon">!</span>
                  <span className="tile__msg">{cam.name}</span>
                </div>
              </div>
            ) : (
              <CameraTile
                key={cam.id}
                camera={cam}
                viewerId={viewerId}
                selected={selected === cam.id}
                streamStatus={streamStatus[`${cam.id}__sub`]}
                onSelect={setSelected}
                onFullscreen={openCamera}
              />
            ),
          )}
        </main>
      </div>
    </div>
  );
}
