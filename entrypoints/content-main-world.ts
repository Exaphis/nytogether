import { findReact } from '@/utils'
import { sendMessage, setNamespace, onMessage } from 'webext-bridge/window'
import type {
    NYTUser,
    NYTStoreState,
    RoomGuesses,
    Cell,
} from '@/lib/nyt-interfaces'

const log = (message: string, ...args: any[]) => {
    console.log(`[NYTogether/content-main-world] ${message}`, ...args)
}

class GameState {
    private store: any
    private diffVersion: number = 0

    constructor(store: any) {
        log('Constructing GameState with store:', store)

        this.store = store
        store.dispatch({
            type: 'crossword/user/CHANGE_SETTING',
            payload: {
                nyTogetherDiffVersion: this.diffVersion,
            },
        })

        store.subscribe(() => {
            const state = store.getState()
            if (
                state.user.settings.nyTogetherDiffVersion !== this.diffVersion
            ) {
                log(
                    'Aborting state update: Diff version mismatch!',
                    state.user.settings.nyTogetherDiffVersion,
                    this.diffVersion
                )
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
                // if (state.toolbar.inPencilMode !== capsLockState) {
                //     this.store.dispatch({
                //         type: 'crossword/toolbar/TOGGLE_PENCIL_MODE',
                //     })
                // }

                // log('Setting cell', 1, state.cells[1].answer)
                // await this.setCell(1, {
                //     letter: 'HELLO',
                //     userId: '0',
                //     timestamp: 0,
                //     penciled: capsLockState,
                // })

                const board: RoomGuesses = {}
                for (const [cellId, cellData] of Object.entries(state.cells)) {
                    if (cellData.answer) {
                        board[parseInt(cellId)] = {
                            letter: cellData.answer,
                            userId: '0',
                            timestamp: 0,
                            penciled: capsLockState,
                        }
                    }
                }
                await this.setBoard(board)
            }
        }

        document.addEventListener('keydown', handleCapsLock)
        document.addEventListener('keyup', handleCapsLock)
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

        const waitForState = async (
            predicate: (state: NYTStoreState) => boolean,
            timeout: number = 1000
        ): Promise<NYTStoreState | null> => {
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

        this.diffVersion++
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

                await waitForState(
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

        this.store.dispatch({
            type: 'crossword/user/CHANGE_SETTING',
            payload: {
                nyTogetherDiffVersion: this.diffVersion,
            },
        })
    }

    setBoard(board: RoomGuesses) {
        const state = this.store.getState() as NYTStoreState
        if (state.user.settings.nyTogetherDiffVersion !== this.diffVersion) {
            log('Aborting setBoard: Diff version mismatch!')
            return
        }

        const diffCells: Record<number, Cell> = {}
        for (const [cellId, cell] of Object.entries(board) as [
            string,
            Cell
        ][]) {
            const cellIdNum = parseInt(cellId)
            if (state.cells[cellIdNum].guess !== cell.letter) {
                diffCells[cellIdNum] = cell
            }
        }

        log('Setting board:', diffCells)
        this.setCells(diffCells)
            .then(() => {
                log('Board set.')
            })
            .catch((err) => {
                log('Error setting board:', err)
            })
    }

    getState() {
        return this.store.getState()
    }
}

let globalState: GameState | null = null

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

    globalState = new GameState(store)
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

    onMessage('query-game-state', (message) => {
        log('Game state requested')
        if (!globalState) {
            return null
        }
        const state = globalState.getState()
        state.gameData = (window as any).gameData
        return state
    })

    onMessage('set-board', (message) => {
        log('Setting board:', message.data)
        globalState?.setBoard(message.data as unknown as RoomGuesses)
    })
})
