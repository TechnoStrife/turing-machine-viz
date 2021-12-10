'use strict'

const {TMSpecError} = require('./parser')
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
 * @returns {[TMSpec, PositionTable]}
 */
function universal_transform(spec, parseSpec) {
    if (spec.tapes !== 0)
        throw new TMSpecError('For universal transform tapes must be 1')

    let {sourceCode: uni, positionTable} = examples.get('universal');

    [uni] = parseSpec(uni, true)

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
 * @returns {[TMSpec, PositionTable]}
 */
function shennon2_transform(spec, parseSpec) {
    // let symbols = {
    //     [spec.blank]: 0,
    //     '>': 1,
    // }
    let [symbols, states] = unique_symbols_states(spec)
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

    let res = {}

    function add(from_state, symbol, to_state, write, move) {
        if (res[from_state] === undefined)
            res[from_state] = {}
        if (res[from_state][symbol] === undefined)
            res[from_state][symbol] = {symbol: write, move: move, state: to_state}
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
                    `${to_state}_${move}_move_${size}`, 0,
                    `${to_state}_${move}_move_${size-1}`, 0,
                    'L',
                )
                add(
                    `${to_state}_${move}_move_${size}`, 1,
                    `${to_state}_${move}_move_${size-1}`, 1,
                    'L',
                )
            }
            add(`${to_state}_${move}_move_1`, 0, `${to_state}`, 0, 'L')
            add(`${to_state}_${move}_move_1`, 1, `${to_state}`, 1, 'L')
        }
    }

    return [{
        input: input,
        tapes: 0,
        blank: ' ',
        startState: spec.startState,
        table: res,
        vis: {titles: {}, info: {}, colors: {}, 0: {}},
    }, null]
}
/*
print("Command format: S.a.a'.R/H/L.S'")
#  add commands
while(1):
    c = input().split('.') # Si.ai.aj'.R/L/H.Sj'
    #c[0] = condition before
    #c[2] = symbol after
    #c[3] = move
    #c[4] = condition after

    bef = bin(symbols[c[1]])[2:].zfill(s_size)
    af = bin(symbols[c[2]])[2:].zfill(s_size)

    print(bef, ' ', af)

    #find symbol
    ncom[f"{c[0]}.{bef[0]}->{bef[0]}.R.{c[0]}_{bef[0]}"] = 0
    n += 1

    for i in range(1, s_size - 1):
        ncom[f"{c[0]}_{bef[:i]}.{bef[i]}->{bef[i]}.R.{c[0]}_{bef[:i+1]}"] = 0
        n += 1

    ncom[f"{c[0]}_{bef[:-1]}.{bef[-1]}->{bef[-1]}.H.{c[0]}_{bef}"] = 0
    n += 1

    ncom[f"{c[0]}_{bef}.{bef[-1]}->{bef[-1]}.H.{c[4]}_{c[3]}_{af}"] = 0
    n += 1

    #update symbol
    for i in range(s_size - 1, 0, -1):
        ncom[f"{c[4]}_{c[3]}_{af[:i + 1]}.{bef[i]}->{af[i]}.L.{c[4]}_{c[3]}_{af[:i]}"] = 0
        n += 1

    ncom[f"{c[4]}_{c[3]}_{af[0]}.{bef[0]}->{af[0]}.H.{c[4]}_{c[3]}"] = 0
    n += 1

    #move to next symbol
    if(str(c[3]) == 'R'):
        ncom[f"{c[4]}_{c[3]}.{af[0]}->{af[0]}.H.{c[4]}_{c[3]}_move_{s_size}"] = 0
        n +=1
        for i in range(s_size, 1, -1):
            ncom[f"{c[4]}_{c[3]}_move_{i}.{af[s_size - i]}->{af[s_size - i]}.{c[3]}.{c[4]}_{c[3]}_move_{i - 1}"] = 0
            n += 1

        ncom[f"{c[4]}_{c[3]}_move_{1}.{af[s_size -1]}->{af[s_size - 1]}.R.{c[4]}"] = 0
        n += 1

    elif(str(c[3]) == 'H'):
        ncom[f"{c[4]}_{c[3]}.{af[0]}->{af[0]}.H.{c[4]}"] = 0
        n +=1

    elif(str(c[3]) == "L"):
        ncom[f"{c[4]}_{c[3]}.{af[0]}->{af[0]}.H.{c[4]}_{c[3]}_move_{s_size}"] = 0
        n += 1
        ncom[f"{c[4]}_{c[3]}_move_{s_size}.{af[0]}->{af[0]}.{c[3]}.{c[4]}_{c[3]}_move_{s_size - 1}"] = 0
        n += 1
        for i in range(s_size - 1, 1, -1):
            ncom[f"{c[4]}_{c[3]}_move_{i}.0->0.{c[3]}.{c[4]}_{c[3]}_move_{i - 1}"] = 0
            ncom[f"{c[4]}_{c[3]}_move_{i}.1->1.{c[3]}.{c[4]}_{c[3]}_move_{i - 1}"] = 0
            n += 2

        ncom[f"{c[4]}_{c[3]}_move_{1}.0->0.L.{c[4]}"] = 0
        ncom[f"{c[4]}_{c[3]}_move_{1}.1->1.L.{c[4]}"] = 0
        n += 2


print(f"Number of commands {len(ncom)}")
for x in ncom.keys():
    print(x, end = '\n')

 */


exports.transformations = {
    'universal': universal_transform,
    'shennon2': shennon2_transform,
}

