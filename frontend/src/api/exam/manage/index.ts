import type { ExamManage } from './model';

import type { ID, IDS, PageQuery, PageResult } from '#/api/common';

import { requestClient } from '#/api/request';

enum Api {
  list = '/exam/manage/list',
  publish = '/exam/manage/publish',
  root = '/exam/manage',
}

export function examManageList(params?: PageQuery) {
  return requestClient.get<PageResult<ExamManage>>(Api.list, { params });
}

export function examManageInfo(examId: ID) {
  return requestClient.get<ExamManage>(`${Api.root}/${examId}`);
}

export function examManageAdd(data: Partial<ExamManage>) {
  return requestClient.postWithMsg<void>(Api.root, data);
}

export function examManageUpdate(data: Partial<ExamManage>) {
  return requestClient.putWithMsg<void>(Api.root, data);
}

export function examManagePublish(data: { examId: ID; status: string }) {
  return requestClient.putWithMsg<void>(Api.publish, data);
}

export function examManageRemove(examIds: IDS) {
  return requestClient.deleteWithMsg<void>(`${Api.root}/${examIds}`);
}
