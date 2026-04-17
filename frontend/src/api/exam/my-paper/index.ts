import type {
  HistoryPaperResponse,
  MyPaperRow,
  StartPaperResponse,
} from './model';

import type { ID, PageResult } from '#/api/common';

import { requestClient } from '#/api/request';

enum Api {
  answerHeartbeat = '/exam/answer/heartbeat',
  answerSubmit = '/exam/answer/submit',
  answerTempSave = '/exam/answer/temp-save',
  detail = '/exam/my-paper/detail',
  list = '/exam/my-paper/list',
  start = '/exam/my-paper/start',
}

export function myPaperList() {
  return requestClient.get<PageResult<MyPaperRow>>(Api.list);
}

export function myPaperDetail(examId: ID) {
  return requestClient.get<HistoryPaperResponse>(`${Api.detail}/${examId}`);
}

export function myPaperStart(examId: ID) {
  return requestClient.get<StartPaperResponse>(`${Api.start}/${examId}`);
}

export function answerHeartbeat() {
  return requestClient.get<{ serverTime: string }>(Api.answerHeartbeat);
}

export function answerTempSave(data: { examId: ID; userAnswers: Record<string, any> }) {
  return requestClient.putWithMsg<void>(Api.answerTempSave, data);
}

export function answerSubmit(data: { examId: ID; userAnswers: Record<string, any> }) {
  return requestClient.postWithMsg<{ hasManualQuestion: boolean; totalScore: number }>(
    Api.answerSubmit,
    data,
  );
}
