import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';
import net from 'net';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let flaskProcess = null;
let flaskPort = 5000;

ipcMain.handle('get-flask-port', () => {
  return flaskPort;
});

function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, () => {
            const port = srv.address().port;
            srv.close((err) => resolve(port));
        });
        srv.on('error', reject);
    });
}

const startFlask = async () => {
  flaskPort = await getFreePort();
  const isDev = !app.isPackaged;
  const isWin = os.platform() === 'win32';

  let pythonExecutable = 'python3';
  if (isWin) {
     pythonExecutable = 'python';
  }

  let scriptPath;
  if (isDev) {
    const venvPython = isWin ? 'venv\\Scripts\\python.exe' : 'venv/bin/python';
    // Using app.getAppPath() provides a reliable absolute path to project root
    const rootPath = app.getAppPath();
    pythonExecutable = path.join(rootPath, 'backend', venvPython);
    scriptPath = path.join(rootPath, 'backend', 'app.py');
  } else {
    // In prod, point to packaged resources
    scriptPath = path.join(process.resourcesPath, 'backend', 'app.py');
  }

  console.log(`Starting Flask with python: ${pythonExecutable}`);
  console.log(`Script path: ${scriptPath}`);

  flaskProcess = spawn(pythonExecutable, [scriptPath], {
    env: { ...process.env, FLASK_PORT: flaskPort.toString() }
  });

  flaskProcess.on('error', (err) => {
    console.error('Failed to start Flask subprocess:', err);
  });

  flaskProcess.stdout.on('data', (data) => {
    console.log(`Flask stdout: ${data}`);
  });

  flaskProcess.stderr.on('data', (data) => {
    console.error(`Flask stderr: ${data}`);
  });

  flaskProcess.on('close', (code) => {
    console.log(`Flask process exited with code ${code}`);
  });
};

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
};

app.on('ready', async () => {
  await startFlask();
  createWindow();
});

app.on('window-all-closed', () => {
  if (flaskProcess) {
    flaskProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (flaskProcess) {
    flaskProcess.kill();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
