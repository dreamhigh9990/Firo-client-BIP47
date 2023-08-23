import { ucFirst } from 'lib/utils'
import { camelCase, snakeCase } from 'lodash'

export const getName = (namespace) => {
    const name = camelCase(namespace)
    const Name = name.charAt(0).toUpperCase() + name.slice(1)
    const NAME = snakeCase(namespace).toUpperCase()

    return {
        name,
        Name,
        NAME
    }
}

export const getTypeName = (name) => {
    return snakeCase(name).toUpperCase()
}

export const getId = (object) => {
    const { txid, index } = object

    if (!txid || index === undefined) {
        return null
    }

    return `${txid}-${index}`
}

export const formatDenominationPairs = function (denominations) {
    return Object.entries(denominations)
    // transform to [{denomination: '25', amount: 1}]
        .map((pair) => {
            const [ denomination, amount ] = pair

            return {
                denomination,
                amount,
                cost: Number(denomination) * amount
            }
        })
        .filter((denom) => denom.amount)
}

export const addConfirmationsToTransaction = function (tx, currentBlockHeight) {
    const { block } = tx
    const txConfirmations = currentBlockHeight && block ? (currentBlockHeight + 1) - block.height : 0

    return {
        ...tx,
        confirmations: txConfirmations,
        isConfirmed: !!txConfirmations
    }
}

export const stringToBool = function (value) {
    return value === '1'
}

export const boolToString = function (value) {
    return value ? '1' : '0'
}
