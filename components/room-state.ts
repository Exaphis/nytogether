import { onMessage } from 'webext-bridge/popup'

export function setupRoomState(element: HTMLDivElement) {
    const connectedUsersDiv = document.createElement('p')
    connectedUsersDiv.className = 'connected-users'
    connectedUsersDiv.innerHTML = 'Connected Users: 0'

    const gameStateDiv = document.createElement('p')
    gameStateDiv.className = 'game-state'
    gameStateDiv.innerHTML = 'Game state: ...'

    onMessage('room-state', (message) => {
        console.log('Received room-state message:', message.data)
        gameStateDiv.innerHTML = `Game state: ${JSON.stringify(message.data)}`
    })

    element.appendChild(connectedUsersDiv)
    element.appendChild(gameStateDiv)
}
