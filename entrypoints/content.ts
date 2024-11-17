import {
    allowWindowMessaging,
    onMessage,
    sendMessage,
} from 'webext-bridge/content-script'
import { injectScript } from 'wxt/client'
import { initializeApp } from 'firebase/app'
import {
    getDatabase,
    ref,
    set,
    onDisconnect,
    onValue,
    DataSnapshot,
    remove,
} from 'firebase/database'
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

let nytogetherState: {
    roomName: string
    autoJoin: boolean
    username: string
    userId: string
    members: { [userId: string]: { name: string } }
} = {
    roomName: '',
    autoJoin: false,
    username: '',
    userId: '',
    members: {},
}

let database: any = null
let connectedRoomData: {
    roomName: string
    username: string
    disconnectRoomMemberListener: any
} = {
    roomName: '',
    username: '',
    disconnectRoomMemberListener: null,
}

async function joinRoom() {
    if (
        !nytogetherState.roomName ||
        !nytogetherState.username ||
        !nytogetherState.userId
    ) {
        error('Cannot join room: missing room name, username, or user')
        return
    }

    log(
        'Joining room:',
        nytogetherState.roomName,
        'with username:',
        nytogetherState.username
    )

    const oldRoomName = connectedRoomData.roomName
    const oldUsername = connectedRoomData.username
    connectedRoomData.username = nytogetherState.username
    connectedRoomData.roomName = nytogetherState.roomName

    // Update the member listener
    if (oldRoomName !== nytogetherState.roomName) {
        if (connectedRoomData.disconnectRoomMemberListener) {
            connectedRoomData.disconnectRoomMemberListener()
        }

        log('Setting up member listener for room:', nytogetherState.roomName)
        const membersRef = ref(database, `members/${nytogetherState.roomName}`)
        connectedRoomData.disconnectRoomMemberListener = onValue(
            membersRef,
            (snapshot: DataSnapshot) => {
                nytogetherState.members = snapshot.val() || {}
                log('Updated members:', nytogetherState.members)
                sendMessage('room-state', { nytogetherState }, 'popup')
            },
            (e: any) => {
                error('Error setting up member listener:', e)
            }
        )
    }

    // Add the new username, removing the old username if it exists
    if (
        oldUsername !== nytogetherState.username ||
        oldRoomName !== nytogetherState.roomName
    ) {
        if (oldUsername) {
            log(
                `Removing old username at path members/${oldRoomName}/${oldUsername}`
            )
            const oldMemberRef = ref(
                database,
                `members/${oldRoomName}/${oldUsername}`
            )
            await remove(oldMemberRef)
        }

        try {
            // Update to new structure: roomId/name/username/userId
            const memberRef = ref(
                database,
                `members/${nytogetherState.roomName}/${nytogetherState.username}`
            )

            // Set up automatic cleanup on disconnect
            onDisconnect(memberRef).remove()

            // Add the member with new structure
            await set(memberRef, {
                userId: nytogetherState.userId,
            })
            log('Successfully joined room')
        } catch (err) {
            error('Error joining room:', err)
        }
    }
}

async function main() {
    // Initialize Firebase
    const app = initializeApp(firebaseConfig)

    // Initialize Realtime Database and get a reference to the service
    database = getDatabase(app)

    const auth = getAuth()
    try {
        const userCredential = await signInAnonymously(auth)
        nytogetherState.userId = userCredential.user.uid
        log('Signed in anonymously with uid:', nytogetherState.userId)
    } catch (error: any) {
        const errorCode = error.code
        const errorMessage = error.message
        error('Error signing in:', errorCode, errorMessage)
    }

    // allow the injected script to send messages to the background page
    allowWindowMessaging('nytogether')

    onMessage('room-state', (message) => {
        const data = {
            ...(message.data as any),
            nytogetherState,
        }
        log('Forwarding room-state message:', data)
        sendMessage('room-state', data, 'popup')
    })

    onMessage('query-room-state', (message) => {
        log('Querying room-state')
        sendMessage('query-room-state', {}, 'window')
    })

    onMessage('set-nytogether-state', (message) => {
        log('Updating settings:', message.data)
        if (message.data) {
            const settings = message.data as typeof nytogetherState
            nytogetherState = { ...nytogetherState, ...settings }
        }
    })

    onMessage('join-room', joinRoom)

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
