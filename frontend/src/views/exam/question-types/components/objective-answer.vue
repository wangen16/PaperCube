<script setup lang="ts">
import type { QuestionAnswerProps } from '../model';

import { computed } from 'vue';

import { Checkbox } from 'ant-design-vue';

import { getJudgeOptions } from '../helpers';

const props = defineProps<QuestionAnswerProps>();
const emit = defineEmits<{
  'update:modelValue': [value: any];
}>();

const mode = computed(() => String(props.question.questionType || '1'));
const options = computed(() => {
  if (mode.value === '3') {
    return getJudgeOptions();
  }
  return Array.isArray(props.question.options) ? props.question.options : [];
});

function currentValue() {
  if (props.modelValue != null) {
    return props.modelValue;
  }
  return mode.value === '2' ? [] : '';
}

function updateValue(value: any) {
  if (props.readonly) {
    return;
  }
  emit('update:modelValue', value);
}
</script>

<template>
  <div class="space-y-4">
    <template v-if="mode === '1' || mode === '3'">
      <label v-for="item in options" :key="item.key"
        class="flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors" :class="currentValue() === (mode === '3' ? item.key : item.key)
            ? 'border-primary bg-primary/5'
            : 'border-border hover:bg-accent/30'
          ">
        <input class="h-5 w-5 border-slate-300 text-primary focus:ring-primary" :checked="currentValue() === item.key"
          :disabled="readonly" type="radio" @change="updateValue(item.key)" />
        <span class="text-base">
          {{ mode === '3' ? item.label : `${item.label}. ${item.value}` }}
        </span>
      </label>
    </template>

    <template v-else>
      <label v-for="item in options" :key="item.key"
        class="flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors" :class="(currentValue() as string[])?.includes?.(item.key)
            ? 'border-primary bg-primary/5'
            : 'border-border hover:bg-accent/30'
          ">
        <Checkbox :checked="(currentValue() as string[])?.includes?.(item.key)" :disabled="readonly" @update:checked="
          updateValue(
            $event
              ? [...((currentValue() as string[]) || []), item.key]
              : ((currentValue() as string[]) || []).filter((value: string) => value !== item.key),
          )
          " />
        <span class="text-base">
          {{ item.label }}. {{ item.value }}
        </span>
      </label>
    </template>
  </div>
</template>
