<script setup lang="ts">
import type { VbenFormProps } from '@vben/common-ui';
import type { ClassRoom } from '#/api/school/class-room/model';
import type { Student } from '#/api/school/student/model';

import type { VxeGridProps } from '#/adapter/vxe-table';

import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { getVxePopupContainer } from '@vben/utils';

import { Modal, Popconfirm, Space, Button } from 'ant-design-vue';

import { useVbenVxeGrid, vxeCheckboxChecked } from '#/adapter/vxe-table';
import {
  classRoomAllocatedStudentList,
  classRoomCancelStudent,
  classRoomCancelStudents,
  classRoomInfo,
} from '#/api/school/class-room';

import assignStudentDrawer from './assign-student-drawer.vue';
import { columns, querySchema } from './data';

const route = useRoute();
const classId = route.params.classId as string;
const classRoom = ref<ClassRoom>();

const pageTitle = computed(() => {
  return classRoom.value
    ? `班级学生 - ${classRoom.value.className}`
    : '班级学生';
});

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
  },
  columns,
  height: 'auto',
  keepSource: true,
  pagerConfig: {},
  proxyConfig: {
    ajax: {
      query: async ({ page }, formValues = {}) => {
        return await classRoomAllocatedStudentList({
          classId,
          pageNum: page.currentPage,
          pageSize: page.pageSize,
          ...formValues,
        });
      },
    },
  },
  rowConfig: {
    keyField: 'studentId',
  },
  id: 'school-class-room-assign-student-index',
};

const [BasicTable, tableApi] = useVbenVxeGrid({
  formOptions,
  gridOptions,
});

const [AssignStudentDrawer, drawerApi] = useVbenDrawer({
  connectedComponent: assignStudentDrawer,
});

void classRoomInfo(classId).then((resp) => {
  classRoom.value = resp;
});

function handleAdd() {
  drawerApi.setData({});
  drawerApi.open();
}

async function handleCancelAssign(record: Student) {
  await classRoomCancelStudent({ classId, studentId: record.studentId });
  await tableApi.query();
}

function handleMultipleCancelAssign() {
  const rows = tableApi.grid.getCheckboxRecords() as Student[];
  const ids = rows.map((row) => row.studentId);
  Modal.confirm({
    title: '提示',
    okType: 'danger',
    content: `确认移除选中的${ids.length}名学生吗？`,
    onOk: async () => {
      await classRoomCancelStudents(classId, ids);
      await tableApi.query();
      tableApi.grid.clearCheckboxRow();
    },
  });
}
</script>

<template>
  <Page :auto-content-height="true">
    <BasicTable :table-title="pageTitle">
      <template #toolbar-tools>
        <Space>
          <Button :disabled="!vxeCheckboxChecked(tableApi)" danger type="primary"
            v-access:code="['school:classRoom:assign']" @click="handleMultipleCancelAssign">
            移除
          </Button>
          <Button type="primary" v-access:code="['school:classRoom:assign']" @click="handleAdd">
            添加学生
          </Button>
        </Space>
      </template>
      <template #action="{ row }">
        <Popconfirm :get-popup-container="getVxePopupContainer" :title="`确认将学生[${row.studentName}]移出当前班级吗？`"
          placement="left" @confirm="handleCancelAssign(row)">
          <GhostButton danger v-access:code="['school:classRoom:assign']" @click.stop="">
            移除
          </GhostButton>
        </Popconfirm>
      </template>
    </BasicTable>
    <AssignStudentDrawer @reload="tableApi.query()" />
  </Page>
</template>
