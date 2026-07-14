const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Stock AI Studio Desktop',
    autoHideMenuBar: true
  });

  // Load the web app URL
  const startUrl = process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://adobe-stock-metadata-ai.vercel.app'; // Hosted URL fallback for desktop container

  mainWindow.loadURL(startUrl);

  // Open devtools in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
