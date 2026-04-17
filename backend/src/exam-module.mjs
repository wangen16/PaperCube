import {
  getQuestionTypeHandler,
  getQuestionTypeHandlerOrThrow,
} from './exam-question-type-registry.mjs';

function safeParseJson(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toJsonText(value, fallback = '{}') {
  if (value == null || value === '') {
    return fallback;
  }
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(value);
    }
  }
  return JSON.stringify(value);
}

function toNumber(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function toTimestamp(value) {
  if (!value) {
    return null;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function csvFromRows(rows) {
  if (!rows.length) {
    return '';
  }
  const headers = Object.keys(rows[0]);
  const escapeCell = (value) => {
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replaceAll('"', '""')}"`;
    }
    return stringValue;
  };
  const body = rows.map((row) => headers.map((header) => escapeCell(row[header])).join(','));
  return [headers.join(','), ...body].join('\n');
}

function buildQuestionCsvRows(rows) {
  return rows.map((item) => ({
    autoGrading: item.autoGrading,
    content: item.content,
    createTime: item.createTime,
    difficulty: item.difficulty,
    knowledgeCategoryName: item.knowledgeCategoryName,
    questionId: item.questionId,
    questionType: item.questionType,
    status: item.status,
  }));
}

function buildScoreCsvRows(rows) {
  return rows.map((item) => ({
    examTitle: item.examTitle,
    recordId: item.recordId,
    score: item.totalScore,
    status: item.status,
    submitTime: item.submitTime,
    userName: item.userName,
  }));
}

export async function handleExamModule(context) {
  const {
    body,
    buildTree,
    getClassRoomById,
    getTable,
    getUserById,
    includesText,
    method,
    nextId,
    now,
    paginate,
    pathname,
    persistTables,
    query,
    response,
    sendError,
    sendFile,
    sendPage,
    sendSuccess,
    session,
    state,
  } = context;

  const getKnowledgeCategoryById = (categoryId) =>
    getTable('knowledge_category').find(
      (item) => Number(item.categoryId) === Number(categoryId) && item.delFlag !== '2',
    );

  const getQuestionById = (questionId) =>
    getTable('question').find(
      (item) => Number(item.questionId) === Number(questionId) && item.delFlag !== '2',
    );

  const getPaperById = (paperId) =>
    getTable('exam_paper').find(
      (item) => Number(item.paperId) === Number(paperId) && item.delFlag !== '2',
    );

  const getExamById = (examId) =>
    getTable('exam').find(
      (item) => Number(item.examId) === Number(examId) && item.delFlag !== '2',
    );

  const getStudentByUserId = (userId) =>
    getTable('student').find(
      (item) => Number(item.userId) === Number(userId) && item.delFlag !== '2',
    );

  const getSnapshotByExamAndUser = (examId, userId) =>
    getTable('exam_paper_snapshot').find(
      (item) =>
        Number(item.examId) === Number(examId) &&
        Number(item.userId) === Number(userId) &&
        item.delFlag !== '2',
    );

  const getRecordByExamAndUser = (examId, userId) =>
    getTable('exam_record').find(
      (item) =>
        Number(item.examId) === Number(examId) &&
        Number(item.userId) === Number(userId) &&
        item.delFlag !== '2',
    );

  const buildCategoryAncestors = (parentId) => {
    if (!parentId || Number(parentId) === 0) {
      return '0';
    }
    const parent = getKnowledgeCategoryById(parentId);
    if (!parent) {
      return '0';
    }
    return `${parent.ancestors},${parent.categoryId}`;
  };

  const generateCategoryCode = (parentId, excludeId) => {
    const parent = Number(parentId) === 0 ? null : getKnowledgeCategoryById(parentId);
    const prefix = parent?.categoryCode || '';
    const siblings = getTable('knowledge_category').filter(
      (item) =>
        item.delFlag !== '2' &&
        Number(item.parentId || 0) === Number(parentId || 0) &&
        Number(item.categoryId) !== Number(excludeId || 0),
    );
    const maxSegment = siblings.reduce((max, item) => {
      const code = String(item.categoryCode || '');
      const segment = code.slice(prefix.length, prefix.length + 3);
      return Math.max(max, Number.parseInt(segment || '0', 10) || 0);
    }, 0);
    return `${prefix}${String(maxSegment + 1).padStart(3, '0')}`;
  };

  const refreshCategoryChildren = (parent) => {
    const children = getTable('knowledge_category').filter(
      (item) => item.delFlag !== '2' && Number(item.parentId) === Number(parent.categoryId),
    );
    children.forEach((child) => {
      const localSegment = String(child.categoryCode || '').slice(-3).padStart(3, '0');
      child.ancestors = `${parent.ancestors},${parent.categoryId}`;
      child.categoryCode = `${parent.categoryCode}${localSegment}`;
      child.updateBy = 'admin';
      child.updateTime = now();
      refreshCategoryChildren(child);
    });
  };

  const collectCategoryIds = (categoryId) => {
    const target = Number(categoryId || 0);
    if (!target) {
      return [];
    }
    return getTable('knowledge_category')
      .filter((item) => {
        if (item.delFlag === '2') {
          return false;
        }
        if (Number(item.categoryId) === target) {
          return true;
        }
        const ancestors = String(item.ancestors || '').split(',');
        return ancestors.includes(String(target));
      })
      .map((item) => Number(item.categoryId));
  };

  const mapKnowledgeCategory = (item) => ({
    ...item,
    children: undefined,
    createTime: item.createTime || now(),
    parentName: getKnowledgeCategoryById(item.parentId)?.categoryName || '',
  });

  const buildKnowledgeCategoryTreeOptions = () => {
    const rows = getTable('knowledge_category')
      .filter((item) => item.delFlag !== '2')
      .map((item) => ({
        children: [],
        code: item.categoryCode,
        id: Number(item.categoryId),
        key: String(item.categoryId),
        label: item.categoryName,
        parentId: Number(item.parentId || 0),
        weight: Number(item.orderNum || 0),
      }));
    return buildTree(rows, 'id', 'parentId', 0);
  };

  const mapQuestion = (item) => {
    const category = getKnowledgeCategoryById(item.knowledgeCategoryId);
    return {
      ...item,
      attachments: safeParseJson(item.attachments, []),
      autoGrading: item.autoGrading ?? '1',
      createTime: item.createTime || now(),
      knowledgeCategoryName: category?.categoryName || '',
      options: safeParseJson(item.options, []),
      partialScoreRule: safeParseJson(item.partialScoreRule, {}),
      questionConfig: safeParseJson(item.questionConfig, {}),
      standardAnswer: safeParseJson(item.standardAnswer, {}),
      tags: safeParseJson(item.tags, []),
    };
  };

  const mapPaper = (item) => ({
    ...item,
    createTime: item.createTime || now(),
    paperStructure: safeParseJson(item.paperStructure, []),
  });

  const mapExam = (item) => {
    const paper = getPaperById(item.paperId);
    return {
      ...item,
      createTime: item.createTime || now(),
      paperTitle: paper?.title || '',
    };
  };

  const mapRecord = (item) => {
    const exam = getExamById(item.examId);
    const user = getUserById(item.userId);
    return {
      ...item,
      createTime: item.createTime || now(),
      examTitle: exam?.title || '',
      submitTime: item.submitTime || '',
      userAnswers: safeParseJson(item.userAnswers, {}),
      userName: user?.nickName || user?.userName || '',
    };
  };

  const buildQuestionSnapshot = (question, score) => {
    const handler = getQuestionTypeHandler(question.questionType);
    if (!handler) {
      return {
        analysis: question.analysis || '',
        attachments: safeParseJson(question.attachments, []),
        autoGrading: question.autoGrading ?? '1',
        content: question.content || '',
        difficulty: question.difficulty || '2',
        knowledgeCategoryId: Number(question.knowledgeCategoryId),
        options: safeParseJson(question.options, []),
        questionConfig: safeParseJson(question.questionConfig, {}),
        questionId: Number(question.questionId),
        questionType: question.questionType,
        score: Number(score || 0),
      };
    }
    return handler.buildSnapshotQuestion(mapQuestion(question), score);
  };

  const selectRandomQuestions = (filter, count, usedIds = new Set()) => {
    let categoryIds = [];
    if (filter.knowledgeCategoryIds?.length) {
      categoryIds = filter.knowledgeCategoryIds.flatMap(id => collectCategoryIds(id));
    } else if (filter.knowledgeCategoryId) {
      categoryIds = collectCategoryIds(filter.knowledgeCategoryId);
    }
    categoryIds = [...new Set(categoryIds)];

    const difficultyMin = toNumber(
      filter.difficultyMin ?? filter.difficulty,
      Number.NaN,
    );
    const difficultyMax = toNumber(
      filter.difficultyMax ?? filter.difficulty,
      Number.NaN,
    );
    let rows = getTable('question')
      .filter((item) => item.delFlag !== '2' && item.status === '0')
      .filter((item) => !usedIds.has(Number(item.questionId)));

    if (categoryIds.length > 0) {
      rows = rows.filter((item) => categoryIds.includes(Number(item.knowledgeCategoryId)));
    }
    if (filter.types?.length) {
      const typeStrings = filter.types.map(String);
      rows = rows.filter((item) => typeStrings.includes(String(item.questionType)));
    } else if (filter.type) {
      rows = rows.filter((item) => String(item.questionType) === String(filter.type));
    }
    if (!Number.isNaN(difficultyMin) || !Number.isNaN(difficultyMax)) {
      rows = rows.filter((item) => {
        const difficulty = toNumber(item.difficulty, 0);
        if (!Number.isNaN(difficultyMin) && difficulty < difficultyMin) {
          return false;
        }
        if (!Number.isNaN(difficultyMax) && difficulty > difficultyMax) {
          return false;
        }
        return true;
      });
    }

    // 方案一整改落实：应用层洗牌。剥离数据库排序操作。
    // 1. 模拟 SQL 查 ID: SELECT id FROM question WHERE [filters] AND id NOT IN (usedIds)
    const candidateIds = rows.map((item) => Number(item.questionId));

    // 2. 在应用层内存中仅对 ID 数组进行随机洗牌 (Fisher-Yates)
    for (let index = candidateIds.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [candidateIds[index], candidateIds[swapIndex]] = [candidateIds[swapIndex], candidateIds[index]];
    }

    // 3. 截取所需数量的目标 ID
    const selectedIds = candidateIds.slice(0, Number(count || 0));

    // 4. 根据选出的 ID 集合直接去取完整数据，模拟 SQL: SELECT * FROM question WHERE id IN (...)
    return selectedIds.map((id) => getQuestionById(id));
  };

  const generateBaselineSnapshot = (exam) => {
    const paper = getPaperById(exam.paperId);
    if (!paper) {
      throw new Error('试卷不存在');
    }
    const structure = safeParseJson(paper.paperStructure, []);
    const usedIds = new Set();
    const dynamicStructure = [];
    
    // 一、先正向循环整套试卷结构，记录原有固定题目Id，并复制一份结构准备操作
    structure.forEach((item, index) => {
      dynamicStructure.push({ ...item, _originalIndex: index });
      if (item.type === 'fixed') {
        const question = getQuestionById(item.questionId);
        if (!question) {
          throw new Error('试卷固定选题中包含已删除或不存在的试题，请重新配置试卷');
        }
        usedIds.add(Number(question.questionId));
      }
    });

    // 二、逆向循环试卷结构，针对需要在发布时生成的随机规则进行原位插入替换
    for (let i = dynamicStructure.length - 1; i >= 0; i--) {
      const item = dynamicStructure[i];
      if (item.type === 'random' && item.generateTiming === 'on_publish') {
        const selected = selectRandomQuestions(item.filter || {}, item.count, usedIds);
        if (selected.length < Number(item.count || 0)) {
          throw new Error(`【发布时随机抽取】题库中符合条件的试题不足 (需要 ${item.count} 题，实际只有 ${selected.length} 题)`);
        }
        
        const mappedItems = selected.map((question, selectedIndex) => {
          usedIds.add(Number(question.questionId));
          return {
            _isGenerated: true,
            _originalIndex: item._originalIndex,
            question,
            score: Number(item.scorePerItem || 0),
            selectedIndex
          };
        });
        
        // 抽取到试题后，插入到对应的试卷位置
        dynamicStructure.splice(i, 1, ...mappedItems);
      }
    }

    const questions = [];
    const answerRules = [];

    // 三、对已完成全部生成的试卷结构进行最终扁平化
    dynamicStructure.forEach((item) => {
      if (item.type === 'fixed') {
        const question = getQuestionById(item.questionId);
        questions.push({
          ...buildQuestionSnapshot(question, item.score),
          _structureIndex: item._originalIndex,
        });
        answerRules.push({
          autoGrading: question.autoGrading ?? '1',
          partialScoreRule: safeParseJson(question.partialScoreRule, {}),
          questionConfig: safeParseJson(question.questionConfig, {}),
          questionId: Number(question.questionId),
          questionType: question.questionType,
          score: Number(item.score || 0),
          standardAnswer: safeParseJson(question.standardAnswer, {}),
          _structureIndex: item._originalIndex,
        });
      } else if (item._isGenerated) {
        questions.push({
          ...buildQuestionSnapshot(item.question, item.score),
          _structureIndex: item._originalIndex,
        });
        answerRules.push({
          autoGrading: item.question.autoGrading ?? '1',
          partialScoreRule: safeParseJson(item.question.partialScoreRule, {}),
          questionConfig: safeParseJson(item.question.questionConfig, {}),
          questionId: Number(item.question.questionId),
          questionType: item.question.questionType,
          score: Number(item.score || 0),
          standardAnswer: safeParseJson(item.question.standardAnswer, {}),
          selectedIndex: item.selectedIndex,
          _structureIndex: item._originalIndex,
        });
      }
    });

    questions.forEach((q, i) => { q.orderNum = i + 1; });

    return {
      paperJson: toJsonText({
        examId: Number(exam.examId),
        paperId: Number(paper.paperId),
        passScore: Number(paper.passScore || 0),
        questions,
        title: paper.title,
        totalScore: questions.reduce((sum, item) => sum + Number(item.score || 0), 0),
        userId: 0,
      }),
      standardAnswerJson: toJsonText({ questions: answerRules }),
      examId: Number(exam.examId),
      userId: 0,
    };
  };

  const generateStudentSnapshot = (exam, userId) => {
    let baseline = getTable('exam_paper_snapshot').find(
      (item) => Number(item.examId) === Number(exam.examId) && Number(item.userId) === 0 && item.delFlag !== '2',
    );
    if (!baseline) {
      const generated = generateBaselineSnapshot(exam);
      baseline = {
        examId: Number(exam.examId),
        userId: 0,
        paperJson: generated.paperJson,
        standardAnswerJson: generated.standardAnswerJson,
      };
    }

    const baselinePaper = safeParseJson(baseline.paperJson, { questions: [] });
    const baselineAnswer = safeParseJson(baseline.standardAnswerJson, { questions: [] });

    const paper = getPaperById(exam.paperId);
    if (!paper) {
      throw new Error('试卷不存在');
    }
    const structure = safeParseJson(paper.paperStructure, []);
    
    // 一、先收集已确定发布时的全部题目ID（固定题+发布时抽出的题）
    const usedIds = new Set(baselinePaper.questions.map(q => Number(q.questionId)));
    const dynamicStructure = [];
    structure.forEach((item, index) => {
      dynamicStructure.push({ ...item, _originalIndex: index });
    });

    // 二、逆向循环试卷结构，针对考时生成的随机题进行原位插入替换
    for (let i = dynamicStructure.length - 1; i >= 0; i--) {
      const item = dynamicStructure[i];
      if (item.type === 'random' && item.generateTiming === 'on_exam') {
        const selected = selectRandomQuestions(item.filter || {}, item.count, usedIds);
        if (selected.length < Number(item.count || 0)) {
          throw new Error(`【考时随机抽取】题库中符合条件的试题不足 (需要 ${item.count} 题，实际只有 ${selected.length} 题)`);
        }
        
        const mappedItems = selected.map((question, selectedIndex) => {
          usedIds.add(Number(question.questionId));
          return {
            _isGenerated: true,
            _originalIndex: item._originalIndex,
            question,
            score: Number(item.scorePerItem || 0),
            selectedIndex
          };
        });
        
        // 考时抽取后，插入位置
        dynamicStructure.splice(i, 1, ...mappedItems);
      }
    }

    const finalQuestions = [];
    const finalAnswerRules = [];

    // 三、对完成双重抽题后的完整数组进行最终整合
    dynamicStructure.forEach((item) => {
      if (item.type === 'fixed' || (item.type === 'random' && item.generateTiming === 'on_publish')) {
        const bQs = baselinePaper.questions.filter(q => q._structureIndex === item._originalIndex);
        const bAs = baselineAnswer.questions.filter(a => a._structureIndex === item._originalIndex);
        finalQuestions.push(...bQs);
        finalAnswerRules.push(...bAs);
      } else if (item._isGenerated) {
        finalQuestions.push({
          ...buildQuestionSnapshot(item.question, item.score),
          _structureIndex: item._originalIndex,
        });
        finalAnswerRules.push({
          autoGrading: item.question.autoGrading ?? '1',
          partialScoreRule: safeParseJson(item.question.partialScoreRule, {}),
          questionConfig: safeParseJson(item.question.questionConfig, {}),
          questionId: Number(item.question.questionId),
          questionType: item.question.questionType,
          score: Number(item.score || 0),
          standardAnswer: safeParseJson(item.question.standardAnswer, {}),
          selectedIndex: item.selectedIndex,
          _structureIndex: item._originalIndex,
        });
      }
    });

    finalQuestions.forEach((q, i) => { q.orderNum = i + 1; });
    const totalScore = finalQuestions.reduce((sum, item) => sum + Number(item.score || 0), 0);

    return {
      paperJson: toJsonText({
        examId: Number(exam.examId),
        paperId: Number(paper.paperId),
        passScore: Number(paper.passScore || 0),
        questions: finalQuestions,
        title: paper.title,
        totalScore,
        userId: Number(userId),
      }),
      standardAnswerJson: toJsonText({ questions: finalAnswerRules }),
    };
  };

  const gradeQuestion = (rule, answer) => {
    const handler = getQuestionTypeHandler(rule.questionType);
    if (!handler) {
      return { isCorrect: false, manualRequired: true, score: 0 };
    }
    return handler.grade({ rule, userAnswer: answer });
  };

  const upsertRecordDetails = (recordId, details) => {
    state.tables.exam_record_detail = getTable('exam_record_detail').filter(
      (item) => Number(item.recordId) !== Number(recordId),
    );
    details.forEach((detail) => {
      state.tables.exam_record_detail.push({
        ...detail,
        detailId: nextId('exam_record_detail', 'detailId'),
      });
    });
  };

  const gradeRecord = (record, snapshot) => {
    const paper = safeParseJson(snapshot.paperJson, { questions: [] });
    const rules = safeParseJson(snapshot.standardAnswerJson, { questions: [] });
    const userAnswers = safeParseJson(record.userAnswers, {});
    let totalScore = 0;
    let hasManualQuestion = false;
    const details = [];

    paper.questions.forEach((question) => {
      const rule = rules.questions.find(
        (item) => Number(item.questionId) === Number(question.questionId),
      );
      if (!rule) {
        return;
      }
      const result = gradeQuestion(rule, userAnswers[question.questionId]);
      totalScore += Number(result.score || 0);
      if (result.manualRequired) {
        hasManualQuestion = true;
      }
      details.push({
        createBy: 'admin',
        createTime: now(),
        delFlag: '0',
        isCorrect: result.isCorrect ? '1' : '0',
        questionId: Number(question.questionId),
        recordId: Number(record.recordId),
        remark: '',
        score: Number(result.score || 0),
        updateBy: '',
        updateTime: '',
        userAnswer: toJsonText(userAnswers[question.questionId] ?? null, 'null'),
      });
    });

    upsertRecordDetails(record.recordId, details);
    record.totalScore = Number(totalScore.toFixed(2));
    record.status = hasManualQuestion ? '2' : '3';
    record.submitTime = now();
    record.updateBy = 'admin';
    record.updateTime = now();
    return { hasManualQuestion, totalScore: record.totalScore };
  };

  const collectExamIdsForUser = (userId) => {
    const student = getStudentByUserId(userId);
    const classId = student?.classId ? Number(student.classId) : null;
    return new Set(
      getTable('exam_target')
        .filter((item) => item.delFlag !== '2')
        .filter((item) => {
          if (String(item.targetType) === '2') {
            return Number(item.targetValue) === Number(userId);
          }
          if (String(item.targetType) === '1') {
            return classId != null && Number(item.targetValue) === classId;
          }
          return false;
        })
        .map((item) => Number(item.examId)),
    );
  };

  const mapMyPaper = (exam, userId) => {
    const record = getRecordByExamAndUser(exam.examId, userId);
    const snapshot = getSnapshotByExamAndUser(exam.examId, userId);
    return {
      canStart: String(exam.status) === '1' && (!record || String(record.status) === '0'),
      canViewDetail: !!record,
      examId: Number(exam.examId),
      score: record?.totalScore ?? null,
      snapshotId: snapshot?.snapshotId ?? null,
      startTime: record?.startTime || '',
      status: record?.status ?? 'NOT_STARTED',
      submitTime: record?.submitTime || '',
      timeMode: exam.timeMode,
      title: exam.title,
    };
  };

  const hasExamAccess = (examId, userId) => collectExamIdsForUser(userId).has(Number(examId));

  const validateExamStart = (exam) => {
    const current = toTimestamp(now());
    if (String(exam.timeMode) !== '1') {
      return null;
    }
    const startAt = toTimestamp(exam.startTime);
    const endAt = toTimestamp(exam.endTime);
    if (startAt && current < startAt) {
      return '考试未开始';
    }
    if (endAt && current > endAt) {
      return '考试已结束';
    }
    return null;
  };

  let matched = null;

  if (pathname === '/exam/knowledge-category/list' && method === 'GET') {
    let rows = getTable('knowledge_category')
      .filter((item) => item.delFlag !== '2')
      .map(mapKnowledgeCategory);
    rows = rows.filter((item) => includesText(item.categoryName, query.categoryName));
    if (query.status) {
      rows = rows.filter((item) => String(item.status) === String(query.status));
    }
    sendSuccess(response, rows);
    return true;
  }

  if (pathname === '/exam/knowledge-category/tree' && method === 'GET') {
    sendSuccess(response, buildKnowledgeCategoryTreeOptions());
    return true;
  }

  matched = pathname.match(/^\/exam\/knowledge-category\/list\/exclude\/(\d+)$/);
  if (matched && method === 'GET') {
    const categoryId = Number(matched[1]);
    const rows = getTable('knowledge_category')
      .filter((item) => item.delFlag !== '2')
      .filter((item) => Number(item.categoryId) !== categoryId)
      .filter((item) => !String(item.ancestors || '').split(',').includes(String(categoryId)))
      .map((item) => ({
        code: item.categoryCode,
        id: Number(item.categoryId),
        key: String(item.categoryId),
        label: item.categoryName,
        parentId: Number(item.parentId || 0),
        weight: Number(item.orderNum || 0),
      }));
    sendSuccess(response, buildTree(rows, 'id', 'parentId', 0));
    return true;
  }

  matched = pathname.match(/^\/exam\/knowledge-category\/(\d+)$/);
  if (matched && method === 'GET') {
    const category = getKnowledgeCategoryById(matched[1]);
    if (!category) {
      sendError(response, 404, '知识分类不存在');
      return true;
    }
    sendSuccess(response, mapKnowledgeCategory(category));
    return true;
  }

  if (pathname === '/exam/knowledge-category' && method === 'POST') {
    const categoryId = nextId('knowledge_category', 'categoryId');
    const categoryCode = generateCategoryCode(body.parentId, categoryId);
    getTable('knowledge_category').push({
      ancestors: buildCategoryAncestors(body.parentId),
      categoryCode,
      categoryId,
      categoryName: body.categoryName,
      createBy: 'admin',
      createTime: now(),
      delFlag: '0',
      orderNum: Number(body.orderNum || 0),
      parentId: Number(body.parentId || 0),
      remark: body.remark || '',
      status: body.status || '0',
      updateBy: '',
      updateTime: '',
    });
    await persistTables(['knowledge_category']);
    sendSuccess(response);
    return true;
  }

  if (pathname === '/exam/knowledge-category' && method === 'PUT') {
    const category = getKnowledgeCategoryById(body.categoryId);
    if (!category) {
      sendError(response, 404, '知识分类不存在');
      return true;
    }
    const parentChanged = Number(body.parentId ?? category.parentId) !== Number(category.parentId);
    Object.assign(category, {
      categoryName: body.categoryName ?? category.categoryName,
      orderNum: Number(body.orderNum ?? category.orderNum),
      remark: body.remark ?? category.remark,
      status: body.status ?? category.status,
      updateBy: 'admin',
      updateTime: now(),
    });
    if (parentChanged) {
      category.parentId = Number(body.parentId || 0);
      category.ancestors = buildCategoryAncestors(category.parentId);
      category.categoryCode = generateCategoryCode(category.parentId, category.categoryId);
      refreshCategoryChildren(category);
    }
    await persistTables(['knowledge_category']);
    sendSuccess(response);
    return true;
  }

  matched = pathname.match(/^\/exam\/knowledge-category\/(\d+)$/);
  if (matched && method === 'DELETE') {
    const categoryId = Number(matched[1]);
    const hasChildren = getTable('knowledge_category').some(
      (item) => item.delFlag !== '2' && Number(item.parentId) === categoryId,
    );
    if (hasChildren) {
      sendError(response, 500, '存在下级知识分类，无法删除');
      return true;
    }
    const usedByQuestion = getTable('question').some(
      (item) => item.delFlag !== '2' && Number(item.knowledgeCategoryId) === categoryId,
    );
    if (usedByQuestion) {
      sendError(response, 500, '当前知识分类下存在题目，无法删除');
      return true;
    }
    state.tables.knowledge_category = getTable('knowledge_category').filter(
      (item) => Number(item.categoryId) !== categoryId,
    );
    await persistTables(['knowledge_category']);
    sendSuccess(response);
    return true;
  }

  if (pathname === '/exam/question/list' && method === 'GET') {
    let rows = getTable('question')
      .filter((item) => item.delFlag !== '2')
      .map(mapQuestion);
    rows = rows.filter((item) => includesText(item.content, query.content));
    if (query.questionType) {
      rows = rows.filter((item) => String(item.questionType) === String(query.questionType));
    }
    if (query.difficulty) {
      rows = rows.filter((item) => String(item.difficulty) === String(query.difficulty));
    }
    if (query.autoGrading) {
      rows = rows.filter((item) => String(item.autoGrading) === String(query.autoGrading));
    }
    if (query.knowledgeCategoryId) {
      const categoryIds = collectCategoryIds(query.knowledgeCategoryId);
      rows = rows.filter((item) =>
        categoryIds.includes(Number(item.knowledgeCategoryId)),
      );
    }
    const result = paginate(rows, query);
    sendPage(response, result.rows, result.total);
    return true;
  }

  if (pathname === '/exam/question/export' && method === 'POST') {
    const rows = getTable('question').filter((item) => item.delFlag !== '2').map(mapQuestion);
    sendFile(response, 'question.csv', csvFromRows(buildQuestionCsvRows(rows)));
    return true;
  }

  if (pathname === '/exam/question/import' && method === 'POST') {
    sendSuccess(response, null, '当前版本暂未实现真实Excel导入，接口已预留');
    return true;
  }

  matched = pathname.match(/^\/exam\/question\/(\d+)$/);
  if (matched && method === 'GET') {
    const question = getQuestionById(matched[1]);
    if (!question) {
      sendError(response, 404, '题目不存在');
      return true;
    }
    sendSuccess(response, mapQuestion(question));
    return true;
  }

  if (pathname === '/exam/question' && method === 'POST') {
    let normalizedQuestion;
    try {
      const handler = getQuestionTypeHandlerOrThrow(body.questionType);
      normalizedQuestion = handler.normalizeQuestionPayload(body);
      const errors = handler.validateQuestionPayload(normalizedQuestion);
      if (errors.length > 0) {
        sendError(response, 500, errors[0]);
        return true;
      }
    } catch (error) {
      sendError(response, 500, error.message || '题型处理失败');
      return true;
    }

    getTable('question').push({
      analysis: normalizedQuestion.analysis || '',
      attachments: toJsonText(normalizedQuestion.attachments, '[]'),
      autoGrading: normalizedQuestion.autoGrading || '1',
      content: normalizedQuestion.content || '',
      createBy: 'admin',
      createTime: now(),
      delFlag: '0',
      difficulty: normalizedQuestion.difficulty || '2',
      knowledgeCategoryId: Number(normalizedQuestion.knowledgeCategoryId),
      options: toJsonText(normalizedQuestion.options, '[]'),
      partialScoreRule: toJsonText(normalizedQuestion.partialScoreRule, '{}'),
      questionId: nextId('question', 'questionId'),
      questionType: normalizedQuestion.questionType,
      remark: normalizedQuestion.remark || '',
      standardAnswer: toJsonText(normalizedQuestion.standardAnswer, '{}'),
      status: normalizedQuestion.status || '0',
      tags: toJsonText(normalizedQuestion.tags, '[]'),
      updateBy: '',
      updateTime: '',
    });
    await persistTables(['question']);
    sendSuccess(response);
    return true;
  }

  if (pathname === '/exam/question' && method === 'PUT') {
    const question = getQuestionById(body.questionId);
    if (!question) {
      sendError(response, 404, '题目不存在');
      return true;
    }
    let normalizedQuestion;
    try {
      const mergedQuestion = {
        ...mapQuestion(question),
        ...body,
        attachments: body.attachments ?? safeParseJson(question.attachments, []),
        options: body.options ?? safeParseJson(question.options, []),
        partialScoreRule: body.partialScoreRule ?? safeParseJson(question.partialScoreRule, {}),
        questionConfig: body.questionConfig ?? safeParseJson(question.questionConfig, {}),
        standardAnswer: body.standardAnswer ?? safeParseJson(question.standardAnswer, {}),
        tags: body.tags ?? safeParseJson(question.tags, []),
      };
      const handler = getQuestionTypeHandlerOrThrow(mergedQuestion.questionType);
      normalizedQuestion = handler.normalizeQuestionPayload(mergedQuestion);
      const errors = handler.validateQuestionPayload(normalizedQuestion);
      if (errors.length > 0) {
        sendError(response, 500, errors[0]);
        return true;
      }
    } catch (error) {
      sendError(response, 500, error.message || '题型处理失败');
      return true;
    }
    Object.assign(question, {
      analysis: normalizedQuestion.analysis,
      attachments: toJsonText(normalizedQuestion.attachments, '[]'),
      autoGrading: normalizedQuestion.autoGrading,
      content: normalizedQuestion.content,
      difficulty: normalizedQuestion.difficulty,
      knowledgeCategoryId: Number(normalizedQuestion.knowledgeCategoryId),
      options: toJsonText(normalizedQuestion.options, '[]'),
      partialScoreRule: toJsonText(normalizedQuestion.partialScoreRule, '{}'),
      questionType: normalizedQuestion.questionType,
      remark: normalizedQuestion.remark,
      standardAnswer: toJsonText(normalizedQuestion.standardAnswer, '{}'),
      status: normalizedQuestion.status,
      tags: toJsonText(normalizedQuestion.tags, '[]'),
      updateBy: 'admin',
      updateTime: now(),
    });
    await persistTables(['question']);
    sendSuccess(response);
    return true;
  }

  matched = pathname.match(/^\/exam\/question\/([\d,]+)$/);
  if (matched && method === 'DELETE') {
    const ids = matched[1].split(',').map(Number);
    state.tables.question = getTable('question').filter(
      (item) => !ids.includes(Number(item.questionId)),
    );
    await persistTables(['question']);
    sendSuccess(response);
    return true;
  }

  if (pathname === '/exam/paper/list' && method === 'GET') {
    let rows = getTable('exam_paper').filter((item) => item.delFlag !== '2').map(mapPaper);
    rows = rows.filter((item) => includesText(item.title, query.title));
    if (query.status) {
      rows = rows.filter((item) => String(item.status) === String(query.status));
    }
    const result = paginate(rows, query);
    sendPage(response, result.rows, result.total);
    return true;
  }

  matched = pathname.match(/^\/exam\/paper\/(\d+)$/);
  if (matched && method === 'GET') {
    const paper = getPaperById(matched[1]);
    if (!paper) {
      sendError(response, 404, '试卷不存在');
      return true;
    }
    sendSuccess(response, mapPaper(paper));
    return true;
  }

  if (pathname === '/exam/paper' && method === 'POST') {
    getTable('exam_paper').push({
      createBy: 'admin',
      createTime: now(),
      delFlag: '0',
      paperId: nextId('exam_paper', 'paperId'),
      paperStructure: toJsonText(body.paperStructure, '[]'),
      passScore: Number(body.passScore || 0),
      remark: body.remark || '',
      status: body.status || '0',
      title: body.title,
      totalScore: Number(body.totalScore || 0),
      updateBy: '',
      updateTime: '',
    });
    await persistTables(['exam_paper']);
    sendSuccess(response);
    return true;
  }

  if (pathname === '/exam/paper' && method === 'PUT') {
    const paper = getPaperById(body.paperId);
    if (!paper) {
      sendError(response, 404, '试卷不存在');
      return true;
    }
    Object.assign(paper, {
      paperStructure: body.paperStructure != null ? toJsonText(body.paperStructure, '[]') : paper.paperStructure,
      passScore: body.passScore != null ? Number(body.passScore) : paper.passScore,
      remark: body.remark ?? paper.remark,
      status: body.status ?? paper.status,
      title: body.title ?? paper.title,
      totalScore: body.totalScore != null ? Number(body.totalScore) : paper.totalScore,
      updateBy: 'admin',
      updateTime: now(),
    });
    await persistTables(['exam_paper']);
    sendSuccess(response);
    return true;
  }

  matched = pathname.match(/^\/exam\/paper\/([\d,]+)$/);
  if (matched && method === 'DELETE') {
    const ids = matched[1].split(',').map(Number);
    state.tables.exam_paper = getTable('exam_paper').filter(
      (item) => !ids.includes(Number(item.paperId)),
    );
    await persistTables(['exam_paper']);
    sendSuccess(response);
    return true;
  }

  if (pathname === '/exam/manage/list' && method === 'GET') {
    let rows = getTable('exam').filter((item) => item.delFlag !== '2').map(mapExam);
    rows = rows.filter((item) => includesText(item.title, query.title));
    if (query.status) {
      rows = rows.filter((item) => String(item.status) === String(query.status));
    }
    if (query.paperId) {
      rows = rows.filter((item) => Number(item.paperId) === Number(query.paperId));
    }
    const result = paginate(rows, query);
    sendPage(response, result.rows, result.total);
    return true;
  }

  matched = pathname.match(/^\/exam\/manage\/(\d+)$/);
  if (matched && method === 'GET') {
    const exam = getExamById(matched[1]);
    if (!exam) {
      sendError(response, 404, '考试不存在');
      return true;
    }
    const targets = getTable('exam_target').filter(
      (item) => item.delFlag !== '2' && Number(item.examId) === Number(exam.examId),
    );
    sendSuccess(response, {
      ...mapExam(exam),
      targetList: targets,
    });
    return true;
  }

  if (pathname === '/exam/manage' && method === 'POST') {
    const examId = nextId('exam', 'examId');
    getTable('exam').push({
      createBy: 'admin',
      createTime: now(),
      delFlag: '0',
      durationMins: Number(body.durationMins || 0),
      endTime: body.endTime || null,
      examId,
      paperId: Number(body.paperId),
      remark: body.remark || '',
      startTime: body.startTime || null,
      status: body.status || '0',
      timeMode: body.timeMode || '1',
      title: body.title,
      updateBy: '',
      updateTime: '',
    });
    (body.targetList || []).forEach((item) => {
      getTable('exam_target').push({
        createBy: 'admin',
        createTime: now(),
        delFlag: '0',
        examId,
        remark: '',
        targetId: nextId('exam_target', 'targetId'),
        targetType: item.targetType,
        targetValue: Number(item.targetValue),
        updateBy: '',
        updateTime: '',
      });
    });
    await persistTables(['exam', 'exam_target']);
    sendSuccess(response);
    return true;
  }

  if (pathname === '/exam/manage' && method === 'PUT') {
    const exam = getExamById(body.examId);
    if (!exam) {
      sendError(response, 404, '考试不存在');
      return true;
    }
    Object.assign(exam, {
      durationMins: body.durationMins != null ? Number(body.durationMins) : exam.durationMins,
      endTime: body.endTime ?? exam.endTime,
      paperId: body.paperId != null ? Number(body.paperId) : exam.paperId,
      remark: body.remark ?? exam.remark,
      startTime: body.startTime ?? exam.startTime,
      status: body.status ?? exam.status,
      timeMode: body.timeMode ?? exam.timeMode,
      title: body.title ?? exam.title,
      updateBy: 'admin',
      updateTime: now(),
    });
    state.tables.exam_target = getTable('exam_target').filter(
      (item) => Number(item.examId) !== Number(exam.examId),
    );
    (body.targetList || []).forEach((item) => {
      state.tables.exam_target.push({
        createBy: 'admin',
        createTime: now(),
        delFlag: '0',
        examId: Number(exam.examId),
        remark: '',
        targetId: nextId('exam_target', 'targetId'),
        targetType: item.targetType,
        targetValue: Number(item.targetValue),
        updateBy: '',
        updateTime: '',
      });
    });
    await persistTables(['exam', 'exam_target']);
    sendSuccess(response);
    return true;
  }

  matched = pathname.match(/^\/exam\/manage\/([\d,]+)$/);
  if (matched && method === 'DELETE') {
    const ids = matched[1].split(',').map(Number);
    const hasRecords = getTable('exam_record').some(
      (item) => ids.includes(Number(item.examId)) && item.delFlag !== '2'
    );
    if (hasRecords) {
      sendError(response, 403, '选中的部分考试已有考生答题记录，为保障成绩数据完整，禁止删除！');
      return true;
    }
    state.tables.exam = getTable('exam').filter((item) => !ids.includes(Number(item.examId)));
    state.tables.exam_target = getTable('exam_target').filter(
      (item) => !ids.includes(Number(item.examId)),
    );
    await persistTables(['exam', 'exam_target']);
    sendSuccess(response);
    return true;
  }

  if (pathname === '/exam/manage/publish' && method === 'PUT') {
    const exam = getExamById(body.examId);
    if (!exam) {
      sendError(response, 404, '考试不存在');
      return true;
    }
    exam.status = body.status || '1';
    exam.updateBy = 'admin';
    exam.updateTime = now();

    const baseline = getTable('exam_paper_snapshot').find(
      (item) => Number(item.examId) === Number(exam.examId) && Number(item.userId) === 0,
    );
    const generated = generateBaselineSnapshot(exam);

    if (baseline) {
      baseline.paperJson = generated.paperJson;
      baseline.standardAnswerJson = generated.standardAnswerJson;
      baseline.updateBy = 'admin';
      baseline.updateTime = now();
      baseline.delFlag = '0';
    } else {
      getTable('exam_paper_snapshot').push({
        createBy: 'admin',
        createTime: now(),
        delFlag: '0',
        examId: Number(exam.examId),
        paperJson: generated.paperJson,
        remark: '',
        snapshotId: nextId('exam_paper_snapshot', 'snapshotId'),
        standardAnswerJson: generated.standardAnswerJson,
        updateBy: '',
        updateTime: '',
        userId: 0,
      });
    }

    await persistTables(['exam', 'exam_paper_snapshot']);
    sendSuccess(response);
    return true;
  }

  if (pathname === '/exam/grading/list' && method === 'GET') {
    let rows = getTable('exam_record').filter((item) => item.delFlag !== '2').map(mapRecord);
    rows = rows.filter((item) => includesText(item.examTitle, query.title));
    if (query.status) {
      rows = rows.filter((item) => String(item.status) === String(query.status));
    }
    const result = paginate(rows, query);
    sendPage(response, result.rows, result.total);
    return true;
  }

  matched = pathname.match(/^\/exam\/grading\/(\d+)$/);
  if (matched && method === 'GET') {
    const record = getTable('exam_record').find(
      (item) => Number(item.recordId) === Number(matched[1]) && item.delFlag !== '2',
    );
    if (!record) {
      sendError(response, 404, '答卷不存在');
      return true;
    }
    const snapshot = getTable('exam_paper_snapshot').find(
      (item) => Number(item.snapshotId) === Number(record.snapshotId) && item.delFlag !== '2',
    );
    const details = getTable('exam_record_detail').filter(
      (item) => Number(item.recordId) === Number(record.recordId) && item.delFlag !== '2',
    );
    sendSuccess(response, {
      details: details.map((item) => ({
        ...item,
        userAnswer: safeParseJson(item.userAnswer, null),
      })),
      record: mapRecord(record),
      snapshot: snapshot
        ? {
            ...snapshot,
            paperJson: safeParseJson(snapshot.paperJson, {}),
            standardAnswerJson: safeParseJson(snapshot.standardAnswerJson, {}),
          }
        : null,
    });
    return true;
  }

  if (pathname === '/exam/grading/score' && method === 'PUT') {
    const record = getTable('exam_record').find(
      (item) => Number(item.recordId) === Number(body.recordId) && item.delFlag !== '2',
    );
    if (!record) {
      sendError(response, 404, '答卷不存在');
      return true;
    }
    const scoreMap = new Map((body.details || []).map((item) => [Number(item.questionId), item]));
    let totalScore = 0;
    getTable('exam_record_detail')
      .filter((item) => Number(item.recordId) === Number(record.recordId) && item.delFlag !== '2')
      .forEach((detail) => {
        const incoming = scoreMap.get(Number(detail.questionId));
        if (!incoming) {
          totalScore += Number(detail.score || 0);
          return;
        }
        detail.score = Number(incoming.score || 0);
        detail.isCorrect = incoming.isCorrect ? '1' : '0';
        detail.updateBy = 'admin';
        detail.updateTime = now();
        totalScore += Number(detail.score || 0);
      });
    record.totalScore = Number(totalScore.toFixed(2));
    record.status = '3';
    record.updateBy = 'admin';
    record.updateTime = now();
    await persistTables(['exam_record', 'exam_record_detail']);
    sendSuccess(response);
    return true;
  }

  if (pathname === '/exam/score/list' && method === 'GET') {
    let rows = getTable('exam_record').filter((item) => item.delFlag !== '2').map(mapRecord);
    rows = rows.filter((item) => includesText(item.examTitle, query.title));
    rows = rows.filter((item) => includesText(item.userName, query.userName));
    const result = paginate(rows, query);
    sendPage(response, result.rows, result.total);
    return true;
  }

  if (pathname === '/exam/score/export' && method === 'POST') {
    const rows = getTable('exam_record').filter((item) => item.delFlag !== '2').map(mapRecord);
    sendFile(response, 'exam-score.csv', csvFromRows(buildScoreCsvRows(rows)));
    return true;
  }

  if (pathname === '/exam/my-paper/list' && method === 'GET') {
    const examIds = collectExamIdsForUser(session.userId);
    const rows = getTable('exam')
      .filter((item) => item.delFlag !== '2' && examIds.has(Number(item.examId)))
      .map((item) => mapMyPaper(item, session.userId));
    sendPage(response, rows, rows.length);
    return true;
  }

  matched = pathname.match(/^\/exam\/my-paper\/detail\/(\d+)$/);
  if (matched && method === 'GET') {
    const examId = Number(matched[1]);
    if (!hasExamAccess(examId, session.userId)) {
      sendError(response, 403, '无权查看当前试卷');
      return true;
    }
    const snapshot = getSnapshotByExamAndUser(examId, session.userId);
    const record = getRecordByExamAndUser(examId, session.userId);
    const exam = getExamById(examId);
    if (!exam || !snapshot || !record) {
      sendError(response, 404, '历史试卷不存在');
      return true;
    }
    const details = getTable('exam_record_detail')
      .filter((item) => Number(item.recordId) === Number(record.recordId) && item.delFlag !== '2')
      .map((item) => ({
        ...item,
        userAnswer: safeParseJson(item.userAnswer, null),
      }));
    sendSuccess(response, {
      details,
      exam: mapExam(exam),
      readonly: true,
      record: mapRecord(record),
      snapshot: {
        ...snapshot,
        paperJson: safeParseJson(snapshot.paperJson, {}),
        standardAnswerJson: safeParseJson(snapshot.standardAnswerJson, {}),
      },
    });
    return true;
  }

  matched = pathname.match(/^\/exam\/my-paper\/start\/(\d+)$/);
  if (matched && method === 'GET') {
    const examId = Number(matched[1]);
    if (!hasExamAccess(examId, session.userId)) {
      sendError(response, 403, '无权参加当前考试');
      return true;
    }
    const exam = getExamById(examId);
    if (!exam) {
      sendError(response, 404, '考试不存在');
      return true;
    }
    if (String(exam.status) !== '1') {
      sendError(response, 500, '当前考试未发布');
      return true;
    }
    const validateMessage = validateExamStart(exam);
    if (validateMessage === '考试未开始') {
      sendSuccess(response, {
        exam: mapExam(exam),
        readonly: true,
        record: null,
        serverTime: now(),
        snapshot: null,
        waiting: true,
      });
      return true;
    }
    if (validateMessage) {
      sendError(response, 500, validateMessage);
      return true;
    }
    let snapshot = getSnapshotByExamAndUser(examId, session.userId);
    if (!snapshot) {
      const generated = generateStudentSnapshot(exam, session.userId);
      snapshot = {
        createBy: 'admin',
        createTime: now(),
        delFlag: '0',
        examId,
        paperJson: generated.paperJson,
        remark: '',
        snapshotId: nextId('exam_paper_snapshot', 'snapshotId'),
        standardAnswerJson: generated.standardAnswerJson,
        updateBy: '',
        updateTime: '',
        userId: Number(session.userId),
      };
      getTable('exam_paper_snapshot').push(snapshot);
    }
    let record = getRecordByExamAndUser(examId, session.userId);
    if (!record) {
      record = {
        createBy: 'admin',
        createTime: now(),
        delFlag: '0',
        examId,
        recordId: nextId('exam_record', 'recordId'),
        remark: '',
        snapshotId: Number(snapshot.snapshotId),
        startTime: now(),
        status: '0',
        submitTime: '',
        totalScore: 0,
        updateBy: '',
        updateTime: '',
        userAnswers: '{}',
        userId: Number(session.userId),
      };
      getTable('exam_record').push(record);
    }
    await persistTables(['exam_paper_snapshot', 'exam_record']);
    sendSuccess(response, {
      exam: mapExam(exam),
      readonly: false,
      record: mapRecord(record),
      serverTime: now(),
      snapshot: {
        ...snapshot,
        paperJson: safeParseJson(snapshot.paperJson, {}),
        standardAnswerJson: safeParseJson(snapshot.standardAnswerJson, {}),
      },
    });
    return true;
  }

  if (pathname === '/exam/answer/heartbeat' && method === 'GET') {
    sendSuccess(response, { serverTime: now() });
    return true;
  }

  if (pathname === '/exam/answer/temp-save' && method === 'PUT') {
    const record = getRecordByExamAndUser(body.examId, session.userId);
    if (!record) {
      sendError(response, 404, '答卷不存在');
      return true;
    }
    if (String(record.status) !== '0') {
      sendError(response, 500, '当前答卷已提交，无法暂存');
      return true;
    }
    record.userAnswers = toJsonText(body.userAnswers, '{}');
    record.updateBy = 'admin';
    record.updateTime = now();
    await persistTables(['exam_record']);
    sendSuccess(response, null, '暂存成功');
    return true;
  }

  if (pathname === '/exam/answer/submit' && method === 'POST') {
    const record = getRecordByExamAndUser(body.examId, session.userId);
    const snapshot = getSnapshotByExamAndUser(body.examId, session.userId);
    if (!record || !snapshot) {
      sendError(response, 404, '答卷不存在');
      return true;
    }
    if (String(record.status) !== '0') {
      sendSuccess(response, null, '答卷已提交');
      return true;
    }
    if (body.userAnswers != null) {
      record.userAnswers = toJsonText(body.userAnswers, '{}');
    }
    const result = gradeRecord(record, snapshot);
    await persistTables(['exam_record', 'exam_record_detail']);
    sendSuccess(response, {
      hasManualQuestion: result.hasManualQuestion,
      totalScore: result.totalScore,
    }, '交卷成功');
    return true;
  }

  return false;
}
