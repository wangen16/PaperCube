import type { ExamPaper } from './model';

import type { ID, IDS, PageQuery, PageResult } from '#/api/common';

import { requestClient } from '#/api/request';

enum Api {
  list = '/exam/paper/list',
  root = '/exam/paper',
}

export function paperList(params?: PageQuery) {
  return requestClient.get<PageResult<ExamPaper>>(Api.list, { params });
}

export function paperInfo(paperId: ID) {
  return requestClient.get<ExamPaper>(`${Api.root}/${paperId}`);
}

export function paperAdd(data: Partial<ExamPaper>) {
  return requestClient.postWithMsg<void>(Api.root, data);
}

export function paperUpdate(data: Partial<ExamPaper>) {
  return requestClient.putWithMsg<void>(Api.root, data);
}

export function paperRemove(paperIds: IDS) {
  return requestClient.deleteWithMsg<void>(`${Api.root}/${paperIds}`);
}
