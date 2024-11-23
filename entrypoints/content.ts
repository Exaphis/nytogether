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
    serverTimestamp,
    DataSnapshot,
    remove,
    get,
} from 'firebase/database'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { NYTStoreStateSchema } from '@/lib/nyt-interfaces'

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
    disconnectListeners: any[]
    guessesRef: any
    memberRef: any
    members: { [userId: string]: { name: string; selection: number } }
    userId: string
} | null = null

function sendRoomState() {
    log('Sending connected room state:', connectedRoomState)
    sendMessage('room-state', connectedRoomState, 'popup')
}

async function getGameState() {
    const res = await sendMessage('query-game-state', {}, 'window')
    if (res === null) {
        error('No game state received from content-main-world')
        return null
    }

    // Validate the game state using our Zod schema
    const result = NYTStoreStateSchema.safeParse(res)
    if (!result.success) {
        error('Invalid game state received:', result.error)
        return null
    }

    return result.data
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

    const gameState = await getGameState()
    if (gameState === null) {
        error('No game state!')
        return
    }

    log('Joining room:', roomName, 'with username:', username)

    let guessesRef: any = null
    let memberRef: any = null
    try {
        // Create/update the xword room entry
        const xwordRef = ref(database, `xwords/${roomName}`)
        const xwordSnapshot = await get(xwordRef)

        if (!xwordSnapshot.exists()) {
            // New room
            await set(xwordRef, {
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            })
        }

        // Create/update the guesses entry
        guessesRef = ref(database, `guesses/${roomName}`)
        const guessesSnapshot = await get(guessesRef)

        if (!guessesSnapshot.exists()) {
            // New room
            let guesses: { [key: string]: any } = {}
            for (const cell of gameState.cells) {
                guesses[cell.index.toString()] = {
                    letter: cell.guess,
                    userId: user.uid,
                    timestamp: serverTimestamp(),
                    penciled: cell.penciled,
                }
            }
            log('Setting guesses:', guesses)
            await set(guessesRef, guesses)
        }

        // Add the member
        memberRef = ref(database, `members/${roomName}/${username}`)

        // Set up automatic cleanup on disconnect
        onDisconnect(memberRef).remove()

        // Add the member with new structure
        await set(memberRef, {
            userId: user.uid,
            selection: gameState.selection.cell,
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
        memberRef,
        guessesRef,
        disconnectListeners: [],
        members: {},
        userId: user.uid,
    }

    // Update the member listener
    log('Setting up member listener for room:', roomName)
    const membersRef = ref(database, `members/${roomName}`)
    connectedRoomState.disconnectListeners.push(
        onValue(
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
    )

    // Set up the guesses listener
    connectedRoomState.disconnectListeners.push(
        onValue(guessesRef, (snapshot: DataSnapshot) => {
            log('Updated guesses:', snapshot.val())
        })
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

    for (const disconnectListener of connectedRoomState.disconnectListeners) {
        disconnectListener()
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
        return connectedRoomState
    })

    onMessage('game-state', async (message) => {
        // Validate the game state using our Zod schema
        const result = NYTStoreStateSchema.safeParse(message.data)
        if (!result.success) {
            error('Invalid game state received:', result.error)
            return
        }
        const gameState = result.data

        if (connectedRoomState !== null) {
            const existingGuessesSnapshot = await get(
                connectedRoomState.guessesRef
            )
            const existingGuesses = existingGuessesSnapshot.val()
            let guesses: { [key: string]: any } = existingGuesses
            let updated: boolean = false

            for (const cell of gameState.cells) {
                const newGuess = {
                    letter: cell.guess,
                    userId: connectedRoomState.userId,
                    timestamp: serverTimestamp(),
                    penciled: cell.penciled,
                }

                // if letter/penciled is the same as existing, skip
                if (
                    existingGuesses[cell.index.toString()].letter ===
                        cell.guess &&
                    existingGuesses[cell.index.toString()].penciled ===
                        cell.penciled
                ) {
                    continue
                }

                guesses[cell.index.toString()] = newGuess
                updated = true
            }
            if (updated) {
                log('Setting guesses:', guesses)
                await set(connectedRoomState.guessesRef, guesses)
            } else {
                log('No updates to guesses')
            }

            const existingMemberSnapshot = await get(
                connectedRoomState.memberRef
            )
            const existingMember = existingMemberSnapshot.val()
            if (existingMember.selection !== gameState.selection.cell) {
                log('Updating selection:', gameState.selection.cell)
                await set(connectedRoomState.memberRef, {
                    userId: connectedRoomState.userId,
                    selection: gameState.selection.cell,
                })
            } else {
                log('No updates to selection')
            }
        }

        log(
            'Forwarding validated game state from content-main-world to popup:',
            result.data
        )
        sendMessage('game-state', result.data, 'popup')
    })

    onMessage('query-game-state', async (message) => {
        log('Received game state request from popup')
        return await getGameState()
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
