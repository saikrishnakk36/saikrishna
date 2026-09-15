import { useEffect } from 'react';
import CameraTile from './CameraTile.jsx';
import * as api from '../lib/api.js';

const PAD = [
  ['upleft', 'up', 'upright'],
  ['left', null, 'right'],
  ['downleft', 'down', 'downright'],
];

/** Single-camera view: main stream, audio, PTZ and snapshot download. */
export default function Fullscreen({ camera, viewerId, onClose, isAdmin }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const move = (direction, action) =>
    api.ptz(camera.id, { direction, action }).catch((err) => console.error('PTZ', err.message));

  const grab = () => window.open(api.snapshotUrl(camera.id), '_blank', 'noopener');

  return (
    <div className="fs">
      <div className="fs__head">
        <button className="btn" onClick={onClose}>&larr; Back to wall</button>
        <div className="fs__title">
          <strong>{camera.name}</strong>
          <span>{camera.siteName}</span>
        </div>
        <div className="fs__actions">
          <button className="btn" onClick={grab}>Snapshot</button>
        </div>
      </div>

      <div className="fs__stage">
        <CameraTile camera={camera} quality="main" viewerId={viewerId} muted={false} />
      </div>

      {camera.ptz && isAdmin && (
        <div className="ptz">
          <div className="ptz__pad">
            {PAD.flat().map((dir, i) =>
              dir ? (
                <button
                  key={dir}
                  className="ptz__btn"
                  onMouseDown={() => move(dir, 'start')}
                  onMouseUp={() => move(dir, 'stop')}
                  onMouseLeave={() => move(dir, 'stop')}
                  onTouchStart={() => move(dir, 'start')}
                  onTouchEnd={() => move(dir, 'stop')}
                >
                  {{ up: '^', down: 'v', left: '<', right: '>' }[dir] ?? '•'}
                </button>
              ) : (
                <span key={`gap-${i}`} className="ptz__btn ptz__btn--gap" />
              ),
            )}
          </div>
          <div className="ptz__zoom">
            <button className="btn" onMouseDown={() => move('zoomin', 'start')} onMouseUp={() => move('zoomin', 'stop')}>Zoom +</button>
            <button className="btn" onMouseDown={() => move('zoomout', 'start')} onMouseUp={() => move('zoomout', 'stop')}>Zoom -</button>
          </div>
        </div>
      )}
    </div>
  );
}
