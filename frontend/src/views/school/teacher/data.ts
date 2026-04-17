import type { FormSchemaGetter } from '#/adapter/form';
import type { VxeGridProps } from '#/adapter/vxe-table';

import { z } from '#/adapter/form';
import { getDictOptions } from '#/utils/dict';
import { renderDict } from '#/utils/render';

const teacherStatusDict = 'school_teacher_status';

const sexOptions = [
  { label: '男', value: '0' },
  { label: '女', value: '1' },
  { label: '未知', value: '2' },
];

function renderOptionLabel(
  value: string,
  options: Array<{ label: string; value: string }>,
) {
  return options.find((item) => item.value === value)?.label ?? value ?? '';
}

export const querySchema: FormSchemaGetter = () => [
  {
    component: 'Input',
    fieldName: 'teacherNo',
    label: '教师编号',
  },
  {
    component: 'Input',
    fieldName: 'teacherName',
    label: '教师姓名',
  },
  {
    component: 'Select',
    defaultValue: '0',
    componentProps: {
      options: getDictOptions(teacherStatusDict),
    },
    fieldName: 'status',
    label: '状态',
  },
];

export const columns: VxeGridProps['columns'] = [
  { type: 'checkbox', width: 60 },
  {
    field: 'teacherNo',
    title: '教师编号',
    minWidth: 120,
  },
  {
    field: 'teacherName',
    title: '教师姓名',
    minWidth: 120,
  },
  {
    field: 'userName',
    title: '登录账号',
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
    formatter: ({ cellValue }) => renderOptionLabel(cellValue, sexOptions),
    minWidth: 100,
  },
  {
    field: 'status',
    title: '状态',
    slots: {
      default: ({ row }) => renderDict(row.status, teacherStatusDict),
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
    fieldName: 'teacherId',
  },
  {
    component: 'Input',
    fieldName: 'teacherNo',
    label: '教师编号',
    rules: 'required',
  },
  {
    component: 'Input',
    fieldName: 'teacherName',
    help: '系统会根据姓名拼音自动生成登录账号',
    label: '教师姓名',
    rules: 'required',
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
      options: sexOptions,
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
      options: getDictOptions(teacherStatusDict),
      optionType: 'button',
    },
    defaultValue: '0',
    fieldName: 'status',
    label: '状态',
    rules: 'required',
  },
];
