import { RoomState, NYTStoreState } from '@/lib/nyt-interfaces'
import { onMessage, sendMessage } from 'webext-bridge/background'
import aloneIconUrl from '@/assets/alone-48.png'
import inRoomIconUrl from '@/assets/together-48.png'
import { browser, Runtime } from 'wxt/browser'

export default defineBackground(() => {
    const tabPort = new Map<number, Runtime.Port>()

    onMessage('room-state', async (message) => {
        const tabId = message.sender.tabId
        if (!tabId) {
            console.error('No tab id in message sender')
            return
        }

        console.log('Received room state from tab id:', tabId)
        const roomState = message.data

        tabPort.get(tabId)?.postMessage({
            type: 'room-state',
            data: roomState,
        })

        try {
            if (roomState) {
                await browser.action.setIcon({
                    path: inRoomIconUrl,
                    tabId,
                })
                await browser.action.setBadgeText({
                    text: Object.keys(roomState.members).length.toString(),
                    tabId,
                })
            } else {
                await browser.action.setBadgeText({
                    text: null,
                    tabId,
                })
                await browser.action.setIcon({
                    path: aloneIconUrl,
                    tabId,
                })
            }
        } catch (error) {
            console.error('Error setting icon or badge text:', error)
        }
    })

    onMessage('game-state', async (message) => {
        const tabId = message.sender.tabId
        if (!tabId) {
            console.error('No tab id in message sender')
            return
        }

        console.log('Received game state from tab id:', tabId)

        tabPort.get(tabId)?.postMessage({
            type: 'game-state',
            data: message.data,
        })
    })

    browser.runtime.onConnect.addListener((port) => {
        if (port.name.startsWith('nytogether-popup@')) {
            const tabId = parseInt(port.name.split('@')[1])

            console.log('Received popup connection from', tabId)
            tabPort.set(tabId, port)

            sendMessage('query-room-state', null, `content-script@${tabId}`)
            sendMessage('query-game-state', null, `content-script@${tabId}`)

            port.onDisconnect.addListener((port) => {
                console.log('Popup disconnected from', tabId)
                tabPort.delete(tabId)
            })
        }
    })
})
