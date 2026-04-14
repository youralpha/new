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

function extractZip() {
  console.log('Распаковка pdfium.dll...');
  const isWin = process.platform === 'win32';
  try {
    if (isWin) {
      execSync(`powershell -command "Expand-Archive -Force '${zipPath}' '${__dirname}/temp_pdfium'"`, { stdio: 'ignore' });
      fs.copyFileSync(
        path.join(__dirname, 'temp_pdfium', 'bin', 'pdfium.dll'),
        path.join(destPath, 'pdfium.dll')
      );
      console.log('Готово! pdfium.dll скопирован в src-tauri');

      fs.unlinkSync(zipPath);
      execSync(`powershell -command "Remove-Item -Recurse -Force '${__dirname}/temp_pdfium'"`, { stdio: 'ignore' });
    } else {
       console.log('Пропуск на Linux/Mac. В Windows библиотека распакуется автоматически.');
    }
  } catch (e) {
    console.error('Ошибка автоматической распаковки. Пожалуйста, распакуйте pdfium-win-x64.zip/bin/pdfium.dll в папку src-tauri вручную.', e.message);
  }
}
