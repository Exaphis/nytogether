import { findReact } from "@/utils";

const log = (message: string, ...args: any[]) => {
    console.log(`[NYTogether/content-main-world] ${message}`, ...args);
};

const handleUserInit = (elem: Element): boolean => {
    log('Found element:', elem)
    const fiber = findReact(elem)
    log('Fiber:', fiber)
    if (fiber === null) {
        return false
    }

    return true;
}

export default defineUnlistedScript(() => {
    log('Initialized.');

    const observer = new MutationObserver((mutations) => {
        const element = document.querySelector('#hub-root > div.hub-welcome');
        if (element && handleUserInit(element)) {
            observer.disconnect();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})
