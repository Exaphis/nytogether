import { allowWindowMessaging } from 'webext-bridge/content-script'
import { injectScript } from 'wxt/client'

const log = (message: string, ...args: any[]) => {
    console.log(`[NYTogether/content] ${message}`, ...args)
}

export default defineContentScript({
    matches: ['*://*.nytimes.com/crosswords*'],
    main() {
        // allow the injected script to send messages to the background page
        allowWindowMessaging('nytogether')

        log('Injecting content-main-world.js')
        injectScript('/content-main-world.js', { keepInDom: true })
    },
})
