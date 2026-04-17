<script setup lang="ts">
import type { RuleObject } from 'ant-design-vue/es/form';
import type { UploadFile } from 'ant-design-vue/es/upload/interface';

import type { KnowledgeCategoryTree } from '#/api/exam/knowledge-category/model';

import { computed, ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import { DictEnum } from '@vben/constants';
import { $t } from '@vben/locales';
import { cloneDeep } from '@vben/utils';

import { FileUpload } from '#/components/upload';
import { Form, FormItem, Image, Input, message, RadioGroup, Rate, Select, TreeSelect } from 'ant-design-vue';
import { knowledgeCategoryTree } from '#/api/exam/knowledge-category';
import { questionAdd, questionInfo, questionUpdate } from '#/api/exam/question';
import { Tinymce } from '#/components/tinymce';
import { getDictOptions } from '#/utils/dict';
import {
  AUTO_GRADING_OPTIONS,
  QUESTION_DIFFICULTY_OPTIONS,
} from '../_components/constants';
import QuestionTypeEditorRenderer from '../question-types/question-type-editor-renderer.vue';
import { createQuestionFormDefaults, normalizeQuestionForm } from '../question-types/helpers';
import type { QuestionFormModel } from '../question-types/model';
import {
  getQuestionTypeModuleOrThrow,
  getQuestionTypeOptions,
} from '../question-types/registry';

const Textarea = Input.TextArea;

const emit = defineEmits<{ reload: [] }>();

type AntdFormRules<T> = Partial<Record<keyof T, RuleObject[]>> & {
  [key: string]: RuleObject[];
};

const defaultValues = (): QuestionFormModel => createQuestionFormDefaults();

const formData = ref<QuestionFormModel>(defaultValues());
const categoryTreeData = ref<KnowledgeCategoryTree[]>([]);
const normalStatusOptions = computed(() =>
  getDictOptions(DictEnum.SYS_NORMAL_DISABLE),
);
const questionTypeOptions = computed(() => getQuestionTypeOptions());

const formRules = ref<AntdFormRules<QuestionFormModel>>({
  content: [{ required: true, message: '题干不能为空' }],
  knowledgeCategoryId: [{ required: true, message: '请选择知识分类' }],
  questionType: [{ required: true, message: '请选择题型' }],
});

const isUpdate = ref(false);
const title = computed(() => (isUpdate.value ? $t('pages.common.edit') : $t('pages.common.add')));

const QUESTION_ATTACHMENT_ACCEPT = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.mp4',
  '.webm',
  '.ogg',
  '.mov',
  '.m4v',
].join(',');

const QUESTION_EDITOR_PLUGINS =
  'searchreplace autosave directionality code visualblocks visualchars fullscreen lists advlist wordcount help autoresize';

const QUESTION_EDITOR_TOOLBAR =
  'undo redo | blocks fontsize | bold italic underline strikethrough | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | forecolor backcolor removeformat | code fullscreen';

const QUESTION_EDITOR_OPTIONS: Record<string, any> = {
  contextmenu: '',
  menubar: false,
  paste_data_images: false,
  quickbars_insert_toolbar: '',
  quickbars_selection_toolbar: '',
  toolbar_mode: 'wrap' as const,
};

const previewImageVisible = ref(false);
const previewImageUrl = ref('');

const { resetFields, validate, validateInfos } = Form.useForm(formData, formRules);

function extractPublicFields(question: QuestionFormModel) {
  return {
    analysis: question.analysis,
    attachments: [...question.attachments],
    autoGrading: question.autoGrading,
    content: question.content,
    difficulty: question.difficulty,
    knowledgeCategoryId: question.knowledgeCategoryId,
    questionId: question.questionId,
    remark: question.remark,
    status: question.status,
    tags: [...question.tags],
  };
}

function handleQuestionTypeChange(questionType: string) {
  const nextType = String(questionType || '1');
  if (nextType === formData.value.questionType) {
    return;
  }
  const publicFields = extractPublicFields(formData.value);
  const module = getQuestionTypeModuleOrThrow(nextType);
  formData.value = module.normalizeQuestion({
    ...module.buildDefaultQuestion(),
    ...publicFields,
    questionType: nextType,
  });
}

function isImageAsset(value: string) {
  return /\.(bmp|gif|jpe?g|png|svg|webp)(\?.*)?$/i.test(String(value || ''));
}

function attachmentThumbUrl(cb: { response: any; type: 'info' | 'upload' }) {
  const response = cb.response || {};
  const name = String(response.originalName || response.fileName || response.url || '');
  return isImageAsset(name) ? response.url : undefined;
}

function handleAttachmentPreview(file: UploadFile) {
  const url = String(file.url || '');
  const name = String(file.name || '');
  if (url && isImageAsset(url || name)) {
    previewImageUrl.value = url;
    previewImageVisible.value = true;
    return;
  }
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function handleImagePreviewVisibleChange(value: boolean) {
  previewImageVisible.value = value;
}

const [BasicDrawer, drawerApi] = useVbenDrawer({
  class: 'w-[880px]',
  onClosed: handleClosed,
  onConfirm: handleConfirm,
  async onOpenChange(isOpen) {
    if (!isOpen) {
      return null;
    }
    drawerApi.drawerLoading(true);
    try {
      const { id, knowledgeCategoryId } = drawerApi.getData() as {
        id?: number | string;
        knowledgeCategoryId?: number | string;
      };
      isUpdate.value = !!id;

      const rawTreeData = await knowledgeCategoryTree();
      const attachFullPath = (nodes: any[], parentPath = '') => {
        nodes.forEach((node) => {
          node.fullPath = parentPath ? `${parentPath} / ${node.label}` : node.label;
          if (node.children?.length) {
            attachFullPath(node.children, node.fullPath);
          }
        });
      };
      attachFullPath(rawTreeData);
      categoryTreeData.value = rawTreeData;

      if (id) {
        const record = await questionInfo(id);
        fillForm(record);
      } else {
        formData.value = defaultValues();
        if (knowledgeCategoryId) {
          formData.value.knowledgeCategoryId = Number(knowledgeCategoryId);
        }
      }
    } finally {
      drawerApi.drawerLoading(false);
    }
  },
});

function fillForm(record: Record<string, any>) {
  const normalized = normalizeQuestionForm(record);
  const module = getQuestionTypeModuleOrThrow(normalized.questionType);
  formData.value = module.normalizeQuestion(normalized);
}

function buildPayload() {
  const module = getQuestionTypeModuleOrThrow(formData.value.questionType);
  const normalized = module.normalizeQuestion(formData.value);
  const errorMessage = module.validateQuestion(normalized);
  if (errorMessage) {
    throw new Error(errorMessage);
  }
  return normalized;
}

async function handleConfirm() {
  try {
    drawerApi.lock(true);
    await validate();
    const payload = buildPayload();
    await (isUpdate.value ? questionUpdate(payload) : questionAdd(payload));
    emit('reload');
    await handleClosed();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    drawerApi.lock(false);
  }
}

async function handleClosed() {
  drawerApi.close();
  formData.value = cloneDeep(defaultValues());
  resetFields();
}
</script>

<template>
  <BasicDrawer :title="title">
    <Form layout="vertical">
      <div class="grid grid-cols-2 gap-4">
        <FormItem label="知识分类" v-bind="validateInfos.knowledgeCategoryId">
          <TreeSelect v-model:value="formData.knowledgeCategoryId" allow-clear class="w-full"
            :field-names="{ children: 'children', label: 'label', value: 'id' }" placeholder="请选择知识分类" show-search
            :tree-data="categoryTreeData" tree-default-expand-all :tree-line="{ showLeafIcon: false }"
            tree-node-filter-prop="label" tree-node-label-prop="fullPath" />
        </FormItem>
        <FormItem label="题型" v-bind="validateInfos.questionType">
          <Select :options="questionTypeOptions" :value="formData.questionType"
            @update:value="handleQuestionTypeChange(String($event || '1'))" />
        </FormItem>
        <FormItem label="难度">
          <div class="flex items-center gap-3">
            <Rate :count="5" :value="Number(formData.difficulty || 1)"
              @change="formData.difficulty = String($event || 1)" />
            <span class="text-xs text-slate-500">
              {{QUESTION_DIFFICULTY_OPTIONS.find((item) => item.value === formData.difficulty)?.label}}
            </span>
          </div>
        </FormItem>
        <FormItem label="状态">
          <RadioGroup v-model:value="formData.status" button-style="solid" option-type="button"
            :options="normalStatusOptions" />
        </FormItem>
        <FormItem label="自动判分">
          <RadioGroup v-model:value="formData.autoGrading" button-style="solid" option-type="button"
            :options="AUTO_GRADING_OPTIONS" />
        </FormItem>
        <FormItem label="标签">
          <Select v-model:value="formData.tags" mode="tags" placeholder="输入标签后回车" />
        </FormItem>
      </div>

      <FormItem label="题干" v-bind="validateInfos.content">
        <Tinymce v-model="formData.content" :options="QUESTION_EDITOR_OPTIONS" :plugins="QUESTION_EDITOR_PLUGINS"
          :toolbar="QUESTION_EDITOR_TOOLBAR" />
      </FormItem>

      <FormItem label="附件">
        <FileUpload v-model:value="formData.attachments" accept-format="图片 / 视频" :accept="QUESTION_ATTACHMENT_ACCEPT"
          :help-message="false" :max-count="9" :custom-thumb-url="attachmentThumbUrl" list-type="picture-card" multiple
          :preview="handleAttachmentPreview" />
        <div class="mt-2 text-xs text-slate-500">
          支持上传浏览器可直接预览的图片和视频格式
        </div>
      </FormItem>

      <QuestionTypeEditorRenderer v-model="formData" />

      <FormItem label="解析">
        <Textarea v-model:value="formData.analysis" :rows="4" placeholder="请输入题目解析" />
      </FormItem>

      <FormItem label="备注">
        <Textarea v-model:value="formData.remark" :rows="3" placeholder="请输入备注" />
      </FormItem>
    </Form>
    <Image class="hidden" :preview="{
      visible: previewImageVisible,
      onVisibleChange: handleImagePreviewVisibleChange,
    }" :src="previewImageUrl" />
  </BasicDrawer>
</template>
