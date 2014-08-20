/* %Z% %W% %I% %E% %U% */
/*
 * <copyright
 * notice="lm-source-program"
 * pids="5725-P60"
 * years="2013,2014"
 * crc="3568777996" >
 * Licensed Materials - Property of IBM
 *
 * 5725-P60
 *
 * (C) Copyright IBM Corp. 2014
 *
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with
 * IBM Corp.
 * </copyright>
 */
/* jslint node: true */
/* jshint -W083,-W097 */
'use strict';

// ***********************************************************************
// Example unit test, that can be used as the starting point for new tests
// ***********************************************************************


/** @const {string} enable unittest mode in mqlight.js */
process.env.NODE_ENV = 'unittest';

var mqlight = require('../mqlight');
var testCase = require('nodeunit').testCase;

// Individual test cases can be defined like this...



/**
 * @constructor
 * @param {object} test the unittest interface
 */
module.exports.example_test1 = function(test) {
  test.expect(1);
  // How many assertion tests do we expect?
  test.ok(true, 'this should always work');
  test.done();  // Test is done.  Did we run all the assertions?
};

// Groups of tests (bracketed by a setUp and tearDown function) work like
// this...



/** @constructor */
module.exports.example_test_group = {
  setUp: function(callback) {
    // Do some setup here..
    callback();
  },
  tearDown: function(callback) {
    // Do the tear down here...
    callback();
  },
  example_test2: function(test) {
    test.done();
  },
  example_test3: function(test) {
    test.done();
  }
};

// Crib-sheet: see https://github.com/caolan/nodeunit
//
// Nodeunit provides the following functions for testing with:
//
//   ok(value, [message])
//     - Tests if value is a true value.
//   equal(actual, expected, [message])
//     - Tests shallow, coercive equality with the equal comparison
//       operator ( == ).
//   notEqual(actual, expected, [message])
//     - Tests shallow, coercive non-equality with the not equal comparison
//       operator ( != ).
//   deepEqual(actual, expected, [message])
//     - Tests for deep equality.
//   notDeepEqual(actual, expected, [message])
//     - Tests for any deep inequality.
//   strictEqual(actual, expected, [message])
//     - Tests strict equality, as determined by the strict equality
//       operator ( === )
//   notStrictEqual(actual, expected, [message])
//     - Tests strict non-equality, as determined by the strict not equal
//       operator ( !== )
//   throws(block, [error], [message])
//     - Expects block to throw an error.
//   doesNotThrow(block, [error], [message])
//     - Expects block not to throw an error.
//   ifError(value)
//     - Tests if value is not a false value, throws if it is a true value.
//       Useful when testing the first argument, error in callbacks.
//
// Nodeunit also provides the following functions within tests:
//
//   expect(amount)
//     - Specify how many assertions are expected to run within a test. Very
//       useful for ensuring that all your callbacks and assertions are run.
//   done()
//     - Finish the current test function, and move on to the next. ALL tests
//       should call this!

