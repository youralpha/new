import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
const { ipcRenderer } = window.require('electron');

const App = () => {
  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [port, setPort] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [serverReady, setServerReady] = useState(false);

  useEffect(() => {
    const fetchPort = async () => {
      try {
        const p = await ipcRenderer.invoke('get-flask-port');
        setPort(p);
        setLogs(prev => [...prev, `[UI] Received port from Electron: ${p}`]);
      } catch (err) {
        console.error("Failed to get port:", err);
        setLogs(prev => [...prev, `[UI Error] Failed to get port: ${err.message}`]);
      }
    };
    fetchPort();

    const handleLog = (event, message) => {
      setLogs((prev) => [...prev, message]);
    };

    ipcRenderer.on('debug-log', handleLog);

    return () => {
      ipcRenderer.removeListener('debug-log', handleLog);
    };
  }, []);

  // Ping server until ready
  useEffect(() => {
    if (!port) return;

    let intervalId;
    const checkStatus = async () => {
      try {
        setLogs(prev => [...prev, `[UI] Pinging http://127.0.0.1:${port}/api/status ...`]);
        const res = await fetch(`http://127.0.0.1:${port}/api/status`);
        if (res.ok) {
          setLogs(prev => [...prev, `[UI] Server is READY!`]);
          setServerReady(true);
          clearInterval(intervalId);
        } else {
          setLogs(prev => [...prev, `[UI] Server returned status: ${res.status}`]);
        }
      } catch (e) {
        setLogs(prev => [...prev, `[UI Error] Ping failed: ${e.message}`]);
      }
    };

    intervalId = setInterval(checkStatus, 2000);
    checkStatus(); // initial check

    return () => clearInterval(intervalId);
  }, [port]);

  const handleCompare = async () => {
    if (!file1 || !file2) {
      alert('Пожалуйста, выберите оба файла.');
      return;
    }

    if (!port) {
      alert('Сервер обработки еще не запущен.');
      return;
    }

    setLoading(true);
    setResultMessage('');
    setResultUrl('');

    const formData = new FormData();
    formData.append('file1', file1);
    formData.append('file2', file2);

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/compare`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при сравнении');
      }

      setResultUrl(`http://127.0.0.1:${port}${data.result_url}`);

      let msg = '';
      if (data.metadata.status === 'pages_decreased') {
        msg = 'Внимание: количество страниц уменьшилось!';
      } else if (data.metadata.status === 'pages_increased') {
        msg = 'Количество страниц изменилось (стало больше).';
      } else {
        msg = 'Сравнение завершено успешно.';
      }
      setResultMessage(msg);

    } catch (error) {
      console.error(error);
      setResultMessage(`Ошибка: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>Сравнение PDF файлов</h2>
      <p style={{ color: 'gray', fontSize: '14px' }}>Примечание: Второй файл используется как основа для сравнения.</p>

      <div style={{ marginBottom: '15px' }}>
        <label>
          <strong>Файл 1: </strong>
          <input type="file" accept="application/pdf" onChange={(e) => setFile1(e.target.files[0])} />
        </label>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>
          <strong>Файл 2 (Основа): </strong>
          <input type="file" accept="application/pdf" onChange={(e) => setFile2(e.target.files[0])} />
        </label>
      </div>

      <button onClick={handleCompare} disabled={loading || !serverReady} style={{ padding: '10px 20px', cursor: 'pointer' }}>
        {loading ? 'Идет сравнение...' : serverReady ? 'Сравнить файлы' : 'Ожидание запуска сервера...'}
      </button>

      {resultMessage && (
        <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '5px' }}>
          <p>{resultMessage}</p>
          {resultUrl && (
            <a href={resultUrl} download="result.pdf" style={{ display: 'inline-block', marginTop: '10px', color: 'blue', textDecoration: 'underline' }}>
              Скачать результат (PDF)
            </a>
          )}
        </div>
      )}

      <div style={{ marginTop: '40px' }}>
        <button onClick={() => setShowLogs(!showLogs)} style={{ padding: '5px 10px', cursor: 'pointer', fontSize: '12px' }}>
          {showLogs ? 'Скрыть дебаг-логи' : 'Показать дебаг-логи'}
        </button>
        {showLogs && (
          <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#2b2b2b', color: '#a9b7c6', fontFamily: 'monospace', fontSize: '12px', height: '200px', overflowY: 'auto', whiteSpace: 'pre-wrap', borderRadius: '5px' }}>
            {logs.length === 0 ? 'Логов пока нет...' : logs.join('\n')}
          </div>
        )}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);
