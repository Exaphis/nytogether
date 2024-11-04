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
    log('Found redeem element:', elem)
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

function isStore(obj: any): boolean {
    // heuristic to check if `obj` is a redux store
    return obj?.dispatch !== undefined
}

function deepGetStore(obj: any, depth = 0): any | null {
    // given an object, traverse it to find a redux store
    // if none is found, return null
    if (isStore(obj)) {
        return obj
    }
    if (depth > 10) {
        return null
    }
    if (Array.isArray(obj)) {
        for (const elem of obj) {
            const store = deepGetStore(elem, depth + 1)
            if (store !== null) {
                return store
            }
        }
    }
    return null
}

function findStore(state: any): any | null {
    // given the memoizedState of a react component,
    // traverse the linked list to find the store
    let current = state
    while (current !== null) {
        let store = deepGetStore(current.memoizedState)
        if (store !== null) {
            return store
        }

        current = current.next
    }
    return null
}

const handleGameStore = (elem: Element): boolean => {
    // Try to get the Redux store in the crossword page.
    log('Found element:', elem)
    const fiber = findReact(elem)
    log('Fiber:', fiber)
    if (fiber === null) {
        return false
    }
    log('Fiber state:', fiber.memoizedState)
    const store = findStore(fiber.memoizedState)
    log('Found store:', store)
    if (store === null) {
        return false
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
    observeElement('main', handleGameStore)
})
