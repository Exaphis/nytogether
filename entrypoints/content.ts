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
    onChildChanged,
    update,
    runTransaction,
} from 'firebase/database'
import { getAuth, signInAnonymously } from 'firebase/auth'
import {
    NYTStoreStateSchema,
    NYTStoreState,
    Member,
    RoomState as IRoomState,
    AutoJoinState,
    NYTCell,
    Cell,
} from '@/lib/nyt-interfaces'

const log = (message: string, ...args: any[]) => {
    console.log(`[NYTogether/content] ${message}`, ...args)
}

const error = (message: string, ...args: any[]) => {
    console.error(`[NYTogether/content] ${message}`, ...args)
}

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
        requestedRoomName: string
        gameId: string
        username: string
        disconnectListeners: any[]
        guessesRef: any
        memberRef: any
        guesses: Record<number, Cell>
    } | null
    database: any
    onRoomStateChange: (state: RoomState) => void
    // queryGameState must be a member function, not a global one.
    // Otherwise, we see "Browser.runtime.connect not implemented" errors.
    queryGameState: () => Promise<NYTStoreState | null>
    setCell: (cellId: number, cell: NYTCell) => Promise<void>
    receivedInitialGameState: boolean

    constructor(
        onRoomStateChange: (state: RoomState) => void,
        queryGameState: () => Promise<NYTStoreState | null>,
        setCell: (cellId: number, cell: NYTCell) => Promise<void>,
        database: any
    ) {
        this.data = null
        this.onRoomStateChange = onRoomStateChange
        this.queryGameState = queryGameState
        this.setCell = setCell
        this.database = database
        this.receivedInitialGameState = false
    }

    async connect(requestedRoomName: string, username: string) {
        if (!requestedRoomName || !username) {
            throw new Error('Missing room name or username')
        }
        if (this.data !== null) {
            throw new Error('Already in a room')
        }

        const user = getAuth().currentUser
        if (!user) {
            throw new Error('User not authenticated')
        }

        const gameState = await this.queryGameState()
        if (gameState === null) {
            throw new Error('No game state found')
        }

        // update requested room name to the actual room name
        // by adding a suffix for the puzzle ID
        const gameSuffix = `${gameState.puzzle.data.meta.publishStream}-${gameState.puzzle.data.meta.publicationDate}`
        const roomName = `${requestedRoomName}-${gameSuffix}`

        log('Joining room:', roomName, 'with username:', username)

        // Add the member
        const memberRef = ref(this.database, `members/${roomName}/${username}`)

        // Make sure the member doesn't already exist
        const memberSnapshot = await get(memberRef)
        if (memberSnapshot.exists()) {
            throw new Error(
                `User with username ${username} already in room ${roomName}`
            )
        }

        // Set up automatic cleanup on disconnect
        onDisconnect(memberRef).remove()

        // Add the member with new structure
        await set(memberRef, {
            userId: user.uid,
            selection: gameState.selection.cell,
        })

        // Create the xword room entry if necessary
        runTransaction(
            ref(this.database, `xwords/${roomName}`),
            (currentData) => {
                if (currentData === null) {
                    return {
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    }
                }
                return currentData
            }
        )

        // Create/update the guesses entry
        const guessesRef = ref(this.database, `guesses/${roomName}`)
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
        } else {
            // Guesses already exist, so we need to set the game board state
            // to match the guesses
            const guesses = guessesSnapshot.val()
            for (const [key, val] of Object.entries(guesses)) {
                await this.setCell(parseInt(key), {
                    guess: (val as any).letter,
                    penciled: (val as any).penciled,
                })
            }
        }

        log('Successfully joined room')

        // Set the room state up before setting up the member listener
        // so that we don't miss any updates
        this.data = {
            roomName,
            requestedRoomName,
            gameId: gameSuffix,
            username,
            memberRef,
            guessesRef,
            guesses: (await get(guessesRef)).val(),
            disconnectListeners: [],
        }

        // Set up the member listener
        log('Setting up member listener for room:', roomName)
        const membersRef = ref(this.database, `members/${roomName}`)
        this.data.disconnectListeners.push(
            onValue(
                membersRef,
                (snapshot: DataSnapshot) => {
                    log('Updated members:', snapshot.val())

                    // Update the selections on screen
                    let selectedCellIds: number[] = []
                    for (const [memberName, memberVal] of Object.entries(
                        snapshot.val() || {}
                    )) {
                        const member = memberVal as Member
                        if (
                            memberName !== username &&
                            member.selection !== null
                        ) {
                            selectedCellIds.push(member.selection)
                        }
                    }

                    const cellElems = document.querySelectorAll('.xwd__cell')
                    for (let i = 0; i < cellElems.length; i++) {
                        const cellElem = cellElems[i]
                        const inputElem = cellElem.querySelector('rect')!

                        if (selectedCellIds.includes(i)) {
                            inputElem.style.fill = 'greenyellow'
                        } else {
                            inputElem.style.removeProperty('fill')
                        }
                    }

                    this.onRoomStateChange(this)
                },
                (e: any) => {
                    error('Error setting up member listener:', e)
                }
            )
        )

        // Set up the guesses listener. We already know the guesses exist.
        this.data.disconnectListeners.push(
            onChildChanged(guessesRef, async (snapshot: DataSnapshot) => {
                const key = parseInt(snapshot.key!)
                const val = snapshot.val()
                log('Updated guess:', key, val)
                const cell = {
                    guess: val.letter,
                    penciled: val.penciled,
                }
                await this.setCell(key, cell)
                this.data!.guesses[key] = val
                this.onRoomStateChange(this)
            })
        )

        this.onRoomStateChange(this)
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
        this.onRoomStateChange(this)
    }

    async onGameStateUpdate(gameState: NYTStoreState) {
        if (gameState.nytogetherUpdating) {
            log('NYTogether is updating, skipping game state update')
            return
        }

        if (!this.receivedInitialGameState) {
            log('This is the first game state update! Checking autojoin')
            const item = storage.defineItem<AutoJoinState | null>(
                'local:autojoin',
                {
                    fallback: null,
                }
            )
            const autoJoin = await item.getValue()
            log('Autojoin state:', autoJoin)
            if (autoJoin !== null) {
                log('Autojoining room:', autoJoin.roomName)
                await this.connect(autoJoin.roomName, autoJoin.displayName)
            } else {
                log('No autojoin state found')
            }
        }

        this.receivedInitialGameState = true
        if (this.data === null) {
            log('Not in a room, not processing game state update')
            return
        }

        const currUid = getAuth().currentUser!.uid
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

    async onCellUpdate(cells: { [cell: number]: NYTCell }) {
        if (this.data === null) {
            log('Not in a room, not processing cell update')
            return
        }

        const currUid = getAuth().currentUser!.uid

        for (const [cellId, cell] of Object.entries(cells)) {
            log('Setting guess in database:', cellId, cell)
            const updates: any = {}
            updates[`xwords/${this.data.roomName}/updatedAt`] =
                serverTimestamp()
            updates[`guesses/${this.data.roomName}/${cellId}`] = {
                letter: cell.guess,
                userId: currUid,
                timestamp: serverTimestamp(),
                penciled: cell.penciled,
            }
            await update(ref(this.database), updates)
        }
    }

    public async getRoomData(): Promise<IRoomState | null> {
        if (this.data === null) {
            return null
        }
        const membersRef = ref(this.database, `members/${this.data.roomName}`)
        const membersSnapshot = await get(membersRef)
        const members = membersSnapshot.val() || {}
        return {
            roomName: this.data.roomName,
            requestedRoomName: this.data.requestedRoomName,
            gameId: this.data.gameId,
            username: this.data.username,
            userId: getAuth().currentUser!.uid,
            members,
            guesses: this.data.guesses,
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
        const res = await sendMessage('query-game-state', null, 'window')
        if (res === null) {
            error('No game state received from content-main-world')
            return null
        }

        // Validate the game state using our Zod schema
        const result = NYTStoreStateSchema.safeParse(res)
        if (!result.success) {
            error('Invalid game state received:', res, result.error)
            return null
        }

        return result.data
    }

    window.addEventListener('beforeunload', async () => {
        log('Unloading, clearing state in background')
        await sendMessage('room-state', null, 'background')
        await sendMessage('game-state', null, 'background')
    })

    const roomState = new RoomState(
        async (state) => {
            const roomData = await state.getRoomData()
            log('Sending connected room state:', roomData)
            await sendMessage('room-state', roomData, 'background')
        },
        getGameState,
        async (cellId: number, cell: NYTCell) => {
            await sendMessage('set-cell', { cellId, cell }, 'window')
        },
        database
    )

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
            'Forwarding validated game state from content-main-world to background:',
            result.data
        )
        sendMessage('game-state', result.data, 'background')
    })

    onMessage('query-room-state', async (message) => {
        log('Received query-room-state request from background')
        const roomData = await roomState.getRoomData()
        sendMessage('room-state', roomData, 'background')
    })

    onMessage('query-game-state', async (message) => {
        log('Received query-game-state request from background')
        const gameState = await getGameState()
        sendMessage('game-state', gameState, 'background')
    })

    onMessage('cell-update', async (message) => {
        log('Received cell update from content-main-world')
        roomState.onCellUpdate(message.data)
    })

    onMessage('join-room', async (message) => {
        log('Received join room request from popup', message.data)
        try {
            await roomState.connect(
                message.data.roomName,
                message.data.username
            )
        } catch (error) {
            return {
                success: false,
                error: (error as any).message,
            }
        }
        return {
            success: true,
        }
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
