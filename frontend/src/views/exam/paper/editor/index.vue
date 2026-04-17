<script setup lang="ts">
import type { ExamPaper, PaperStructureItem } from '#/api/exam/paper/model';
import type { KnowledgeCategoryTree } from '#/api/exam/knowledge-category/model';
import type { Question } from '#/api/exam/question/model';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { HolderOutlined } from '@ant-design/icons-vue';
import { Page } from '@vben/common-ui';
import { DictEnum } from '@vben/constants';
import { message } from 'ant-design-vue';

import {
  Button,
  Card,
  Collapse,
  Empty,
  Image,
  Input,
  InputNumber,
  Radio,
  Rate,
  Select,
  Slider,
  Tag,
  Tooltip,
  TreeSelect,
} from 'ant-design-vue';
import { VueDraggable } from 'vue-draggable-plus';

import { FileUpload } from '#/components/upload';
import { knowledgeCategoryTree } from '#/api/exam/knowledge-category';
import { paperAdd, paperInfo, paperUpdate } from '#/api/exam/paper';
import { questionInfo, questionList } from '#/api/exam/question';
import { ossInfo } from '#/api/system/oss/index';
import { getDictOptions } from '#/utils/dict';

import {
  getDifficultyText,
  normalizeDifficulty,
  QUESTION_DIFFICULTY_OPTIONS,
  stripHtml,
} from '../../_components/constants';
import { useTabs } from '@vben/hooks';
const { closeCurrentTab } = useTabs();


import QuestionAttachments from '../../_components/question-attachments.vue';
import QuestionTypePreviewRenderer from '../../question-types/question-type-preview-renderer.vue';
import { getQuestionTypeLabel, getQuestionTypeOptions } from '../../question-types/registry';

const route = useRoute();
const router = useRouter();

interface PaperFormState {
  paperId?: number;
  passScore: number;
  remark: string;
  status: string;
  title: string;
}

const loading = ref(false);
const questionLoading = ref(false);
const saving = ref(false);
const durationHint = ref(120);
const lastSavedText = ref('未保存');
const categoryPathMap = ref<Record<number, string>>({});
const categoryTreeData = ref<KnowledgeCategoryTree[]>([]);
const questionRows = ref<Question[]>([]);
const structureList = ref<PaperStructureItem[]>([]);
const fixedQuestionMap = reactive<Record<number, Question>>({});
const attachmentUrlMap = reactive<Record<string, { url: string; type: string }>>({});

const paperForm = reactive<PaperFormState>({
  paperId: undefined,
  passScore: 60,
  remark: '',
  status: '0',
  title: '',
});

const filters = reactive({
  content: '',
  difficulty: undefined as string | undefined,
  knowledgeCategoryId: undefined as number | undefined,
  questionType: undefined as string | undefined,
});

const isUpdate = computed(() => Boolean(route.params.paperId));
const pageTitle = computed(() =>
  `${isUpdate.value ? '编辑试卷' : '新建试卷'}：${paperForm.title?.trim() || '未命名试卷'}`,
);
const normalStatusOptions = computed(() =>
  getDictOptions(DictEnum.SYS_NORMAL_DISABLE),
);
const questionTypeOptions = computed(() => getQuestionTypeOptions());

const randomTimingOptions = [
  { label: '发布时', value: 'on_publish' },
  { label: '考试时', value: 'on_exam' },
];

const totalScore = computed(() => {
  return structureList.value.reduce((sum, item) => {
    if (item.type === 'fixed') {
      return sum + Number(item.score || 0);
    }
    return sum + Number(item.count || 0) * Number(item.scorePerItem || 0);
  }, 0);
});

function normalizeDifficultyPoint(value: null | number | string | undefined) {
  return normalizeDifficulty(value);
}

function normalizeDifficultyRange(
  minValue: null | number | string | undefined,
  maxValue: null | number | string | undefined,
): [number, number] {
  const min = normalizeDifficultyPoint(minValue);
  const max = normalizeDifficultyPoint(maxValue);
  return min <= max ? [min, max] : [max, min];
}

function normalizeStructureItem(item: PaperStructureItem): PaperStructureItem {
  if (item.type !== 'random') {
    return {
      ...item,
      score: Number(item.score || 5),
    };
  }

  const [difficultyMin, difficultyMax] = normalizeDifficultyRange(
    item.filter?.difficultyMin ?? item.filter?.difficulty ?? 1,
    item.filter?.difficultyMax ?? item.filter?.difficulty ?? 5,
  );

  return {
    ...item,
    count: Number(item.count || 10),
    filter: {
      difficulty: undefined,
      difficultyMax,
      difficultyMin,
      knowledgeCategoryIds: item.filter?.knowledgeCategoryIds || (item.filter?.knowledgeCategoryId ? [item.filter?.knowledgeCategoryId] : []),
      types: item.filter?.types || (item.filter?.type ? [item.filter?.type] : []),
    },
    generateTiming: item.generateTiming || 'on_publish',
    scorePerItem: Number(item.scorePerItem || 2),
  };
}

function getQuestionTypeColor(type?: null | number | string) {
  switch (String(type ?? '')) {
    case '1': {
      return 'blue';
    }
    case '2': {
      return 'purple';
    }
    case '3': {
      return 'green';
    }
    case '4': {
      return 'gold';
    }
    default: {
      return 'default';
    }
  }
}

function getFixedQuestion(item: PaperStructureItem) {
  return item.questionId ? fixedQuestionMap[Number(item.questionId)] : undefined;
}

function isQuestionInPaper(questionId?: number) {
  if (!questionId) return false;
  return structureList.value.some(s => s.type === 'fixed' && s.questionId === questionId);
}

function getQuestionDifficulty(question?: Partial<Question>) {
  return normalizeDifficulty(question?.difficulty);
}

function getQuestionCategoryName(question?: Partial<Question>) {
  const categoryId = Number(question?.knowledgeCategoryId || 0);
  if (categoryId && categoryPathMap.value[categoryId]) {
    return categoryPathMap.value[categoryId];
  }
  return question?.knowledgeCategoryName || '未分类';
}

function createRandomBlock(): PaperStructureItem {
  return {
    count: 10,
    filter: {
      difficulty: undefined,
      difficultyMax: filters.difficulty ? Number(filters.difficulty) : 5,
      difficultyMin: filters.difficulty ? Number(filters.difficulty) : 1,
      knowledgeCategoryIds: filters.knowledgeCategoryId ? [filters.knowledgeCategoryId] : [],
      types: filters.questionType ? [filters.questionType] : [],
    },
    generateTiming: 'on_publish',
    scorePerItem: 2,
    type: 'random',
  };
}

async function fetchAttachments(ossIds: string[]) {
  const missing = ossIds.filter(id => !attachmentUrlMap[id]);
  if (!missing.length) return;
  try {
    const res = await ossInfo(missing.join(','));
    res.forEach(item => {
      attachmentUrlMap[item.ossId] = {
        url: item.url,
        type: String(item.url).match(/\.(mp4|webm|ogg|mov)$/i) ? 'video' : 'image'
      };
    });
  } catch (e) {
    console.error('Failed to fetch attachment info', e);
  }
}

function addFixedQuestion(question: Question) {
  if (isQuestionInPaper(question.questionId)) {
    message.warning('该试题已存在于试卷中');
    return;
  }
  fixedQuestionMap[question.questionId] = question;
  structureList.value.push({
    questionId: question.questionId,
    score: 5,
    type: 'fixed',
  });
  if (question.attachments?.length) {
    fetchAttachments(question.attachments.map(String));
  }
}

function addRandomBlock() {
  structureList.value.push(createRandomBlock());
}

function removeFixedQuestion(questionId?: number) {
  if (!questionId) return;
  const index = structureList.value.findIndex(s => s.type === 'fixed' && s.questionId === questionId);
  if (index !== -1) {
    structureList.value.splice(index, 1);
  }
}

function removeStructure(index: number) {
  structureList.value.splice(index, 1);
}

function onStructureAdd(event: any) {
  const newIndex = event.newIndex;
  const item = structureList.value[newIndex];
  if (item && item.type === 'fixed') {
    const duplicates = structureList.value.filter(s => s.type === 'fixed' && s.questionId === item.questionId);
    if (duplicates.length > 1) {
      message.warning('该试题已存在于试卷中');
      structureList.value.splice(newIndex, 1);
    } else {
      const q = fixedQuestionMap[Number(item.questionId)];
      if (q && q.attachments?.length) {
        fetchAttachments(q.attachments.map(String));
      }
    }
  }
}

function formatDifficultyTooltip(value?: number) {
  return `${Number(value || 1)} 星`;
}

function getRandomDifficultyRange(item: PaperStructureItem): [number, number] {
  return normalizeDifficultyRange(
    item.filter?.difficultyMin ?? item.filter?.difficulty ?? 1,
    item.filter?.difficultyMax ?? item.filter?.difficulty ?? 5,
  );
}

function updateRandomDifficultyRange(
  item: PaperStructureItem,
  value: [number, number] | number,
) {
  if (!item.filter) {
    item.filter = {};
  }
  const nextValue = Array.isArray(value) ? value : [value, value];
  const [difficultyMin, difficultyMax] = normalizeDifficultyRange(
    nextValue[0],
    nextValue[1],
  );
  item.filter.difficulty = undefined;
  item.filter.difficultyMin = difficultyMin;
  item.filter.difficultyMax = difficultyMax;
}

function getRandomDifficultyText(item: PaperStructureItem) {
  const [min, max] = getRandomDifficultyRange(item);
  return min === max ? `${min} 星` : `${min}-${max} 星`;
}

function buildCategoryTreeWithPath(
  nodes: KnowledgeCategoryTree[],
  parentPath = '',
  pathMap: Record<number, string> = {},
): KnowledgeCategoryTree[] {
  return nodes.map((node) => {
    const currentLabel = node.label || '';
    const path = parentPath ? `${parentPath}/${currentLabel}` : currentLabel;
    pathMap[Number(node.id)] = path;
    return {
      ...node,
      label: currentLabel,
      fullPath: path,
      children: node.children?.length
        ? buildCategoryTreeWithPath(node.children, path, pathMap)
        : undefined,
    };
  });
}

function getStructureOrder(index: number) {
  return (
    structureList.value.slice(0, index + 1).reduce((sum, item) => {
      return sum + (item.type === 'fixed' ? 1 : Number(item.count || 0));
    }, 0) || 1
  );
}

async function loadCategories() {
  const rows = await knowledgeCategoryTree();
  const pathMap: Record<number, string> = {};
  categoryTreeData.value = buildCategoryTreeWithPath(rows, '', pathMap);
  categoryPathMap.value = pathMap;
}

async function loadQuestions() {
  questionLoading.value = true;
  try {
    const response = await questionList({
      content: filters.content,
      difficulty: filters.difficulty,
      knowledgeCategoryId: filters.knowledgeCategoryId,
      pageNum: 1,
      pageSize: 200,
      questionType: filters.questionType,
    });
    questionRows.value = response.rows || [];
  } finally {
    questionLoading.value = false;
  }
}

async function setupFixedQuestionMap(items: PaperStructureItem[]) {
  const ids = [...new Set(
    items
      .filter((item) => item.type === 'fixed' && item.questionId)
      .map((item) => Number(item.questionId)),
  )];

  const allAttachmentIds = new Set<string>();
  await Promise.all(
    ids.map(async (questionId) => {
      try {
        const q = await questionInfo(questionId);
        fixedQuestionMap[questionId] = q;
        if (q.attachments?.length) {
          q.attachments.forEach(id => allAttachmentIds.add(String(id)));
        }
      } catch {
        delete fixedQuestionMap[questionId];
      }
    }),
  );
  if (allAttachmentIds.size > 0) {
    await fetchAttachments([...allAttachmentIds]);
  }
}

async function loadPaperDetail() {
  if (!route.params.paperId) {
    return;
  }

  loading.value = true;
  try {
    const record = await paperInfo(route.params.paperId as string);
    paperForm.paperId = record.paperId;
    paperForm.passScore = Number(record.passScore || 60);
    paperForm.remark = record.remark || '';
    paperForm.status = String(record.status || '0');
    paperForm.title = record.title || '';
    structureList.value = Array.isArray(record.paperStructure)
      ? record.paperStructure.map(normalizeStructureItem)
      : [];
    await setupFixedQuestionMap(structureList.value);
  } finally {
    loading.value = false;
  }
}

async function savePaper() {
  if (!paperForm.title.trim()) {
    message.warning('请输入试卷名称');
    return;
  }

  if (structureList.value.length === 0) {
    message.warning('请先添加题目或随机规则');
    return;
  }
  saving.value = true;
  try {
    const payload: Partial<ExamPaper> = {
      paperId: paperForm.paperId,
      paperStructure: structureList.value,
      passScore: Number(paperForm.passScore || 0),
      remark: paperForm.remark,
      status: paperForm.status,
      title: paperForm.title.trim(),
      totalScore: totalScore.value,
    };
    await (paperForm.paperId ? paperUpdate(payload) : paperAdd(payload));
    lastSavedText.value = '刚刚';
    message.success('试卷保存成功');
    //关闭这个标签页
    closeCurrentTab();
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadCategories(), loadQuestions(), loadPaperDetail()]);
});
</script>

<template>
  <Page class="paper-editor-page h-full !p-0" autoContentHeight>
    <div class="paper-editor-shell flex h-full flex-col overflow-hidden rounded-md">
      <header class="paper-topbar">
        <div class="flex min-w-0 items-center gap-4">
          <span class="i-mdi:file-document-edit-outline text-2xl text-primary"></span>
          <h1 class="truncate text-lg font-semibold tracking-tight">
            {{ pageTitle }}
          </h1>
        </div>

        <div class="flex items-center gap-4">
          <div class="score-badge rounded-md">
            <span class="text-sm">当前总分：</span>
            <span class="text-lg font-bold text-primary">{{ totalScore }} 分</span>
          </div>
          <Button type="primary" size="large" :loading="saving" @click="savePaper">
            {{ saving ? '保存中' : '发布试卷' }}
          </Button>
        </div>
      </header>

      <main class="flex min-h-0 flex-1 overflow-hidden">
        <aside class="resource-panel">
          <div class="resource-filter">
            <div class="filter-grid">
              <div class="field-block">
                <TreeSelect v-model:value="filters.knowledgeCategoryId" allow-clear
                  :field-names="{ children: 'children', label: 'label', value: 'id' }" placeholder="全部分类"
                  :tree-data="categoryTreeData" tree-default-expand-all tree-node-filter-prop="label"
                  tree-node-label-prop="fullPath" />
              </div>

              <div class="field-block">
                <Select v-model:value="filters.difficulty" allow-clear :options="QUESTION_DIFFICULTY_OPTIONS"
                  placeholder="全部难度" />
              </div>

              <div class="field-block">
                <Select v-model:value="filters.questionType" allow-clear :options="questionTypeOptions"
                  placeholder="全部题型" />
              </div>

              <div class="field-block">
                <Input v-model:value="filters.content" allow-clear placeholder="搜索题目内容..." />
              </div>
            </div>

            <div class="filter-actions">
              <Button type="primary" @click="loadQuestions">查询</Button>
              <Button @click="addRandomBlock">添加随机规则</Button>
            </div>
          </div>

          <div class="resource-list">
            <div v-if="questionLoading" class="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              题库加载中...
            </div>

            <VueDraggable v-else-if="questionRows.length" v-model="questionRows" class="space-y-3" :animation="180"
              :fallback-on-body="true" ghost-class="paper-sort-ghost"
              :group="{ name: 'paper-editor-questions', pull: 'clone', put: false }" handle=".question-handle"
              :sort="false" tag="div" filter=".disabled-drag">
              <Card v-for="question in questionRows" :key="question.questionId"
                class="question-card transition-opacity duration-200" size="small"
                :class="{ 'opacity-50 bg-muted/30 disabled-drag': isQuestionInPaper(question.questionId) }">
                <div class="flex items-start gap-3">
                  <Tooltip title="按住手柄拖入右侧试卷">
                    <span class="question-handle" v-if="!isQuestionInPaper(question.questionId)">
                      <HolderOutlined />
                    </span>
                    <span class="question-handle opacity-30 cursor-not-allowed" v-else>
                      <HolderOutlined />
                    </span>
                  </Tooltip>

                  <div class="min-w-0 flex-1 space-y-2">
                    <div class="flex items-center gap-2">
                      <Tag :color="getQuestionTypeColor(question.questionType)">
                        {{ getQuestionTypeLabel(question.questionType) }}
                      </Tag>
                      <span class="text-xs text-muted-foreground">
                        {{ getQuestionCategoryName(question) }}
                      </span>
                    </div>

                    <p class="line-clamp-2 text-sm font-medium leading-6 text-foreground">
                      {{ stripHtml(question.content) }}
                    </p>

                    <div class="flex items-center justify-between gap-3">
                      <div class="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <Rate :count="5" disabled :value="getQuestionDifficulty(question)" />
                      </div>
                      <Button v-if="!isQuestionInPaper(question.questionId)" type="link" size="small"
                        @click="addFixedQuestion(question)">
                        加入试卷
                      </Button>
                      <Button v-else type="link" danger size="small" class="mr-2"
                        @click="removeFixedQuestion(question.questionId)">
                        撤回
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </VueDraggable>

            <Empty v-else description="暂无匹配题目" />
          </div>
        </aside>

        <section class="canvas-panel">
          <div class="canvas-wrap">
            <div class="exam-config-card">
              <div class="grid grid-cols-3 gap-6">
                <div class="field-block">
                  <label class="field-label">试卷名称</label>
                  <Input v-model:value="paperForm.title" placeholder="请输入试卷名称" size="large" />
                </div>

                <div class="field-block">
                  <label class="field-label">及格分</label>
                  <InputNumber prefix v-model:value="paperForm.passScore" class="w-full" :min="0" size="large"
                    placeholder="请输入及格分" style="overflow: hidden;" />
                </div>

                <div class="field-block">
                  <label class="field-label">考试时长</label>
                  <InputNumber prefix v-model:value="durationHint" class="w-full" :min="0" size="large"
                    placeholder="请输入考试时长" style="overflow: hidden;" />
                </div>
              </div>
            </div>

            <VueDraggable v-model="structureList" class="paper-canvas" :class="{ 'opacity-70': loading }"
              :animation="180" drag-class="paper-sort-drag" :fallback-on-body="true" ghost-class="paper-sort-ghost"
              :group="{ name: 'paper-editor-questions', pull: true, put: true }" handle=".canvas-handle"
              chosen-class="paper-sort-chosen" tag="div" @add="onStructureAdd">
              <template v-if="structureList.length">
                <Card v-for="(item, index) in structureList"
                  :key="`${item.type}-${item.questionId || 'random'}-${index}`" class="canvas-card"
                  :class="{ 'canvas-random-card': item.type === 'random' }" size="small">
                  <div class="flex items-start gap-4">
                    <Tooltip title="按住手柄拖动排序">
                      <span class="canvas-handle">
                        <HolderOutlined />
                      </span>
                    </Tooltip>

                    <div class="min-w-0 flex-1">
                      <template v-if="item.type === 'fixed'">
                        <template v-if="getFixedQuestion(item)">
                          <div class="mb-4 flex items-start justify-between gap-4">
                            <div class="flex min-w-0 items-center gap-3">
                              <span class="q-badge">Q{{ getStructureOrder(index) }}</span>
                              <Tag :color="getQuestionTypeColor(getFixedQuestion(item)?.questionType)">
                                {{ getQuestionTypeLabel(getFixedQuestion(item)?.questionType) }}
                              </Tag>
                              <span class="text-xs text-muted-foreground">{{
                                getQuestionCategoryName(getFixedQuestion(item)) }}</span>
                            </div>

                            <Button danger size="small" type="text" @click="removeStructure(index)">
                              删除
                            </Button>
                          </div>

                          <div class="text-sm leading-7 text-foreground">
                            {{ stripHtml(getFixedQuestion(item)?.content || '') }}
                          </div>

                          <QuestionAttachments v-if="getFixedQuestion(item)?.attachments?.length"
                            :attachments="getFixedQuestion(item)?.attachments || []" class="mt-4" />
                          <div class="question-footer">
                            <div class="flex items-center gap-4 text-xs text-muted-foreground">
                              <span class="flex items-center gap-2">
                                <span>难度：</span>
                                <Rate :count="5" disabled :value="getQuestionDifficulty(getFixedQuestion(item))" />
                              </span>
                            </div>

                            <div class="flex items-center gap-2">
                              <InputNumber prefix="本题分值：" v-model:value="item.score" class="w-60" :min="0" />
                            </div>
                          </div>
                        </template>

                        <Empty v-else description="题目数据加载失败" />
                      </template>

                      <template v-else>
                        <div class="mb-4 flex items-start justify-between gap-4">
                          <div class="flex items-center gap-2">
                            <span class="i-mdi:shuffle-variant text-lg text-primary"></span>
                            <h3 class="text-sm font-bold text-foreground">随机抽题规则设定</h3>
                          </div>

                          <Button danger size="small" type="text" @click="removeStructure(index)">
                            移除规则
                          </Button>
                        </div>

                        <div class="space-y-4">
                          <div class="grid grid-cols-3 gap-6">
                            <div class="field-block">
                              <label class="field-label">抽取题型</label>
                              <Select v-model:value="item.filter!.types" mode="multiple" allow-clear
                                :options="questionTypeOptions" placeholder="请选择" />
                            </div>

                            <div class="field-block">
                              <label class="field-label">知识分类</label>
                              <TreeSelect v-model:value="item.filter!.knowledgeCategoryIds" multiple allow-clear
                                treeCheckable :field-names="{ children: 'children', label: 'label', value: 'id' }"
                                placeholder="请选择知识分类" :tree-data="categoryTreeData" tree-default-expand-all
                                tree-node-filter-prop="label" tree-node-label-prop="fullPath" />
                            </div>

                            <div class="field-block">
                              <label class="field-label">难度等级 {{ getRandomDifficultyText(item) }}</label>
                              <Slider range :max="5" :min="1" :step="1"
                                :tooltip="{ formatter: formatDifficultyTooltip }"
                                :value="getRandomDifficultyRange(item)" @change="
                                  (value) =>
                                    updateRandomDifficultyRange(
                                      item,
                                      Array.isArray(value)
                                        ? [Number(value[0] || 1), Number(value[1] || 1)]
                                        : Number(value || 1),
                                    )
                                " />
                            </div>
                          </div>

                          <div class="grid grid-cols-3 items-end gap-6">
                            <div class="field-block">
                              <label class="field-label">抽取数量</label>
                              <InputNumber prefix v-model:value="item.count" class="w-full" :min="1"
                                style="overflow: hidden;" />
                            </div>

                            <div class="field-block">
                              <label class="field-label">单题分值</label>
                              <InputNumber prefix v-model:value="item.scorePerItem" class="w-full" :min="0"
                                style="overflow: hidden;" />
                            </div>

                            <div class="field-block">
                              <label class="field-label">抽取时机</label>
                              <Radio.Group v-model:value="item.generateTiming" button-style="solid"
                                class="w-full timing-group" option-type="button" :options="randomTimingOptions" />
                            </div>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>
                </Card>
              </template>

              <div v-else class="empty-canvas">
                <div class="flex flex-col items-center gap-2 text-muted-foreground">
                  <span class="i-mdi:plus-circle-outline text-5xl"></span>
                  <span class="text-sm font-medium text-muted-foreground">
                    拖拽左侧题目或点击“添加随机规则”到此处
                  </span>
                </div>
              </div>
            </VueDraggable>
          </div>
        </section>
      </main>
    </div>
  </Page>
</template>

<style scoped>
.paper-editor-page :deep(.ant-input),
.paper-editor-page :deep(.ant-input-number),
.paper-editor-page :deep(.ant-select),
.paper-editor-page :deep(.ant-tree-select) {
  width: 100%;
}

.paper-editor-page :deep(.ant-input),
.paper-editor-page :deep(.ant-input-number),
.paper-editor-page :deep(.ant-input-affix-wrapper),
.paper-editor-page :deep(.ant-input-number-affix-wrapper),
.paper-editor-page :deep(.ant-select-selector),
.paper-editor-page :deep(.ant-tree-select-selector) {
  border-color: hsl(var(--border));
  border-radius: var(--radius) !important;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
}

.paper-editor-page :deep(.ant-select-single:not(.ant-select-customize-input) .ant-select-selector),
.paper-editor-page :deep(.ant-select-multiple .ant-select-selector),
.paper-editor-page :deep(.ant-tree-select .ant-select-selector),
.paper-editor-page :deep(.ant-input-number),
.paper-editor-page :deep(.ant-input-number-group-addon),
.paper-editor-page :deep(.ant-input-group-addon) {
  border-radius: var(--radius) !important;
}

.paper-editor-page :deep(.ant-select-selector),
.paper-editor-page :deep(.ant-tree-select-selector),
.paper-editor-page :deep(.ant-input-number) {
  overflow: hidden;
}

.paper-editor-page :deep(.ant-card) {
  background: hsl(var(--card));
  color: hsl(var(--card-foreground));
  border-width: 0;
}

.paper-editor-page :deep(.ant-rate) {
  font-size: 12px;
}

.paper-editor-page :deep(.ant-collapse) {
  background: hsl(var(--muted) / 0.5);
  border-radius: 10px;
}

.paper-editor-page :deep(.ant-collapse > .ant-collapse-item) {
  border-bottom: 0;
}

.paper-editor-page :deep(.ant-collapse-header) {
  padding: 10px 12px !important;
  color: hsl(var(--muted-foreground)) !important;
  font-size: 13px;
}

.paper-editor-page :deep(.ant-collapse-content-box) {
  padding: 0 12px 12px !important;
}

.paper-editor-page :deep(.timing-group .ant-radio-button-wrapper) {
  flex: 1;
  text-align: center;
}

.paper-editor-page :deep(.ant-radio-button-wrapper) {
  border-color: hsl(var(--border));
  background: hsl(var(--background));
  color: hsl(var(--muted-foreground));
}

.paper-editor-page :deep(.ant-radio-button-wrapper-checked:not(.ant-radio-button-wrapper-disabled)) {
  border-color: hsl(var(--primary));
  background: hsl(var(--primary));
  color: white;
}

.paper-editor-page :deep(.ant-slider-rail) {
  background: hsl(var(--muted));
}

.paper-editor-page :deep(.ant-slider-track) {
  background: hsl(var(--primary));
}

.paper-editor-page :deep(.ant-slider-handle::after) {
  box-shadow: 0 0 0 2px hsl(var(--primary));
}

.paper-editor-shell {
  background: hsl(var(--background-deep));
  color: hsl(var(--foreground));
}

.paper-topbar {
  display: flex;
  height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 24px;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  border-bottom: 1px solid hsl(var(--border));
}

.score-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: var(--radius);
  background: #88888820;
  padding: 6px 16px;
}

.resource-panel {
  display: flex;
  width: 30%;
  min-width: 340px;
  flex-direction: column;
  border-right: 1px solid hsl(var(--border));
  background: hsl(var(--background));
}

.resource-filter {
  box-shadow: 0 0px 20px 0px #88888820;
  padding: 10px 20px;
  z-index: 99;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.filter-actions {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}

.config-label {
  font-size: 14px;
  font-weight: 500;
  color: hsl(var(--foreground));
}

.resource-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.question-card {
  box-shadow: 0 0px 6px 0px #88888820;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.question-card:hover {
  box-shadow: 0 2px 20px 0px #88888820;
}

.question-handle,
.canvas-handle {
  cursor: grab;
  user-select: none;
  color: hsl(var(--muted-foreground));
}

.question-handle:active,
.canvas-handle:active {
  cursor: grabbing;
}

.question-handle {
  margin-top: 4px;
  font-size: 20px;
}

.canvas-panel {
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.canvas-wrap {
  margin: 0 auto;
  display: flex;
  height: 100%;
  max-width: 1000px;
  flex-direction: column;
}

.exam-config-card {
  box-shadow: 0 2px 20px 0px #88888820;
  background: hsl(var(--background));
  padding: 10px 24px;
  z-index: 99;
}

.paper-canvas {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.canvas-card {
  position: relative;
  margin-bottom: 16px;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.canvas-card:hover {
  box-shadow: 0 0px 20px 0px #88888820;
}

.canvas-random-card {
  border-color: hsl(var(--primary) / 0.24);
}

.q-badge {
  border-radius: 6px;
  background: hsl(var(--primary) / 0.1);
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 700;
  color: hsl(var(--primary));
}

.question-footer {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px solid hsl(var(--border));
  padding-top: 16px;
}

.random-flag {
  position: absolute;
  right: 0;
  top: 0;
  border-bottom-left-radius: 8px;
  background: hsl(var(--primary) / 0.1);
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 700;
  color: hsl(var(--primary));
}

.empty-canvas {
  display: flex;
  min-height: 520px;
  align-items: center;
  justify-content: center;
}

.paper-editor-page :deep(.paper-sort-ghost) {
  opacity: 0.45;
  background: hsl(var(--primary) / 0.05) !important;
  border: 1px dashed hsl(var(--primary) / 0.4) !important;
}

.paper-editor-page :deep(.paper-sort-chosen) {
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.18);
}

.paper-editor-page :deep(.paper-sort-drag) {
  transform: rotate(1deg);
  box-shadow: 0 18px 40px hsl(var(--foreground) / 0.14);
}
</style>
:where(.css-dev-only-do-not-override-gbq6yx).ant-input-number .ant-input-number-input
:where(.css-dev-only-do-not-override-gbq6yx).ant-input-number-affix-wrapper
