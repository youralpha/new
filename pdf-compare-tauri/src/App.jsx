import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Container, Card, Flex, Text, TextField, Button, Heading, Badge, Box, Callout } from "@radix-ui/themes";
import { InfoCircledIcon, CheckCircledIcon, CrossCircledIcon, UpdateIcon } from "@radix-ui/react-icons";

function App() {
  const [file1, setFile1] = useState("");
  const [file2, setFile2] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleCompare() {
    if (!file1 || !file2) {
      setError("Пожалуйста, введите полные пути к обоим файлам на вашем компьютере.");
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await invoke("compare_pdfs", { file1, file2 });
      if (response.success) {
        setResult(response);
      } else {
        setError(response.message);
      }
    } catch (err) {
      setError(`Критическая ошибка: ${err}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container size="2" style={{ padding: '40px 20px' }}>
      <Flex direction="column" gap="5">
        <Box>
          <Heading size="7" mb="2">Сравнение чертежей (PDF)</Heading>
          <Text color="gray" size="3" as="div" mb="2">
            Инструмент на базе Tauri + Rust.
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
              {loading ? <><UpdateIcon className="spin" /> Идет обработка...</> : "Сравнить файлы"}
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

              <Box mt="2" p="3" style={{ backgroundColor: 'var(--gray-a3)', borderRadius: 'var(--radius-3)' }}>
                <Text as="div" size="2" weight="bold" mb="2">Анализ страниц:</Text>
                <Flex gap="3" wrap="wrap">
                  <Badge color="blue" size="2">Файл 1: {result.metadata.num_pages1} стр.</Badge>
                  <Badge color="indigo" size="2">Файл 2: {result.metadata.num_pages2} стр.</Badge>

                  {result.metadata.status === "pages_decreased" && (
                    <Badge color="red" size="2">Страниц стало меньше!</Badge>
                  )}
                  {result.metadata.status === "pages_increased" && (
                    <Badge color="orange" size="2">Добавлены новые страницы</Badge>
                  )}
                  {result.metadata.status === "pages_equal" && (
                    <Badge color="green" size="2">Количество совпадает</Badge>
                  )}
                </Flex>
              </Box>

              {result.output_path && (
                <Callout.Root color="green" mt="2">
                  <Callout.Icon><InfoCircledIcon /></Callout.Icon>
                  <Callout.Text>
                    Измененные изображения сохранены по пути: <br/>
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
