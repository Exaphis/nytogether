import {
    allowWindowMessaging,
    onMessage,
    sendMessage,
} from 'webext-bridge/content-script'
import { injectScript } from 'wxt/client'

const log = (message: string, ...args: any[]) => {
    console.log(`[NYTogether/content] ${message}`, ...args)
}

export default defineContentScript({
    matches: ['*://*.nytimes.com/crosswords*'],
    main() {
        // allow the injected script to send messages to the background page
        allowWindowMessaging('nytogether')

        onMessage('room-state', (message) => {
            log('Forwarding room-state message:', message)
            // forward the message to the popup
            sendMessage('room-state', message.data, 'popup')
        })

        onMessage('query-room-state', (message) => {
            log('Querying room-state')
            sendMessage('query-room-state', {}, 'window')
        })

        log('Injecting content-main-world.js')
        injectScript('/content-main-world.js', { keepInDom: true })
    },
})
