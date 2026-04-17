import type { Teacher } from './model';

import type { ID, IDS, PageQuery, PageResult } from '#/api/common';

import { requestClient } from '#/api/request';

enum Api {
  options = '/school/teacher/options',
  root = '/school/teacher',
  teacherList = '/school/teacher/list',
}

export function teacherList(params?: PageQuery) {
  return requestClient.get<PageResult<Teacher>>(Api.teacherList, { params });
}

export function teacherOptions() {
  return requestClient.get<Teacher[]>(Api.options);
}

export function teacherInfo(teacherId: ID) {
  return requestClient.get<Teacher>(`${Api.root}/${teacherId}`);
}

export function teacherAdd(data: Partial<Teacher>) {
  return requestClient.postWithMsg<void>(Api.root, data);
}

export function teacherUpdate(data: Partial<Teacher>) {
  return requestClient.putWithMsg<void>(Api.root, data);
}

export function teacherRemove(teacherIds: IDS) {
  return requestClient.deleteWithMsg<void>(`${Api.root}/${teacherIds}`);
}
