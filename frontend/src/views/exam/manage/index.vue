<script setup lang="ts">
import type { VbenFormProps } from '@vben/common-ui';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { ExamManage } from '#/api/exam/manage/model';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { Modal, Space, Button } from 'ant-design-vue';

import { useVbenVxeGrid, vxeCheckboxChecked } from '#/adapter/vxe-table';
import {
  examManageList,
  examManagePublish,
  examManageRemove,
} from '#/api/exam/manage';

import { columns, querySchema } from './data';
import ManageDrawerView from './manage-drawer.vue';

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
    trigger: 'default',
  },
  columns,
  height: 'auto',
  keepSource: true,
  pagerConfig: {},
  proxyConfig: {
    ajax: {
      query: async ({ page }, formValues = {}) =>
        await examManageList({
          pageNum: page.currentPage,
          pageSize: page.pageSize,
          ...formValues,
        }),
    },
  },
  rowConfig: {
    keyField: 'examId',
  },
  id: 'exam-manage-index',
};

const [BasicTable, tableApi] = useVbenVxeGrid({
  formOptions,
  gridOptions,
});

const [ManageDrawer, drawerApi] = useVbenDrawer({
  connectedComponent: ManageDrawerView,
});

function handleAdd() {
  drawerApi.setData({});
  drawerApi.open();
}

function handleEdit(row: ExamManage) {
  drawerApi.setData({ id: row.examId });
  drawerApi.open();
}

async function handleDelete(row: ExamManage) {
  await examManageRemove([row.examId]);
  await tableApi.query();
}

async function handlePublish(row: ExamManage, status: string) {
  if (status === '2') {
    Modal.confirm({
      title: '高危操作警告',
      content: '强制撤回会导致正在考试的学生被迫中断，且撤回后不产生有效成绩数据，您确定要撤回吗？',
      okText: '强制撤回',
      okType: 'danger',
      onOk: async () => {
        await examManagePublish({ examId: row.examId, status });
        await tableApi.query();
      },
    });
  } else {
    await examManagePublish({ examId: row.examId, status });
    await tableApi.query();
  }
}

function handleMultiDelete() {
  const rows = tableApi.grid.getCheckboxRecords();
  const ids = rows.map((row: ExamManage) => row.examId);
  Modal.confirm({
    content: `确认删除选中的${ids.length}场考试吗？`,
    okType: 'danger',
    title: '提示',
    onOk: async () => {
      await examManageRemove(ids);
      await tableApi.query();
    },
  });
}
</script>

<template>
  <Page :auto-content-height="true">
    <BasicTable table-title="考试管理">
      <template #toolbar-tools>
        <Space>
          <Button :disabled="!vxeCheckboxChecked(tableApi)" danger type="primary" v-access:code="['exam:manage:remove']"
            @click="handleMultiDelete">
            {{ $t('pages.common.delete') }}
          </Button>
          <Button type="primary" v-access:code="['exam:manage:add']" @click="handleAdd">
            新建考试
          </Button>
        </Space>
      </template>
      <template #action="{ row }">
        <Space>
          <ghost-button v-access:code="['exam:manage:edit']" @click="handleEdit(row)">
            编辑
          </ghost-button>
          <ghost-button v-if="row.status !== '1'" class="btn-success" v-access:code="['exam:manage:edit']"
            @click="handlePublish(row, '1')">
            发布
          </ghost-button>
          <ghost-button v-else class="btn-warning" v-access:code="['exam:manage:edit']"
            @click="handlePublish(row, '2')">
            撤回
          </ghost-button>
          <ghost-button danger v-access:code="['exam:manage:remove']" @click="handleDelete(row)">
            删除
          </ghost-button>
        </Space>
      </template>
    </BasicTable>
    <ManageDrawer @reload="tableApi.query()" />
  </Page>
</template>
