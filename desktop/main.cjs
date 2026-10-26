const {app, BrowserWindow, protocol, session, shell} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {soundingResponse} = require('./sounding.cjs');
const ORIGIN = 'labor://app';
if (app.commandLine.hasSwitch('smoke-test')) {
  const profilePath = path.join(app.getPath('temp'), 'AtmosphaerenLabor-smoke-profile');
  require('node:fs').mkdirSync(profilePath, {recursive: true});
  app.setPath('userData', profilePath);
}
protocol.registerSchemesAsPrivileged([{scheme: 'labor', privileges: {standard: true, secure: true, supportFetchAPI: true}}]);

function external(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && ['weather.uwyo.edu', 'opendata.dwd.de', 'github.com', 'www.weather.gov', 'www.noaa.gov'].includes(url.hostname)) shell.openExternal(url.href);
  } catch {}
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
  protocol.handle('labor', async request => {
    const url = new URL(request.url);
    if (url.host !== 'app' || request.method !== 'GET') return new Response('Nicht erlaubt', {status: 403});
    if (url.pathname === '/api/sounding') return soundingResponse(url.searchParams);
    if (url.pathname !== '/index.html') return new Response('Nicht gefunden', {status: 404});
    const assets = app.isPackaged ? path.join(process.resourcesPath, 'assets') : path.join(__dirname, '../app/src/main/assets');
    return new Response(await fs.readFile(path.join(assets, 'index.html')), {headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://geocoding-api.open-meteo.com; img-src 'self' data:; object-src 'none'; base-uri 'none'"
    }});
  });
  const smoke = app.commandLine.hasSwitch('smoke-test');
  const window = new BrowserWindow({width: 1440, height: 960, minWidth: 780, minHeight: 600, show: !smoke,
    backgroundColor: '#101e2e', title: 'Atmosphärenlabor', autoHideMenuBar: true,
    webPreferences: {nodeIntegration: false, contextIsolation: true, sandbox: true}});
  window.webContents.setWindowOpenHandler(({url}) => {external(url); return {action: 'deny'};});
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== ORIGIN + '/index.html') {event.preventDefault(); external(url);}
  });
  if (smoke) require('./smoke.cjs')(window);
  else if (app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR) {
    const {autoUpdater} = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', error => console.warn('Updateprüfung:', error.message));
    const check = () => autoUpdater.checkForUpdatesAndNotify().catch(error => console.warn('Updateprüfung:', error.message));
    check();
    setInterval(check, 4 * 3600 * 1000).unref();
  }
  window.loadURL(ORIGIN + '/index.html');
});
app.on('window-all-closed', () => app.quit());
