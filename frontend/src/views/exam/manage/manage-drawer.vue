<script setup lang="ts">
import type { RuleObject } from 'ant-design-vue/es/form';

import type { ExamManage, ExamTarget } from '#/api/exam/manage/model';
import type { ExamPaper } from '#/api/exam/paper/model';
import type { ClassRoom } from '#/api/school/class-room/model';
import type { Student } from '#/api/school/student/model';

import { computed, ref, watch } from 'vue';

import dayjs from 'dayjs';

import { useVbenDrawer } from '@vben/common-ui';
import { $t } from '@vben/locales';
import { cloneDeep } from '@vben/utils';

import {
  Button,
  Form,
  FormItem,
  Input,
  InputNumber,
  Select,
  Space,
  message,
  DatePicker,
} from 'ant-design-vue';
const RangePicker = DatePicker.RangePicker;

import { examManageAdd, examManageInfo, examManageUpdate } from '#/api/exam/manage';
import { paperList } from '#/api/exam/paper';
import { classRoomOptions } from '#/api/school/class-room';
import { studentInfo, studentList } from '#/api/school/student';

import {
  EXAM_STATUS_OPTIONS,
  EXAM_TIME_MODE_OPTIONS,
  TARGET_TYPE_OPTIONS,
} from '../_components/constants';

const emit = defineEmits<{ reload: [] }>();

interface FormState {
  durationMins?: number;
  timeRange?: [string, string];
  examId?: number;
  paperId?: number;
  remark: string;
  status: string;
  targetClassIds: number[];
  targetStudentIds: number[];
  timeMode: string;
  title: string;
}

const defaultValues = (): FormState => ({
  durationMins: 90,
  timeRange: undefined,
  examId: undefined,
  paperId: undefined,
  remark: '',
  status: '0',
  targetClassIds: [],
  targetStudentIds: [],
  timeMode: '1',
  title: '',
});

const formData = ref<FormState>(defaultValues());

watch(
  () => formData.value.timeRange,
  (newVal) => {
    if (formData.value.timeMode === '1' && newVal && newVal.length === 2) {
      const start = dayjs(newVal[0]);
      const end = dayjs(newVal[1]);
      if (start.isValid() && end.isValid()) {
        const diffMins = end.diff(start, 'minute');
        if (diffMins > 0) {
          formData.value.durationMins = diffMins;
        }
      }
    }
  },
  { deep: true },
);

// 当时间模式切换为非起止时间时，清空已选的时间范围
watch(
  () => formData.value.timeMode,
  (newMode) => {
    if (newMode !== '1') {
      formData.value.timeRange = undefined;
    }
  },
);


const paperOptions = ref<Array<{ label: string; value: number }>>([]);
const classOptions = ref<Array<{ label: string; value: number }>>([]);
const studentOptions = ref<Array<{ label: string; value: number }>>([]);
const fetchingStudents = ref(false);
let searchTimeout: any;

type AntdFormRules<T> = Partial<Record<keyof T, RuleObject[]>> & {
  [key: string]: RuleObject[];
};

const formRules = computed<AntdFormRules<FormState>>(() => {
  const rules: AntdFormRules<FormState> = {
    paperId: [{ required: true, message: '请选择试卷' }],
    title: [{ required: true, message: '请输入考试名称' }],
  };
  if (formData.value.timeMode === '1') {
    rules.timeRange = [{ required: true, message: '请选择固定开考时间范围' }];
  }
  return rules;
});

const { resetFields, validate, validateInfos } = Form.useForm(formData, formRules);

const isUpdate = ref(false);
const title = computed(() => (isUpdate.value ? $t('pages.common.edit') : $t('pages.common.add')));

async function loadBaseOptions() {
  const [papers, classes] = await Promise.all([
    paperList({ pageNum: 1, pageSize: 200 }),
    classRoomOptions(),
  ]);
  paperOptions.value = papers.rows.map((item: ExamPaper) => ({
    label: item.title,
    value: item.paperId,
  }));
  classOptions.value = classes.map((item: ClassRoom) => ({
    label: item.className,
    value: item.classId,
  }));
  await onStudentSearch('');
}

async function onStudentSearch(value: string) {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    fetchingStudents.value = true;
    try {
      const res = await studentList({ pageNum: 1, pageSize: 50, studentName: value });
      studentOptions.value = res.rows.map((item: Student) => ({
        label: `${item.studentName} / ${item.userName}`,
        value: item.userId,
      }));
    } finally {
      fetchingStudents.value = false;
    }
  }, 300);
}

async function fetchSpecificStudents(ids: number[]) {
  const newOpts = [...studentOptions.value];
  const existingIds = new Set(newOpts.map(o => o.value));
  const missingIds = ids.filter(id => !existingIds.has(id));

  await Promise.all(missingIds.map(async (id) => {
    try {
      const student = await studentInfo(id);
      if (student) {
        newOpts.push({
          label: `${student.studentName} / ${student.userName}`,
          value: student.userId,
        });
      }
    } catch (e) { }
  }));
  studentOptions.value = newOpts;
}

const [BasicDrawer, drawerApi] = useVbenDrawer({
  class: 'w-[840px]',
  onClosed: handleClosed,
  onConfirm: handleConfirm,
  async onOpenChange(isOpen) {
    if (!isOpen) {
      return null;
    }
    drawerApi.drawerLoading(true);
    const { id } = drawerApi.getData() as { id?: number | string };
    isUpdate.value = !!id;
    await loadBaseOptions();
    if (id) {
      const record = await examManageInfo(id);

      const stIds: number[] = [];
      const clsIds: number[] = [];
      (record.targetList || []).forEach(item => {
        if (String(item.targetType) === '1') clsIds.push(Number(item.targetValue));
        else if (String(item.targetType) === '2') stIds.push(Number(item.targetValue));
      });
      if (stIds.length > 0) {
        await fetchSpecificStudents(stIds);
      }

      formData.value = {
        durationMins: Number(record.durationMins || 0),
        timeRange: record.startTime && record.endTime ? [record.startTime, record.endTime] : undefined,
        examId: record.examId,
        paperId: record.paperId,
        remark: record.remark || '',
        status: String(record.status || '0'),
        targetClassIds: clsIds,
        targetStudentIds: stIds,
        timeMode: String(record.timeMode || '1'),
        title: record.title,
      };
    }
    drawerApi.drawerLoading(false);
  },
});

async function handleConfirm() {
  try {
    drawerApi.lock(true);
    if (formData.value.timeMode === '1' && (!formData.value.timeRange || formData.value.timeRange.length !== 2)) {
      message.error('当时间模式为固定起止时间时，请选择完整的时间范围！');
      return;
    }
    await validate();
    const payload: any = cloneDeep(formData.value);

    if (payload.timeMode === '1' && payload.timeRange) {
      payload.startTime = payload.timeRange[0];
      payload.endTime = payload.timeRange[1];
    } else {
      payload.startTime = null;
      payload.endTime = null;
    }
    delete payload.timeRange;

    const newTargetList: ExamTarget[] = [];
    (payload.targetClassIds || []).forEach((id: number) => {
      newTargetList.push({ targetType: '1', targetValue: id });
    });
    (payload.targetStudentIds || []).forEach((id: number) => {
      newTargetList.push({ targetType: '2', targetValue: id });
    });
    payload.targetList = newTargetList;
    delete payload.targetClassIds;
    delete payload.targetStudentIds;

    await (isUpdate.value ? examManageUpdate(payload) : examManageAdd(payload));
    emit('reload');
    await handleClosed();
  } catch (error) {
    console.error(error);
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
      <div class="grid grid-cols-2 gap-6">
        <FormItem label="考试名称" v-bind="validateInfos.title">
          <Input v-model:value="formData.title" />
        </FormItem>
        <FormItem label="试卷" v-bind="validateInfos.paperId">
          <Select v-model:value="formData.paperId" :options="paperOptions" />
        </FormItem>

        <FormItem label="时间模式">
          <Select v-model:value="formData.timeMode" :options="EXAM_TIME_MODE_OPTIONS" />
        </FormItem>
        <FormItem label="状态">
          <Select v-model:value="formData.status" :options="EXAM_STATUS_OPTIONS" />
        </FormItem>

        <FormItem v-if="formData.timeMode === '1'" label="起止时间" v-bind="validateInfos.timeRange">
          <RangePicker v-model:value="formData.timeRange" class="w-full" :show-time="{ format: 'HH:mm' }"
            value-format="YYYY-MM-DD HH:mm:00" />
        </FormItem>
        <FormItem v-if="formData.timeMode !== '3'" label="答题时长 (分钟)">
          <InputNumber :disabled="formData.timeMode === '1'" v-model:value="formData.durationMins" class="w-full"
            :min="1" />
        </FormItem>

        <FormItem label="发布班级" class="col-span-2">
          <Select v-model:value="formData.targetClassIds" mode="multiple" :options="classOptions"
            placeholder="请选择要分发的班级（可多选）" allow-clear show-search option-filter-prop="label" />
        </FormItem>
        <FormItem label="发布学生" class="col-span-2">
          <Select v-model:value="formData.targetStudentIds" mode="multiple" :options="studentOptions"
            placeholder="输入学生姓名或账号查找与单点分发（可多选）" allow-clear show-search :filter-option="false" @search="onStudentSearch"
            :loading="fetchingStudents" />
        </FormItem>

        <FormItem label="备注" class="col-span-2">
          <Input.TextArea v-model:value="formData.remark" :rows="3" placeholder="考试说明、监考备注等" />
        </FormItem>
      </div>
    </Form>
  </BasicDrawer>
</template>
