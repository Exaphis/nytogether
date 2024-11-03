import { findReact } from '@/utils'
import { sendMessage, setNamespace } from 'webext-bridge/window'

const log = (message: string, ...args: any[]) => {
    console.log(`[NYTogether/content-main-world] ${message}`, ...args)
}

interface NYTUser {
    entitlement: string
    hasDigi: boolean
    hasHd: boolean
    hasXwd: boolean
    inShortzMode: boolean
    isFreeTrial: boolean
    isLoggedIn: boolean
    regiId: string
}

function isNYTUser(user: any): user is NYTUser {
    return (
        typeof user === 'object' &&
        user !== null &&
        'entitlement' in user &&
        typeof user.entitlement === 'string' &&
        'hasDigi' in user &&
        typeof user.hasDigi === 'boolean' &&
        'hasHd' in user &&
        typeof user.hasHd === 'boolean' &&
        'hasXwd' in user &&
        typeof user.hasXwd === 'boolean' &&
        'inShortzMode' in user &&
        typeof user.inShortzMode === 'boolean' &&
        'isFreeTrial' in user &&
        typeof user.isFreeTrial === 'boolean' &&
        'isLoggedIn' in user &&
        typeof user.isLoggedIn === 'boolean' &&
        'regiId' in user &&
        typeof user.regiId === 'string'
    )
}

const handleRedeem = (elem: Element): boolean => {
    // Open the redeem page if the user is logged in and does not have crossword access.
    log('Found element:', elem)
    const fiber = findReact(elem)
    log('Fiber:', fiber)
    if (fiber === null) {
        return false
    }
    log('Fiber user:', fiber.pendingProps.user)
    if (!fiber.pendingProps.user) {
        return false
    }

    // cast user to NYTUser and verify the schema
    if (!isNYTUser(fiber.pendingProps.user)) {
        return false
    }

    let user = fiber.pendingProps.user as NYTUser
    log('User is valid:', user)

    if (!user.isLoggedIn) {
        log('User is not logged in')
        return false
    }

    log('User has crossword access:', user.hasXwd)
    if (!user.hasXwd) {
        log('User does not have crossword access. Opening redeem page.')
        sendMessage('redeem', {}, 'background')
    }

    return true
}

function observeElement(selector: string, handler: (elem: Element) => boolean) {
    const observer = new MutationObserver((mutations) => {
        const element = document.querySelector(selector)
        if (element && handler(element)) {
            observer.disconnect()
        }
    })

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    })
}

export default defineUnlistedScript(() => {
    log('Initialized.')
    setNamespace('nytogether')

    observeElement('#hub-root > div.hub-welcome', handleRedeem)
})
