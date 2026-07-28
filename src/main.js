
import './style.css'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import {firebaseApp} from "./components/firebaseConfig.js";
import {VueFire} from "vuefire";
import { createPinia } from 'pinia';
import 'vue3-toastify/dist/index.css'
const app = createApp(App)

app.use(createPinia())

app.use(VueFire, {
    // imported above but could also just be created here
    firebaseApp,
    modules: [
        // we will see other modules later on
    ],
})
app.use(router);
app.mount('#app')
