import { onMessage } from 'webext-bridge/background'

export default defineBackground(() => {
    console.log('Hello background!', { id: browser.runtime.id })

    onMessage('redeem', async (message) => {
        browser.tabs.create({
            url: 'https://nytimes.com/subscription/redeem/crossword?campaignId=8KU89&gift_code=b77295e7c59624db',
        })
    })
})
