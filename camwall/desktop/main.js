const { app, BrowserWindow, Menu, shell, powerSaveBlocker } = require('electron');
const path = require('node:path');

// A control-room window must not sleep, and the wall is usually left running
// for days - keep the display awake for as long as the app is open.
let blockerId = null;
let mainWindow = null;

// Dev: point at the Vite server. Prod: load the built web app from disk.
const DEV_URL = process.env.CAMWALL_DEV_URL;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0f14',
    autoHideMenuBar: true,
    title: 'CamWall',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Recorders on a LAN almost always have self-signed certs; the
      // certificate-error handler below scopes any exception to the
      // configured server rather than turning verification off globally.
      backgroundThrottling: false,
    },
  });

  if (DEV_URL) mainWindow.loadURL(DEV_URL);
  else mainWindow.loadFile(path.join(__dirname, '..', 'web', 'dist', 'index.html'));

  // External links open in the real browser, never inside the shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function buildMenu() {
  const template = [
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11',
          click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()),
        },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
  ];
  if (process.platform === 'darwin') {
    template.unshift({ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  blockerId = powerSaveBlocker.start('prevent-display-sleep');
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId);
  if (process.platform !== 'darwin') app.quit();
});

// Allow the self-signed certificate of the configured CamWall server only.
app.on('certificate-error', (event, _wc, url, _error, _cert, callback) => {
  const allowed = (process.env.CAMWALL_TRUSTED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  if (allowed.some((host) => url.includes(host))) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});
