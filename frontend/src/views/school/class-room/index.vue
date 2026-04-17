<script setup lang="ts">
import type { VbenFormProps } from '@vben/common-ui';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { ClassRoom } from '#/api/school/class-room/model';

import { useRouter } from 'vue-router';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { getVxePopupContainer } from '@vben/utils';

import { Modal, Popconfirm, Space, Button } from 'ant-design-vue';

import { useVbenVxeGrid, vxeCheckboxChecked } from '#/adapter/vxe-table';
import {
  classRoomList,
  classRoomRemove,
} from '#/api/school/class-room';

import classRoomDrawer from './class-room-drawer.vue';
import { columns, querySchema } from './data';

const formOptions: VbenFormProps = {
  commonConfig: {
    labelWidth: 80,
    componentProps: {
      allowClear: true,
    },
  },
  schema: querySchema(),
  wrapperClass: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
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
        return await classRoomList({
          pageNum: page.currentPage,
          pageSize: page.pageSize,
          ...formValues,
        });
      },
    },
  },
  rowConfig: {
    keyField: 'classId',
  },
  id: 'school-class-room-index',
};

const [BasicTable, tableApi] = useVbenVxeGrid({
  formOptions,
  gridOptions,
});

const [ClassRoomDrawer, drawerApi] = useVbenDrawer({
  connectedComponent: classRoomDrawer,
});
const router = useRouter();

function handleAdd() {
  drawerApi.setData({});
  drawerApi.open();
}

function handleEdit(record: ClassRoom) {
  drawerApi.setData({ id: record.classId });
  drawerApi.open();
}

async function handleDelete(row: ClassRoom) {
  await classRoomRemove([row.classId]);
  await tableApi.query();
}

function handleMultiDelete() {
  const rows = tableApi.grid.getCheckboxRecords();
  const ids = rows.map((row: ClassRoom) => row.classId);
  Modal.confirm({
    title: '提示',
    okType: 'danger',
    content: `确认删除选中的${ids.length}条记录吗？`,
    onOk: async () => {
      await classRoomRemove(ids);
      await tableApi.query();
    },
  });
}

function handleAssign(record: ClassRoom) {
  router.push(`/school/class-room-assign/student/${record.classId}`);
}
</script>

<template>
  <Page :auto-content-height="true">
    <BasicTable table-title="班级列表">
      <template #toolbar-tools>
        <Space>
          <Button :disabled="!vxeCheckboxChecked(tableApi)" danger type="primary"
            v-access:code="['school:classRoom:remove']" @click="handleMultiDelete">
            {{ $t('pages.common.delete') }}
          </Button>
          <Button type="primary" v-access:code="['school:classRoom:add']" @click="handleAdd">
            {{ $t('pages.common.add') }}
          </Button>
        </Space>
      </template>
      <template #action="{ row }">
        <Space>
          <GhostButton v-access:code="['school:classRoom:edit']" @click="handleEdit(row)">
            {{ $t('pages.common.edit') }}
          </GhostButton>
          <GhostButton v-access:code="['school:classRoom:assign']" @click="handleAssign(row)">
            分配
          </GhostButton>
          <Popconfirm :get-popup-container="getVxePopupContainer" placement="left" title="确认删除？"
            @confirm="handleDelete(row)">
            <GhostButton danger v-access:code="['school:classRoom:remove']" @click.stop="">
              {{ $t('pages.common.delete') }}
            </GhostButton>
          </Popconfirm>
        </Space>
      </template>
    </BasicTable>
    <ClassRoomDrawer @reload="tableApi.query()" />
  </Page>
</template>
