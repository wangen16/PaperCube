import type { ClassRoom } from './model';
import type { Student } from '../student/model';

import type { ID, IDS, PageQuery, PageResult } from '#/api/common';

import { requestClient } from '#/api/request';

enum Api {
  allocatedStudentList = '/school/class-room/student/allocatedList',
  cancelStudent = '/school/class-room/student/cancel',
  cancelStudentAll = '/school/class-room/student/cancelAll',
  classList = '/school/class-room/list',
  options = '/school/class-room/options',
  root = '/school/class-room',
  selectStudents = '/school/class-room/student/selectAll',
  unallocatedStudentList = '/school/class-room/student/unallocatedList',
}

export function classRoomList(params?: PageQuery) {
  return requestClient.get<PageResult<ClassRoom>>(Api.classList, { params });
}

export function classRoomOptions() {
  return requestClient.get<ClassRoom[]>(Api.options);
}

export function classRoomInfo(classId: ID) {
  return requestClient.get<ClassRoom>(`${Api.root}/${classId}`);
}

export function classRoomAdd(data: Partial<ClassRoom>) {
  return requestClient.postWithMsg<void>(Api.root, data);
}

export function classRoomUpdate(data: Partial<ClassRoom>) {
  return requestClient.putWithMsg<void>(Api.root, data);
}

export function classRoomRemove(classIds: IDS) {
  return requestClient.deleteWithMsg<void>(`${Api.root}/${classIds}`);
}

export function classRoomAllocatedStudentList(params?: PageQuery) {
  return requestClient.get<PageResult<Student>>(Api.allocatedStudentList, { params });
}

export function classRoomUnallocatedStudentList(params?: PageQuery) {
  return requestClient.get<PageResult<Student>>(Api.unallocatedStudentList, { params });
}

export function classRoomCancelStudent(data: { classId: ID; studentId: ID }) {
  return requestClient.putWithMsg<void>(Api.cancelStudent, data);
}

export function classRoomCancelStudents(classId: ID, studentIds: IDS) {
  return requestClient.putWithMsg<void>(
    `${Api.cancelStudentAll}?classId=${classId}&studentIds=${studentIds.join(',')}`,
  );
}

export function classRoomSelectStudents(classId: ID, studentIds: IDS) {
  return requestClient.putWithMsg<void>(
    `${Api.selectStudents}?classId=${classId}&studentIds=${studentIds.join(',')}`,
  );
}
