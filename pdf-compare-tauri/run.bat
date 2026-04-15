@echo off
chcp 65001 > nul
cls
echo ========================================================
echo        Запуск PDF Compare (Tauri + React + Rust)
echo ========================================================
echo.

echo [1/3] Проверка и установка зависимостей Node.js...
call npm install
echo.

:menu
echo Выберите действие:
echo 1 - Запустить приложение (Режим Разработки)
echo 2 - Собрать готовое приложение (.exe для Windows)
echo 3 - Выход
echo.

set /p choice="Ваш выбор (1/2/3): "

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto build
if "%choice%"=="3" goto exit

echo Неверный выбор, попробуйте снова.
goto menu

:dev
echo.
echo [2/3] Запуск приложения в режиме разработчика...
echo Закройте это окно, чтобы остановить сервер.
call npm run tauri dev
goto exit

:build
echo.
echo [2/3] Начало финальной сборки приложения...
echo Это может занять несколько минут...
call npm run tauri build
echo.
echo ========================================================
echo Готово! Ищите ваш .exe инсталлятор в папке:
echo src-tauri\target\release\bundle\nsis\
echo ========================================================
pause
goto exit

:exit
