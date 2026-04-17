<script setup lang="ts">
import type { VbenFormProps } from '@vben/common-ui';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { GraphInstanceForm } from '#/api/graph/model';

import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page, useVbenModal } from '@vben/common-ui';
import { getVxePopupContainer } from '@vben/utils';

import { message, Modal, Popconfirm, Progress, Space, Button } from 'ant-design-vue';

import { useVbenVxeGrid, vxeCheckboxChecked } from '#/adapter/vxe-table';
import {
  graphInstanceBuild,
  graphInstanceExport,
  graphInstanceList,
  graphInstanceRebuild,
  graphInstanceRemove,
  graphInstanceStatus,
} from '#/api/graph';
import { commonDownloadExcel } from '#/utils/file/download';

import { columns, getStatusString, querySchema, renderStatusTag } from './data';
import graphInstanceModal from './graph-instance-modal.vue';

const router = useRouter();

const formOptions: VbenFormProps = {
  commonConfig: {
    labelWidth: 80,
    componentProps: {
      allowClear: true,
    },
  },
  schema: querySchema(),
  wrapperClass: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
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
        return await graphInstanceList({
          pageNum: page.currentPage,
          pageSize: page.pageSize,
          ...formValues,
        });
      },
    },
  },
  rowConfig: {
    keyField: 'id',
  },
  id: 'operator-graph-instance-index',
};

const [BasicTable, tableApi] = useVbenVxeGrid({
  formOptions,
  gridOptions,
});

const [GraphInstanceModal, modalApi] = useVbenModal({
  connectedComponent: graphInstanceModal,
});

// 构建状态轮询
const buildingInstances = ref<Set<string>>(new Set());
const buildProgress = ref<Map<string, number>>(new Map());

function handleAdd() {
  modalApi.setData({});
  modalApi.open();
}

async function handleEdit(row: Required<GraphInstanceForm>) {
  modalApi.setData({ id: row.id });
  modalApi.open();
}

async function handleDelete(row: Required<GraphInstanceForm>) {
  await graphInstanceRemove(row.id!);
  message.success('删除成功');
  await tableApi.query();
}

function handleMultiDelete() {
  const rows = tableApi.grid.getCheckboxRecords();
  const ids = rows.map((row: Required<GraphInstanceForm>) => row.id);
  Modal.confirm({
    title: '提示',
    okType: 'danger',
    content: `确认删除选中的${ids.length}条记录吗？`,
    onOk: async () => {
      await graphInstanceRemove(ids);
      message.success('删除成功');
      await tableApi.query();
    },
  });
}

async function handleBuild(row: Required<GraphInstanceForm>) {
  console.log('🚀 开始构建图谱:', row.id);
  try {
    await graphInstanceBuild(row.id!);
    message.success('图谱构建任务已启动');
    buildingInstances.value.add(row.id!);
    console.log('✅ 已添加到 buildingInstances:', row.id);
    console.log('📈 当前 buildingInstances:', [...buildingInstances.value]);
    startPollingStatus(row.id!);
    await tableApi.query();
  } catch (error) {
    console.error('❌ 启动构建任务失败:', error);
    message.error('启动构建任务失败');
  }
}

async function handleRebuild(row: Required<GraphInstanceForm>) {
  Modal.confirm({
    title: '确认重建图谱？',
    content: '重建将清空现有图谱数据并重新构建，此操作不可恢复',
    okType: 'danger',
    onOk: async () => {
      try {
        await graphInstanceRebuild(row.id!);
        message.success('图谱重建任务已启动');
        buildingInstances.value.add(row.id!);
        startPollingStatus(row.id!);
        await tableApi.query();
      } catch {
        message.error('启动重建任务失败');
      }
    },
  });
}

async function handleViewGraph(row: Required<GraphInstanceForm>) {
  console.group('🔍 图谱可视化跳转调试');
  console.log('1. 目标ID:', row.id);
  console.log('2. 知识库ID:', row.knowledgeId);

  // 检查路由是否已加载
  const routes = router.getRoutes();
  console.log('3. 已注册路由总数:', routes.length);

  const graphRoutes = routes.filter(
    (r) => r.path.includes('graph') || r.path.includes('Graph'),
  );
  console.log(
    '4. 图谱相关路由:',
    graphRoutes.map((r) => ({
      path: r.path,
      name: r.name,
    })),
  );

  const targetRoute = routes.find(
    (r) => r.path === '/operate/graph/graphVisualization',
  );
  console.log('5. 目标路由存在?', !!targetRoute);
  console.log('6. 目标路由详情:', targetRoute);

  console.groupEnd();

  if (!targetRoute) {
    message.error('页面路由未加载，请刷新页面后重试');
    return;
  }

  try {
    // 等待路由系统就绪
    await router.isReady();

    // 跳转到图谱可视化页面（在当前窗口打开）
    await router.push({
      path: '/operate/graph/graphVisualization',
      query: {
        id: row.id,
        knowledgeId: row.knowledgeId,
      },
    });

    console.log('✅ 路由跳转成功');
  } catch (error) {
    console.error('❌ 路由跳转失败:', error);
    message.error('页面跳转失败，请重试');
  }
}

// 轮询构建状态
function startPollingStatus(instanceId: string) {
  console.log('🔄 开始轮询构建状态:', instanceId);

  const timer = setInterval(async () => {
    try {
      const status = await graphInstanceStatus(instanceId);
      console.log('📊 收到构建状态:', {
        instanceId,
        progress: status.progress,
        status: status.status,
        taskStatus: status.taskStatus,
        rawResponse: status,
      });

      if (status.progress !== undefined && status.progress !== null) {
        buildProgress.value.set(instanceId, status.progress);
        console.log('✅ 更新进度:', status.progress, '%');
      } else {
        console.warn('⚠️ progress 为空:', status.progress);
      }

      console.log('📈 当前 buildingInstances:', [...buildingInstances.value]);
      console.log('📊 当前 buildProgress:', [...buildProgress.value.entries()]);

      if (
        status.status === 'COMPLETED' ||
        status.status === 'FAILED' ||
        status.status === 'CANCELLED'
      ) {
        console.log('🏁 任务结束，停止轮询:', status.status);
        clearInterval(timer);
        buildingInstances.value.delete(instanceId);
        buildProgress.value.delete(instanceId);
        await tableApi.query();

        if (status.status === 'COMPLETED') {
          message.success('图谱构建完成');
        } else if (status.status === 'FAILED') {
          message.error(`图谱构建失败: ${status.errorMessage || '未知错误'}`);
        }
      }
    } catch (error) {
      console.error('❌ 轮询状态失败:', error);
      clearInterval(timer);
      buildingInstances.value.delete(instanceId);
      buildProgress.value.delete(instanceId);
    }
  }, 3000); // 每3秒轮询一次
}

function handleDownloadExcel() {
  commonDownloadExcel(
    graphInstanceExport,
    '图谱实例数据',
    tableApi.formApi.form.values,
  );
}
</script>

<template>
  <Page :auto-content-height="true">
    <BasicTable table-title="图谱实例列表">
      <template #toolbar-tools>
        <Space>
          <Button v-access:code="['operator:graph:export']" @click="handleDownloadExcel">
            导出
          </Button>
          <Button :disabled="!vxeCheckboxChecked(tableApi)" danger type="primary"
            v-access:code="['operator:graph:remove']" @click="handleMultiDelete">
            删除
          </Button>
          <Button type="primary" v-access:code="['operator:graph:add']" @click="handleAdd">
            新建图谱
          </Button>
        </Space>
      </template>

      <template #status="{ row }">
        <div>
          <component :is="renderStatusTag(row.graphStatus)" />
          <Progress v-if="buildingInstances.has(row.id)" :percent="buildProgress.get(row.id) || 0" :show-info="true"
            size="small" style="width: 100px; margin-top: 4px" />
        </div>
      </template>

      <template #action="{ row }">
        <Space>
          <ghost-button v-if="getStatusString(row.graphStatus) === 'COMPLETED'" type="primary"
            @click.stop="handleViewGraph(row)">
            查看图谱
          </ghost-button>

          <ghost-button v-if="
            ['NOT_BUILT', 'FAILED'].includes(getStatusString(row.graphStatus))
          " v-access:code="['operator:graph:build']" type="primary" @click.stop="handleBuild(row)">
            构建
          </ghost-button>

          <Popconfirm v-if="getStatusString(row.graphStatus) === 'COMPLETED'"
            :get-popup-container="getVxePopupContainer" placement="left" title="确认重建图谱？" @confirm="handleRebuild(row)">
            <ghost-button v-access:code="['operator:graph:rebuild']" @click.stop="">
              重建
            </ghost-button>
          </Popconfirm>

          <ghost-button v-access:code="['operator:graph:edit']" @click.stop="handleEdit(row)">
            编辑
          </ghost-button>

          <Popconfirm :get-popup-container="getVxePopupContainer" placement="left" title="确认删除？"
            @confirm="handleDelete(row)">
            <ghost-button danger v-access:code="['operator:graph:remove']" @click.stop="">
              删除
            </ghost-button>
          </Popconfirm>
        </Space>
      </template>
    </BasicTable>
    <GraphInstanceModal @reload="tableApi.query()" />
  </Page>
</template>
