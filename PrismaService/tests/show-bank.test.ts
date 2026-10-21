import test from 'node:test';
import assert from 'node:assert/strict';
import { showBank, seedShowBank, SHOW_COURSE_ID, SHOW_LEVEL_ID } from '../prisma/show-bank';
import { learningInsights } from '../src/services/learning-insights';
import { checkShowAnswer, publicContent } from '../src/services/show-rules';

const task = (id: string) => {
  const found = showBank.tasks.find(value => value.id === id);
  assert.ok(found, `Missing reviewed task ${id}`);
  return found;
};

test('demo has three complete topics and balanced difficulty/format coverage', () => {
  assert.equal(showBank.topics.length, 3);
  assert.equal(showBank.tasks.length, 36);
  assert.equal(new Set(showBank.tasks.map(t => t.id)).size, 36);
  for (const topic of showBank.topics) {
    const tasks = showBank.tasks.filter(t => t.topicId === topic.id);
    assert.equal(tasks.length, 12);
    for (const difficulty of ['EASY', 'MEDIUM', 'HARD']) {
      const group = tasks.filter(t => t.difficulty === difficulty);
      assert.equal(group.length, 4);
      assert.deepEqual(new Set(group.map(t => t.taskType)), new Set(['MULTIPLE_CHOICE', 'SEQUENCE', 'MATCHING', 'NUMERIC']));
    }
  }
});

test('answer encodings are valid, unambiguous and separate from public metadata', () => {
  for (const question of showBank.tasks) {
    assert.ok(question.question && question.explanation && question.hint);
    assert.ok(question.id.length <= 36 && question.topicId.length <= 36, 'SQL Server identifier length');
    const content = JSON.parse(question.content);
    assert.equal('correctAnswer' in content, false);
    if (question.taskType === 'MULTIPLE_CHOICE') {
      assert.equal(question.options.length, 4);
      assert.equal(new Set(question.options).size, 4);
      assert.equal(question.options.filter(o => o === question.correctAnswer).length, 1);
    } else {
      assert.deepEqual(question.options, []);
      if (question.taskType === 'SEQUENCE') {
        const answer = JSON.parse(question.correctAnswer);
        assert.equal(content.items.length, 4);
        assert.equal(new Set(content.items).size, content.items.length);
        assert.deepEqual(new Set(answer), new Set(content.items));
        assert.equal(answer.length, content.items.length);
        assert.notDeepEqual(answer, content.items, 'Displayed order must be shuffled');
      } else if (question.taskType === 'MATCHING') {
        const answer = JSON.parse(question.correctAnswer);
        assert.equal(content.left.length, 3);
        assert.equal(new Set(content.left).size, content.left.length);
        assert.equal(new Set(content.right).size, content.right.length);
        assert.deepEqual(new Set(Object.keys(answer)), new Set(content.left));
        assert.deepEqual(new Set(Object.values(answer)), new Set(content.right));
        assert.notDeepEqual(Object.values(answer), content.right, 'Displayed right column must be shuffled');
      } else {
        assert.equal(content.tolerance, 0);
        assert.ok(Number.isFinite(Number(question.correctAnswer)));
      }
    }
  }
});

test('the server checker accepts all reviewed keys and rejects incorrect format answers', () => {
  for (const question of showBank.tasks) {
    const serverTask = { ...question, options: question.options.map((text, order) => ({ id: `option-${order}`, text, order })) };
    assert.equal(checkShowAnswer(serverTask, question.correctAnswer), true, question.id);
    assert.equal('correctAnswer' in publicContent(serverTask), false);
    let incorrect = '';
    if (question.taskType === 'MULTIPLE_CHOICE') incorrect = question.options.find(value => value !== question.correctAnswer)!;
    else if (question.taskType === 'NUMERIC') incorrect = String(Number(question.correctAnswer) + 1);
    else if (question.taskType === 'SEQUENCE') incorrect = JSON.stringify(JSON.parse(question.correctAnswer).reverse());
    else {
      const pairs = JSON.parse(question.correctAnswer), keys = Object.keys(pairs);
      [pairs[keys[0]], pairs[keys[1]]] = [pairs[keys[1]], pairs[keys[0]]];
      incorrect = JSON.stringify(pairs);
    }
    assert.equal(checkShowAnswer(serverTask, incorrect), false, question.id);
    assert.equal(checkShowAnswer(serverTask, '[]'), false, `${question.id}: invalid array`);
  }
});

test('all numeric keys agree with independently computed results', () => {
  let repeatedProduct = 2;
  for (let i = 0; i < 3; i++) repeatedProduct *= 3;
  const binarySearchLengths: number[] = [];
  for (let target = 0; target < 15; target++) {
    let left = 0, right = 14, steps = 0;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      steps++;
      if (mid === target) break;
      if (target < mid) right = mid - 1; else left = mid + 1;
    }
    binarySearchLengths.push(steps);
  }
  const scoreValues = [4, 6, 8, null].filter((v): v is number => v !== null);
  const expected: Record<string, number> = {
    'show-task-1-02': [1, 2, 3, 4].reduce((sum, n) => sum + n, 0),
    'show-task-1-06': repeatedProduct,
    'show-task-1-10': Math.max(...binarySearchLengths),
    'show-task-2-02': 3 * 8,
    'show-task-2-06': 16 * 16 * 8 / 8,
    'show-task-2-10': 2048 / 1024,
    'show-task-3-02': 5 - 2,
    'show-task-3-06': Array.from({ length: 4 }).flatMap(() => Array.from({ length: 3 })).length,
    'show-task-3-10': scoreValues.reduce((sum, n) => sum + n, 0) / scoreValues.length
  };
  assert.equal(Object.keys(expected).length, showBank.tasks.filter(t => t.taskType === 'NUMERIC').length);
  for (const [id, value] of Object.entries(expected)) assert.equal(Number(task(id).correctAnswer), value, id);
});

test('choice keys agree with traces, bit ranges and reviewed database rules', () => {
  let loopCount = 0;
  for (let i = 0; i < 5; i++) loopCount++;
  let nestedCount = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) nestedCount++;
  const expected: Record<string, string> = {
    'show-task-1-01': String(4 + 3), 'show-task-1-05': String(loopCount), 'show-task-1-09': String(nestedCount),
    'show-task-2-01': '8', 'show-task-2-05': String(2 ** 5 - 1), 'show-task-2-09': `От −${2 ** 7} до ${2 ** 7 - 1}`,
    'show-task-3-01': 'SELECT', 'show-task-3-05': String([1, 2, 3, 4].filter(id => id >= 2).length),
    'show-task-3-09': 'Обе операции фиксируются вместе либо обе отменяются'
  };
  assert.equal(Object.keys(expected).length, showBank.tasks.filter(t => t.taskType === 'MULTIPLE_CHOICE').length);
  for (const [id, value] of Object.entries(expected)) assert.equal(task(id).correctAnswer, value, id);
});

test('ordered answers obey numeric ordering and program/data dependencies', () => {
  const numberOrder = JSON.parse(task('show-task-1-07').correctAnswer).map(Number);
  assert.deepEqual(numberOrder, [8, 3, 6, 1].sort((a, b) => a - b));
  const binaryOrder = JSON.parse(task('show-task-2-03').correctAnswer).map((value: string) => parseInt(value, 2));
  assert.deepEqual(binaryOrder, [0, 1, 2, 3]);
  const sizes: Record<string, number> = { '1 бит': 1, '1 байт': 8, '1 KiB': 8 * 1024, '1 MiB': 8 * 1024 ** 2 };
  const units = JSON.parse(task('show-task-2-07').correctAnswer) as string[];
  assert.deepEqual(units.map(v => sizes[v]), Object.values(sizes).sort((a, b) => a - b));
  const dependencies: Record<string, [string, string][]> = {
    'show-task-1-03': [['Начать алгоритм', 'Ввести число x'], ['Ввести число x', 'Вычислить результат = 2 × x'], ['Вычислить результат = 2 × x', 'Вывести результат']],
    'show-task-1-11': [['x = 3', 'y = x + 2'], ['y = x + 2', 'z = y × y'], ['z = y × y', 'Вывести z']],
    'show-task-2-11': [['Назначить разрядам слева направо веса 8, 4, 2, 1', 'Выбрать веса разрядов с цифрой 1: 8, 4, 1'], ['Выбрать веса разрядов с цифрой 1: 8, 4, 1', 'Сложить выбранные веса: 8 + 4 + 1'], ['Сложить выбранные веса: 8 + 4 + 1', 'Записать итог: 13']],
    'show-task-3-07': [['Создать запрос с параметром @name', 'Передать введённое имя как значение параметра @name'], ['Передать введённое имя как значение параметра @name', 'Выполнить подготовленный запрос'], ['Выполнить подготовленный запрос', 'Получить и прочитать результат']],
    'show-task-3-11': [['BEGIN TRANSACTION — начать транзакцию', 'Списать сумму со счёта A'], ['Списать сумму со счёта A', 'Зачислить сумму на счёт B'], ['Зачислить сумму на счёт B', 'COMMIT — зафиксировать транзакцию']]
  };
  for (const [id, edges] of Object.entries(dependencies)) {
    const order = JSON.parse(task(id).correctAnswer) as string[];
    for (const [before, after] of edges) assert.ok(order.indexOf(before) < order.indexOf(after), `${id}: ${before} precedes ${after}`);
  }
  const sql = JSON.parse(task('show-task-3-03').correctAnswer).join(' ');
  assert.equal(sql, 'SELECT name FROM Students WHERE active = 1 ORDER BY name');
  assert.equal(parseInt('1101', 2), 8 + 4 + 1);
});

test('matching keys cover all reviewed concepts without duplicate right-hand meanings', () => {
  const assertions: Record<string, Record<string, string>> = {
    'show-task-1-04': { 'Следование': 'Команды выполняются одна за другой', 'Ветвление': 'Выбор команды зависит от условия', 'Цикл': 'Команды повторяются' },
    'show-task-1-08': { 'И (AND)': 'Истина, если оба условия истинны', 'ИЛИ (OR)': 'Истина, если хотя бы одно условие истинно', 'НЕ (NOT)': 'Меняет истину на ложь и ложь на истину' },
    'show-task-1-12': { 'Линейный поиск': 'O(n)', 'Двоичный поиск в отсортированном массиве': 'O(log n)', 'Сортировка выбором': 'O(n²)' },
    'show-task-2-04': { 'Логический': 'true', 'Целочисленный': '42', 'Строковый': '"Привет"' },
    'show-task-2-08': { 'Двоичная': '2', 'Десятичная': '10', 'Шестнадцатеричная': '16' },
    'show-task-2-12': { 'Сжатие без потерь': 'Позволяет полностью восстановить исходные данные', 'Сжатие с потерями': 'Может необратимо удалить часть информации', 'Контрольная сумма': 'Помогает обнаружить изменение данных' },
    'show-task-3-04': { 'Строка': 'Одна запись об объекте', 'Столбец': 'Один вид свойства для всех записей', 'Таблица': 'Набор строк с общей структурой столбцов' },
    'show-task-3-08': { 'PRIMARY KEY': 'Уникально определяет строку и запрещает NULL', 'FOREIGN KEY': 'Связывает значение с ключом другой таблицы', 'NOT NULL': 'Запрещает отсутствие значения в столбце' },
    'show-task-3-12': { 'SQL-инъекция': 'Параметризованные запросы', 'Внедрение скрипта в HTML (XSS)': 'Контекстное кодирование выводимых данных', 'Перехват данных при передаче': 'Шифрование соединения с помощью TLS' }
  };
  assert.equal(Object.keys(assertions).length, showBank.tasks.filter(t => t.taskType === 'MATCHING').length);
  for (const [id, expected] of Object.entries(assertions)) assert.deepEqual(JSON.parse(task(id).correctAnswer), expected, id);
});

test('seed is repeatable, preserves prior courses and supplies one immediately playable level', async () => {
  const stores = Object.fromEntries(['course', 'level', 'topic', 'task'].map(name => [name, new Map<string, any>()]));
  stores.course.set('existing-course', { id: 'existing-course', title: 'Keep me' });
  const mock = Object.fromEntries(Object.entries(stores).map(([name, rows]) => [name, {
    async upsert({ where, create, update }: any) {
      const data = rows.has(where.id) ? { ...rows.get(where.id), ...update } : create;
      rows.set(where.id, structuredClone(data));
      return data;
    }
  }]));
  await seedShowBank(mock as any);
  await seedShowBank(mock as any);
  assert.deepEqual(stores.course.get('existing-course'), { id: 'existing-course', title: 'Keep me' });
  assert.equal(stores.course.size, 2);
  assert.equal(stores.course.get(SHOW_COURSE_ID).isPublished, true);
  assert.equal(stores.level.size, 1);
  assert.equal(stores.level.get(SHOW_LEVEL_ID).requiredXP, 0);
  assert.equal(stores.level.get(SHOW_LEVEL_ID).isLocked, false);
  assert.equal(stores.topic.size, 3);
  assert.equal(stores.task.size, 36);
  assert.equal(new Set([...stores.task.values()].map(t => t.order)).size, 36);
  assert.ok([...stores.task.values()].every(t => t.levelId === SHOW_LEVEL_ID && t.xpReward > 0 && t.timeLimit > 0));
  const ids = [...stores.task.values()].flatMap(t => t.options.create.map((o: any) => o.id));
  assert.equal(ids.length, 36);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => id.length <= 36));
});

test('learning insights handle empty history, invalid times and insufficient topic observations', () => {
  assert.deepEqual(learningInsights([], []), { averageTimeSeconds: 0, topics: [], strongTopics: [], weakTopics: [], strongTopic: null, weakTopic: null });
  const result = learningInsights([{ timeSpent: 10 }, { timeSpent: 20 }, { timeSpent: 21 }, { timeSpent: -1 }, { timeSpent: NaN }], [
    { topicId: 'good', correct: 4, wrong: 1, topic: { name: 'Алгоритмы', courseId: 'demo' } },
    { topicId: 'needs-practice', correct: 1, wrong: 3, topic: { name: 'Данные', courseId: 'demo' } },
    { topicId: 'too-early', correct: 0, wrong: 1, topic: { name: 'Базы', courseId: 'demo' } },
    { topicId: 'no-attempts', correct: 0, wrong: 0, topic: { name: 'Сети', courseId: 'demo' } }
  ]);
  assert.equal(result.averageTimeSeconds, 17);
  assert.deepEqual(result.strongTopics.map(t => t.topicId), ['good']);
  assert.deepEqual(result.weakTopics.map(t => t.topicId), ['needs-practice']);
  assert.equal(result.strongTopic?.topicId, 'good');
  assert.equal(result.weakTopic?.topicId, 'needs-practice');
  assert.equal(result.topics.find(t => t.topicId === 'no-attempts')?.accuracy, 0);
  assert.equal(result.topics.find(t => t.topicId === 'good')?.accuracy, 80);
  assert.equal(result.topics.find(t => t.topicId === 'good')?.attempts, 5);
});
