import { onMessage } from 'webext-bridge/popup'

const log = (message: string, ...args: any[]) => {
    console.log(`[NYTogether/room-state] ${message}`, ...args)
}

interface RoomStateOptions {
    onRoomStateUpdate?: (exists: boolean) => void
}

interface Member {
    name: string
}

interface RoomState {
    cells?: any[]
    members?: { [userId: string]: Member }
    userId?: string
}

let currentState: RoomState | null = null

export function setupRoomState(
    element: HTMLDivElement,
    options: RoomStateOptions = {}
) {
    const connectedUsersDiv = document.createElement('div')
    connectedUsersDiv.className = 'connected-users'

    const connectedUsersTitle = document.createElement('h3')
    connectedUsersTitle.textContent = 'Connected Users'
    connectedUsersDiv.appendChild(connectedUsersTitle)

    const usersList = document.createElement('ul')
    usersList.className = 'users-list'
    connectedUsersDiv.appendChild(usersList)

    const gameStateDiv = document.createElement('p')
    gameStateDiv.className = 'game-state'
    gameStateDiv.innerHTML = 'Game state: ...'

    function updateConnectedUsers(
        members: { [userId: string]: Member } = {},
        currentUser?: string
    ) {
        log('Updating connected users:', members, currentUser)
        const users = Object.entries(members).map(([userId, member]) => ({
            id: userId,
            name: member.name,
            isCurrentUser: userId === currentUser,
        }))

        usersList.innerHTML = users.length
            ? users
                  .map(
                      (user) => `
                <li class="user ${user.isCurrentUser ? 'current-user' : ''}">
                    ${user.name}${user.isCurrentUser ? ' (you)' : ''}
                </li>
            `
                  )
                  .join('')
            : '<li class="no-users">No users connected</li>'
    }

    onMessage('room-state', async (message) => {
        console.log('Received room-state message:', message.data)
        if (!message.data) {
            return
        }

        currentState = { ...currentState, ...(message.data as RoomState) }

        // If we have cells data, the puzzle exists
        const puzzleExists = !!currentState.cells
        options.onRoomStateUpdate?.(puzzleExists)

        if (!puzzleExists) {
            gameStateDiv.innerHTML = 'No puzzle detected'
            updateConnectedUsers()
            return
        }

        // Update connected users
        updateConnectedUsers(currentState.members, currentState.userId)

        if (currentState.cells) {
            let answers = ''
            for (const cell of currentState.cells) {
                answers += cell.answer ?? ' '
            }

            // hash the answers to get a unique identifier for the game state
            const encoder = new TextEncoder()
            const answerData = encoder.encode(answers)
            const hash = await crypto.subtle.digest('SHA-256', answerData)
            const hashArray = Array.from(new Uint8Array(hash))
            const hashHex = hashArray
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('')
            console.log('Answer hash:', hashHex)

            gameStateDiv.innerHTML = `Game state: ${hashHex}`
        }
    })

    element.appendChild(connectedUsersDiv)
    element.appendChild(gameStateDiv)
}
