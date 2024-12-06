import { RoomState } from '@/lib/nyt-interfaces'
import { onMessage } from 'webext-bridge/background'
import aloneIconUrl from '@/assets/alone-48.png'
import inRoomIconUrl from '@/assets/together-48.png'

export default defineBackground(() => {
    console.log('Hello background!', { id: browser.runtime.id })

    onMessage('redeem', async (message) => {
        browser.tabs.create({
            url: 'https://www.nytimes.com/activate-access/access-code?access_code=b77295e7c59624db&source=access_code_redemption_lp:games&campaignId=8KU89',
        })
    })

    onMessage('room-state', async (message) => {
        console.log('Received room state:', message)
        const tabId = message.sender.tabId
        if (!tabId) {
            console.error('No tab id in message sender')
            return
        }

        console.log('Sent from tab id:', tabId)
        const roomState = message.data as unknown as RoomState

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
})
