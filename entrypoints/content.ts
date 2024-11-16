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

let popupState: {
    roomName: string
    autoJoin: boolean
    username: string
    userId: string
    currentRoomMembers: { [key: string]: { name: string } }
} = {
    roomName: '',
    autoJoin: false,
    username: '',
    userId: '',
    currentRoomMembers: {},
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
    if (!popupState.roomName || !popupState.username || !popupState.userId) {
        error('Cannot join room: missing room name, username, or user')
        return
    }

    log(
        'Joining room:',
        popupState.roomName,
        'with username:',
        popupState.username
    )

    const oldRoomName = connectedRoomData.roomName
    const oldUsername = connectedRoomData.username
    connectedRoomData.username = popupState.username
    connectedRoomData.roomName = popupState.roomName

    // Update the member listener
    if (oldRoomName !== popupState.roomName) {
        if (connectedRoomData.disconnectRoomMemberListener) {
            connectedRoomData.disconnectRoomMemberListener()
        }

        log('Setting up member listener for room:', popupState.roomName)
        const membersRef = ref(database, `members/${popupState.roomName}`)
        connectedRoomData.disconnectRoomMemberListener = onValue(
            membersRef,
            (snapshot: DataSnapshot) => {
                // Transform the data structure from name->userId to userId->name
                const nameData = snapshot.val() || {}
                log('Current name data:', nameData)
                popupState.currentRoomMembers = {}

                Object.entries(nameData).forEach(
                    ([name, data]: [string, any]) => {
                        if (data.userId) {
                            popupState.currentRoomMembers[data.userId] = {
                                name,
                            }
                        }
                    }
                )

                sendMessage(
                    'room-state',
                    {
                        members: popupState.currentRoomMembers,
                        userId: popupState.userId,
                    },
                    'popup'
                )
            },
            (e: any) => {
                error('Error setting up member listener:', e)
            }
        )
    }

    // Add the new username, removing the old username if it exists
    if (
        oldUsername !== popupState.username ||
        oldRoomName !== popupState.roomName
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
                `members/${popupState.roomName}/${popupState.username}`
            )

            // Set up automatic cleanup on disconnect
            onDisconnect(memberRef).remove()

            // Add the member with new structure
            await set(memberRef, {
                userId: popupState.userId,
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
        popupState.userId = userCredential.user.uid
        log('Signed in anonymously with uid:', popupState.userId)
    } catch (error: any) {
        const errorCode = error.code
        const errorMessage = error.message
        error('Error signing in:', errorCode, errorMessage)
    }

    // allow the injected script to send messages to the background page
    allowWindowMessaging('nytogether')

    onMessage('room-state', (message) => {
        log('Forwarding room-state message:', message)
        const data = message.data as any
        sendMessage('room-state', { ...data, popupState }, 'popup')
    })

    onMessage('query-room-state', (message) => {
        log('Querying room-state')
        sendMessage('query-room-state', {}, 'window')
    })

    onMessage('update-settings', (message) => {
        log('Updating settings:', message.data)
        if (message.data) {
            const settings = message.data as typeof popupState
            popupState = { ...popupState, ...settings }
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
