export interface NYTUser {
    entitlement: string
    hasDigi: boolean
    hasHd: boolean
    hasXwd: boolean
    inShortzMode: boolean
    isFreeTrial: boolean
    isLoggedIn: boolean
    regiId: string
}

export interface NYTStoreState {
    cells: [
        {
            checked: boolean
            clues: [number]
            confirmed: boolean
            guess: string
            index: number
            modified: boolean
            penciled: boolean
            revealed: boolean
            type: number
        }
    ]
    clues: [
        {
            alternativeAriaLabelText: string
            cells: [number]
            direction: 'Across' | 'Down'
            index: number
            isImageClue: boolean
            label: string
            list: number
            next: number
            prev: number
            text: string
            unfilledCount: number
        }
    ]
    puzzle: {
        data: {
            meta: {
                copyright: string
                editor: string
                id: number
                publicationDate: string
                publishStream: string
            }
        }
        error: any
        hasLoaded: boolean
    }
    toolbar: {
        inPencilMode: boolean
        inRebusMode: boolean
        rebusValue: string
    }
    status: {
        autocheckEnabled: boolean
        blankCells: number
        currentProgress: number
        incorrectCells: number
        isFilled: boolean
        isSolved: boolean
    }
}
