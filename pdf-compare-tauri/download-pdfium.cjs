const https = require('https');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// We use the extremely stable, official NuGet package server which serves
// standard zip files (.nupkg) that never expire and don't have broken redirect loops.
// This specific version contains the full x64 pdfium.dll with V8 support.
const pdfiumUrl = 'https://www.nuget.org/api/v2/package/PdfiumViewer.Native.x86_64.v8-xfa/2018.4.8.256';
const zipPath = path.join(__dirname, 'pdfium.nupkg');
const destPath = path.join(__dirname, 'src-tauri');

console.log('Скачивание 100% стабильной версии pdfium.dll из NuGet...');
const isWin = process.platform === 'win32';

if (isWin) {
  const file = fs.createWriteStream(zipPath);
  https.get(pdfiumUrl, function(response) {
    if (response.statusCode === 302 || response.statusCode === 301) {
      // Handle 1-step redirect common on nuget CDN
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
      // Inside this NuGet package, the dll is at "x64/pdfium.dll"
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
      console.error('Ошибка: pdfium.dll не найден внутри скачанного NuGet архива.');
    }

    fs.unlinkSync(zipPath); // clean up
  } catch (e) {
    console.error('Ошибка распаковки ZIP архива: ', e.message);
  }
}
