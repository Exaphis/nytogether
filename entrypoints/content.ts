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

let database: any = null
let connectedRoomState: {
    roomName: string
    username: string
    disconnectRoomMemberListener: any
    members: { [userId: string]: { name: string } }
    userId: string
} | null = null

function sendRoomState() {
    log('Sending connected room state:', connectedRoomState)
    sendMessage('room-state', connectedRoomState, 'popup')
}

async function joinRoom({
    roomName,
    username,
}: {
    roomName: string
    username: string
}) {
    if (!roomName || !username) {
        error('Cannot join room: missing room name or username')
        return
    }
    if (connectedRoomState !== null) {
        error('Already in a room!')
        return
    }

    const user = getAuth().currentUser
    if (!user) {
        error('No user!')
        return
    }

    log('Joining room:', roomName, 'with username:', username)

    // Add the new username, removing the old username if it exists
    try {
        // Update to new structure: roomId/name/username/userId
        const memberRef = ref(database, `members/${roomName}/${username}`)

        // Set up automatic cleanup on disconnect
        onDisconnect(memberRef).remove()

        // Add the member with new structure
        await set(memberRef, {
            userId: user.uid,
        })
        log('Successfully joined room')
    } catch (err) {
        error('Error joining room:', err)
        return
    }

    // Set the room state up before setting up the member listener
    // so that we don't miss any updates
    connectedRoomState = {
        roomName,
        username,
        disconnectRoomMemberListener: null,
        members: {},
        userId: user.uid,
    }

    // Update the member listener
    log('Setting up member listener for room:', roomName)
    const membersRef = ref(database, `members/${roomName}`)
    connectedRoomState.disconnectRoomMemberListener = onValue(
        membersRef,
        (snapshot: DataSnapshot) => {
            if (connectedRoomState === null) {
                error('Room is disconnected!')
                return
            }
            connectedRoomState.members = snapshot.val() || {}
            log('Updated members:', connectedRoomState.members)
            sendRoomState()
        },
        (e: any) => {
            error('Error setting up member listener:', e)
        }
    )

    sendRoomState()
}

async function leaveRoom() {
    if (connectedRoomState === null) {
        log('Not in a room, skipping leave')
        return
    }

    log('Leaving room:', connectedRoomState.roomName)
    // Remove the member from the database
    const memberRef = ref(
        database,
        `members/${connectedRoomState.roomName}/${connectedRoomState.username}`
    )
    await remove(memberRef)

    if (!connectedRoomState.disconnectRoomMemberListener) {
        error('No disconnect room member listener!')
    } else {
        connectedRoomState.disconnectRoomMemberListener()
    }
    connectedRoomState = null

    sendRoomState()
}

async function main() {
    // Initialize Firebase
    const app = initializeApp(firebaseConfig)

    // Initialize Realtime Database and get a reference to the service
    database = getDatabase(app)

    const auth = getAuth()
    try {
        const userCredential = await signInAnonymously(auth)
        log('Signed in anonymously with uid:', userCredential.user.uid)
    } catch (error: any) {
        const errorCode = error.code
        const errorMessage = error.message
        error('Error signing in:', errorCode, errorMessage)
    }

    // allow the injected script to send messages to the background page
    allowWindowMessaging('nytogether')

    onMessage('query-room-state', (message) => {
        log('Received room state request from popup')
        sendRoomState()
    })

    onMessage('game-state', (message) => {
        log(
            'Forwarding game state from content-main-world to popup:',
            message.data
        )
        sendMessage('game-state', message.data, 'popup')
    })

    onMessage('query-game-state', (message) => {
        log('Forwarding game state request from popup to content-main-world')
        sendMessage('query-game-state', {}, 'window')
    })

    onMessage('join-room', (message) => {
        joinRoom(message.data as any)
    })
    onMessage('leave-room', leaveRoom)

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
