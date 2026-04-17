import type { FormSchemaGetter } from '#/adapter/form';
import type { VxeGridProps } from '#/adapter/vxe-table';

import { getDictOptions } from '#/utils/dict';
import { renderDict } from '#/utils/render';

const classStatusDict = 'school_class_status';

export const querySchema: FormSchemaGetter = () => [
  {
    component: 'Input',
    fieldName: 'classNo',
    label: '班级编号',
  },
  {
    component: 'Input',
    fieldName: 'className',
    label: '班级名称',
  },
  {
    component: 'Input',
    fieldName: 'gradeName',
    label: '年级名称',
  },
  {
    component: 'Input',
    fieldName: 'teacherName',
    label: '班主任',
  },
  {
    component: 'Select',
    defaultValue: '0',
    componentProps: {
      options: getDictOptions(classStatusDict),
    },
    fieldName: 'status',
    label: '状态',
  },
];

export const columns: VxeGridProps['columns'] = [
  { type: 'checkbox', width: 60 },
  {
    field: 'classNo',
    title: '班级编号',
    minWidth: 120,
  },
  {
    field: 'className',
    title: '班级名称',
    minWidth: 140,
  },
  {
    field: 'gradeName',
    title: '年级名称',
    minWidth: 140,
  },
  {
    field: 'teacherName',
    title: '班主任',
    minWidth: 120,
  },
  {
    field: 'status',
    title: '状态',
    slots: {
      default: ({ row }) => renderDict(row.status, classStatusDict),
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
    fieldName: 'classId',
  },
  {
    component: 'Input',
    fieldName: 'classNo',
    label: '班级编号',
    rules: 'required',
  },
  {
    component: 'Input',
    fieldName: 'className',
    label: '班级名称',
    rules: 'required',
  },
  {
    component: 'Input',
    fieldName: 'gradeName',
    label: '年级名称',
  },
  {
    component: 'Select',
    componentProps: {
      options: [],
      optionFilterProp: 'label',
      optionLabelProp: 'label',
      showSearch: true,
    },
    fieldName: 'teacherId',
    label: '班主任',
    rules: 'selectRequired',
  },
  {
    component: 'RadioGroup',
    componentProps: {
      buttonStyle: 'solid',
      options: getDictOptions(classStatusDict),
      optionType: 'button',
    },
    defaultValue: '0',
    fieldName: 'status',
    label: '状态',
    rules: 'required',
  },
];
