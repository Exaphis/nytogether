import { sendMessage, setNamespace, onMessage } from 'webext-bridge/window'
import type { NYTStoreState, RoomGuesses, Cell } from '@/lib/nyt-interfaces'

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
    private updating: boolean = false

    constructor(store: any) {
        log('Constructing GameState with store:', store)

        this.store = store
        const state = store.getState()
        if (state.transient.isSynced) {
            sendMessage('game-state', store.getState(), 'content-script')
        }

        store.subscribe(() => {
            const state = store.getState()
            if (!state.transient.isSynced) {
                log('Aborting state update: store.transient.isSynced is false')
                return
            }
            if (this.updating) {
                log('Aborting state update: currently updating')
                return
            }

            log('Store changed:', state)
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

    private async setCells(cellUpdates: Record<number, Cell>) {
        function triggerInputChange(
            node: HTMLInputElement,
            inputValue: string
        ) {
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

        async function waitForElement(
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

        const storeState = this.store.getState()
        if (storeState.status.isSolved) {
            log('Game is already solved!')
            return
        }

        const prevSelection = storeState.selection.cell
        const inPencilMode = storeState.toolbar.inPencilMode
        const inRebusMode = storeState.toolbar.inRebusMode
        const rebusContents = storeState.toolbar.rebusValue

        const rebusButton = document.querySelector(
            '[aria-label="Rebus"]'
        ) as HTMLButtonElement

        // Save rebus state if needed
        if (inRebusMode) {
            const rebusInput = (await waitForElement(
                '#rebus-input'
            )) as HTMLInputElement
            rebusInput.blur()
        }
        // Group cells by pencil state to minimize pencil mode toggles
        const penciledCells: Record<number, Cell> = {}
        const unpenciledCells: Record<number, Cell> = {}

        for (const [cellId, cell] of Object.entries(cellUpdates)) {
            const numericCellId = parseInt(cellId)
            if (cell.penciled) {
                penciledCells[numericCellId] = cell
            } else {
                unpenciledCells[numericCellId] = cell
            }
        }

        let currPencilMode = inPencilMode

        const fillCells = async (
            cells: Record<number, Cell>,
            penciled: boolean
        ) => {
            if (Object.keys(cells).length === 0) return

            if (currPencilMode !== penciled) {
                this.store.dispatch({
                    type: 'crossword/toolbar/TOGGLE_PENCIL_MODE',
                })
                currPencilMode = penciled
            }

            for (const [cellId, cell] of Object.entries(cells)) {
                this.store.dispatch({
                    type: 'crossword/selection/SELECT_CELL',
                    payload: { index: parseInt(cellId) },
                })

                rebusButton.click()
                const rebusInput = (await waitForElement(
                    '#rebus-input'
                )) as HTMLInputElement
                triggerInputChange(rebusInput, cell.letter)
                rebusButton.click() // confirm input

                await this.waitForState(
                    (state) =>
                        state.cells[parseInt(cellId)].guess.toUpperCase() ===
                        cell.letter.toUpperCase()
                )
            }
        }

        await fillCells(penciledCells, true)
        await fillCells(unpenciledCells, false)

        // Restore pencil mode if we changed it
        if (currPencilMode !== inPencilMode) {
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
            const rebusInput = (await waitForElement(
                '#rebus-input'
            )) as HTMLInputElement
            triggerInputChange(rebusInput, rebusContents)
        }
    }

    async setBoard(board: RoomGuesses) {
        const state = this.store.getState() as NYTStoreState
        if (this.updating) {
            log('Aborting setBoard: currently updating')
            return
        }
        this.updating = true

        const diffCells: Record<number, Cell> = {}
        for (const [cellId, cell] of Object.entries(board) as [
            string,
            Cell
        ][]) {
            const cellIdNum = parseInt(cellId)
            if (
                state.cells[cellIdNum].guess !== cell.letter ||
                state.cells[cellIdNum].penciled !== cell.penciled
            ) {
                diffCells[cellIdNum] = cell
            }
        }

        log('Setting board:', diffCells)
        await this.setCells(diffCells)

        // Wait for all state updates to finish to avoid
        // a feedback loop
        await this.waitForState((state) => {
            for (const [cellId, cell] of Object.entries(diffCells) as [
                string,
                Cell
            ][]) {
                const cellIdNum = parseInt(cellId)
                if (
                    state.cells[cellIdNum].guess !== cell.letter ||
                    state.cells[cellIdNum].penciled !== cell.penciled
                ) {
                    return false
                }
            }
            return true
        }, 1000)
        this.updating = false
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

    onMessage('set-board', async (message) => {
        log('Setting board:', message.data)
        await globalState?.setBoard(message.data as unknown as RoomGuesses)
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
