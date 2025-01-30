import { defineConfig } from 'wxt'

// See https://wxt.dev/api/config.html
export default defineConfig({
    modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
    extensionApi: 'chrome',
    manifest: ({ manifestVersion }) => ({
        name: 'NYTogether',
        web_accessible_resources: [
            {
                resources: ['/content-main-world.js'],
                matches: ['*://*.nytimes.com/*'],
            },
        ],
        permissions:
            manifestVersion === 3
                ? ['storage']
                : ['storage', 'https://*.googleapis.com/*'],
        host_permissions:
            manifestVersion === 3 ? ['https://*.googleapis.com/*'] : [],
    }),
    runner: {
        chromiumArgs: ['--user-data-dir=./.wxt/chrome-data'],
    },
})
