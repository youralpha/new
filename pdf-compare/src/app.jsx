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

  useEffect(() => {
    const fetchPort = async () => {
      try {
        const p = await ipcRenderer.invoke('get-flask-port');
        setPort(p);
      } catch (err) {
        console.error("Failed to get port:", err);
      }
    };
    fetchPort();
  }, []);

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

      <button onClick={handleCompare} disabled={loading || !port} style={{ padding: '10px 20px', cursor: 'pointer' }}>
        {loading ? 'Идет сравнение...' : 'Сравнить файлы'}
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
    </div>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);
