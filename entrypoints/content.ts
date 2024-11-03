import { injectScript } from "wxt/client";

const log = (message: string, ...args: any[]) => {
    console.log(`[NYTogether/content] ${message}`, ...args);
};

export default defineContentScript({
    matches: ['*://*.nytimes.com/crosswords*'],
    main() {
        log('Injecting content-main-world.js');
        injectScript('/content-main-world.js', { keepInDom: true })
    },
});
