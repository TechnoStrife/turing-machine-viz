'use strict'

let TM = require('./TuringMachine'),
    jsyaml = require('js-yaml'),
    _ = require('lodash')

/**
 * Thrown when parsing a string that is valid as YAML but invalid
 * as a machine specification.
 *
 * Examples: unrecognized synonym, no start state defined,
 * transitioning to an undeclared state.
 *
 * A readable message is generated based on the details (if any) provided.
 * @param {string} reason  A readable error code.
 *   As an error code, this should be relatively short and not include runtime values.
 * @param {?Object} details Optional details. Possible keys:
 *                          problemValue, state, key, synonym, info, suggestion
 */
function TMSpecError(reason, details={}) {
    this.name = 'TMSpecError'
    this.stack = (new Error()).stack

    this.reason = reason
    this.details = details || {}
}

TMSpecError.prototype = Object.create(Error.prototype)
TMSpecError.prototype.constructor = TMSpecError

// generate a formatted description in HTML
Object.defineProperty(TMSpecError.prototype, 'message', {
    get: function () {
        let header = this.reason
        let details = this.details

        function code(str) {
            return '<code>' + str + '</code>'
        }

        function showLoc(state, symbol, synonym) {
            if (state != null) {
                if (symbol != null) {
                    return ' in the transition from state ' + code(state) + ' and symbol ' + code(
                        symbol)
                } else {
                    return ' for state ' + code(state)
                }
            } else if (synonym != null) {
                return ' in the definition of synonym ' + code(synonym)
            }
            return ''
        }

        let problemValue = details.problemValue ? ' ' + code(details.problemValue) : ''
        let location = showLoc(details.state, details.symbol, details.synonym)
        let sentences = [
            '<strong>' + header + problemValue + '</strong>' + location
            , details.info, details.suggestion,
        ]
            .filter(_.identity)
            .map(function (s) {
                return s + '.'
            })
        if (location) {
            sentences.splice(1, 0, '<br>')
        }
        return sentences.join(' ')
    },
    enumerable: true,
})

/** @typedef {{[key: string]: ?{[key: string]: string} }} TransitionTable */
/**
 * @typedef {Object} TMSpec
 * @property {string} blank
 * @property {int} tapes
 * @property {string} 'start state'
 * @property {string} startState
 * @property synonyms
 * @property {TransitionTable} table
 */

/**
 * IDEA: check with flow (flowtype.org)
 * @throws {YAMLException} on YAML syntax error
 * @throws {TMSpecError} for an invalid spec
 *          (eg. no start state, transitioning to an undefined state)
 * @param {string} str
 * @param {boolean} allowTapes
 * @returns {{startState}|*}
 */
function parseSpec(str, allowTapes = false) {
    /** @type {TMSpec|null} obj */
    let obj = jsyaml.safeLoad(str)
    // check for required object properties.
    // auto-convert .blank and 'start state' to string, for convenience.
    if (obj == null) {
        throw new TMSpecError(
            'The document is empty',
            {
                info: 'Every Turing machine requires a <code>blank</code> tape symbol,' +
                    ' a <code>start state</code>, and a transition <code>table</code>',
            },
        )
    }
    let detailsForBlank = {
        suggestion: "Examples: <code>blank: ' '</code>, <code>blank: '0'</code>",
    }
    if (obj.blank == null) {
        throw new TMSpecError('No blank symbol was specified', detailsForBlank)
    }
    obj.blank = String(obj.blank)
    if (obj.blank.length !== 1) {
        throw new TMSpecError('The blank symbol must be a string of length 1', detailsForBlank)
    }

    if (allowTapes) {
        if (obj.tapes === undefined)
            obj.tapes = 1
        if (!Number.isInteger(obj.tapes)) {
            throw new TMSpecError(
                'The number of tapes must be an integer',
                {problemValue: typeof obj.tapes},
            )
        }
        if (obj.tapes > 9) {
            throw new TMSpecError('Why would you need more than 9 tapes?')
        }
    } else {
        if (obj.tapes !== undefined && obj.tapes !== 1) {
            throw new TMSpecError('This Turing machine has only 1 tape')
        }
        obj.tapes = 0
    }

    obj.startState = obj['start state']
    delete obj['start state']
    if (obj.startState == null) {
        throw new TMSpecError(
            'No start state was specified',
            {suggestion: 'Assign one using <code>start state: </code>'},
        )
    }

    obj.startState = String(obj.startState)
    // parse synonyms and transition table
    checkTableType(obj.table) // parseSynonyms assumes a table object
    let synonyms = parseSynonyms(obj.synonyms, obj.table, obj.tapes)
    obj.table = parseTable(synonyms, obj.table, obj.tapes)
    // check for references to non-existent states
    if (!(obj.startState in obj.table)) {
        throw new TMSpecError('The start state has to be declared in the transition table')
    }

    return obj
}

function checkTableType(val) {
    if (val == null) {
        throw new TMSpecError(
            'Missing transition table',
            {suggestion: 'Specify one using <code>table:</code>'},
        )
    }
    if (typeof val !== 'object') {
        throw new TMSpecError(
            'Transition table has an invalid type',
            {
                problemValue: typeof val,
                info: 'The transition table should be a nested mapping from states to symbols to instructions',
            },
        )
    }
}

/**
 * @throws {TMSpecError}
 * @param {any} val
 * @param {TransitionTable} table
 * @param {int} tapes
 * @returns {?SynonymMap}
 */
function parseSynonyms(val, table, tapes) {
    if (val == null) {
        return null
    }
    if (typeof val !== 'object') {
        throw new TMSpecError(
            'Synonyms table has an invalid type',
            {
                problemValue: typeof val,
                info: 'Synonyms should be a mapping from string abbreviations to instructions'
                    + ' (e.g. <code>accept: {R: accept}</code>)',
            },
        )
    }
    return _.mapValues(val, function (actionVal, key) {
        try {
            return parseInstruction(null, table, actionVal, tapes)
        } catch (e) {
            if (e instanceof TMSpecError) {
                e.details.synonym = key
                if (e.reason === 'Unrecognized string') {
                    e.details.info = 'Note that a synonym cannot be defined using another synonym'
                }
            }
            throw e
        }
    })
}

/**
 * @param {?SynonymMap} synonyms
 * @param {TransitionTable} val
 * @param {number} tapes
 * @returns {TransitionTable}
 */
function parseTable(synonyms, val, tapes) {
    return _.mapValues(val, function (stateObj, state) {
        if (stateObj == null) {
            // case: halting state
            return null
        }
        if (typeof stateObj !== 'object') {
            throw new TMSpecError(
                'State entry has an invalid type',
                {
                    problemValue: typeof stateObj, state: state,
                    info: 'Each state should map symbols to instructions. An empty map signifies a halting state.',
                },
            )
        }
        return _.mapValues(stateObj, function (actionVal, symbol) {
            try {
                return parseInstruction(synonyms, val, actionVal, tapes)
            } catch (e) {
                if (e instanceof TMSpecError) {
                    e.details.state = state
                    e.details.symbol = symbol
                }
                throw e
            }
        })
    })
}

// omits null/undefined properties
// (?string, direction, ?string) -> {symbol?: string, move: direction, state?: string}
function makeInstruction(symbol, move, state) {
    return Object.freeze(_.omitBy(
        {symbol: symbol, move: move, state: state},
        function (x) {
            return x == null
        },
    ))
}

function checkTarget(table, instruct) {
    if (instruct.state != null && !(instruct.state in table)) {
        throw new TMSpecError('Undeclared state', {
            problemValue: instruct.state,
            suggestion: 'Make sure to list all states in the transition table and define their transitions (if any)',
        })
    }
    return instruct
}
/**
 * @typedef {{[tape: string]: string}} TapeDict
 */
/**
 * @typedef {Object} MTTMAction
 * @property {string|null} state
 * @property {TapeDict} move
 * @property {TapeDict} write
 */
/**
 * @typedef {Object} STTMAction
 * @property {?string} state
 * @property {?string} move
 * @property {?string} write
 */
/** @typedef {STTMAction|MTTMAction} TMAction */
/**
 * @typedef {{[key: string]: TMAction}} SynonymMap
 */

/**
 * @throws {TMSpecError} if the target state is undeclared (not in the table)
 * @param {?SynonymMap} synonyms
 * @param {TransitionTable} table
 * @param {string | Object} val
 * @param {int} tapes
 * @return Readonly<TMAction>
 */
function parseInstruction(synonyms, table, val, tapes) {
    return checkTarget(table, function () {
        switch (typeof val) {
            case 'string':
                return parseInstructionString(synonyms, val, tapes)
            case 'object':
                return parseInstructionObject(val)
            default:
                throw new TMSpecError(
                    'Invalid instruction type',
                    {
                        problemValue: typeof val,
                        info: 'An instruction can be a string '
                            + '(a direction <code>L</code>/<code>R</code> or a synonym)'
                            + ' or a mapping (examples: <code>{R: accept}</code>, '
                            + '<code>{write: \' \', L: start}</code>)',
                    },
                )
        }
    }())
}

const moveLeft = Object.freeze({move: TM.MoveHead.left})
const moveRight = Object.freeze({move: TM.MoveHead.right})

// case: direction or synonym
/**
 *
 * @param {?SynonymMap} synonyms
 * @param {string} val
 * @param {int} tapes
 * @returns {Readonly<TMAction>}
 */
function parseInstructionString(synonyms, val, tapes) {
    if (tapes) {
        if (synonyms && synonyms[val]) {
            return synonyms[val]
        }
        let state = val.match(/^([a-zA-Z]\w+)?( |$)/)
        let instruction = {state: null, move: {}, write: {}}
        if (state != null) {
            val = val.slice(state[1].length).trim()
            instruction.state = state[1]
        }
        while (val !== '') {
            let tape = val.match(/^(\d)([RL]?[^ ]?)( |$)/)
            if (tape === null) {
                throw new TMSpecError(
                    'Unrecognized string',
                    {
                        problemValue: val,
                        info: 'An instruction can be a synonym or a state with instructions for'
                            + ' tapes. Examples: <code>state2 1R 2R0</code>, <code>20 3R</code>',
                    },
                )
            }
            val = val.slice(tape[0].length).trimLeft()
            let tape_number = parseInt(tape[1])
            if (tape_number > tapes) {
                throw new TMSpecError(
                    'Tape number is bigger than the number of tapes',
                    {
                        problemValue: val,
                        info: `Your machine has only ${tapes} tapes`,
                    },
                )
            }
            if (tape[2] !== '')
                instruction.move[tape_number] = tape[2]
            if (tape[3] !== '')
                instruction.write[tape_number] = tape[3]
        }
        return instruction
    } else {
        if (val === 'L') {
            return moveLeft
        } else if (val === 'R') {
            return moveRight
        }
        // note: this order prevents overriding L/R in synonyms, as that would
        // allow inconsistent notation, e.g. 'R' and {R: ..} being different.
        if (synonyms && synonyms[val]) {
            return synonyms[val]
        }
        throw new TMSpecError(
            'Unrecognized string',
            {
                problemValue: val,
                info: 'An instruction can be a string if it\'s a synonym or a direction',
            },
        )
    }
}

// type ActionObj = {write?: any, L: ?string} | {write?: any, R: ?string}
// case: ActionObj
function parseInstructionObject(val) {
    var symbol, move, state
    if (val == null) {
        throw new TMSpecError('Missing instruction')
    }
    // prevent typos: check for unrecognized keys
    (function () {
        var badKey
        if (!Object.keys(val).every(function (key) {
            badKey = key
            return key === 'L' || key === 'R' || key === 'write'
        })) {
            throw new TMSpecError(
                'Unrecognized key',
                {
                    problemValue: badKey,
                    info: 'An instruction always has a tape movement <code>L</code> or <code>R</code>, '
                        + 'and optionally can <code>write</code> a symbol',
                },
            )
        }
    })()
    // one L/R key is required, with optional state value
    if ('L' in val && 'R' in val) {
        throw new TMSpecError(
            'Conflicting tape movements',
            {info: 'Each instruction needs exactly one movement direction, but two were found'},
        )
    }
    if ('L' in val) {
        move = TM.MoveHead.left
        state = val.L
    } else if ('R' in val) {
        move = TM.MoveHead.right
        state = val.R
    } else {
        throw new TMSpecError('Missing movement direction')
    }
    // write key is optional, but must contain a char value if present
    if ('write' in val) {
        var writeStr = String(val.write)
        if (writeStr.length === 1) {
            symbol = writeStr
        } else {
            throw new TMSpecError('Write requires a string of length 1')
        }
    }
    return makeInstruction(symbol, move, state)
}

exports.TMSpecError = TMSpecError
exports.parseSpec = parseSpec
// re-exports
exports.YAMLException = jsyaml.YAMLException
