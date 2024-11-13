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
      <div class="room-input">
        <label for="room-name">Room Name:</label>
        <input type="text" id="room-name" placeholder="Enter room name">
        <div class="auto-join">
          <input type="checkbox" id="auto-join">
          <label for="auto-join">Auto-join</label>
        </div>
        <button id="join-button">Join</button>
      </div>
      <div id="room-state">
        <h2>Room State</h2>
      </div>
    </div>
  </div>
`

setupRoomState(document.querySelector<HTMLDivElement>('#room-state')!)

function sendMessageToTab(messageID: string, data: any) {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
        if (tabs.length > 0) {
            sendMessage(messageID, data, `content-script@${tabs[0].id}`)
        }
    })
}

document
    .querySelector<HTMLInputElement>('#room-name')!
    .addEventListener('input', (event) => {
        log('Setting room name:', (event.target as HTMLInputElement).value)
        sendMessageToTab('set-room-name', {
            roomName: (event.target as HTMLInputElement).value,
        })
    })

document
    .querySelector<HTMLInputElement>('#join-button')!
    .addEventListener('click', () => {
        log('Joining room')
        sendMessageToTab('join-room', {})
    })

document
    .querySelector<HTMLInputElement>('#auto-join')!
    .addEventListener('change', (event) => {
        log('Setting auto-join:', (event.target as HTMLInputElement).checked)
        sendMessageToTab('set-auto-join', {
            autoJoin: (event.target as HTMLInputElement).checked,
        })
    })

log('Querying room-state')
sendMessageToTab('query-room-state', {})
