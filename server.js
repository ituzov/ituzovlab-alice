// Сервер: принимает запросы от Алисы и отдаёт ответы.
import express from 'express';
import { config } from './config.js';
import { makeAnswer } from './alice.js';

if (!config.apiKey) {
  console.error('Нет API_KEY: положи его в файл .env');
  process.exit(1);
}

const app = express();
app.use(express.json());

// Проверка, что сервер жив: открой адрес в браузере, увидишь «ok».
// /health для «Пути проверки состояния» в App Platform
app.get(['/', '/health'], (req, res) => {
  res.send('ok');
});

// Сюда Алиса присылает каждую фразу пользователя
app.post('/', async (req, res) => {
  const alice = req.body;

  // Чужой навык? Не отвечаем (защита от тех, кто найдёт адрес туннеля)
  if (config.skillId && alice.session.skill_id !== config.skillId) {
    return res.sendStatus(403);
  }

  console.log(`→ ${alice.request.original_utterance || '(навык запущен)'}`);

  const answer = await makeAnswer(alice);

  // Формат ответа, который ждёт Алиса
  res.json({
    version: alice.version,
    response: {
      text: answer.text,
      end_session: answer.endSession,
    },
  });
});

app.listen(config.port, () => {
  console.log(`Алиса-сервер на :${config.port}, модель ${config.model}`);
});
