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
import { NYTStoreStateSchema, NYTStoreState } from '@/lib/nyt-interfaces'

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

class RoomState {
    private data: {
        roomName: string
        username: string
        disconnectListeners: any[]
        guessesRef: any
        memberRef: any
    } | null
    database: any
    onStateChange: (state: RoomState) => void
    // queryGameState must be a member function, not a global one.
    // Otherwise, we see "Browser.runtime.connect not implemented" errors.
    queryGameState: () => Promise<NYTStoreState | null>

    constructor(
        onStateChange: (state: RoomState) => void,
        queryGameState: () => Promise<NYTStoreState | null>,
        database: any
    ) {
        this.data = null
        this.onStateChange = onStateChange
        this.queryGameState = queryGameState
        this.database = database
    }

    async connect(roomName: string, username: string) {
        if (!roomName || !username) {
            error('Cannot join room: missing room name or username')
            return
        }
        if (this.data !== null) {
            error('Already in a room!')
            return
        }

        const user = getAuth().currentUser
        if (!user) {
            error('No user!')
            return
        }

        const gameState = await this.queryGameState()
        if (gameState === null) {
            error('No game state!')
            return
        }

        log('Joining room:', roomName, 'with username:', username)

        let guessesRef: any = null
        let memberRef: any = null
        try {
            // Create/update the xword room entry
            const xwordRef = ref(this.database, `xwords/${roomName}`)
            const xwordSnapshot = await get(xwordRef)

            if (!xwordSnapshot.exists()) {
                // New room
                await set(xwordRef, {
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                })
            }

            // Create/update the guesses entry
            guessesRef = ref(this.database, `guesses/${roomName}`)
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
            memberRef = ref(this.database, `members/${roomName}/${username}`)

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
        this.data = {
            roomName,
            username,
            memberRef,
            guessesRef,
            disconnectListeners: [],
        }

        // Update the member listener
        log('Setting up member listener for room:', roomName)
        const membersRef = ref(this.database, `members/${roomName}`)
        this.data.disconnectListeners.push(
            onValue(
                membersRef,
                (snapshot: DataSnapshot) => {
                    if (this.data === null) {
                        error('Room is disconnected!')
                        return
                    }
                    this.onStateChange(this)
                },
                (e: any) => {
                    error('Error setting up member listener:', e)
                }
            )
        )

        // Set up the guesses listener
        this.data.disconnectListeners.push(
            onValue(guessesRef, (snapshot: DataSnapshot) => {
                log('Updated guesses:', snapshot.val())
                this.onStateChange(this)
            })
        )

        this.onStateChange(this)
    }

    async leaveRoom() {
        if (this.data === null) {
            log('Not in a room, skipping leave')
            return
        }

        log('Leaving room:', this.data.roomName)
        // Remove the member from the database
        const memberRef = ref(
            this.database,
            `members/${this.data.roomName}/${this.data.username}`
        )
        await remove(memberRef)

        for (const disconnectListener of this.data.disconnectListeners) {
            disconnectListener()
        }

        this.data = null
        this.onStateChange(this)
    }

    async onGameStateUpdate(gameState: NYTStoreState) {
        if (this.data === null) {
            error('Not in a room, skipping game state update')
            return
        }

        const currUid = getAuth().currentUser!.uid
        const existingGuessesSnapshot = await get(this.data.guessesRef)
        const existingGuesses = existingGuessesSnapshot.val()
        let guesses: { [key: string]: any } = existingGuesses
        let updated: boolean = false

        for (const cell of gameState.cells) {
            const newGuess = {
                letter: cell.guess,
                userId: currUid,
                timestamp: serverTimestamp(),
                penciled: cell.penciled,
            }

            // if letter/penciled is the same as existing, skip
            if (
                existingGuesses[cell.index.toString()].letter === cell.guess &&
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
            await set(this.data.guessesRef, guesses)
        } else {
            log('No updates to guesses')
        }

        const existingMemberSnapshot = await get(this.data.memberRef)
        const existingMember = existingMemberSnapshot.val()
        if (existingMember.selection !== gameState.selection.cell) {
            log('Updating selection:', gameState.selection.cell)
            await set(this.data.memberRef, {
                userId: currUid,
                selection: gameState.selection.cell,
            })
        } else {
            log('No updates to selection')
        }
    }

    public async getRoomData() {
        if (this.data === null) {
            return null
        }
        const membersRef = ref(this.database, `members/${this.data.roomName}`)
        const membersSnapshot = await get(membersRef)
        const members = membersSnapshot.val() || {}
        return {
            roomName: this.data.roomName,
            username: this.data.username,
            userId: getAuth().currentUser!.uid,
            members,
        }
    }
}

async function main() {
    // Initialize Firebase
    const app = initializeApp(firebaseConfig)

    // Initialize Realtime Database and get a reference to the service
    const database = getDatabase(app)

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

    async function getGameState(): Promise<NYTStoreState | null> {
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

        return result.data as NYTStoreState
    }

    const roomState = new RoomState(
        async (state) => {
            log('Sending connected room state:', state)
            sendMessage('room-state', await state.getRoomData(), 'popup')
        },
        getGameState,
        database
    )

    onMessage('query-room-state', async (message) => {
        log('Received room state request from popup')
        return await roomState.getRoomData()
    })

    onMessage('game-state', async (message) => {
        // Validate the game state using our Zod schema
        const result = NYTStoreStateSchema.safeParse(message.data)
        if (!result.success) {
            error('Invalid game state received:', result.error)
            return
        }

        const gameState = result.data
        roomState.onGameStateUpdate(gameState)

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
        const data = message.data as { roomName: string; username: string }
        log('Received join room request from popup', data)
        roomState.connect(data.roomName, data.username)
    })

    onMessage('leave-room', (message) => {
        log('Received leave room request from popup')
        roomState.leaveRoom()
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
