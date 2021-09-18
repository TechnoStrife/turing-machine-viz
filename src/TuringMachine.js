'use strict'

/**
 * Construct a Turing machine.
 * @param {(state, symbol) -> ?{state: state, symbol: symbol, move: direction}} transition
 *   A transition function that, given *only* the current state and symbol,
 *   returns an object with the following properties: symbol, move, and state.
 *   Returning null/undefined halts the machine (no transition defined).
 * @param {state} startState  The state to start in.
 * @param         tapes        The tape to use.
 */
function TuringMachine(transition, startState, tapes) {
    this.transition = transition
    this.state = startState
    this.tapes = tapes
}

TuringMachine.prototype.toString = function () {
    return String(this.state) + '\n' + this.tapes.map(String).join('\n')
}

/**
 * Step to the next configuration according to the transition function.
 * @return {boolean} true if successful (the transition is defined),
 *   false otherwise (machine halted)
 */
TuringMachine.prototype.step = function () {
    let instruct = this.nextInstruction
    if (instruct == null) {
        return false
    }
    for (let i = 0; i < this.tapes.length; i++) {
        this.tapes[i].write(instruct.symbol[i])
        move(this.tapes[i], instruct.move[i])
    }
    this.state = instruct.state

    return true
}

Object.defineProperties(TuringMachine.prototype, {
    nextInstruction: {
        get: function () {
            return this.transition(this.state,
                this.tapes.reduce((acc, tape) => acc + tape.read(), ''))
        },
        enumerable: true,
    },
    isHalted: {
        get: function () {
            return this.nextInstruction == null
        },
        enumerable: true,
    },
})

// Allows for both notational conventions of moving the head or moving the tape
function move(tape, direction) {
    switch (direction) {
        case 'R':
            tape.headRight()
            break
        case 'L':
            tape.headLeft()
            break
        case 'H':
            break
        default:
            throw new TypeError('not a valid tape movement: ' + String(direction))
    }
}

exports.TuringMachine = TuringMachine
