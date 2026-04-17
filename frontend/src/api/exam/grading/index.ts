import type {
  ExamRecordRow,
  GradingDetailResponse,
} from './model';

import type { ID, PageQuery, PageResult } from '#/api/common';

import { requestClient } from '#/api/request';

enum Api {
  detail = '/exam/grading',
  list = '/exam/grading/list',
  score = '/exam/grading/score',
}

export function gradingList(params?: PageQuery) {
  return requestClient.get<PageResult<ExamRecordRow>>(Api.list, { params });
}

export function gradingInfo(recordId: ID) {
  return requestClient.get<GradingDetailResponse>(`${Api.detail}/${recordId}`);
}

export function gradingScore(data: {
  details: Array<{ isCorrect?: boolean; questionId: number; score: number }>;
  recordId: ID;
}) {
  return requestClient.putWithMsg<void>(Api.score, data);
}
