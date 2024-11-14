import { setupRoomState } from '@/components/room-state'
import './style.css'
import { sendMessage } from 'webext-bridge/popup'

const log = (message: string, ...args: any[]) => {
    console.log(`[NYTogether/popup] ${message}`, ...args)
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>NYTogether</h1>
    <div class="card">
      <p id="no-puzzle-message">Open a NYT Crossword puzzle to get started!</p>
      <div id="room-input" style="display: none">
        <label for="username">Your Name:</label>
        <input type="text" id="username" placeholder="Enter your name">
        <label for="room-name">Room Name:</label>
        <input type="text" id="room-name" placeholder="Enter room name">
        <div class="auto-join">
          <input type="checkbox" id="auto-join">
          <label for="auto-join">Auto-join</label>
        </div>
        <button id="join-button">Join</button>
        <div id="room-state">
            <h2>Room State</h2>
        </div>
      </div>
    </div>
  </div>
`

setupRoomState(document.querySelector<HTMLDivElement>('#room-state')!, {
    onRoomStateUpdate: (exists: boolean) => {
        const roomInput = document.querySelector<HTMLDivElement>('#room-input')!
        const noPuzzleMessage =
            document.querySelector<HTMLParagraphElement>('#no-puzzle-message')!

        roomInput.style.display = exists ? 'block' : 'none'
        noPuzzleMessage.style.display = exists ? 'none' : 'block'
    },
})

function sendMessageToTab(messageID: string, data: any) {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
        if (tabs.length > 0) {
            sendMessage(messageID, data, `content-script@${tabs[0].id}`)
        }
    })
}

function updateSettings(
    settings: Partial<{
        roomName: string
        autoJoin: boolean
        username: string
    }>
) {
    log('Updating settings:', settings)
    sendMessageToTab('update-settings', settings)
}

document
    .querySelector<HTMLInputElement>('#room-name')!
    .addEventListener('input', (event) => {
        const roomName = (event.target as HTMLInputElement).value
        log('Setting room name:', roomName)
        updateSettings({ roomName })
    })

document
    .querySelector<HTMLInputElement>('#auto-join')!
    .addEventListener('change', (event) => {
        const autoJoin = (event.target as HTMLInputElement).checked
        log('Setting auto-join:', autoJoin)
        updateSettings({ autoJoin })
    })

document
    .querySelector<HTMLInputElement>('#username')!
    .addEventListener('input', (event) => {
        const username = (event.target as HTMLInputElement).value
        log('Setting username:', username)
        updateSettings({ username })
    })

log('Querying room-state')
sendMessageToTab('query-room-state', {})
