import {
    allowWindowMessaging,
    onMessage,
    sendMessage,
} from 'webext-bridge/content-script'
import { injectScript } from 'wxt/client'
import { initializeApp } from 'firebase/app'
import { getDatabase, ref, set, onDisconnect } from 'firebase/database'
import { getAuth, signInAnonymously } from 'firebase/auth'

const log = (message: string, ...args: any[]) => {
    console.log(`[NYTogether/content] ${message}`, ...args)
}

const error = (message: string, ...args: any[]) => {
    console.error(`[NYTogether/content] ${message}`, ...args)
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

let popupState = {
    roomName: '',
    autoJoin: false,
    username: '',
}

let currentUser: any = null
let database: any = null

async function main() {
    // Initialize Firebase
    const app = initializeApp(firebaseConfig)

    // Initialize Realtime Database and get a reference to the service
    database = getDatabase(app)

    const auth = getAuth()
    try {
        const userCredential = await signInAnonymously(auth)
        currentUser = userCredential.user
        log('Signed in anonymously with uid:', currentUser.uid)
    } catch (error: any) {
        const errorCode = error.code
        const errorMessage = error.message
        error('Error signing in:', errorCode, errorMessage)
    }

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

    onMessage('set-room-name', (message) => {
        log('Setting room name:', message)
        if (message.data) {
            popupState.roomName = (message.data as any).roomName
        }
    })

    onMessage('set-auto-join', (message) => {
        log('Setting auto-join:', message)
        if (message.data) {
            popupState.autoJoin = (message.data as any).autoJoin
        }
    })

    onMessage('set-username', (message) => {
        log('Setting username:', message)
        if (message.data) {
            popupState.username = (message.data as any).username
        }
    })

    onMessage('join-room', async () => {
        log('Joining room:', popupState.roomName)
        if (!popupState.roomName || !popupState.username || !currentUser) {
            error('Cannot join room: missing room name, username, or user')
            return
        }

        try {
            // Add the user to the members list
            const memberRef = ref(
                database,
                `members/${popupState.roomName}/${currentUser.uid}`
            )

            // Set up automatic cleanup on disconnect
            onDisconnect(memberRef).remove()

            // Add the member
            await set(memberRef, {
                name: popupState.username,
            })
            log('Successfully joined room')
        } catch (err) {
            error('Error joining room:', err)
        }
    })

    log('Injecting content-main-world.js')
    injectScript('/content-main-world.js', { keepInDom: true })
}

export default defineContentScript({
    matches: ['*://*.nytimes.com/crosswords*'],
    main() {
        main().catch((err) => {
            error('Error in main:', err)
        })
    },
})
