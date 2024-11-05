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
      </div>
      <div id="room-state">
        <h2>Room State</h2>
      </div>
    </div>
  </div>
`

setupRoomState(document.querySelector<HTMLDivElement>('#room-state')!)

log('Querying room-state')
browser.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
    if (tabs.length > 0) {
        const tabId = tabs[0].id
        log('Querying room-state for tab', tabId)
        sendMessage('query-room-state', {}, `content-script@${tabId}`)
    }
})
