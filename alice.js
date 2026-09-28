// Логика навыка: решаем, что ответить на реплику пользователя.
import { config } from './config.js';
import { askModel } from './llm.js';

const EXIT_WORDS = ['хватит', 'стоп', 'выход', 'пока', 'закончить'];
const CONTINUE_WORDS = ['дальше', 'ну', 'ну что', 'ну что там', 'что там', 'продолжай', 'давай', 'готово'];

// Память разговоров. Для каждого сеанса храним:
//   history: все реплики (пользователя и модели)
//   pendingAnswer: ответ, который модель ещё готовит (если не успела вовремя)
const dialogs = new Map();

function getDialog(sessionId) {
  if (!dialogs.has(sessionId)) {
    dialogs.set(sessionId, { history: [], pendingAnswer: null });
  }
  return dialogs.get(sessionId);
}

// Главная функция: получает запрос от Алисы, возвращает ответ
export async function makeAnswer(alice) {
  const sessionId = alice.session.session_id;
  const userText = (alice.request.original_utterance || '').trim();
  const command = normalize(alice.request.command || '');
  const dialog = getDialog(sessionId);

  // 1. Яндекс иногда проверяет, жив ли навык
  if (userText === 'ping') {
    return say('pong');
  }

  // 2. Навык только что запустили
  if (alice.session.new && !userText) {
    return say('Привет! Я на связи, спрашивай что угодно.');
  }

  // 3. Пользователь хочет выйти
  if (EXIT_WORDS.includes(command)) {
    dialogs.delete(sessionId);
    return { text: 'Давай, до связи!', endSession: true };
  }

  // 4. «Дальше»: отдаём ответ, который модель не успела договорить в прошлый раз
  if (dialog.pendingAnswer && CONTINUE_WORDS.includes(command)) {
    return deliver(dialog, dialog.pendingAnswer, 'Ещё думаю, спроси через пару секунд.');
  }

  // 5. Обычный вопрос. Если модель ещё думает над прошлым, встаём в очередь за ним
  const previous = dialog.pendingAnswer || Promise.resolve();
  dialog.pendingAnswer = previous.then(() => askAndRemember(dialog, userText));
  return deliver(dialog, dialog.pendingAnswer, 'Секунду, думаю. Скажи «дальше».');
}

// Ждём ответ модели, но не дольше, чем готова ждать Алиса.
// Успела: отдаём ответ. Не успела: говорим waitText, а ответ заберём по «дальше»
async function deliver(dialog, answerPromise, waitText) {
  const answer = await waitAtMost(answerPromise, config.waitForAnswerMs);
  if (!answer) {
    return say(waitText);
  }
  // Пока ждали, пользователь мог задать новый вопрос, тогда его ответ не трогаем
  if (dialog.pendingAnswer === answerPromise) {
    dialog.pendingAnswer = null;
  }
  return say(answer);
}

// Спрашиваем модель и сохраняем вопрос и ответ в историю разговора
async function askAndRemember(dialog, question) {
  dialog.history.push({ role: 'user', content: question });
  try {
    const answer = await askModel(dialog.history);
    dialog.history.push({ role: 'assistant', content: answer });

    // Храним только последние реплики, чтобы запросы не разрастались
    if (dialog.history.length > config.maxHistory) {
      dialog.history = dialog.history.slice(-config.maxHistory);
    }
    return answer;
  } catch (error) {
    console.error('✗', error.message);
    dialog.history.pop(); // убираем вопрос, на который не ответили
    return 'Не получилось достучаться до модели, попробуй ещё раз.';
  }
}

// «Алиса, дальше!» → «дальше»
function normalize(command) {
  return command
    .toLowerCase()
    .replace(/[.,!?«»]/g, '')
    .replace(/^алиса\s+/, '')
    .trim();
}

// Ждём ответ, но не дольше ms миллисекунд. Не дождались: вернём null
function waitAtMost(promise, ms) {
  const timer = new Promise((resolve) => setTimeout(() => resolve(null), ms));
  return Promise.race([promise, timer]);
}

// Алиса читает не больше 1024 символов
function say(text) {
  return { text: text.slice(0, 1024), endSession: false };
}
