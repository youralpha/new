const https = require('https');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// We use the older 5200 chromium build zip which is known to be a standard ZIP file
// (not a TGZ) and includes the necessary symbols for pdfium-render.
// This completely bypasses the .tgz tar issue and the Expand-Archive subfolder issue.
const pdfiumUrl = 'https://github.com/bblanchon/pdfium-binaries/releases/download/chromium/5200/pdfium-win-x64.zip';
const zipPath = path.join(__dirname, 'pdfium.zip');
const destPath = path.join(__dirname, 'src-tauri');

console.log('Скачивание стабильной версии pdfium-win-x64.zip...');
const isWin = process.platform === 'win32';

if (isWin) {
  const file = fs.createWriteStream(zipPath);
  https.get(pdfiumUrl, function(response) {
    if (response.statusCode === 302 || response.statusCode === 301) {
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
    fs.unlink(zipPath, () => {});
    console.error('Ошибка скачивания: ', err.message);
  });
} else {
  console.log('Пропуск скачивания на Linux/Mac. Там используется системная библиотека.');
}

function extractZip() {
  console.log('Распаковка pdfium.dll через JS-архиватор (adm-zip)...');
  try {
    const zip = new AdmZip(zipPath);
    // Unzip completely directly into memory / JS to find the exact file
    const zipEntries = zip.getEntries();

    let dllFound = false;
    for (let i = 0; i < zipEntries.length; i++) {
      if (zipEntries[i].entryName.endsWith('pdfium.dll')) {
        // Extract this specific file to src-tauri
        const content = zipEntries[i].getData();
        fs.writeFileSync(path.join(destPath, 'pdfium.dll'), content);
        dllFound = true;
        break;
      }
    }

    if (dllFound) {
      console.log('Готово! pdfium.dll (x64) успешно извлечен в src-tauri.');
    } else {
      console.error('Ошибка: pdfium.dll не найден внутри скачанного ZIP архива.');
    }

    fs.unlinkSync(zipPath); // clean up
  } catch (e) {
    console.error('Ошибка распаковки ZIP архива: ', e.message);
  }
}
