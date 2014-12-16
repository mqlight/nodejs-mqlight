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


/** @const {string} enable unittest mode in mqlight.js */
process.env.NODE_ENV = 'unittest';

var mqlight = require('../mqlight');
var testCase = require('nodeunit').testCase;


/**
 * Test a successful stop, ensuring that both the 'stopped'
 * event and the callback passed into client.stop(...) are driven.  In
 * both cases 'this' should point at client that the event listener / callback
 * is associated with.
 * @param {object} test the unittest interface
 */
module.exports.test_stop_callback_and_event = function(test) {
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_stop_callback_and_event'
  });
  client.start(function() {
    var count = 0;
    client.on('stopped', function() {
      test.ok(this === client);
      test.equals(arguments.length, 0);
      test.equals(client.state, 'stopped');
      test.equals(client.service, undefined);
      if (++count == 2) {
        test.done();
      }
    });
    client.stop(function() {
      test.ok(this === client);
      test.equals(arguments.length, 0);
      if (++count == 2) {
        test.done();
      }
    });
  });
};


/**
 * Test that the stopped event is fired on a subsequent tick from that in
 * which the client.stop(...) call is run - meaning that it is possible
 * to call client.stop(...) and client.on('stopped',...) on the same
 * tick and still have the event listener fire.
 * @param {object} test the unittest interface
 */
module.exports.test_listener_fired_on_subsequent_tick = function(test) {
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_listener_fired_on_subsequent_tick'
  });
  client.start();
  client.on('started', function() {
    client.stop();
    client.on('stopped', function() {
      test.done();
    });
  });
};


/**
 * Test that when an argument is specified to the client.stop(...)
 * function it must be a callback (e.g. of type function).
 * @param {object} test the unittest interface
 */
module.exports.test_stop_argument_is_function = function(test) {
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_stop_argument_is_function'
  });
  test.throws(
      function() {
        client.stop(1234);
      },
      TypeError,
      'stop should throw TypeError if argument is not a function'
  );
  client.stop();
  test.done();
};


/**
 * Test that the stop(...) method returns the instance of the client that
 * it is invoked on.  This is to allow chaining of methods.
 * @param {object} test the unittest interface
 */
module.exports.test_stop_method_returns_client = function(test) {
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_stop_method_returns_client'
  });
  var result = client.stop();
  test.ok(result === client);
  test.done();
};


/**
 * Tests that calling stop on an already stopped client has no
 * effect other than to callback any supplied callback function to indicate
 * success.
 * @param {object} test the unittest interface
 */
module.exports.test_stop_when_already_stopped = function(test) {
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_stop_when_already_stopped'
  }).stop();
  client.once('stopped', function() {
    setImmediate(function() {
      client.on('stopped', function() {
        test.ok(false, "shouldn't receive stopped event if already stopped");
      });
      client.stop(function(err) {
        test.ok(!err);
        test.done();
      });
    });
  });
};


/**
 * Tests that when calling stop multiple times, all callbacks
 * get invoked.
 * @param {object} test the unittest interface
 */
module.exports.test_stop_all_callbacks_called = function(test) {
  var count = 0;
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_start_all_callbacks_called'
  });
  var stopped = function(err) {
    test.ok(!err);
    count++;
    if (count == 3) {
      test.done();
    }
  };
  client.stop(stopped);
  client.stop(stopped);
  client.stop(stopped);
};


/**
 * Test that if too many arguments are supplied to stop - then they are
 * ignored.
 * @param {object} test the unittest interface
 */
module.exports.test_stop_too_many_arguments = function(test) {
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_stop_too_many_arguments'
  });
  client.stop(function(err) {
    test.ok(!err);
    test.done();
  }, 'spurious');
};


/**
 * Test that the client.subscriptions list is cleared upon a user-requested
 * client.stop(...) call.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_stop_cleared_subscriptions = function(test) {
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_stop_cleared_subscriptions'
  });
  client.on('started', function() {
    client.on('stopped', function() {
      test.deepEqual(client._subscriptions, [],
                     'client.subscriptions was not ' +
                     'cleared during client.stop() call');
      test.done();
    });
    client.subscribe('/foo', function(err) {
      test.ifError(err);
      test.deepEqual(client._subscriptions.length, 1, 'client.subscriptions ' +
                     'was not appended to');
      client.stop();
    });
  });
};
