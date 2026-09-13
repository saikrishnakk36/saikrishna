import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export function login(config, username, password) {
  const user = config.users.find((u) => u.username === username);
  // Compare against a dummy hash when the user is unknown so the response time
  // does not reveal which usernames exist.
  const hash = user?.passwordHash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const ok = bcrypt.compareSync(password ?? '', hash);
  if (!user || !ok) return null;

  const payload = { sub: user.username, role: user.role ?? 'viewer', sites: user.sites ?? null };
  const token = jwt.sign(payload, config.server.jwtSecret, {
    expiresIn: `${config.server.sessionHours}h`,
  });
  return { token, user: payload };
}

export function requireAuth(config) {
  return (req, res, next) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ')
      ? header.slice(7)
      : req.query.token || req.cookies?.camwall_token;
    if (!token) return res.status(401).json({ error: 'authentication required' });
    try {
      req.user = jwt.verify(token, config.server.jwtSecret);
      next();
    } catch {
      res.status(401).json({ error: 'invalid or expired session' });
    }
  };
}

export function verifyToken(config, token) {
  try {
    return jwt.verify(token, config.server.jwtSecret);
  } catch {
    return null;
  }
}

/** Site-level access control: users may be pinned to a subset of sites. */
export function canSee(user, siteId) {
  return !user?.sites || user.sites.includes(siteId);
}

export function visibleCameras(config, user) {
  return config.cameras.filter((c) => c.enabled && canSee(user, c.siteId));
}
