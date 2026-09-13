/** Site tree + per-camera status. Doubles as the picker for custom layouts. */
export default function Sidebar({ sites, cameras, activeSite, onSite, onCamera, pinned, open }) {
  const bySite = new Map();
  for (const cam of cameras) {
    if (!bySite.has(cam.siteId)) bySite.set(cam.siteId, []);
    bySite.get(cam.siteId).push(cam);
  }

  const onlineCount = (list) => list.filter((c) => c.health?.online !== false).length;

  return (
    <aside className={`sidebar ${open ? '' : 'sidebar--closed'}`}>
      <button
        className={`sidebar__site ${activeSite === 'all' ? 'is-active' : ''}`}
        onClick={() => onSite('all')}
      >
        <span className="sidebar__siteName">All locations</span>
        <span className="sidebar__count">{cameras.length}</span>
      </button>

      {sites.map((site) => {
        const list = bySite.get(site.id) ?? [];
        return (
          <div key={site.id} className="sidebar__group">
            <button
              className={`sidebar__site ${activeSite === site.id ? 'is-active' : ''}`}
              onClick={() => onSite(site.id)}
            >
              <span className={`dot ${site.health?.online === false ? 'dot--error' : 'dot--live'}`} />
              <span className="sidebar__siteName">{site.name}</span>
              <span className="sidebar__count">
                {onlineCount(list)}/{list.length}
              </span>
            </button>

            <div className="sidebar__cams">
              {list.map((cam) => (
                <button
                  key={cam.id}
                  className={`sidebar__cam ${pinned?.includes(cam.id) ? 'is-pinned' : ''}`}
                  onClick={() => onCamera(cam.id)}
                  title={cam.health?.error ?? ''}
                >
                  <span className={`dot ${cam.health?.online === false ? 'dot--error' : 'dot--live'}`} />
                  {cam.name}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </aside>
  );
}
