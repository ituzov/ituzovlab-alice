// Общение с нейросетью: отправляем историю разговора, получаем ответ.
import { config } from './config.js';

export async function askModel(history) {
  const startedAt = Date.now();

  const request = {
    model: config.model,
    messages: [
      { role: 'system', content: config.systemPrompt },
      ...history,
    ],
    // Максимальная длина ответа (с запасом: сюда входят и «размышления» модели)
    max_completion_tokens: 1500,
  };
  if (config.reasoningEffort) {
    request.reasoning_effort = config.reasoningEffort;
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Модель вернула ошибку ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const answer = cleanForSpeech(data.choices[0].message.content);

  console.log(`← (${Date.now() - startedAt} мс) ${answer}`);
  return answer;
}

// Убираем то, что колонка не сможет нормально прочитать вслух:
// звёздочки, решётки, ссылки, маркеры списков
function cleanForSpeech(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [текст](ссылка) → текст
    .replace(/[*_`#>]/g, '')                // markdown-символы
    .replace(/^\s*[-•]\s+/gm, '')           // маркеры списков
    .trim();
}
