import type { FormSchemaGetter } from '#/adapter/form';
import type { VxeGridProps } from '#/adapter/vxe-table';

import { DictEnum } from '@vben/constants';
import { getPopupContainer } from '@vben/utils';

import { getDictOptions } from '#/utils/dict';
import { renderDict } from '#/utils/render';

export const querySchema: FormSchemaGetter = () => [
  {
    component: 'Input',
    fieldName: 'categoryName',
    label: '分类名称',
  },
  {
    component: 'Select',
    componentProps: {
      getPopupContainer,
      options: getDictOptions(DictEnum.SYS_NORMAL_DISABLE),
    },
    fieldName: 'status',
    label: '状态',
  },
];

export const columns: VxeGridProps['columns'] = [
  {
    field: 'categoryName',
    title: '分类名称',
    treeNode: true,
  },
  {
    field: 'categoryCode',
    title: '分类编码',
    minWidth: 180,
  },
  {
    field: 'orderNum',
    title: '排序',
    width: 100,
  },
  {
    field: 'status',
    title: '状态',
    slots: {
      default: ({ row }) => renderDict(row.status, DictEnum.SYS_NORMAL_DISABLE),
    },
    width: 100,
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
    width: 220,
  },
];

export const drawerSchema: FormSchemaGetter = () => [
  {
    component: 'Input',
    dependencies: {
      show: () => false,
      triggerFields: [''],
    },
    fieldName: 'categoryId',
  },
  {
    component: 'TreeSelect',
    fieldName: 'parentId',
    label: '上级分类',
  },
  {
    component: 'Input',
    fieldName: 'categoryName',
    label: '分类名称',
    rules: 'required',
  },
  {
    component: 'InputNumber',
    defaultValue: 0,
    fieldName: 'orderNum',
    label: '显示排序',
    rules: 'required',
  },
  {
    component: 'Input',
    fieldName: 'categoryCode',
    help: '编码按父级自动生成，不支持手改',
    label: '分类编码',
    componentProps: {
      disabled: true,
      placeholder: '保存后自动生成',
    },
  },
  {
    component: 'RadioGroup',
    componentProps: {
      buttonStyle: 'solid',
      options: getDictOptions(DictEnum.SYS_NORMAL_DISABLE),
      optionType: 'button',
    },
    defaultValue: '0',
    fieldName: 'status',
    label: '状态',
  },
  {
    component: 'Textarea',
    fieldName: 'remark',
    formItemClass: 'col-span-2 items-start',
    label: '备注',
  },
];
