'use strict'

var parseDocument = require('./sharing/format').parseDocument
var fromPairs = require('lodash/fp').fromPairs


function requireExample(name) {
    return require('raw-loader!./examples/' + name + '.yaml')
}

var examplePairs = [
    'universal',
    'multitape',
    'repeat01',
    'binaryIncrement',
    'divisibleBy3',
    'copy1s',
    'divisibleBy3Base10',
    'matchThreeLengths',
    'matchBinaryStrings',
    'palindrome',
    'busyBeaver3',
    'busyBeaver4',
    'powersOfTwo',
    'lengthMult',
    'binaryAdd',
    'unaryMult',
    'binaryMult',
].map(function (id) {
    // parse each string into a document
    var doc = parseDocument(requireExample(id))
    doc.id = id

    return [id, doc]
})
var examples = Object.freeze(fromPairs(examplePairs))


function isExampleID(docID) {
    return {}.hasOwnProperty.call(examples, docID)
}

function get(docID) {
    return isExampleID(docID) ? examples[docID] : null
}

var list = examplePairs.map(function (pair) {
    return pair[1]
})


exports.hasID = isExampleID
exports.get = get
exports.list = list
exports.firsttimeDocID = 'universal'
exports.blankTemplate = requireExample('_template')
