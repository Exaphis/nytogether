/**
 * Useful functions for use in the browser console for development.
 */

function bfsSearchNestedObject(obj, searchString, maxDepth = 1000) {
    // Initialize the queue with the root object, starting at depth 0 and an empty path
    const queue = [{ currentObj: obj, path: [], depth: 0 }]

    // Process each item in the queue until it's empty
    while (queue.length > 0) {
        const { currentObj, path, depth } = queue.shift()

        // Stop the search if the max depth is exceeded
        if (depth > maxDepth) {
            return null
        }

        // Iterate over each key in the current object
        for (let key in currentObj) {
            const value = currentObj[key]
            const currentPath = path.concat(key) // Update the path

            // If the value is a string and matches the search string, return the path
            if (typeof value === 'string' && value === searchString) {
                return currentPath
            }

            // If the value is an object, add it to the queue for further exploration
            if (typeof value === 'object' && value !== null) {
                queue.push({
                    currentObj: value,
                    path: currentPath,
                    depth: depth + 1,
                })
            }
        }
    }

    // If the string is not found, return null
    return null
}

// Example usage:
const data = {
    a: {
        b: {
            c: 'hello',
            d: {
                e: 'world',
            },
        },
    },
}

console.log(bfsSearchNestedObject(data, 'hello')) // Output: ['a', 'b', 'c']
console.log(bfsSearchNestedObject(data, 'world')) // Output: ['a', 'b', 'd', 'e']
console.log(bfsSearchNestedObject(data, 'not found')) // Output: null
