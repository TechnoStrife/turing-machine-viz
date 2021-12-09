'use strict'

const {TMSpecError} = require('./parser')
const examples = require('./examples')

/** @typedef {{[key: string]: ?{[key: string]: string} }} TransitionTable */
/**
 * omits null/undefined properties
 * @param {?string | Object<string>} symbol
 * @param {string} move
 * @param {?string} state
 * @returns {TMAction}
 */
/*
// case: halting state
            return null
 */
/**
 * @typedef {Object} TMSpec
 * @property {string} blank
 * @property {int} tapes
 * @property {string} 'start state'
 * @property {string} startState
 * @property {string} transform
 * @property synonyms
 * @property {TransitionTable} table
 * @property {VisTable} vis
 */
/*
input:
  - '>112211223111122111122312212223311222111123333111122211222331222111123333'
  - '>22'
  - '>;11;1111;11;1111;1111;'
 */

/*
input: 'abba' # try a, ab, bb, babab
blank: ' '
start state: start
table:
  start:
    a: {write: ' ', R: haveA}
    b: {write: ' ', R: haveB}
    ' ': accept # empty string
  haveA:
    [a,b]: R
    ' ': {L: matchA}
  haveB:
    [a,b]: R
    ' ': {L: matchB}
  matchA:
    a: {write: ' ', L: back} # same symbol at both ends
    b: reject
    ' ': accept # single symbol
  matchB:
    a: reject
    b: {write: ' ', L: back} # same symbol at both ends
    ' ': accept # single symbol
  back:
    [a,b]: L
    ' ': {R: start}
  accept:
  reject:
 */

/**
 * @param {TMSpec} spec
 * @returns {[TMSpec, PositionTable]}
 */
function universal_transform(spec, parseSpec) {
    if (spec.tapes !== 0)
        throw new TMSpecError('For universal transform tapes must be 1')

    let {sourceCode: uni, positionTable} = examples.get('universal');

    [uni] = parseSpec(uni, true)

    let symbols = []
    let states = []
    let final_states = []
    for (const from_state in spec.table) {
        if (!states.includes(from_state))
            states.push(from_state)
        if (spec.table[from_state] === null)
            final_states.push(from_state)
        for (const [comma_symbols, action] of Object.entries(spec.table[from_state] || {})) {
            for (const symbol of parseSymbolKey(comma_symbols)) {
                if (!symbols.includes(symbol))
                    symbols.push(symbol)

                if (action.state && !states.includes(action.state))
                    states.push(action.state)
                if (action.symbol && !symbols.includes(action.symbol[0]))
                    symbols.push(action.symbol[0])
            }
        }
    }
    symbols.sort()

    symbols = unary(symbols, spec.blank, '1')
    states = unary(states, spec.startState, '2')
    let move = {'R': '3', 'L': '33', 'H': '333', null: '333', undefined: '333'}

    let instructions = '>'
    let state_tape = '>' + states[spec.startState]
    let data_tape

    for (const from_state in spec.table) {
        for (const [comma_symbols, action] of Object.entries(spec.table[from_state] || {})) {
            for (const symbol of parseSymbolKey(comma_symbols)) {
                instructions += symbols[symbol]
                instructions += states[from_state]
                instructions += symbols[action.symbol && action.symbol[0] || symbol]
                instructions += states[action.state || from_state]
                if (final_states.includes(action.state))
                    instructions += '3333'
                else
                    instructions += move[action.move]
            }
        }
    }
    data_tape = Array.prototype.map.call(spec.input, symbol => symbols[symbol]).join(';')
    data_tape = '>;' + data_tape + ';'

    uni.input = [
        instructions,
        state_tape,
        data_tape,
    ]

    return [uni, positionTable]
}

function parseSymbolKey(key) {
    return key.split(',').reduce(function (acc, x) {
        if (x === '' && acc[acc.length - 1] === '') {
            acc[acc.length - 1] = ','
        } else {
            acc.push(x)
        }
        return acc
    }, [])
}

function unary(arr, first, code) {
    let res = {[first]: code}
    arr.splice(arr.indexOf(first), 1)
    for (const elem of arr) {
        code += code[0]
        res[elem] = code
    }
    return res
}


exports.transformations = {
    'universal': universal_transform,
}

