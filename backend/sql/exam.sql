SET NAMES utf8mb4;

-- ----------------------------
-- 考试模块表结构
-- 按现有项目旧模型风格设计：
-- 1. 使用 del_flag 软删除
-- 2. 使用 create_by/create_time/update_by/update_time
-- 3. 表名使用单数 snake_case
-- ----------------------------
drop table if exists exam_record_detail;
drop table if exists exam_record;
drop table if exists exam_paper_snapshot;
drop table if exists exam_target;
drop table if exists exam;
drop table if exists exam_paper;
drop table if exists question;
drop table if exists attachment;
drop table if exists knowledge_category;

create table knowledge_category (
  category_id        bigint(20)      not null auto_increment    comment '知识分类id',
  parent_id          bigint(20)      default 0                  comment '父分类id',
  ancestors          varchar(500)    default ''                 comment '祖级列表',
  category_code      varchar(100)    not null                   comment '分类编码',
  category_name      varchar(100)    not null                   comment '分类名称',
  order_num          int(4)          default 0                  comment '显示顺序',
  status             char(1)         default '0'                comment '状态（0正常 1停用）',
  del_flag           char(1)         default '0'                comment '删除标志（0代表存在 2代表删除）',
  create_by          varchar(64)     default ''                 comment '创建者',
  create_time        datetime                                   comment '创建时间',
  update_by          varchar(64)     default ''                 comment '更新者',
  update_time        datetime                                   comment '更新时间',
  remark             varchar(500)    default null               comment '备注',
  primary key (category_id),
  unique key uk_knowledge_category_code (category_code)
) engine=innodb auto_increment=1000 comment = '知识分类表';

create table attachment (
  attachment_id      bigint(20)      not null auto_increment    comment '附件id',
  file_name          varchar(200)    not null                   comment '文件名称',
  file_url           varchar(500)    not null                   comment '文件访问地址',
  file_type          varchar(50)     default ''                 comment '文件类型',
  bucket_name        varchar(100)    default ''                 comment '存储桶名称',
  object_name        varchar(255)    default ''                 comment '对象存储路径',
  uploader_id        bigint(20)      default null               comment '上传人id',
  del_flag           char(1)         default '0'                comment '删除标志（0代表存在 2代表删除）',
  create_by          varchar(64)     default ''                 comment '创建者',
  create_time        datetime                                   comment '创建时间',
  update_by          varchar(64)     default ''                 comment '更新者',
  update_time        datetime                                   comment '更新时间',
  remark             varchar(500)    default null               comment '备注',
  primary key (attachment_id)
) engine=innodb auto_increment=1000 comment = '附件表';

create table question (
  question_id          bigint(20)      not null auto_increment    comment '题目id',
  knowledge_category_id bigint(20)     not null                   comment '知识分类id',
  question_type        char(1)         not null                   comment '题型（1单选 2多选 3判断 4主观）',
  auto_grading         char(1)         default '1'                comment '是否自动判分（0否 1是）',
  content              longtext                                   comment '题干内容',
  options              json                                       comment '选项json',
  standard_answer      json                                       comment '标准答案json',
  partial_score_rule   json                                       comment '部分得分规则json',
  question_config      json                                       comment '题型扩展配置json',
  analysis             longtext                                   comment '题目解析',
  difficulty           char(1)         default '2'                comment '难度（1简单 2中等 3困难）',
  tags                 json                                       comment '标签json',
  attachments          json                                       comment '附件json',
  status               char(1)         default '0'                comment '状态（0正常 1停用）',
  del_flag             char(1)         default '0'                comment '删除标志（0代表存在 2代表删除）',
  create_by            varchar(64)     default ''                 comment '创建者',
  create_time          datetime                                   comment '创建时间',
  update_by            varchar(64)     default ''                 comment '更新者',
  update_time          datetime                                   comment '更新时间',
  remark               varchar(500)    default null               comment '备注',
  primary key (question_id),
  key idx_question_knowledge_category_id (knowledge_category_id),
  constraint fk_question_knowledge_category foreign key (knowledge_category_id) references knowledge_category (category_id)
) engine=innodb auto_increment=1000 comment = '题目表';

create table exam_paper (
  paper_id            bigint(20)      not null auto_increment    comment '试卷id',
  title               varchar(200)    not null                   comment '试卷标题',
  total_score         decimal(10,2)   default 0.00              comment '总分',
  pass_score          decimal(10,2)   default 0.00              comment '及格分',
  paper_structure     json                                       comment '试卷结构json',
  status              char(1)         default '0'                comment '状态（0正常 1停用）',
  del_flag            char(1)         default '0'                comment '删除标志（0代表存在 2代表删除）',
  create_by           varchar(64)     default ''                 comment '创建者',
  create_time         datetime                                   comment '创建时间',
  update_by           varchar(64)     default ''                 comment '更新者',
  update_time         datetime                                   comment '更新时间',
  remark              varchar(500)    default null               comment '备注',
  primary key (paper_id)
) engine=innodb auto_increment=1000 comment = '试卷模板表';

create table exam (
  exam_id             bigint(20)      not null auto_increment    comment '考试id',
  paper_id            bigint(20)      not null                   comment '试卷id',
  title               varchar(200)    not null                   comment '考试名称',
  time_mode           char(1)         default '1'                comment '时间模式（1固定起止 2仅限时长 3无限制）',
  start_time          datetime                                   comment '开始时间',
  end_time            datetime                                   comment '结束时间',
  duration_mins       int(11)         default 0                  comment '答题时长（分钟）',
  status              char(1)         default '0'                comment '状态（0草稿 1已发布 2已撤回 3已归档）',
  del_flag            char(1)         default '0'                comment '删除标志（0代表存在 2代表删除）',
  create_by           varchar(64)     default ''                 comment '创建者',
  create_time         datetime                                   comment '创建时间',
  update_by           varchar(64)     default ''                 comment '更新者',
  update_time         datetime                                   comment '更新时间',
  remark              varchar(500)    default null               comment '备注',
  primary key (exam_id),
  key idx_exam_paper_id (paper_id),
  constraint fk_exam_paper foreign key (paper_id) references exam_paper (paper_id)
) engine=innodb auto_increment=1000 comment = '考试表';

create table exam_target (
  target_id           bigint(20)      not null auto_increment    comment '考试目标id',
  exam_id             bigint(20)      not null                   comment '考试id',
  target_type         char(1)         not null                   comment '目标类型（1班级 2用户）',
  target_value        bigint(20)      not null                   comment '目标值',
  del_flag            char(1)         default '0'                comment '删除标志（0代表存在 2代表删除）',
  create_by           varchar(64)     default ''                 comment '创建者',
  create_time         datetime                                   comment '创建时间',
  update_by           varchar(64)     default ''                 comment '更新者',
  update_time         datetime                                   comment '更新时间',
  remark              varchar(500)    default null               comment '备注',
  primary key (target_id),
  key idx_exam_target_exam_id (exam_id),
  key idx_exam_target_type_value (target_type, target_value),
  constraint fk_exam_target_exam foreign key (exam_id) references exam (exam_id)
) engine=innodb auto_increment=1000 comment = '考试分发目标表';

create table exam_paper_snapshot (
  snapshot_id           bigint(20)      not null auto_increment    comment '试卷快照id',
  exam_id               bigint(20)      not null                   comment '考试id',
  user_id               bigint(20)      not null                   comment '用户id',
  paper_json            json                                       comment '试卷快照json',
  standard_answer_json  json                                       comment '标准答案快照json',
  del_flag              char(1)         default '0'                comment '删除标志（0代表存在 2代表删除）',
  create_by             varchar(64)     default ''                 comment '创建者',
  create_time           datetime                                   comment '创建时间',
  update_by             varchar(64)     default ''                 comment '更新者',
  update_time           datetime                                   comment '更新时间',
  remark                varchar(500)    default null               comment '备注',
  primary key (snapshot_id),
  unique key uk_exam_snapshot_exam_user (exam_id, user_id),
  key idx_exam_snapshot_user_id (user_id),
  constraint fk_exam_snapshot_exam foreign key (exam_id) references exam (exam_id),
  constraint fk_exam_snapshot_user foreign key (user_id) references sys_user (user_id)
) engine=innodb auto_increment=1000 comment = '试卷快照表';

create table exam_record (
  record_id            bigint(20)      not null auto_increment    comment '答卷记录id',
  exam_id              bigint(20)      not null                   comment '考试id',
  user_id              bigint(20)      not null                   comment '用户id',
  snapshot_id          bigint(20)      not null                   comment '试卷快照id',
  start_time           datetime                                   comment '开卷时间',
  user_answers         json                                       comment '用户答案json',
  submit_time          datetime                                   comment '交卷时间',
  status               char(1)         default '0'                comment '状态（0答题中 1已交卷 2待阅卷 3已阅卷）',
  total_score          decimal(10,2)   default 0.00              comment '总分',
  del_flag             char(1)         default '0'                comment '删除标志（0代表存在 2代表删除）',
  create_by            varchar(64)     default ''                 comment '创建者',
  create_time          datetime                                   comment '创建时间',
  update_by            varchar(64)     default ''                 comment '更新者',
  update_time          datetime                                   comment '更新时间',
  remark               varchar(500)    default null               comment '备注',
  primary key (record_id),
  unique key uk_exam_record_exam_user (exam_id, user_id),
  key idx_exam_record_snapshot_id (snapshot_id),
  constraint fk_exam_record_exam foreign key (exam_id) references exam (exam_id),
  constraint fk_exam_record_user foreign key (user_id) references sys_user (user_id),
  constraint fk_exam_record_snapshot foreign key (snapshot_id) references exam_paper_snapshot (snapshot_id)
) engine=innodb auto_increment=1000 comment = '答卷记录表';

create table exam_record_detail (
  detail_id            bigint(20)      not null auto_increment    comment '答卷明细id',
  record_id            bigint(20)      not null                   comment '答卷记录id',
  question_id          bigint(20)      not null                   comment '题目id',
  user_answer          json                                       comment '用户答案json',
  score                decimal(10,2)   default 0.00              comment '得分',
  is_correct           char(1)         default '0'                comment '是否正确（0否 1是）',
  del_flag             char(1)         default '0'                comment '删除标志（0代表存在 2代表删除）',
  create_by            varchar(64)     default ''                 comment '创建者',
  create_time          datetime                                   comment '创建时间',
  update_by            varchar(64)     default ''                 comment '更新者',
  update_time          datetime                                   comment '更新时间',
  remark               varchar(500)    default null               comment '备注',
  primary key (detail_id),
  key idx_exam_record_detail_record_id (record_id),
  key idx_exam_record_detail_question_id (question_id),
  constraint fk_exam_record_detail_record foreign key (record_id) references exam_record (record_id),
  constraint fk_exam_record_detail_question foreign key (question_id) references question (question_id)
) engine=innodb auto_increment=1000 comment = '答卷明细表';

-- ----------------------------
-- 考试模块字典
-- ----------------------------
insert into sys_dict_type values(300, '题目类型', 'exam_question_type', '0', 'admin', sysdate(), '', null, '题目类型列表');
insert into sys_dict_type values(301, '题目难度', 'exam_question_difficulty', '0', 'admin', sysdate(), '', null, '题目难度列表');
insert into sys_dict_type values(302, '考试状态', 'exam_status', '0', 'admin', sysdate(), '', null, '考试状态列表');
insert into sys_dict_type values(303, '考试时间模式', 'exam_time_mode', '0', 'admin', sysdate(), '', null, '考试时间模式列表');
insert into sys_dict_type values(304, '答卷状态', 'exam_record_status', '0', 'admin', sysdate(), '', null, '答卷状态列表');

insert into sys_dict_data values(300, 1, '单选题', '1', 'exam_question_type', '', 'primary', 'Y', '0', 'admin', sysdate(), '', null, '单选题');
insert into sys_dict_data values(301, 2, '多选题', '2', 'exam_question_type', '', 'success', 'N', '0', 'admin', sysdate(), '', null, '多选题');
insert into sys_dict_data values(302, 3, '判断题', '3', 'exam_question_type', '', 'warning', 'N', '0', 'admin', sysdate(), '', null, '判断题');
insert into sys_dict_data values(303, 4, '主观题', '4', 'exam_question_type', '', 'danger', 'N', '0', 'admin', sysdate(), '', null, '主观题');

insert into sys_dict_data values(304, 1, '简单', '1', 'exam_question_difficulty', '', 'primary', 'Y', '0', 'admin', sysdate(), '', null, '简单');
insert into sys_dict_data values(305, 2, '中等', '2', 'exam_question_difficulty', '', 'warning', 'N', '0', 'admin', sysdate(), '', null, '中等');
insert into sys_dict_data values(306, 3, '困难', '3', 'exam_question_difficulty', '', 'danger', 'N', '0', 'admin', sysdate(), '', null, '困难');

insert into sys_dict_data values(307, 1, '草稿', '0', 'exam_status', '', 'default', 'Y', '0', 'admin', sysdate(), '', null, '考试草稿');
insert into sys_dict_data values(308, 2, '已发布', '1', 'exam_status', '', 'primary', 'N', '0', 'admin', sysdate(), '', null, '考试已发布');
insert into sys_dict_data values(309, 3, '已撤回', '2', 'exam_status', '', 'warning', 'N', '0', 'admin', sysdate(), '', null, '考试已撤回');
insert into sys_dict_data values(310, 4, '已归档', '3', 'exam_status', '', 'info', 'N', '0', 'admin', sysdate(), '', null, '考试已归档');

insert into sys_dict_data values(311, 1, '固定起止', '1', 'exam_time_mode', '', 'primary', 'Y', '0', 'admin', sysdate(), '', null, '固定起止');
insert into sys_dict_data values(312, 2, '仅限时长', '2', 'exam_time_mode', '', 'warning', 'N', '0', 'admin', sysdate(), '', null, '仅限时长');
insert into sys_dict_data values(313, 3, '无限制', '3', 'exam_time_mode', '', 'success', 'N', '0', 'admin', sysdate(), '', null, '无限制');

insert into sys_dict_data values(314, 1, '答题中', '0', 'exam_record_status', '', 'warning', 'Y', '0', 'admin', sysdate(), '', null, '答题中');
insert into sys_dict_data values(315, 2, '已交卷', '1', 'exam_record_status', '', 'primary', 'N', '0', 'admin', sysdate(), '', null, '已交卷');
insert into sys_dict_data values(316, 3, '待阅卷', '2', 'exam_record_status', '', 'danger', 'N', '0', 'admin', sysdate(), '', null, '待阅卷');
insert into sys_dict_data values(317, 4, '已阅卷', '3', 'exam_record_status', '', 'success', 'N', '0', 'admin', sysdate(), '', null, '已阅卷');

-- ----------------------------
-- 考试模块菜单
-- ----------------------------
insert into sys_menu values('3000', '考试系统', '0', '6', 'exam', null, '', '', 1, 0, 'M', '0', '0', '', 'education', 'admin', sysdate(), '', null, '考试系统目录');
insert into sys_menu values('3001', '知识分类', '3000', '1', 'knowledge-category', 'exam/knowledge-category/index', '', '', 1, 0, 'C', '0', '0', 'exam:knowledgeCategory:list', 'tree', 'admin', sysdate(), '', null, '知识分类菜单');
insert into sys_menu values('3002', '题库管理', '3000', '2', 'question', 'exam/question/index', '', '', 1, 0, 'C', '0', '0', 'exam:question:list', 'question', 'admin', sysdate(), '', null, '题库管理菜单');
insert into sys_menu values('3003', '试卷管理', '3000', '3', 'paper', 'exam/paper/index', '', '', 1, 0, 'C', '0', '0', 'exam:paper:list', 'documentation', 'admin', sysdate(), '', null, '试卷管理菜单');
insert into sys_menu values('3004', '考试管理', '3000', '4', 'manage', 'exam/manage/index', '', '', 1, 0, 'C', '0', '0', 'exam:manage:list', 'calendar', 'admin', sysdate(), '', null, '考试管理菜单');
insert into sys_menu values('3005', '阅卷管理', '3000', '5', 'grading', 'exam/grading/index', '', '', 1, 0, 'C', '0', '0', 'exam:grading:list', 'edit', 'admin', sysdate(), '', null, '阅卷管理菜单');
insert into sys_menu values('3006', '成绩查询', '3000', '6', 'score', 'exam/score/index', '', '', 1, 0, 'C', '0', '0', 'exam:score:list', 'chart', 'admin', sysdate(), '', null, '成绩查询菜单');
insert into sys_menu values('3007', '我的试卷', '3000', '7', 'my-paper', 'exam/my-paper/index', '', '', 1, 0, 'C', '0', '0', 'exam:myPaper:list', 'book-open', 'admin', sysdate(), '', null, '我的试卷菜单');

insert into sys_menu values('3100', '知识分类查询', '3001', '1', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:knowledgeCategory:query', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3101', '知识分类新增', '3001', '2', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:knowledgeCategory:add', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3102', '知识分类修改', '3001', '3', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:knowledgeCategory:edit', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3103', '知识分类删除', '3001', '4', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:knowledgeCategory:remove', '#', 'admin', sysdate(), '', null, '');

insert into sys_menu values('3110', '题库查询', '3002', '1', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:question:query', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3111', '题库新增', '3002', '2', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:question:add', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3112', '题库修改', '3002', '3', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:question:edit', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3113', '题库删除', '3002', '4', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:question:remove', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3114', '题库导入', '3002', '5', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:question:import', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3115', '题库导出', '3002', '6', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:question:export', '#', 'admin', sysdate(), '', null, '');

insert into sys_menu values('3120', '试卷查询', '3003', '1', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:paper:query', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3121', '试卷新增', '3003', '2', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:paper:add', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3122', '试卷修改', '3003', '3', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:paper:edit', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3123', '试卷删除', '3003', '4', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:paper:remove', '#', 'admin', sysdate(), '', null, '');

insert into sys_menu values('3130', '考试查询', '3004', '1', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:manage:query', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3131', '考试新增', '3004', '2', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:manage:add', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3132', '考试修改', '3004', '3', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:manage:edit', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3133', '考试删除', '3004', '4', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:manage:remove', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3134', '考试发布', '3004', '5', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:manage:publish', '#', 'admin', sysdate(), '', null, '');

insert into sys_menu values('3140', '阅卷查询', '3005', '1', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:grading:query', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3141', '阅卷评分', '3005', '2', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:grading:review', '#', 'admin', sysdate(), '', null, '');

insert into sys_menu values('3150', '成绩查询', '3006', '1', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:score:query', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3151', '成绩导出', '3006', '2', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:score:export', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('3160', '我的试卷查询', '3007', '1', '', '', '', '', 1, 0, 'F', '0', '0', 'exam:myPaper:query', '#', 'admin', sysdate(), '', null, '');

-- ----------------------------
-- 考试模块角色菜单
-- ----------------------------
insert into sys_role_menu values ('200', '3000');
insert into sys_role_menu values ('200', '3001');
insert into sys_role_menu values ('200', '3002');
insert into sys_role_menu values ('200', '3003');
insert into sys_role_menu values ('200', '3004');
insert into sys_role_menu values ('200', '3005');
insert into sys_role_menu values ('200', '3006');
insert into sys_role_menu values ('200', '3100');
insert into sys_role_menu values ('200', '3101');
insert into sys_role_menu values ('200', '3102');
insert into sys_role_menu values ('200', '3103');
insert into sys_role_menu values ('200', '3110');
insert into sys_role_menu values ('200', '3111');
insert into sys_role_menu values ('200', '3112');
insert into sys_role_menu values ('200', '3113');
insert into sys_role_menu values ('200', '3114');
insert into sys_role_menu values ('200', '3115');
insert into sys_role_menu values ('200', '3120');
insert into sys_role_menu values ('200', '3121');
insert into sys_role_menu values ('200', '3122');
insert into sys_role_menu values ('200', '3123');
insert into sys_role_menu values ('200', '3130');
insert into sys_role_menu values ('200', '3131');
insert into sys_role_menu values ('200', '3132');
insert into sys_role_menu values ('200', '3133');
insert into sys_role_menu values ('200', '3134');
insert into sys_role_menu values ('200', '3140');
insert into sys_role_menu values ('200', '3141');
insert into sys_role_menu values ('200', '3150');
insert into sys_role_menu values ('200', '3151');

insert into sys_role_menu values ('201', '3000');
insert into sys_role_menu values ('201', '3007');
insert into sys_role_menu values ('201', '3160');
