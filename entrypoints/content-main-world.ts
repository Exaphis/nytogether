import { sendMessage, setNamespace, onMessage } from 'webext-bridge/window'
import type { NYTStoreState, NYTCell } from '@/lib/nyt-interfaces'
import { Mutex, MutexInterface } from 'async-mutex'

const log = (message: string, ...args: any[]) => {
    console.log(`[NYTogether/content-main-world] ${message}`, ...args)
}

const error = (message: string, ...args: any[]) => {
    console.error(`[NYTogether/content-main-world] ${message}`, ...args)
}

// https://stackoverflow.com/q/47166101
function findReact(dom: any, traverseUp = 0) {
    const key = Object.keys(dom).find((key) => {
        return (
            key.startsWith('__reactFiber$') || // react 17+
            key.startsWith('__reactInternalInstance$')
        ) // react <17
    })!
    const domFiber = dom[key]
    if (domFiber == null) return null

    // react 16+
    const GetCompFiber = (fiber: any) => {
        let parentFiber = fiber.return
        while (typeof parentFiber.type == 'string') {
            parentFiber = parentFiber.return
        }
        return parentFiber
    }
    let compFiber = GetCompFiber(domFiber)
    for (let i = 0; i < traverseUp; i++) {
        compFiber = GetCompFiber(compFiber)
    }
    return compFiber
}

class GameState {
    private store: any
    private prevCells: { [cell: number]: NYTCell } = {}
    private storeMutex: MutexInterface = new Mutex()

    constructor(store: any) {
        log('Constructing GameState with store:', store)

        this.store = store
        const state = store.getState() as NYTStoreState
        this.prevCells = state.cells
        sendMessage('game-state', store.getState(), 'content-script')

        store.subscribe(() => {
            const state = store.getState()
            const diffCells: Record<number, NYTCell> = {}
            for (const [cellId, cell] of Object.entries(state.cells) as [
                string,
                NYTCell
            ][]) {
                const cellIdNum = parseInt(cellId)
                if (this.prevCells[cellIdNum] !== cell) {
                    diffCells[cellIdNum] = cell
                }
            }

            this.prevCells = state.cells

            if (this.storeMutex.isLocked()) {
                log('Store updated but mutex is locked, skipping updates')
                return
            }
            log('Store changed', state, 'Different cells:', diffCells)

            if (Object.keys(diffCells).length > 0) {
                sendMessage('cell-update', diffCells, 'content-script')
            }
            sendMessage('game-state', state, 'content-script')
        })

        // Add caps lock detection
        const handleCapsLock = async (event: KeyboardEvent) => {
            if (event.code === 'CapsLock') {
                const capsLockState = event.getModifierState('CapsLock')
                log(`Caps Lock ${capsLockState ? 'ON' : 'OFF'}`)
                const state = this.store.getState() as NYTStoreState
                log(`Pencil mode: ${state.toolbar.inPencilMode}`)
                if (state.toolbar.inPencilMode !== capsLockState) {
                    this.store.dispatch({
                        type: 'crossword/toolbar/TOGGLE_PENCIL_MODE',
                    })
                }
            }
        }

        document.addEventListener('keydown', handleCapsLock)
        document.addEventListener('keyup', handleCapsLock)
    }

    private async waitForState(
        predicate: (state: NYTStoreState) => boolean,
        timeout: number = 1000
    ): Promise<NYTStoreState | null> {
        const result = Promise.race([
            new Promise<NYTStoreState>((resolve) => {
                // Check current state first
                const currentState = this.store.getState()
                if (predicate(currentState)) {
                    resolve(currentState)
                    return
                }

                // Set up subscription to store
                const unsubscribe = this.store.subscribe(() => {
                    const state = this.store.getState()
                    if (predicate(state)) {
                        unsubscribe()
                        resolve(state)
                    }
                })
            }),
            new Promise<null>((resolve) => {
                setTimeout(() => resolve(null), timeout)
            }),
        ])
        if (result === null) {
            throw new Error('Timeout waiting for state')
        }
        return result
    }

    private triggerInputChange(node: HTMLInputElement, inputValue: string) {
        log('Setting input value', node, inputValue)

        // https://stackoverflow.com/a/46012210/6686559
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
        )?.set
        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(node, inputValue)
        }

        var ev2 = new Event('input', { bubbles: true })
        node.dispatchEvent(ev2)
    }

    private async waitForElement(
        selector: string,
        timeout: number = 1000
    ): Promise<Element> {
        const result = await Promise.race([
            new Promise<Element>((resolve) => {
                const observer = new MutationObserver((mutations, obs) => {
                    const input = document.querySelector(selector)
                    if (input) {
                        obs.disconnect()
                        resolve(input)
                    }
                })

                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                })

                // Also check immediately in case it already exists
                const input = document.querySelector(selector)
                if (input) {
                    observer.disconnect()
                    resolve(input)
                }
            }),
            new Promise<null>((resolve) => {
                setTimeout(() => resolve(null), timeout)
            }),
        ])
        if (result === null) {
            throw new Error(`Element ${selector} not found`)
        }
        return result
    }

    public async setCell(cellId: number, cell: NYTCell) {
        const storeState = this.store.getState()
        if (storeState.status.isSolved) {
            log('Game is already solved!')
            return
        }
        if (
            storeState.cells[cellId].guess === cell.guess &&
            storeState.cells[cellId].penciled === cell.penciled
        ) {
            log('Cell already set:', cellId, cell)
            return
        }
        log('Setting cell:', cellId, cell)

        this.storeMutex.runExclusive(async () => {
            const prevSelection = storeState.selection.cell
            const inPencilMode = storeState.toolbar.inPencilMode
            const inRebusMode = storeState.toolbar.inRebusMode
            const rebusContents = storeState.toolbar.rebusValue

            const rebusButton = document.querySelector(
                '[aria-label="Rebus"]'
            ) as HTMLButtonElement

            // Save rebus state if needed
            if (inRebusMode) {
                const rebusInput = (await this.waitForElement(
                    '#rebus-input'
                )) as HTMLInputElement
                rebusInput.blur()
            }

            const changePencilMode = cell.penciled !== inPencilMode
            if (changePencilMode) {
                this.store.dispatch({
                    type: 'crossword/toolbar/TOGGLE_PENCIL_MODE',
                })
            }

            this.store.dispatch({
                type: 'crossword/selection/SELECT_CELL',
                payload: { index: cellId },
            })

            rebusButton.click()
            const rebusInput = (await this.waitForElement(
                '#rebus-input'
            )) as HTMLInputElement
            this.triggerInputChange(rebusInput, cell.guess)
            rebusButton.click() // confirm input

            await this.waitForState(
                (state) =>
                    state.cells[cellId].guess === cell.guess &&
                    state.cells[cellId].penciled === cell.penciled
            )

            // Restore pencil mode if we changed it
            if (changePencilMode) {
                this.store.dispatch({
                    type: 'crossword/toolbar/TOGGLE_PENCIL_MODE',
                })
            }

            // Restore selection
            this.store.dispatch({
                type: 'crossword/selection/SELECT_CELL',
                payload: {
                    index: prevSelection,
                },
            })

            // Restore rebus state if needed
            if (inRebusMode) {
                rebusButton.click()
                const rebusInput = (await this.waitForElement(
                    '#rebus-input'
                )) as HTMLInputElement
                this.triggerInputChange(rebusInput, rebusContents)
            }
        })
    }

    getState() {
        return this.store.getState()
    }
}

let globalState: GameState | null = null

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

    globalState = new GameState(store)
    return true
}

function observeElement(selector: string, handler: (elem: Element) => boolean) {
    function onMutation() {
        const element = document.querySelector(selector)
        if (element && handler(element)) {
            observer.disconnect()
        }
    }

    const observer = new MutationObserver(onMutation)

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    })

    onMutation()
}

function initialize() {
    if (globalState) {
        return
    }

    try {
        setNamespace('nytogether')
    } catch (err) {}

    log('Setting up observers...')

    observeElement('main', handleGameStore)

    onMessage('query-game-state', (message) => {
        log('Game state requested')
        if (!globalState) {
            error('globalState is not initialized')
            return null
        }
        const state = globalState.getState()
        state.gameData = (window as any).gameData
        return state
    })

    onMessage('set-cell', async (message) => {
        log('Setting cell:', message.data)
        await globalState?.setCell(message.data.cellId, message.data.cell)
    })

    log('Initialized.')
}

export default defineUnlistedScript(() => {
    initialize()

    // Re-run setup on navigation because this function may not be called
    // on page navigation (since NYT Games is an SPA)
    const navigationObserver = new MutationObserver((mutations) => {
        initialize()
    })
    navigationObserver.observe(document.body, {
        childList: true,
        subtree: true,
    })
})
