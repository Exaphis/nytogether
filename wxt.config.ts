import { defineConfig, defineRunnerConfig } from 'wxt'

// See https://wxt.dev/api/config.html
export default defineConfig({
    modules: ['@wxt-dev/module-react'],
    extensionApi: 'chrome',
    manifest: {
        web_accessible_resources: [
            {
                resources: ['/content-main-world.js'],
                matches: ['*://*.nytimes.com/*'],
            },
        ],
    },
    runner: {
        chromiumArgs: ['--user-data-dir=./.wxt/chrome-data'],
    },
})
