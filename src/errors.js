'use strict'

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
function TMSpecError(reason, details = {}) {
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

exports.TMSpecError = TMSpecError