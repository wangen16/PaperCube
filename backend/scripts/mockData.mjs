const BASE_URL = 'http://127.0.0.1:6039';

let token = '';

async function login() {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const json = await res.json();
  if (json.code !== 200) throw new Error('Login failed: ' + json.msg);
  token = json.data.access_token;
  console.log('Logged in successfully!');
}

async function fetchAuth(url, options = {}) {
  options.headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };
  const res = await fetch(url, options);
  const json = await res.json();
  if (json.code !== 200) throw new Error(`API Error ${url}: ` + json.msg);
  return json;
}

async function listCategories() {
  const json = await fetchAuth(`${BASE_URL}/exam/knowledge-category/list`);
  return json.data || [];
}

async function createCategory(categoryName, parentId = 0) {
  return await fetchAuth(`${BASE_URL}/exam/knowledge-category`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoryName, parentId, status: '0', orderNum: 1 })
  });
}

async function getOrCreateCategory(name, parentId = 0) {
  const cats = await listCategories();
  let cat = cats.find(c => String(c.categoryName) === name && Number(c.parentId || 0) === Number(parentId));
  if (!cat) {
    console.log(`Creating category: ${name} (parentId: ${parentId})`);
    await createCategory(name, parentId);
    const newCats = await listCategories();
    cat = newCats.find(c => String(c.categoryName) === name && Number(c.parentId || 0) === Number(parentId));
    if (!cat) throw new Error('Not found after creation');
  }
  return cat.categoryId;
}

async function createQuestion(categoryId, index, subtitle) {
  const payload = {
    analysis: `这是关于${subtitle}第 ${index} 题的解析说明，主要考察学生的基础理解能力。`,
    attachments: [],
    autoGrading: "1",
    content: `<p>【模拟题-${subtitle}】以下关于课文内容的描述，哪个选项是正确的？(题号：${index})</p>`,
    difficulty: (index % 3 + 1).toString(),
    knowledgeCategoryId: categoryId,
    options: [
      { key: "A", value: "这是干扰项A", isCorrect: false },
      { key: "B", value: "这是正确选项B", isCorrect: true },
      { key: "C", value: "这是干扰项C", isCorrect: false },
      { key: "D", value: "这是干扰项D", isCorrect: false }
    ],
    questionType: "1", 
    standardAnswer: { answers: ["B"] },
    status: "0",
    tags: ["批量模拟", subtitle]
  };

  await fetchAuth(`${BASE_URL}/exam/question`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function run() {
  await login();
  
  console.log('Initializing categories...');
  const gaoyiId = await getOrCreateCategory('高一', 0);
  const yuwenId = await getOrCreateCategory('语文', gaoyiId);
  const shangceId = await getOrCreateCategory('上册', yuwenId);
  const xiaceId = await getOrCreateCategory('下册', yuwenId);

  console.log(`Resolved IDs: 高一=${gaoyiId}, 语文=${yuwenId}, 上册=${shangceId}, 下册=${xiaceId}`);

  console.log('Generating 50 questions for 上册...');
  for(let i = 1; i <= 50; i++) {
    await createQuestion(shangceId, i, '上册');
    if (i % 10 === 0) console.log(`  ...created ${i} questions`);
  }

  console.log('Generating 50 questions for 下册...');
  for(let i = 1; i <= 50; i++) {
    await createQuestion(xiaceId, i, '下册');
    if (i % 10 === 0) console.log(`  ...created ${i} questions`);
  }

  console.log('Successfully created 100 questions!');
}

run().catch(console.error);
