import { findReact } from '@/utils'
import { sendMessage, setNamespace, onMessage } from 'webext-bridge/window'
import type { NYTUser, NYTStoreState } from '@/lib/nyt-interfaces'

const log = (message: string, ...args: any[]) => {
    console.log(`[NYTogether/content-main-world] ${message}`, ...args)
}

let globalStore: any = null

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

    let user = fiber.pendingProps.user as NYTUser
    log('User:', user)

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

function handleGameStore(elem: Element): boolean {
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

    store.subscribe(() => {
        log('Store changed:', store.getState())
        sendMessage('game-state', store.getState(), 'content-script')
    })

    globalStore = store
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

    // Add caps lock detection
    const handleCapsLock = (event: KeyboardEvent) => {
        if (event.code === 'CapsLock') {
            const capsLockState = event.getModifierState('CapsLock')
            log(`Caps Lock ${capsLockState ? 'ON' : 'OFF'}`)
            const state = globalStore?.getState() as NYTStoreState
            log(`Pencil mode: ${state.toolbar.inPencilMode}`)
            if (state.toolbar.inPencilMode !== capsLockState) {
                globalStore?.dispatch({
                    type: 'crossword/toolbar/TOGGLE_PENCIL_MODE',
                })
            }
        }
    }

    document.addEventListener('keydown', handleCapsLock)
    document.addEventListener('keyup', handleCapsLock)

    onMessage('query-game-state', (message) => {
        log('Game state requested')
        if (!globalStore) {
            return null
        }
        const state = globalStore.getState()
        state.gameData = (window as any).gameData
        return state
    })
})
