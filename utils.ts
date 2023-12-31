import { nanoid } from "nanoid"

export function findReact(dom, traverseUp = 0) {
  const key = Object.keys(dom).find((key) => {
    return (
      key.startsWith("__reactFiber$") || // react 17+
      key.startsWith("__reactInternalInstance$")
    ) // react <17
  })
  const domFiber = dom[key]
  if (domFiber == null) return null

  // react 16+
  const GetCompFiber = (fiber) => {
    let parentFiber = fiber.return
    while (typeof parentFiber.type == "string") {
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

function isStore(obj) {
  // heuristic to check if `obj` is a redux store
  return obj?.dispatch !== undefined
}

function deepGetStore(obj, depth = 0) {
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

export function findStore(state) {
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

let outstandingPromises: Map<string, (value: any) => void> = new Map()

export function customEventTrigger(window: Window, eventName: string, detail: any) {
  const event = new CustomEvent(`${eventName}-send`, {
    detail: {
      requestId: nanoid(),
      originalDetail: detail
    }
  })
  const promise = new Promise((resolve) => {
    outstandingPromises.set(event.detail.requestId, resolve)
  })

  window.addEventListener(`${eventName}-receive`, (event: CustomEvent) => {
    const { requestId, resp } = event.detail
    const resolve = outstandingPromises.get(requestId)
    resolve(resp)
    outstandingPromises.delete(requestId)
  })

  window.dispatchEvent(event)
  return promise
}

export function customEventListen(window: Window, eventName: string, callback: any) {
  window.addEventListener(`${eventName}-send`, (event: CustomEvent) => {
    const { requestId, originalDetail } = event.detail
    const resp = callback(originalDetail)
    const respEvent = new CustomEvent(`${eventName}-receive`, {
      detail: {
        requestId,
        resp
      }
    })
    window.dispatchEvent(respEvent)
  })
}