import { onMessage } from 'webext-bridge/popup'

export function setupRoomState(element: HTMLDivElement) {
    const connectedUsersDiv = document.createElement('p')
    connectedUsersDiv.className = 'connected-users'
    connectedUsersDiv.innerHTML = 'Connected Users: 0'

    const gameStateDiv = document.createElement('p')
    gameStateDiv.className = 'game-state'
    gameStateDiv.innerHTML = 'Game state: ...'

    onMessage('room-state', async (message) => {
        console.log('Received room-state message:', message.data)

        const state = message.data! as any
        let answers = ''
        for (const cell of state.cells) {
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
    })

    element.appendChild(connectedUsersDiv)
    element.appendChild(gameStateDiv)
}
