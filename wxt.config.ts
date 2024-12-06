import { defineConfig } from 'wxt'

// See https://wxt.dev/api/config.html
export default defineConfig({
    modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
    extensionApi: 'chrome',
    manifest: {
        name: 'NYTogether',
        web_accessible_resources: [
            {
                resources: ['/content-main-world.js'],
                matches: ['*://*.nytimes.com/*'],
            },
        ],
        permissions: ['storage'],
    },
    runner: {
        chromiumArgs: ['--user-data-dir=./.wxt/chrome-data'],
    },
})
