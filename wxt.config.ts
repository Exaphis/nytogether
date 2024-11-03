import { defineConfig } from 'wxt'

// See https://wxt.dev/api/config.html
export default defineConfig({
    extensionApi: 'chrome',
    manifest: {
        web_accessible_resources: [
            {
                resources: ['/content-main-world.js'],
                matches: ['*://*.nytimes.com/*'],
            },
        ],
    },
})
