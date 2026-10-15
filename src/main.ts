import '@fontsource-variable/nunito'
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { greetConsole } from './services/consoleGreeting'

createApp(App).mount('#app')
greetConsole()
