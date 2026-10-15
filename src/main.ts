import '@fontsource-variable/nunito'
// The title's serif, with its optical-size axis, which shapes letters for display sizes
import '@fontsource-variable/fraunces/opsz.css'
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { greetConsole } from './services/consoleGreeting'

createApp(App).mount('#app')
greetConsole()
