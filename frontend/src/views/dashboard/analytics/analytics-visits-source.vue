<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import { ref, watch } from 'vue';

const props = defineProps<{ data?: Record<string, number> }>();

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);

const TYPE_MAP = {
  '1': '单选题',
  '2': '多选题', 
  '3': '判断题',
  '4': '填空题',
  '5': '简答题',
};

watch(() => props.data, (newData) => {
  if (!newData) return;
  const chartData = Object.keys(newData).map(key => ({
    name: TYPE_MAP[key as keyof typeof TYPE_MAP] || '未知类型',
    value: newData[key]
  }));

  renderEcharts({
    legend: { bottom: '2%', left: 'center' },
    series: [
      {
        animationType: 'scale',
        avoidLabelOverlap: false,
        color: ['#5ab1ef', '#b6a2de', '#67e0e3', '#2ec7c9', '#f3d999'],
        data: chartData,
        itemStyle: { borderRadius: 10, borderWidth: 2 },
        label: { show: false, position: 'center' },
        labelLine: { show: false },
        name: '题型分布',
        radius: ['40%', '65%'],
        type: 'pie',
      },
    ],
    tooltip: { trigger: 'item' },
  });
}, { immediate: true });
</script>

<template>
  <EchartsUI ref="chartRef" />
</template>
