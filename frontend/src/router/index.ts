import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { title: '备考概览', nav: 'dashboard' },
    },
    {
      path: '/practice',
      name: 'practice',
      component: () => import('@/views/PracticeView.vue'),
      meta: { title: '专项练习', nav: 'practice' },
    },
    {
      path: '/questions',
      name: 'questions',
      component: () => import('@/views/QuestionsView.vue'),
      meta: { title: '题库浏览', nav: 'questions' },
    },
    {
      path: '/exam',
      name: 'exam',
      component: () => import('@/views/ExamView.vue'),
      meta: { title: '全真模拟考', nav: 'exam', standalone: true },
    },
    {
      path: '/exam/:id/report',
      name: 'exam-report',
      component: () => import('@/views/ExamReportView.vue'),
      meta: { title: '成绩报告', nav: 'exam' },
    },
    {
      path: '/wrong',
      name: 'wrong',
      component: () => import('@/views/WrongBookView.vue'),
      meta: { title: '错题本', nav: 'wrong' },
    },
    {
      path: '/scores',
      name: 'scores',
      component: () => import('@/views/ScoresView.vue'),
      meta: { title: '模拟考成绩', nav: 'scores' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  // 路由只切主内容区，滚动位置交给 .workspace 自行管理，避免整页白屏闪烁。
  scrollBehavior: () => ({ top: 0 }),
})

export default router
