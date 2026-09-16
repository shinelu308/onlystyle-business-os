import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// 设计系统 = 从 Lovart 设计稿自动抽取（不要手改，见文件头注释）
import './styles/design-system.css'
// 工程自有的补充/覆盖样式
import './styles/site.css'

createApp(App).use(router).mount('#app')
