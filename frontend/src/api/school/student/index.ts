import type { Student } from './model';

import type { ID, IDS, PageQuery, PageResult } from '#/api/common';

import { requestClient } from '#/api/request';

enum Api {
  root = '/school/student',
  studentList = '/school/student/list',
}

export function studentList(params?: PageQuery) {
  return requestClient.get<PageResult<Student>>(Api.studentList, { params });
}

export function studentInfo(studentId: ID) {
  return requestClient.get<Student>(`${Api.root}/${studentId}`);
}

export function studentAdd(data: Partial<Student>) {
  return requestClient.postWithMsg<void>(Api.root, data);
}

export function studentUpdate(data: Partial<Student>) {
  return requestClient.putWithMsg<void>(Api.root, data);
}

export function studentRemove(studentIds: IDS) {
  return requestClient.deleteWithMsg<void>(`${Api.root}/${studentIds}`);
}
