import { onMessage } from 'webext-bridge/background'

export default defineBackground(() => {
    console.log('Hello background!', { id: browser.runtime.id })

    onMessage('redeem', async (message) => {
        browser.tabs.create({
            url: 'https://www.nytimes.com/activate-access/access-code?access_code=b77295e7c59624db&source=access_code_redemption_lp:games&campaignId=8KU89',
        })
    })
})
