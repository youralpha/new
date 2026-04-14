const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pdfiumUrl = 'https://github.com/bblanchon/pdfium-binaries/releases/download/chromium/6873/pdfium-win-x64.zip';
const zipPath = path.join(__dirname, 'pdfium.zip');
const destPath = path.join(__dirname, 'src-tauri');

console.log('Скачивание pdfium-win-x64...');

const file = fs.createWriteStream(zipPath);
https.get(pdfiumUrl, function(response) {
  if (response.statusCode === 302) {
    https.get(response.headers.location, function(res) {
      res.pipe(file);
      file.on('finish', function() {
        file.close(() => extractZip());
      });
    });
  } else {
    response.pipe(file);
    file.on('finish', function() {
      file.close(() => extractZip());
    });
  }
}).on('error', function(err) {
  fs.unlink(zipPath);
  console.error('Ошибка скачивания: ', err.message);
});

function findFile(dir, filename) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      const result = findFile(fullPath, filename);
      if (result) return result;
    } else if (file === filename) {
      return fullPath;
    }
  }
  return null;
}

function extractZip() {
  console.log('Распаковка pdfium.dll...');
  const isWin = process.platform === 'win32';
  try {
    if (isWin) {
      const tempDir = path.join(__dirname, 'temp_pdfium');
      execSync(`powershell -command "Expand-Archive -Force '${zipPath}' '${tempDir}'"`, { stdio: 'ignore' });

      const extractedDllPath = findFile(tempDir, 'pdfium.dll');
      if (!extractedDllPath) {
        throw new Error('Файл pdfium.dll не найден внутри скачанного архива.');
      }

      fs.copyFileSync(extractedDllPath, path.join(destPath, 'pdfium.dll'));
      console.log('Готово! pdfium.dll скопирован в src-tauri');

      fs.unlinkSync(zipPath);
      execSync(`powershell -command "Remove-Item -Recurse -Force '${tempDir}'"`, { stdio: 'ignore' });
    } else {
       console.log('Пропуск на Linux/Mac. В Windows библиотека распакуется автоматически.');
       fs.unlinkSync(zipPath); // clean up downloaded zip anyway
    }
  } catch (e) {
    console.error('Ошибка автоматической распаковки. Пожалуйста, распакуйте pdfium-win-x64.zip/bin/pdfium.dll в папку src-tauri вручную.', e.message);
  }
}
