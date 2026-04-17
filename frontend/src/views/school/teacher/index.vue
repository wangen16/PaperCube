<script setup lang="ts">
import type { VbenFormProps } from '@vben/common-ui';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { Teacher } from '#/api/school/teacher/model';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { getVxePopupContainer } from '@vben/utils';

import { Modal, Popconfirm, Space, Button } from 'ant-design-vue';

import { useVbenVxeGrid, vxeCheckboxChecked } from '#/adapter/vxe-table';
import {
  teacherList,
  teacherRemove,
} from '#/api/school/teacher';

import { columns, querySchema } from './data';
import teacherDrawer from './teacher-drawer.vue';

const formOptions: VbenFormProps = {
  commonConfig: {
    labelWidth: 80,
    componentProps: {
      allowClear: true,
    },
  },
  schema: querySchema(),
  wrapperClass: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
};

const gridOptions: VxeGridProps = {
  checkboxConfig: {
    highlight: true,
    reserve: true,
    trigger: 'cell',
  },
  columns,
  height: 'auto',
  keepSource: true,
  pagerConfig: {},
  proxyConfig: {
    ajax: {
      query: async ({ page }, formValues = {}) => {
        return await teacherList({
          pageNum: page.currentPage,
          pageSize: page.pageSize,
          ...formValues,
        });
      },
    },
  },
  rowConfig: {
    keyField: 'teacherId',
  },
  id: 'school-teacher-index',
};

const [BasicTable, tableApi] = useVbenVxeGrid({
  formOptions,
  gridOptions,
});

const [TeacherDrawer, drawerApi] = useVbenDrawer({
  connectedComponent: teacherDrawer,
});

function handleAdd() {
  drawerApi.setData({});
  drawerApi.open();
}

function handleEdit(record: Teacher) {
  drawerApi.setData({ id: record.teacherId });
  drawerApi.open();
}

async function handleDelete(row: Teacher) {
  await teacherRemove([row.teacherId]);
  await tableApi.query();
}

function handleMultiDelete() {
  const rows = tableApi.grid.getCheckboxRecords();
  const ids = rows.map((row: Teacher) => row.teacherId);
  Modal.confirm({
    title: '提示',
    okType: 'danger',
    content: `确认删除选中的${ids.length}条记录吗？`,
    onOk: async () => {
      await teacherRemove(ids);
      await tableApi.query();
    },
  });
}
</script>

<template>
  <Page :auto-content-height="true">
    <BasicTable table-title="教师列表">
      <template #toolbar-tools>
        <Space>
          <Button :disabled="!vxeCheckboxChecked(tableApi)" danger type="primary"
            v-access:code="['school:teacher:remove']" @click="handleMultiDelete">
            {{ $t('pages.common.delete') }}
          </Button>
          <Button type="primary" v-access:code="['school:teacher:add']" @click="handleAdd">
            {{ $t('pages.common.add') }}
          </Button>
        </Space>
      </template>
      <template #action="{ row }">
        <Space>
          <GhostButton v-access:code="['school:teacher:edit']" @click="handleEdit(row)">
            {{ $t('pages.common.edit') }}
          </GhostButton>
          <Popconfirm :get-popup-container="getVxePopupContainer" placement="left" title="确认删除？"
            @confirm="handleDelete(row)">
            <GhostButton danger v-access:code="['school:teacher:remove']" @click.stop="">
              {{ $t('pages.common.delete') }}
            </GhostButton>
          </Popconfirm>
        </Space>
      </template>
    </BasicTable>
    <TeacherDrawer @reload="tableApi.query()" />
  </Page>
</template>
