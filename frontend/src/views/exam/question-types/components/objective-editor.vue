<script setup lang="ts">
import type { QuestionEditorProps, QuestionFormModel } from '../model';

import { computed } from 'vue';

import { Button, Checkbox, Radio, Select, Input, FormItem } from 'ant-design-vue';

import {
  createDefaultOptions,
  extractAnswerArray,
  getJudgeOptions,
} from '../helpers';
import { MULTI_SELECT_SCORING_OPTIONS } from '../../_components/constants';

const props = defineProps<QuestionEditorProps>();
const emit = defineEmits<{
  'update:modelValue': [value: QuestionFormModel];
}>();

const mode = computed(() => String(props.modelValue.questionType || '1'));
const optionList = computed(() =>
  mode.value === '3'
    ? getJudgeOptions()
    : props.modelValue.options?.length
      ? props.modelValue.options
      : createDefaultOptions(),
);
const selectedAnswers = computed(() => extractAnswerArray(props.modelValue.standardAnswer));

function updateQuestion(patch: Partial<QuestionFormModel>) {
  emit('update:modelValue', {
    ...props.modelValue,
    ...patch,
  });
}

function syncOptions(nextOptions: QuestionFormModel['options']) {
  const availableKeys = nextOptions.map((item) => item.key);
  const nextAnswers = selectedAnswers.value.filter((item) => availableKeys.includes(item));
  updateQuestion({
    options: nextOptions,
    standardAnswer: {
      answers: mode.value === '2' ? nextAnswers : nextAnswers.slice(0, 1),
    },
  });
}

function addOption() {
  const nextIndex = optionList.value.length;
  const nextLabel = String.fromCharCode('A'.charCodeAt(0) + nextIndex);
  syncOptions([
    ...optionList.value,
    {
      key: nextLabel,
      label: nextLabel,
      value: '',
    },
  ]);
}

function removeOption(index: number) {
  if (optionList.value.length <= 2) {
    return;
  }
  const nextOptions = optionList.value
    .filter((_, currentIndex) => currentIndex !== index)
    .map((item, itemIndex) => {
      const label = String.fromCharCode('A'.charCodeAt(0) + itemIndex);
      return {
        ...item,
        key: label,
        label,
      };
    });
  syncOptions(nextOptions);
}

function updateOptionValue(index: number, value: string) {
  const nextOptions = optionList.value.map((item, currentIndex) =>
    currentIndex === index ? { ...item, value } : item,
  );
  syncOptions(nextOptions);
}

function updateSingleAnswer(answerKey: string) {
  updateQuestion({
    standardAnswer: {
      answers: answerKey ? [answerKey] : [],
    },
  });
}

function updateMultiAnswer(answerKey: string, checked: boolean) {
  const currentAnswers = [...selectedAnswers.value];
  const nextAnswers = checked
    ? [...new Set([...currentAnswers, answerKey])]
    : currentAnswers.filter((item) => item !== answerKey);
  updateQuestion({
    standardAnswer: {
      answers: nextAnswers,
    },
  });
}

function isAnswerSelected(answerKey: string) {
  return selectedAnswers.value.includes(answerKey);
}
</script>

<template>
  <FormItem v-if="mode !== '3'" label="选项与答案">
    <div class="space-y-3">
      <div v-for="(option, index) in optionList" :key="option.key"
        class="grid grid-cols-[32px_32px_minmax(0,1fr)_auto] items-center gap-3">
        <div class="flex items-center justify-center">
          <Checkbox v-if="mode === '2'" :checked="isAnswerSelected(option.key)"
            @update:checked="updateMultiAnswer(option.key, !!$event)" />
          <Radio v-else :checked="selectedAnswers[0] === option.key" @change="updateSingleAnswer(option.key)" />
        </div>
        <div class="text-center font-semibold">{{ option.label }}</div>
        <Input class="w-full" v-model:value="option.value" placeholder="请输入选项内容"
          @change="updateOptionValue(index, option.value)" />
        <Button danger type="link" @click="removeOption(index)">
          删除
        </Button>
      </div>
      <!-- Offset the add option button to align with inputs -->
      <div class="grid grid-cols-[32px_32px_minmax(0,1fr)_auto] gap-3">
        <div class="col-start-3">
          <Button type="dashed" @click="addOption">新增选项</Button>
        </div>
      </div>
    </div>
  </FormItem>

  <FormItem v-if="mode === '3'" label="正确答案">
    <div class="space-y-3">
      <div v-for="option in optionList" :key="option.key"
        class="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-slate-50"
        @click="updateSingleAnswer(option.key)">
        <div class="flex w-10 justify-center">
          <Radio :checked="selectedAnswers[0] === option.key" @change="updateSingleAnswer(option.key)" />
        </div>
        <div class="min-w-0 flex-1 text-sm text-foreground">
          {{ option.label }}
        </div>
      </div>
    </div>
  </FormItem>

  <FormItem v-if="mode === '2'" label="少选判分">
    <Select :options="MULTI_SELECT_SCORING_OPTIONS"
      :value="props.modelValue.partialScoreRule?.mode || 'zero_if_not_full_correct'" placeholder="请选择少选判分规则"
      @update:value="
        updateQuestion({
          partialScoreRule: { mode: $event || 'zero_if_not_full_correct' },
        })
        " />
  </FormItem>
</template>
