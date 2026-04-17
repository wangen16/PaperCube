SET NAMES utf8mb4;

-- ----------------------------
-- 校园模块表结构
-- ----------------------------
drop table if exists student;
drop table if exists class_room;
drop table if exists teacher;

create table teacher (
  teacher_id        bigint(20)      not null auto_increment    comment '老师id',
  user_id           bigint(20)      not null                   comment '关联用户id',
  teacher_no        varchar(30)     not null                   comment '教师编号',
  teacher_name      varchar(30)     not null                   comment '老师姓名',
  status            char(1)         default '0'                comment '状态（0在职 1离职）',
  del_flag          char(1)         default '0'                comment '删除标志（0代表存在 2代表删除）',
  create_by         varchar(64)     default ''                 comment '创建者',
  create_time       datetime                                   comment '创建时间',
  update_by         varchar(64)     default ''                 comment '更新者',
  update_time       datetime                                   comment '更新时间',
  primary key (teacher_id),
  unique key uk_teacher_user_id (user_id),
  unique key uk_teacher_teacher_no (teacher_no),
  constraint fk_teacher_user foreign key (user_id) references sys_user (user_id)
) engine=innodb auto_increment=200 comment = '老师表';

create table class_room (
  class_id          bigint(20)      not null auto_increment    comment '班级id',
  class_no          varchar(30)     not null                   comment '班级编号',
  class_name        varchar(30)     not null                   comment '班级名称',
  grade_name        varchar(30)     default ''                 comment '年级名称',
  teacher_id        bigint(20)      not null                   comment '班主任老师id',
  status            char(1)         default '0'                comment '班级状态（0正常 1停用）',
  del_flag          char(1)         default '0'                comment '删除标志（0代表存在 2代表删除）',
  create_by         varchar(64)     default ''                 comment '创建者',
  create_time       datetime                                   comment '创建时间',
  update_by         varchar(64)     default ''                 comment '更新者',
  update_time       datetime                                   comment '更新时间',
  primary key (class_id),
  unique key uk_class_room_class_no (class_no),
  constraint fk_class_room_teacher foreign key (teacher_id) references teacher (teacher_id)
) engine=innodb auto_increment=300 comment = '班级表';

create table student (
  student_id        bigint(20)      not null auto_increment    comment '学生id',
  user_id           bigint(20)      not null                   comment '关联用户id',
  student_no        varchar(30)     not null                   comment '学号',
  student_name      varchar(30)     not null                   comment '学生姓名',
  birthday          date                                       comment '出生日期',
  class_id          bigint(20)      default null               comment '所属班级id',
  status            char(1)         default '0'                comment '状态（0在读 1离校）',
  del_flag          char(1)         default '0'                comment '删除标志（0代表存在 2代表删除）',
  create_by         varchar(64)     default ''                 comment '创建者',
  create_time       datetime                                   comment '创建时间',
  update_by         varchar(64)     default ''                 comment '更新者',
  update_time       datetime                                   comment '更新时间',
  primary key (student_id),
  unique key uk_student_user_id (user_id),
  unique key uk_student_student_no (student_no),
  constraint fk_student_user foreign key (user_id) references sys_user (user_id),
  constraint fk_student_class foreign key (class_id) references class_room (class_id)
) engine=innodb auto_increment=400 comment = '学生表';

-- ----------------------------
-- 校园身份角色
-- ----------------------------
insert into sys_role values('200', '老师角色', 'school_teacher', 101, 1, 1, 1, '0', '0', 'admin', sysdate(), '', null, '校园老师身份角色');
insert into sys_role values('201', '学生角色', 'school_student', 102, 1, 1, 1, '0', '0', 'admin', sysdate(), '', null, '校园学生身份角色');

-- ----------------------------
-- 校园字典
-- ----------------------------
insert into sys_dict_type values(200, '教师状态', 'school_teacher_status', '0', 'admin', sysdate(), '', null, '教师状态列表');
insert into sys_dict_type values(201, '班级状态', 'school_class_status', '0', 'admin', sysdate(), '', null, '班级状态列表');
insert into sys_dict_type values(202, '学生状态', 'school_student_status', '0', 'admin', sysdate(), '', null, '学生状态列表');

insert into sys_dict_data values(200, 1, '在职', '0', 'school_teacher_status', '', 'primary', 'Y', '0', 'admin', sysdate(), '', null, '教师在职');
insert into sys_dict_data values(201, 2, '离职', '1', 'school_teacher_status', '', 'danger', 'N', '0', 'admin', sysdate(), '', null, '教师离职');
insert into sys_dict_data values(202, 1, '正常', '0', 'school_class_status', '', 'primary', 'Y', '0', 'admin', sysdate(), '', null, '班级正常');
insert into sys_dict_data values(203, 2, '停用', '1', 'school_class_status', '', 'danger', 'N', '0', 'admin', sysdate(), '', null, '班级停用');
insert into sys_dict_data values(204, 1, '在读', '0', 'school_student_status', '', 'primary', 'Y', '0', 'admin', sysdate(), '', null, '学生在读');
insert into sys_dict_data values(205, 2, '离校', '1', 'school_student_status', '', 'danger', 'N', '0', 'admin', sysdate(), '', null, '学生离校');

-- ----------------------------
-- 校园管理菜单
-- ----------------------------
insert into sys_menu values('2000', '校园管理', '0', '5', 'school', null, '', '', 1, 0, 'M', '0', '0', '', 'system', 'admin', sysdate(), '', null, '校园管理目录');
insert into sys_menu values('2001', '教师管理', '2000', '1', 'teacher', 'school/teacher/index', '', '', 1, 0, 'C', '0', '0', 'school:teacher:list', 'peoples', 'admin', sysdate(), '', null, '教师管理菜单');
insert into sys_menu values('2002', '班级管理', '2000', '2', 'class-room', 'school/class-room/index', '', '', 1, 0, 'C', '0', '0', 'school:classRoom:list', 'tree', 'admin', sysdate(), '', null, '班级管理菜单');
insert into sys_menu values('2003', '学生管理', '2000', '3', 'student', 'school/student/index', '', '', 1, 0, 'C', '0', '0', 'school:student:list', 'user', 'admin', sysdate(), '', null, '学生管理菜单');

insert into sys_menu values('2100', '教师查询', '2001', '1', '', '', '', '', 1, 0, 'F', '0', '0', 'school:teacher:query', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('2101', '教师新增', '2001', '2', '', '', '', '', 1, 0, 'F', '0', '0', 'school:teacher:add', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('2102', '教师修改', '2001', '3', '', '', '', '', 1, 0, 'F', '0', '0', 'school:teacher:edit', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('2103', '教师删除', '2001', '4', '', '', '', '', 1, 0, 'F', '0', '0', 'school:teacher:remove', '#', 'admin', sysdate(), '', null, '');

insert into sys_menu values('2200', '班级查询', '2002', '1', '', '', '', '', 1, 0, 'F', '0', '0', 'school:classRoom:query', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('2201', '班级新增', '2002', '2', '', '', '', '', 1, 0, 'F', '0', '0', 'school:classRoom:add', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('2202', '班级修改', '2002', '3', '', '', '', '', 1, 0, 'F', '0', '0', 'school:classRoom:edit', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('2203', '班级删除', '2002', '4', '', '', '', '', 1, 0, 'F', '0', '0', 'school:classRoom:remove', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('2204', '班级分配', '2002', '5', '', '', '', '', 1, 0, 'F', '0', '0', 'school:classRoom:assign', '#', 'admin', sysdate(), '', null, '');

insert into sys_menu values('2300', '学生查询', '2003', '1', '', '', '', '', 1, 0, 'F', '0', '0', 'school:student:query', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('2301', '学生新增', '2003', '2', '', '', '', '', 1, 0, 'F', '0', '0', 'school:student:add', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('2302', '学生修改', '2003', '3', '', '', '', '', 1, 0, 'F', '0', '0', 'school:student:edit', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('2303', '学生删除', '2003', '4', '', '', '', '', 1, 0, 'F', '0', '0', 'school:student:remove', '#', 'admin', sysdate(), '', null, '');
