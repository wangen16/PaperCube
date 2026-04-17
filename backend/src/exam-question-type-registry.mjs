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

function normalizeScalarAnswer(value) {
  if (Array.isArray(value)) {
    return String(value[0] ?? '').trim();
  }
  return String(value ?? '').trim();
}

function normalizeArrayAnswer(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))].sort();
  }
  if (typeof value === 'string') {
    return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))].sort();
  }
  return [];
}

function extractAnswerValue(rule) {
  const parsed = safeParseJson(rule, {});
  if (parsed && typeof parsed === 'object' && 'answers' in parsed) {
    return parsed.answers;
  }
  return parsed;
}

function normalizeOptionList(options) {
  const source = Array.isArray(options) ? options : [];
  return source
    .map((item, index) => {
      const label = String(item?.label || item?.key || String.fromCharCode(65 + index));
      return {
        key: String(item?.key || label),
        label,
        value: String(item?.value || '').trim(),
      };
    })
    .filter((item) => item.value);
}

function hasKeywordMatch(userText, keywords = [], matchMode = 'any') {
  const normalizedText = String(userText ?? '').toLowerCase();
  const normalizedKeywords = keywords
    .map((item) => String(item ?? '').trim().toLowerCase())
    .filter(Boolean);
  if (!normalizedKeywords.length) {
    return false;
  }
  if (matchMode === 'all') {
    return normalizedKeywords.every((item) => normalizedText.includes(item));
  }
  return normalizedKeywords.some((item) => normalizedText.includes(item));
}

function normalizeAttachmentIds(attachments) {
  const source = Array.isArray(attachments) ? attachments : [];
  return [...new Set(
    source
      .map((item) => {
        if (typeof item === 'string' || typeof item === 'number') {
          return String(item);
        }
        if (item && typeof item === 'object') {
          return String(item.ossId || item.uid || item.id || '').trim();
        }
        return '';
      })
      .filter(Boolean),
  )];
}

function normalizeBaseQuestionPayload(body = {}) {
  return {
    analysis: body.analysis || '',
    attachments: normalizeAttachmentIds(body.attachments),
    autoGrading: String(body.autoGrading ?? '1'),
    content: body.content || '',
    difficulty: String(body.difficulty || '2'),
    knowledgeCategoryId: Number(body.knowledgeCategoryId || 0),
    options: normalizeOptionList(body.options),
    partialScoreRule: safeParseJson(body.partialScoreRule, {}),
    questionConfig: safeParseJson(body.questionConfig, {}),
    questionId: body.questionId ? Number(body.questionId) : undefined,
    questionType: String(body.questionType || ''),
    remark: body.remark || '',
    standardAnswer: safeParseJson(body.standardAnswer, {}),
    status: String(body.status ?? '0'),
    tags: Array.isArray(body.tags) ? body.tags.map((item) => String(item).trim()).filter(Boolean) : [],
  };
}

function createBaseValidationResult() {
  return {
    errors: [],
  };
}

function validateBaseQuestion(question) {
  const result = createBaseValidationResult();
  if (!question.knowledgeCategoryId) {
    result.errors.push('请选择知识分类');
  }
  if (!String(question.content || '').trim()) {
    result.errors.push('题干不能为空');
  }
  return result;
}

function createFixedSnapshotQuestion(question, score) {
  return {
    analysis: question.analysis || '',
    attachments: normalizeAttachmentIds(question.attachments),
    autoGrading: question.autoGrading ?? '1',
    content: question.content || '',
    difficulty: question.difficulty || '2',
    knowledgeCategoryId: Number(question.knowledgeCategoryId),
    options: normalizeOptionList(question.options),
    questionConfig: safeParseJson(question.questionConfig, {}),
    questionId: Number(question.questionId),
    questionType: question.questionType,
    score: Number(score || 0),
  };
}

function createSingleChoiceHandler() {
  return {
    type: '1',
    buildSnapshotQuestion(question, score) {
      return createFixedSnapshotQuestion(question, score);
    },
    grade({ rule, userAnswer }) {
      const score = Number(rule.score || 0);
      const correct = normalizeScalarAnswer(
        extractAnswerValue(rule.standardAnswer)[0] ?? extractAnswerValue(rule.standardAnswer),
      );
      const user = normalizeScalarAnswer(userAnswer);
      const isCorrect = correct === user;
      return { isCorrect, manualRequired: false, score: isCorrect ? score : 0 };
    },
    normalizeQuestionPayload(body) {
      const question = normalizeBaseQuestionPayload(body);
      const answers = normalizeArrayAnswer(extractAnswerValue(question.standardAnswer));
      return {
        ...question,
        options: normalizeOptionList(question.options),
        partialScoreRule: {},
        questionConfig: {},
        standardAnswer: {
          answers: answers.length > 0 ? [answers[0]] : [],
        },
      };
    },
    normalizeUserAnswer(answer) {
      return normalizeScalarAnswer(answer);
    },
    validateQuestionPayload(question) {
      const result = validateBaseQuestion(question);
      if (question.options.length < 2) {
        result.errors.push('单选题至少需要 2 个选项');
      }
      if (!Array.isArray(question.standardAnswer?.answers) || question.standardAnswer.answers.length !== 1) {
        result.errors.push('单选题必须设置 1 个标准答案');
      }
      return result.errors;
    },
  };
}

function createMultipleChoiceHandler() {
  return {
    type: '2',
    buildSnapshotQuestion(question, score) {
      return createFixedSnapshotQuestion(question, score);
    },
    grade({ rule, userAnswer }) {
      const score = Number(rule.score || 0);
      const correctAnswers = normalizeArrayAnswer(extractAnswerValue(rule.standardAnswer));
      const userAnswers = normalizeArrayAnswer(userAnswer);
      const isExact = correctAnswers.length === userAnswers.length
        && correctAnswers.every((item, index) => item === userAnswers[index]);
      if (isExact) {
        return { isCorrect: true, manualRequired: false, score };
      }
      const allSelectedCorrect = userAnswers.length > 0
        && userAnswers.every((item) => correctAnswers.includes(item));
      if (allSelectedCorrect && userAnswers.length < correctAnswers.length) {
        const mode = rule.partialScoreRule?.mode || 'zero_if_not_full_correct';
        return {
          isCorrect: false,
          manualRequired: false,
          score: mode === 'half_if_partial_correct' ? Number((score / 2).toFixed(2)) : 0,
        };
      }
      return { isCorrect: false, manualRequired: false, score: 0 };
    },
    normalizeQuestionPayload(body) {
      const question = normalizeBaseQuestionPayload(body);
      return {
        ...question,
        options: normalizeOptionList(question.options),
        partialScoreRule: {
          mode:
            safeParseJson(question.partialScoreRule, {}).mode || 'zero_if_not_full_correct',
        },
        questionConfig: {},
        standardAnswer: {
          answers: normalizeArrayAnswer(extractAnswerValue(question.standardAnswer)),
        },
      };
    },
    normalizeUserAnswer(answer) {
      return normalizeArrayAnswer(answer);
    },
    validateQuestionPayload(question) {
      const result = validateBaseQuestion(question);
      if (question.options.length < 2) {
        result.errors.push('多选题至少需要 2 个选项');
      }
      if (!Array.isArray(question.standardAnswer?.answers) || question.standardAnswer.answers.length === 0) {
        result.errors.push('多选题至少需要设置 1 个标准答案');
      }
      return result.errors;
    },
  };
}

function createJudgeHandler() {
  return {
    type: '3',
    buildSnapshotQuestion(question, score) {
      return createFixedSnapshotQuestion(question, score);
    },
    grade({ rule, userAnswer }) {
      const score = Number(rule.score || 0);
      const correct = normalizeScalarAnswer(
        extractAnswerValue(rule.standardAnswer)[0] ?? extractAnswerValue(rule.standardAnswer),
      );
      const user = normalizeScalarAnswer(userAnswer);
      const isCorrect = correct === user;
      return { isCorrect, manualRequired: false, score: isCorrect ? score : 0 };
    },
    normalizeQuestionPayload(body) {
      const question = normalizeBaseQuestionPayload(body);
      const answers = normalizeArrayAnswer(extractAnswerValue(question.standardAnswer));
      return {
        ...question,
        options: [],
        partialScoreRule: {},
        questionConfig: {},
        standardAnswer: {
          answers: answers.length > 0 ? [answers[0]] : [],
        },
      };
    },
    normalizeUserAnswer(answer) {
      return normalizeScalarAnswer(answer);
    },
    validateQuestionPayload(question) {
      const result = validateBaseQuestion(question);
      const answer = normalizeScalarAnswer(question.standardAnswer?.answers?.[0]);
      if (!['false', 'true'].includes(answer)) {
        result.errors.push('判断题标准答案必须是正确或错误');
      }
      return result.errors;
    },
  };
}

function createSubjectiveHandler() {
  return {
    type: '4',
    buildSnapshotQuestion(question, score) {
      return createFixedSnapshotQuestion(question, score);
    },
    grade({ rule, userAnswer }) {
      if (String(rule.autoGrading || '1') !== '1') {
        return { isCorrect: false, manualRequired: true, score: 0 };
      }
      const score = Number(rule.score || 0);
      const parsedAnswer = safeParseJson(rule.standardAnswer, {});
      const candidateAnswers = normalizeArrayAnswer(parsedAnswer.answers);
      const normalizedUserAnswer = normalizeScalarAnswer(userAnswer);
      const exactMatched = candidateAnswers.some(
        (item) => item.toLowerCase() === normalizedUserAnswer.toLowerCase(),
      );
      const matched = exactMatched
        || hasKeywordMatch(
          normalizedUserAnswer,
          Array.isArray(parsedAnswer.keywords) ? parsedAnswer.keywords : [],
          parsedAnswer.matchMode || 'any',
        );
      return { isCorrect: matched, manualRequired: false, score: matched ? score : 0 };
    },
    normalizeQuestionPayload(body) {
      const question = normalizeBaseQuestionPayload(body);
      const parsedAnswer = safeParseJson(question.standardAnswer, {});
      return {
        ...question,
        options: [],
        partialScoreRule: {},
        questionConfig: safeParseJson(question.questionConfig, {}),
        standardAnswer: {
          answers: normalizeArrayAnswer(parsedAnswer.answers),
          keywords: normalizeArrayAnswer(parsedAnswer.keywords),
          matchMode: parsedAnswer.matchMode === 'all' ? 'all' : 'any',
        },
      };
    },
    normalizeUserAnswer(answer) {
      return normalizeScalarAnswer(answer);
    },
    validateQuestionPayload(question) {
      const result = validateBaseQuestion(question);
      if (String(question.autoGrading || '1') === '1') {
        const answerRule = safeParseJson(question.standardAnswer, {});
        const hasAnswers = normalizeArrayAnswer(answerRule.answers).length > 0;
        const hasKeywords = normalizeArrayAnswer(answerRule.keywords).length > 0;
        if (!hasAnswers && !hasKeywords) {
          result.errors.push('主观题开启自动判分时，至少需要配置参考答案或判分关键词');
        }
      }
      return result.errors;
    },
  };
}

const QUESTION_TYPE_HANDLERS = [
  createSingleChoiceHandler(),
  createMultipleChoiceHandler(),
  createJudgeHandler(),
  createSubjectiveHandler(),
];

const QUESTION_TYPE_HANDLER_MAP = new Map(
  QUESTION_TYPE_HANDLERS.map((handler) => [String(handler.type), handler]),
);

export function getQuestionTypeHandler(type) {
  return QUESTION_TYPE_HANDLER_MAP.get(String(type || ''));
}

export function getQuestionTypeHandlerOrThrow(type) {
  const handler = getQuestionTypeHandler(type);
  if (!handler) {
    throw new Error('当前题型未注册，无法处理');
  }
  return handler;
}
