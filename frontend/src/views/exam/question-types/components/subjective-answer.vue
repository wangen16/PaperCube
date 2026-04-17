<script setup lang="ts">
import type { QuestionAnswerProps } from '../model';
import { Textarea } from 'ant-design-vue';

const props = defineProps<QuestionAnswerProps>();
const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>

<template>
  <div class="space-y-4">
    <div class="rounded-lg border border-dashed border-border p-2">
      <Textarea :disabled="readonly" :rows="10" :value="String(props.modelValue || '')"
        @update:value="emit('update:modelValue', String($event || ''))" />
    </div>
  </div>
</template>
