<script setup lang="ts">
import type { VbenFormProps } from '@vben/common-ui';
import type { Student } from '#/api/school/student/model';

import type { VxeGridProps } from '#/adapter/vxe-table';

import { useRoute } from 'vue-router';

import { useVbenDrawer } from '@vben/common-ui';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  classRoomSelectStudents,
  classRoomUnallocatedStudentList,
} from '#/api/school/class-room';

import { columns, querySchema } from './data';

const emit = defineEmits<{ reload: [] }>();

const [BasicDrawer, drawerApi] = useVbenDrawer({
  destroyOnClose: true,
  onCancel: handleReset,
  onConfirm: handleSubmit,
});

const route = useRoute();
const classId = route.params.classId as string;

const formOptions: VbenFormProps = {
  commonConfig: {
    labelWidth: 80,
  },
  schema: querySchema(),
  wrapperClass: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
};

const selectableColumns = (columns ?? []).filter((item) => item.field !== 'action');

const gridOptions: VxeGridProps = {
  checkboxConfig: {
    highlight: true,
    reserve: true,
    trigger: 'row',
  },
  columns: selectableColumns,
  height: 'auto',
  keepSource: true,
  pagerConfig: {},
  proxyConfig: {
    ajax: {
      query: async ({ page }, formValues = {}) => {
        return await classRoomUnallocatedStudentList({
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
};

const [BasicTable, tableApi] = useVbenVxeGrid({
  formOptions,
  gridOptions,
});

async function handleSubmit() {
  const records = tableApi.grid.getCheckboxRecords() as Student[];
  const studentIds = records.map((item) => item.studentId);
  if (studentIds.length > 0) {
    await classRoomSelectStudents(classId, studentIds);
  }
  handleReset();
  emit('reload');
}

function handleReset() {
  drawerApi.close();
}
</script>

<template>
  <BasicDrawer class="w-[860px]" title="选择未分班学生">
    <BasicTable />
  </BasicDrawer>
</template>
