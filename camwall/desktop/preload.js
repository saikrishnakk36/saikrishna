const { contextBridge } = require('electron');

// The renderer is the same React app the browser loads. This flag is how it
// knows to ask for a server address at sign-in, since in the desktop shell the
// UI is not served by the API.
contextBridge.exposeInMainWorld('camwall', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
});
