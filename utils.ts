export function findReact(dom: any, traverseUp = 0) {
    const key = Object.keys(dom).find((key) => {
        return (
            key.startsWith("__reactFiber$") || // react 17+
            key.startsWith("__reactInternalInstance$")
        ) // react <17
    })!
    const domFiber = dom[key]
    if (domFiber == null) return null

    // react 16+
    const GetCompFiber = (fiber: any) => {
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