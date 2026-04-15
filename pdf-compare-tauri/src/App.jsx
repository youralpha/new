import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import { Container, Card, Flex, Text, TextField, Button, Heading, Callout, Box, Badge } from "@radix-ui/themes";
import { InfoCircledIcon, CheckCircledIcon, CrossCircledIcon, UpdateIcon } from "@radix-ui/react-icons";
import * as pdfjsLib from "pdfjs-dist";

// Provide the worker directly from the locally installed node_modules folder using standard ES URL resolution
// This prevents Vite builder crashes (white screens) caused by the ?url syntax.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.js",
  import.meta.url
).toString();

function App() {
  const [file1, setFile1] = useState("");
  const [file2, setFile2] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function renderPageToCanvas(pdfDoc, pageNum, scale = 2.0) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
      background: "rgba(255,255,255,1)"
    };

    await page.render(renderContext).promise;

    return {
      canvas,
      ctx,
      width: canvas.width,
      height: canvas.height,
      data: ctx.getImageData(0, 0, canvas.width, canvas.height).data
    };
  }

  async function handleCompare() {
    if (!file1 || !file2) {
      setError("Пожалуйста, введите полные пути к обоим файлам на вашем компьютере.");
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);
    setProgressMsg("Чтение файлов...");

    try {
      // 1. Read PDF files via Tauri FS API
      const file1Data = await readFile(file1);
      const file2Data = await readFile(file2);

      setProgressMsg("Парсинг документов (PDF.js)...");
      const doc1 = await pdfjsLib.getDocument({ data: file1Data }).promise;
      const doc2 = await pdfjsLib.getDocument({ data: file2Data }).promise;

      const numPages1 = doc1.numPages;
      const numPages2 = doc2.numPages;
      const commonPages = Math.min(numPages1, numPages2);

      let processedPages = [];

      for (let i = 1; i <= commonPages; i++) {
        setProgressMsg(`Сравнение страницы ${i} из ${commonPages}...`);

        // Render pages (scale=3 roughly equals A3 at high DPI)
        const scale = 3.0;
        const page1Img = await renderPageToCanvas(doc1, i, scale);
        const page2Img = await renderPageToCanvas(doc2, i, scale);

        const maxWidth = Math.max(page1Img.width, page2Img.width);
        const maxHeight = Math.max(page1Img.height, page2Img.height);

        // We do absolute diff on canvas pixels directly
        const outCanvas = document.createElement("canvas");
        outCanvas.width = maxWidth;
        outCanvas.height = maxHeight;
        const outCtx = outCanvas.getContext("2d");

        // Fill white background
        outCtx.fillStyle = "white";
        outCtx.fillRect(0, 0, maxWidth, maxHeight);
        const outImageData = outCtx.getImageData(0, 0, maxWidth, maxHeight);
        const outData = outImageData.data;

        for (let y = 0; y < maxHeight; y++) {
          for (let x = 0; x < maxWidth; x++) {
            const idx = (y * maxWidth + x) * 4;

            // Get pixels (handling different page sizes)
            let r1=255, g1=255, b1=255;
            if (x < page1Img.width && y < page1Img.height) {
              const idx1 = (y * page1Img.width + x) * 4;
              r1 = page1Img.data[idx1];
              g1 = page1Img.data[idx1+1];
              b1 = page1Img.data[idx1+2];
            }

            let r2=255, g2=255, b2=255, a2=255;
            if (x < page2Img.width && y < page2Img.height) {
              const idx2 = (y * page2Img.width + x) * 4;
              r2 = page2Img.data[idx2];
              g2 = page2Img.data[idx2+1];
              b2 = page2Img.data[idx2+2];
              a2 = page2Img.data[idx2+3];
            }

            const gray1 = (r1 + g1 + b1) / 3;
            const gray2 = (r2 + g2 + b2) / 3;

            if (Math.abs(gray1 - gray2) > 10) {
              // Difference found -> blend pure red over file 2 pixel
              outData[idx]   = Math.round(r2 * 0.5 + 255 * 0.5); // R
              outData[idx+1] = Math.round(g2 * 0.5);             // G
              outData[idx+2] = Math.round(b2 * 0.5);             // B
              outData[idx+3] = 255;                              // A
            } else {
              // No difference -> keep file 2 pixel
              outData[idx]   = r2;
              outData[idx+1] = g2;
              outData[idx+2] = b2;
              outData[idx+3] = 255;
            }
          }
        }

        // Pass data to Rust via IPC to save memory
        // Sending raw arrays over IPC can be heavy, but Tauri handles it fast enough
        processedPages.push({
            data: Array.from(outData),
            width: maxWidth,
            height: maxHeight
        });
      }

      setProgressMsg("Сохранение PDF (Rust)...");
      const response = await invoke("create_pdf", {
          file2Path: file2,
          pages: processedPages
      });

      if (response.success) {
        setResult(response);
      } else {
        setError(response.message);
      }

    } catch (err) {
      console.error(err);
      setError(`Ошибка: ${err.message || err}`);
    } finally {
      setLoading(false);
      setProgressMsg("");
    }
  }

  return (
    <Container size="2" style={{ padding: '40px 20px' }}>
      <Flex direction="column" gap="5">
        <Box>
          <Heading size="7" mb="2">Сравнение чертежей (PDF)</Heading>
          <Text color="gray" size="3" as="div" mb="2">
            Инструмент на базе Tauri + React (PDF.js).
          </Text>
          <Callout.Root color="blue" size="1">
            <Callout.Icon><InfoCircledIcon /></Callout.Icon>
            <Callout.Text>
              Все изменения и отличия подсвечиваются полупрозрачным <b>красным цветом</b>.
              За основу берется <b>второй файл</b>, а красным выделяется то, что было изменено, удалено или добавлено по сравнению с первым файлом.
            </Callout.Text>
          </Callout.Root>
        </Box>

        <Card size="3" variant="surface">
          <Flex direction="column" gap="4">
            <Box>
              <Text as="div" size="2" mb="1" weight="bold">Оригинальный файл (Файл 1)</Text>
              <TextField.Root
                placeholder="C:\Users\Admin\Documents\old_plan.pdf"
                value={file1}
                onChange={(e) => setFile1(e.target.value)}
              />
            </Box>

            <Box>
              <Text as="div" size="2" mb="1" weight="bold">Новый файл (Основа, Файл 2)</Text>
              <TextField.Root
                placeholder="C:\Users\Admin\Documents\new_plan.pdf"
                value={file2}
                onChange={(e) => setFile2(e.target.value)}
              />
            </Box>

            <Button size="3" mt="2" onClick={handleCompare} disabled={loading}>
              {loading ? <><UpdateIcon className="spin" /> {progressMsg}</> : "Сравнить файлы"}
            </Button>
          </Flex>
        </Card>

        {error && (
          <Callout.Root color="red">
            <Callout.Icon><CrossCircledIcon /></Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        {result && (
          <Card size="3" variant="classic">
            <Flex direction="column" gap="3">
              <Flex align="center" gap="2">
                <CheckCircledIcon color="green" width="24" height="24" />
                <Heading size="4">Сравнение завершено</Heading>
              </Flex>

              <Text size="3">{result.message}</Text>

              {result.output_path && (
                <Callout.Root color="green" mt="2">
                  <Callout.Icon><InfoCircledIcon /></Callout.Icon>
                  <Callout.Text>
                    Итоговый PDF сохранен по пути: <br/>
                    <strong>{result.output_path}</strong>
                  </Callout.Text>
                </Callout.Root>
              )}
            </Flex>
          </Card>
        )}
      </Flex>

      <style dangerouslySetInnerHTML={{__html: `
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}} />
    </Container>
  );
}

export default App;
