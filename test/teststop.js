/* %Z% %W% %I% %E% %U% */
/*
 * <copyright
 * notice="lm-source-program"
 * pids="5755-P60"
 * years="2013,2014"
 * crc="3568777996" >
 * Licensed Materials - Property of IBM
 *
 * 5755-P60
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
 * Test a successful disconnect, ensuring that both the 'disconnected'
 * event and the callback passed into client.disconnect(...) are driven.  In
 * both cases 'this' should point at client that the event listener / callback
 * is associated with.
 * @param {object} test the unittest interface
 */
module.exports.test_disconnect_callback_and_event = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
    var count = 0;
    client.on('disconnected', function() {
      test.ok(this === client);
      test.equals(arguments.length, 0);
      test.equals(client.state, 'disconnected');
      if (++count == 2) {
        test.done();
      }
    });
    client.disconnect(function() {
      test.ok(this === client);
      test.equals(arguments.length, 0);
      if (++count == 2) {
        test.done();
      }
    });
  });
};


/**
 * Test that the disconnected event is fired on a subsequent tick from that in
 * which the client.disconnect(...) call is run - meaning that it is possible
 * to call client.disconnect(...) and client.on('disconnected',...) on the same
 * tick and still have the event listener fire.
 * @param {object} test the unittest interface
 */
module.exports.test_listener_fired_on_subsequent_tick = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect();
  client.on('connected', function() {
    client.disconnect();
    client.on('disconnected', function() {
      test.done();
    });
  });
};


/**
 * Test that when an argument is specified to the client.disconnect(...)
 * function it must be a callback (e.g. of type function).
 * @param {object} test the unittest interface
 */
module.exports.test_disconnect_argument_is_function = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  test.throws(
      function() {
        client.disconnect(1234);
      },
      TypeError,
      'disconnect should throw TypeError if argument is not a function'
  );
  test.done();
};


/**
 * Test that the disconnect(...) method returns the instance of the client that
 * it is invoked on.  This is to allow chaining of methods.
 * @param {object} test the unittest interface
 */
module.exports.test_disconnect_method_returns_client = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  var result = client.disconnect();
  test.ok(result === client);
  test.done();
};


/**
 * Tests that calling disconnect on an already disconnected client has no
 * effect other than to callback any supplied callback function to indicate
 * success.
 * @param {object} test the unittest interface
 */
module.exports.test_disconnect_when_already_disconnected = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  client.disconnect(function(err) {
    test.ok(!err);
    test.done();
  });
  client.on('disconnected', function() {
    test.ok(false, "shouldn't receive disconnected event if already " +
            'disconnected');
  });
};


/**
 * Test that if too many arguments are supplied to disconnect - then they are
 * ignored.
 * @param {object} test the unittest interface
 */
module.exports.test_disconnect_too_many_arguments = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  client.disconnect(function(err) {
    test.ok(!err);
    test.done();
  }, 'spurious');
};


/**
 * Test that the client.subscriptions list is cleared upon a user-requested
 * client.disconnect(...) call.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_disconnect_cleared_subscriptions = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  client.on('connected', function() {
    client.on('disconnected', function() {
      test.deepEqual(client.subscriptions, [], 'client.subscriptions was not ' +
                     'cleared during client.disconnect() call');
      test.done();
    });
    client.subscribe('/foo', function(err) {
      test.ifError(err);
      test.deepEqual(client.subscriptions.length, 1, 'client.subscriptions ' +
                     'was not appended to');
      client.disconnect();
    });
  });
  client.connect();
};
