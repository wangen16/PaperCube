<script setup lang="ts">
import type { QuestionEditorProps, QuestionFormModel } from '../model';
import { FormItem, Textarea, Switch } from 'ant-design-vue';

import { computed } from 'vue';

const props = defineProps<QuestionEditorProps>();
const emit = defineEmits<{
  'update:modelValue': [value: QuestionFormModel];
}>();

const answerRule = computed(() => ({
  answers: Array.isArray(props.modelValue.standardAnswer?.answers)
    ? props.modelValue.standardAnswer.answers
    : [],
  keywords: Array.isArray(props.modelValue.standardAnswer?.keywords)
    ? props.modelValue.standardAnswer.keywords
    : [],
  matchMode: props.modelValue.standardAnswer?.matchMode === 'all' ? 'all' : 'any',
}));

function updateStandardAnswer(patch: Record<string, any>) {
  emit('update:modelValue', {
    ...props.modelValue,
    standardAnswer: {
      ...answerRule.value,
      ...patch,
    },
  });
}
</script>

<template>
  <FormItem label="关键词匹配">
    <div class="flex items-center gap-3">
      <span>全部命中</span>
      <Switch :checked="answerRule.matchMode === 'all'"
        @change="updateStandardAnswer({ matchMode: $event ? 'all' : 'any' })" />
      <span>任一命中</span>
    </div>
  </FormItem>
  <FormItem label="判分关键词">
    <Textarea :rows="4" :value="answerRule.keywords.join('\n')" placeholder="每行一个关键词，便于后续自动判分" @update:value="
      updateStandardAnswer({
        keywords: String($event || '')
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
      })
      " />
  </FormItem>
  <FormItem label="参考答案">
    <Textarea :rows="4" :value="answerRule.answers.join('\n')" placeholder="每行一个参考答案版本" @update:value="
      updateStandardAnswer({
        answers: String($event || '')
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
      })
      " />
  </FormItem>
</template>
