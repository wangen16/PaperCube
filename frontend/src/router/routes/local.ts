import type { RouteRecordStringComponent } from '@vben/types';

import { $t } from '@vben/locales';

const {
  version,
  // vite inject-metadata 插件注入的全局变量
} = __VBEN_ADMIN_METADATA__ || {};

/**
 * 该文件放非后台返回的路由 比如个人中心 等需要跳转显示的页面
 * 也可以直接在菜单管理配置
 */
const localRoutes: RouteRecordStringComponent[] = [
  {
    component: '/exam/paper/editor/index',
    meta: {
      activePath: '/exam/paper',
      hideInMenu: true,
      requireHomeRedirect: true,
      title: '试卷编辑',
    },
    name: 'ExamPaperEditor',
    path: '/exam/paper-editor/:paperId?',
  },

  {
    component: '/system/role/authUser',
    meta: {
      activePath: '/system/role',
      hideInMenu: true,
      requireHomeRedirect: true,
      title: '角色分配用户',
    },
    name: 'SystemRoleAuthUser',
    path: '/system/role-auth/user/:roleId',
  },
  {
    component: '/school/class-room/assign-student/index',
    meta: {
      activePath: '/school/class-room',
      hideInMenu: true,
      requireHomeRedirect: true,
      title: '班级分配学生',
    },
    name: 'SchoolClassRoomAssignStudent',
    path: '/school/class-room-assign/student/:classId',
  },
  {
    component: '/_core/profile/index',
    meta: {
      icon: 'mingcute:profile-line',
      title: $t('ui.widgets.profile'),
      hideInMenu: true,
      requireHomeRedirect: true,
    },
    name: 'Profile',
    path: '/profile',
  },
];

/**
 * 这里放本地路由
 */
export const localMenuList: RouteRecordStringComponent[] = [
  {
    component: 'BasicLayout',
    meta: {
      order: -1,
      title: 'page.dashboard.title',
      // 不使用基础布局（仅在顶级生效）
      noBasicLayout: true,
    },
    name: 'Dashboard',
    path: '/',
    redirect: '/analytics',
    children: [
      {
        name: 'Analytics',
        path: '/analytics',
        component: '/dashboard/analytics/index',
        meta: {
          icon: 'lucide:book-open-text',
          affixTab: true,
          title: 'page.dashboard.analytics',
        },
      },
      // {
      //   name: 'Workspace',
      //   path: '/workspace',
      //   component: '/dashboard/workspace/index',
      //   meta: {
      //     icon: 'icon-park-outline:workbench',
      //     title: 'page.dashboard.workspace',
      //   },
      // },
    ],
  },
  // {
  //   component: '/_core/about/index',
  //   meta: {
  //     icon: 'lucide:copyright',
  //     order: 9999,
  //     title: $t('demos.vben.about'),
  //   },
  //   name: 'About',
  //   path: '/vben-admin/about',
  // },
  ...localRoutes,
];
