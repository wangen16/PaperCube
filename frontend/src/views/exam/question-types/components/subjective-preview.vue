<script setup lang="ts">
import type { QuestionPreviewProps } from '../model';
import { Textarea } from 'ant-design-vue';


const props = defineProps<QuestionPreviewProps>();
</script>

<template>
  <div class="space-y-4">
    <div class="rounded-lg border border-border p-3">
      <div class="mb-2 text-xs text-muted-foreground">主观题作答区预览</div>
      <Textarea disabled :auto-size="{ minRows: 3, maxRows: 5 }" placeholder="考生将在这里输入答案" />
    </div>
  </div>
</template>
