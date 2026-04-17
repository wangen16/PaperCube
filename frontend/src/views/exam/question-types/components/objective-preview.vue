<script setup lang="ts">
import type { QuestionPreviewProps } from '../model';

import { Checkbox } from 'ant-design-vue';

import { getJudgeOptions } from '../helpers';

const props = defineProps<QuestionPreviewProps>();

function isMulti() {
  return String(props.question.questionType || '') === '2';
}

function renderOptions() {
  if (String(props.question.questionType || '') === '3') {
    return getJudgeOptions();
  }
  return Array.isArray(props.question.options) ? props.question.options : [];
}
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-2 rounded-lg border border-border p-3">
      <div v-for="option in renderOptions()" :key="option.key"
        class="flex items-center gap-3 rounded-md border border-border px-3 py-2">
        <Checkbox v-if="isMulti()" :checked="false" disabled />
        <span v-else
          class="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[11px] text-muted-foreground">
          {{ String(props.question.questionType || '') === '3' ? option.label.slice(0, 1) : option.label }}
        </span>
        <span class="text-sm text-foreground">
          {{
            String(props.question.questionType || '') === '3'
              ? option.label
              : `${option.label}. ${option.value}`
          }}
        </span>
      </div>
    </div>
  </div>
</template>
