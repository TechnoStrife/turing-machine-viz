'use strict'

const {TMSpecError} = require('./errors.js')
const examples = require('./examples')


function unique_symbols_states(spec) {
    let symbols = []
    let states = []
    for (const from_state in spec.table) {
        if (!states.includes(from_state))
            states.push(from_state)
        // if (spec.table[from_state] === null)
        //     final_states.push(from_state)
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
    return [symbols, states]
}


/**
 * @param {TMSpec} spec
 * @returns {[TMSpec, PositionTable, string]}
 */
function universal_transform(spec, parseSpec) {
    if (spec.tapes !== 0)
        throw new TMSpecError('For universal transform tapes must be 1')

    const space = x => x.replace(' ', '⎵')

    let {sourceCode: universal_source, positionTable} = examples.get('universal');

    let [uni] = parseSpec(universal_source, true)

    let [symbols, states] = unique_symbols_states(spec)
    let final_states = []
    for (const from_state in spec.table) {
        if (spec.table[from_state] === null)
            final_states.push(from_state)
    }
    symbols.sort()

    symbols = unary(symbols, spec.blank, '1')
    states = unary(states, spec.startState, '2')
    let move = {'R': '3', 'L': '33', 'H': '333', null: '333', undefined: '333'}

    let raw_instructions = []
    let encoded_instructions = []

    let instructions = '>'
    let state_tape = '>' + states[spec.startState]
    let data_tape

    for (const from_state in spec.table) {
        for (const [comma_symbols, action] of Object.entries(spec.table[from_state] || {})) {
            for (const symbol of parseSymbolKey(comma_symbols)) {
                let new_symbol = action.symbol && action.symbol[0] || symbol
                let new_state = action.state || from_state
                raw_instructions.push([symbol, from_state, new_symbol, new_state, action.move])
                encoded_instructions.push([
                    symbols[symbol],
                    states[from_state],
                    symbols[new_symbol],
                    states[new_state],
                    final_states.includes(action.state) ? '3333' : move[action.move],
                ])
                instructions += encoded_instructions[encoded_instructions.length - 1].join('')
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

    raw_instructions = raw_instructions.map(row => row.map(space))
    encoded_instructions = encoded_instructions.map(row => row.map(space))
    raw_instructions = pad_table(raw_instructions)
    encoded_instructions = pad_table(encoded_instructions)
    raw_instructions = raw_instructions.map(x => '    # ' + x.join(' '))
    encoded_instructions = encoded_instructions.map(x => '    # ' + x.join(' '))

    const unary_cmp = (a, b) => a[1].length - b[1].length
    let max_state_len = Math.max(...Object.keys(states).map(x => x.length))
    universal_source = universal_source.split('\n')
    let input_index = universal_source.findIndex(s => s.startsWith('input:'))
    universal_source.splice(
        input_index + 1,
        3,
        ...uni.input.map(x => `  - '${x}'`),
        ...Object.entries(symbols).sort(unary_cmp).map(([sym, code]) => `    # ${space(sym)} = ${code}\r`),
        '    #\r',
        ...Object.entries(states).sort(unary_cmp).map(([state, code]) => `    # ${state.padStart(max_state_len)} = ${code}\r`),
        '    #\r',
        ...raw_instructions,
        ...encoded_instructions,
    )
    universal_source = universal_source.join('\n')

    return [uni, positionTable, universal_source]
}

function pad_table(table, fill=' ') {
    let max_lengths = table[0].map((_, i) => Math.max(...table.map(row => row[i].length)))
    return table.map(
        row => row.map((x, i) => x.padEnd(max_lengths[i], fill)),
    )
}

function* flatten_spec(spec) {
    for (const from_state in spec.table) {
        for (const [comma_symbols, action] of Object.entries(spec.table[from_state] || {})) {
            for (const symbol of parseSymbolKey(comma_symbols)) {
                yield [from_state, symbol, action]
            }
        }
    }
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


/**
 * @param {TMSpec} spec
 * @returns {[TMSpec, PositionTable, string]}
 */
function shennon2_transform(spec, parseSpec) {
    // let symbols = {
    //     [spec.blank]: 0,
    //     '>': 1,
    // }
    let [symbols, states] = unique_symbols_states(spec)

    if (symbols.length <= 2)
        throw new TMSpecError("It seems like you have too few symbols to apply Shennon's second"
            + " theorem")

    symbols.sort()
    if (symbols.includes('∂')) {
        symbols.splice(symbols.indexOf('∂'), 1)
        symbols.unshift('∂')
    }
    if (symbols.includes(spec.blank)) {
        symbols.splice(symbols.indexOf(spec.blank), 1)
        symbols.unshift(spec.blank)
    }
    let n = 0
    let size = Math.ceil(Math.log2(symbols.length))
    let codes = {}
    for (const symbol of symbols) {
        codes[symbol] = n.toString(2).padStart(size, '0')
        n += 1
    }
    symbols = codes

    let input = Array.prototype.map.call(spec.input, s => symbols[s]).join('')

    let instructions = []
    let res = {}

    function add(from_state, symbol, to_state, write, move) {
        if (res[from_state] === undefined)
            res[from_state] = {}
        if (res[from_state][symbol] === undefined) {
            res[from_state][symbol] = {symbol: write, move: move, state: to_state}
            instructions.push([from_state, symbol, write, move, to_state])
        }
        // assume that if res[from_state][symbol] exists, it has the same instructions
    }

    for (const from_state in spec.table) {
        if (spec.table[from_state] === null)
            res[from_state] = null
    }

    for (const [from_state, raw_symbol, action] of flatten_spec(spec)) {
        // f"{c[0]}.{bef[0]}->{bef[0]}.R.{c[0]}_{bef[0]}"
        let symbol = symbols[raw_symbol]
        let {symbol: raw_write, state: to_state, move} = action
        to_state = to_state || from_state
        raw_write = raw_write || raw_symbol
        let write = symbols[raw_write]

        add(from_state, symbol[0], `${from_state}_${symbol[0]}`, symbol[0], 'R')

        for (let i = 1; i < size - 1; ++i) {
            add(
                `${from_state}_${symbol.slice(0, i)}`, symbol[i],
                `${from_state}_${symbol.slice(0, i+1)}`, symbol[i],
                'R',
            )
        }
        add(
            `${from_state}_${symbol.slice(0, -1)}`, symbol[symbol.length-1],
            `${from_state}_${symbol}`, symbol[symbol.length-1],
            'H',
        )
        add(
            `${from_state}_${symbol}`, symbol[symbol.length-1],
            `${to_state}_${move}_${write}`, symbol[symbol.length-1],
            'H',
        )

        for (let i = size - 1; i > 0; --i) {
            add(
                `${to_state}_${move}_${write.slice(0, i + 1)}`, symbol[i],
                `${to_state}_${move}_${write.slice(0, i)}`, write[i],
                'L',
            )
        }
        add(
            `${to_state}_${move}_${write[0]}`, symbol[0],
            `${to_state}_${move}`, write[0],
            'H',
        )

        if (move === 'R') {
            add(
                `${to_state}_${move}`, write[0],
                `${to_state}_${move}_move_${size}`, write[0],
                'H',
            )
            for (let i = size; i > 1; --i) {
                add(
                    `${to_state}_${move}_move_${i}`, write[size - i],
                    `${to_state}_${move}_move_${i - 1}`, write[size - i],
                    'R',
                )
            }
            add(
                `${to_state}_${move}_move_${1}`, write[size - 1],
                `${to_state}`, write[size - 1],
                'R',
            )
        } else if (move === 'H') {
            add(
                `${to_state}_${move}`, write[0],
                `${to_state}`, write[0],
                'H',
            )
        } else if (move === 'L') {
            add(
                `${to_state}_${move}`, write[0],
                `${to_state}_${move}_move_${size}`, write[0],
                'H',
            )
            add(
                `${to_state}_${move}_move_${size}`, write[0],
                `${to_state}_${move}_move_${size-1}`, write[0],
                'L',
            )
            for (let i = size - 1; i > 1; --i) {
                add(
                    `${to_state}_${move}_move_${i}`, 0,
                    `${to_state}_${move}_move_${i-1}`, 0,
                    'L',
                )
                add(
                    `${to_state}_${move}_move_${i}`, 1,
                    `${to_state}_${move}_move_${i-1}`, 1,
                    'L',
                )
            }
            add(`${to_state}_${move}_move_1`, 0, `${to_state}`, 0, 'L')
            add(`${to_state}_${move}_move_1`, 1, `${to_state}`, 1, 'L')
        }
        if (instructions[instructions.length - 1] !== null)
            instructions.push(null)
    }

    let shennon = {
        input: input,
        tapes: 0,
        blank: ' ',
        startState: spec.startState,
        table: res,
        vis: {titles: {}, info: {}, colors: {}, 0: {}},
    }

    const binary_cmp = (a, b) => parseInt(a[1].length, 2) - parseInt(b[1].length, 2)
    let code = Object.entries(symbols).sort(binary_cmp).map(([sym, c]) => `# ${sym.replace(' ', '␣')} = ${c}\r`).join('\n')
        + '\r\n'
    let max_state_len = Math.max(...instructions.map(x => x ? x[0].length : 0))
    code += instructions.map(x => !x ? '' :`${x[0].padEnd(max_state_len)} ${x[1]} -> ${x[2]} ${x[3]} ${x[4]}`).join('\n')

    return [shennon, null, code]
}


function shennon2_0_transform(spec, parseSpec) {
    let [res, pos, code] = shennon2_transform(spec, parseSpec)
    res.blank = '0'
    return [res, pos, code]
}


exports.transformations = {
    'universal': universal_transform,
    'shennon2': shennon2_transform,
    'shennon2_0': shennon2_0_transform,
}

