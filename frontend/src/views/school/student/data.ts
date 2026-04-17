import type { FormSchemaGetter } from '#/adapter/form';
import type { VxeGridProps } from '#/adapter/vxe-table';

import { DictEnum } from '@vben/constants';

import { z } from '#/adapter/form';
import { getDictOptions } from '#/utils/dict';
import { renderDict } from '#/utils/render';

const studentStatusDict = 'school_student_status';

export const querySchema: FormSchemaGetter = () => [
  {
    component: 'Input',
    fieldName: 'studentNo',
    label: '学号',
  },
  {
    component: 'Input',
    fieldName: 'studentName',
    label: '学生姓名',
  },
  {
    component: 'Input',
    fieldName: 'className',
    label: '班级',
  },
  {
    component: 'Select',
    defaultValue: '0',
    componentProps: {
      options: getDictOptions(studentStatusDict),
    },
    fieldName: 'status',
    label: '状态',
  },
];

export const columns: VxeGridProps['columns'] = [
  { type: 'checkbox', width: 60 },
  {
    field: 'studentNo',
    title: '学号',
    minWidth: 120,
  },
  {
    field: 'studentName',
    title: '学生姓名',
    minWidth: 120,
  },
  {
    field: 'userName',
    title: '登录账号',
    minWidth: 120,
  },
  {
    field: 'className',
    title: '班级',
    formatter: ({ cellValue }) => cellValue || '未分班',
    minWidth: 140,
  },
  {
    field: 'birthday',
    title: '出生日期',
    minWidth: 120,
  },
  {
    field: 'phonenumber',
    title: '手机号',
    minWidth: 120,
  },
  {
    field: 'sex',
    title: '性别',
    slots: {
      default: ({ row }) => renderDict(row.sex, DictEnum.SYS_USER_SEX),
    },
    minWidth: 100,
  },
  {
    field: 'status',
    title: '状态',
    slots: {
      default: ({ row }) => renderDict(row.status, studentStatusDict),
    },
    minWidth: 100,
  },
  {
    field: 'createTime',
    title: '创建时间',
    minWidth: 160,
  },
  {
    field: 'action',
    fixed: 'right',
    slots: { default: 'action' },
    title: '操作',
    resizable: false,
    width: 'auto',
  },
];

export const drawerSchema: FormSchemaGetter = () => [
  {
    component: 'Input',
    dependencies: {
      show: () => false,
      triggerFields: [''],
    },
    fieldName: 'studentId',
  },
  {
    component: 'Input',
    fieldName: 'studentNo',
    help: '系统会使用学号作为登录账号',
    label: '学号',
    rules: 'required',
  },
  {
    component: 'Input',
    fieldName: 'studentName',
    label: '学生姓名',
    rules: 'required',
  },
  {
    component: 'Select',
    componentProps: {
      options: [],
      allowClear: true,
      optionFilterProp: 'label',
      optionLabelProp: 'label',
      showSearch: true,
    },
    fieldName: 'classId',
    label: '所属班级',
  },
  {
    component: 'DatePicker',
    componentProps: {
      valueFormat: 'YYYY-MM-DD',
    },
    fieldName: 'birthday',
    label: '出生日期',
  },
  {
    component: 'Input',
    fieldName: 'phonenumber',
    label: '手机号码',
    rules: z
      .string()
      .regex(/^1[3-9]\d{9}$/, '请输入正确的手机号码')
      .optional()
      .or(z.literal('')),
  },
  {
    component: 'Input',
    fieldName: 'email',
    label: '邮箱',
    rules: z.string().email('请输入正确的邮箱').optional().or(z.literal('')),
  },
  {
    component: 'RadioGroup',
    componentProps: {
      buttonStyle: 'solid',
      options: getDictOptions(DictEnum.SYS_USER_SEX),
      optionType: 'button',
    },
    defaultValue: '0',
    fieldName: 'sex',
    label: '性别',
  },
  {
    component: 'RadioGroup',
    componentProps: {
      buttonStyle: 'solid',
      options: getDictOptions(studentStatusDict),
      optionType: 'button',
    },
    defaultValue: '0',
    fieldName: 'status',
    label: '状态',
    rules: 'required',
  },
];
