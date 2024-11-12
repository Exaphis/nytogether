import {
    allowWindowMessaging,
    onMessage,
    sendMessage,
} from 'webext-bridge/content-script'
import { injectScript } from 'wxt/client'
import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const log = (message: string, ...args: any[]) => {
    console.log(`[NYTogether/content] ${message}`, ...args)
}

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: 'AIzaSyAlcRiK5QvylNbz1n-HZjIKrMAQvXI6qb4',
    authDomain: 'nytogether-cc58e.firebaseapp.com',
    databaseURL: 'https://nytogether-cc58e-default-rtdb.firebaseio.com',
    projectId: 'nytogether-cc58e',
    storageBucket: 'nytogether-cc58e.firebasestorage.app',
    messagingSenderId: '35093823942',
    appId: '1:35093823942:web:af4ac8f451d5916a9572c7',
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Realtime Database and get a reference to the service
const database = getDatabase(app)

export default defineContentScript({
    matches: ['*://*.nytimes.com/crosswords*'],
    main() {
        // allow the injected script to send messages to the background page
        allowWindowMessaging('nytogether')

        onMessage('room-state', (message) => {
            log('Forwarding room-state message:', message)
            // forward the message to the popup
            sendMessage('room-state', message.data, 'popup')
        })

        onMessage('query-room-state', (message) => {
            log('Querying room-state')
            sendMessage('query-room-state', {}, 'window')
        })

        log('Injecting content-main-world.js')
        injectScript('/content-main-world.js', { keepInDom: true })
    },
})
