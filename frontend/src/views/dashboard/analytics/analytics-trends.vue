<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import { ref, watch } from 'vue';

const props = defineProps<{ data?: any[] }>();

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);

watch(() => props.data, (newData) => {
  if (!newData || !newData.length) return;

  const dates = newData.map(item => item.date);
  const activeUsers = newData.map(item => item.activeUsers);
  const examsTaken = newData.map(item => item.examsTaken);

  const maxValue = Math.max(...activeUsers, ...examsTaken, 10);
  // 取稍微大于最大值的整十数
  const yMax = Math.ceil(maxValue / 10) * 10;

  renderEcharts({
    grid: {
      bottom: 0,
      containLabel: true,
      left: '1%',
      right: '1%',
      top: '10%',
    },
    legend: {
      data: ['活跃用户', '考试人次'],
      top: '0%',
    },
    series: [
      {
        name: '活跃用户',
        areaStyle: {},
        data: activeUsers,
        itemStyle: { color: '#5ab1ef' },
        smooth: true,
        type: 'line',
      },
      {
        name: '考试人次',
        areaStyle: {},
        data: examsTaken,
        itemStyle: { color: '#019680' },
        smooth: true,
        type: 'line',
      },
    ],
    tooltip: {
      axisPointer: { lineStyle: { color: '#019680', width: 1 } },
      trigger: 'axis',
    },
    xAxis: {
      axisTick: { show: false },
      boundaryGap: false,
      data: dates,
      splitLine: { lineStyle: { type: 'solid', width: 1 }, show: true },
      type: 'category',
    },
    yAxis: [
      {
        axisTick: { show: false },
        max: yMax,
        splitArea: { show: true },
        splitNumber: 4,
        type: 'value',
      },
    ],
  });
}, { immediate: true });
</script>

<template>
  <EchartsUI ref="chartRef" />
</template>
