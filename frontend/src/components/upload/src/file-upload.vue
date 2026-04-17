<!--
不再支持url 统一使用ossId
去除使用`file-type`库进行文件类型检测 在Safari无法使用
-->
<script setup lang="ts">
import type { UploadListType } from 'ant-design-vue/es/upload/interface';

import type { BaseUploadProps, UploadEmits } from './props';

import { computed } from 'vue';

import { $t, I18nT } from '@vben/locales';

import { InboxOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons-vue';
import { Upload, Button } from 'ant-design-vue';

import { uploadApi } from '#/api';

import { defaultFileAcceptExts, defaultFilePreview } from './helper';
import { useUpload } from './hook';

interface FileUploadProps extends BaseUploadProps {
  /**
   * 同antdv的listType
   * @default text
   */
  listType?: UploadListType;
}

const props = withDefaults(defineProps<FileUploadProps>(), {
  api: () => uploadApi,
  removeOnError: true,
  showSuccessMsg: true,
  removeConfirm: false,
  accept: defaultFileAcceptExts.join(','),
  data: () => undefined,
  maxCount: 1,
  maxSize: 5,
  disabled: false,
  helpMessage: true,
  preview: defaultFilePreview,
  enableDragUpload: false,
  directory: false,
  abortOnUnmounted: true,
  listType: 'text',
});

const emit = defineEmits<UploadEmits>();

/** 返回不同的上传组件 */
const CurrentUploadComponent = computed(() => {
  if (props.enableDragUpload) {
    return Upload.Dragger;
  }
  return Upload;
});

// 双向绑定 ossId
const ossIdList = defineModel<string | string[]>('value', {
  default: () => [],
});

const {
  customRequest,
  acceptStr,
  handleChange,
  handleRemove,
  beforeUpload,
  innerFileList,
} = useUpload(props, emit, ossIdList, 'file');
</script>

<!--
Upload.Dragger只会影响样式
使用普通Upload也是支持拖拽上传的
-->
<template>
  <div class="uploadFile5222">
    <CurrentUploadComponent v-model:file-list="innerFileList" :accept="accept" :list-type="listType"
      :disabled="disabled" :directory="directory" :max-count="maxCount" :progress="{ showInfo: true }"
      :multiple="multiple" :before-upload="beforeUpload" :custom-request="customRequest" @preview="preview"
      @change="handleChange" @remove="handleRemove">
      <div v-if="!enableDragUpload && innerFileList?.length < maxCount && listType === 'picture-card'">
        <div class="flex flex-col items-center justify-center gap-2">
          <PlusOutlined />
          <div class="text-xs">{{ $t('component.upload.upload') }}</div>
        </div>
      </div>
      <div v-else-if="!enableDragUpload && innerFileList?.length < maxCount">
        <Button :disabled="disabled">
          <UploadOutlined />1
          {{ $t('component.upload.upload') }}
        </Button>
      </div>
      <div v-if="enableDragUpload">
        <p class="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p class="ant-upload-text">
          {{ $t('component.upload.clickOrDrag') }}
        </p>
      </div>
    </CurrentUploadComponent>
    <slot name="helpMessage" v-bind="{ maxCount, disabled, maxSize, accept }">
      <I18nT v-if="helpMessage" scope="global" keypath="component.upload.uploadHelpMessage" tag="div"
        class="mt-2 text-[14px] leading-[1.5] text-black/45 dark:text-white/45"
        :class="{ 'upload-text__disabled': disabled }">
        <template #size>
          <span class="text-primary mx-1 font-medium" :class="{ 'upload-text__disabled': disabled }">
            {{ maxSize }}MB
          </span>
        </template>
        <template #ext>
          <span class="text-primary mx-1 font-medium" :class="{ 'upload-text__disabled': disabled }">
            {{ acceptStr }}
          </span>
        </template>
      </I18nT>
    </slot>
  </div>
</template>

<style lang="scss" scoped>
.uploadFile5222 :deep(.ant-upload-list-item-image) {
  object-fit: cover !important;
  border-radius: calc(var(--radius) * 0.5) !important;
}


// 禁用的样式和antd保持一致
.upload-text__disabled {
  color: rgb(50 54 57 / 25%);
  cursor: not-allowed;

  &:where(.dark, .dark *) {
    color: rgb(242 242 242 / 25%);
  }
}
</style>
