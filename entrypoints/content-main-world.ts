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
                    'Diff version mismatch!',
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

                for (const [cellId, cellData] of Object.entries(state.cells)) {
                    if (cellData.answer) {
                        log('Setting cell', cellId, cellData.answer)
                        await this.setCell(parseInt(cellId), {
                            letter: cellData.answer,
                            userId: '0',
                            timestamp: 0,
                            penciled: capsLockState,
                        })
                    }
                }
            }
        }

        document.addEventListener('keydown', handleCapsLock)
        document.addEventListener('keyup', handleCapsLock)
    }

    private async setCell(cellId: number, cellState: Cell) {
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

        this.diffVersion++
        const storeState = this.store.getState()
        if (storeState.status.isSolved) {
            log('Game is already solved!')
            return
        }

        const prevSelection = storeState.selection.cell
        const inPencilMode = storeState.toolbar.inPencilMode

        // TODO: restore rebus selection state (cursor position, selection if any)
        const inRebusMode = storeState.toolbar.inRebusMode
        const rebusContents = storeState.toolbar.rebusValue
        if (inRebusMode) {
            log('In rebus mode already!')
            const rebusInput = (await waitForElement(
                '#rebus-input'
            )) as HTMLInputElement
            // Save the change by calling the onBlur handler
            rebusInput.blur()
        }

        // First, select the cell to change
        this.store.dispatch({
            type: 'crossword/selection/SELECT_CELL',
            payload: {
                index: cellId,
            },
        })

        // Then, toggle pencil mode if needed
        if (cellState.penciled !== inPencilMode) {
            this.store.dispatch({
                type: 'crossword/toolbar/TOGGLE_PENCIL_MODE',
            })
        }

        // Then, enable rebus mode
        // Select the button with aria-label="Rebus"
        const rebusButton = document.querySelector(
            '[aria-label="Rebus"]'
        ) as HTMLButtonElement
        rebusButton.click()

        // Wait for the rebus input to appear
        const rebusInput = (await waitForElement(
            '#rebus-input'
        )) as HTMLInputElement
        log('Setting rebus input to', cellState.letter)
        triggerInputChange(rebusInput, cellState.letter)
        // Save the change by calling the onBlur handler
        rebusInput.blur()

        // Re-toggle pencil mode if we changed it
        if (cellState.penciled !== inPencilMode) {
            this.store.dispatch({
                type: 'crossword/toolbar/TOGGLE_PENCIL_MODE',
            })
        }

        // Restore the selected cell
        this.store.dispatch({
            type: 'crossword/selection/SELECT_CELL',
            payload: {
                index: prevSelection,
            },
        })

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

    setBoard(board: RoomGuesses) {}

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
})
