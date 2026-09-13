import { useState } from 'react';
import * as api from '../lib/api.js';

/** `showServer` is true in Electron and on mobile, where the API lives elsewhere. */
export default function Login({ onLogin, showServer }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(api.state.base);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (showServer) api.setBase(server);
      onLogin(await api.login(username, password));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <h1 className="login__title">CamWall</h1>
        <p className="login__sub">All sites. One screen.</p>

        {showServer && (
          <label className="field">
            <span>Server</span>
            <input
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="https://camwall.yourcompany.com"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
        )}

        <label className="field">
          <span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoCapitalize="off" />
        </label>

        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {error && <div className="login__error">{error}</div>}

        <button className="btn btn--primary" disabled={busy || !username}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
