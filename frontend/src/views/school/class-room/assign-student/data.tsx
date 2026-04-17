import type { FormSchemaGetter } from '#/adapter/form';
import type { VxeGridProps } from '#/adapter/vxe-table';

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
    fieldName: 'phonenumber',
    label: '手机号',
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
    field: 'phonenumber',
    title: '手机号',
    minWidth: 120,
  },
  {
    field: 'birthday',
    title: '出生日期',
    minWidth: 120,
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
