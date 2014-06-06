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


/** @const {string} enable unittest mode in mqlight.js */
process.env.NODE_ENV = 'unittest';

var stubproton = require('./stubs/stubproton');
var mqlight = require('../mqlight');
var testCase = require('nodeunit').testCase;


/**
 * Test a successful connect / disconnect, ensuring that both the 'connected'
 * event and the callback passed into client.connect(...) are driven.  In both
 * cases 'this' should point at client that the event listener / callback is
 * associated with.
 * @param {object} test the unittest interface
 */
module.exports.test_successful_connect_disconnect = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  var count = 0;
  test.equals('disconnected', client.getState());
  client.on('connected', function(x, y) {
    test.ok(this === client);
    test.equals(arguments.length, 0);
    test.equals(client.getState(), 'connected');
    if (++count === 2) {
      client.disconnect();
      test.done();
    }
  });
  client.connect(function(err) {
    test.ok(this === client);
    test.equals(arguments.length, 0);
    test.equals(client.getState(), 'connected');
    if (++count === 2) {
      client.disconnect();
      test.done();
    }
  });
};


/**
 * Test that the connect event is fired on a subsequent tick from that in which
 * the client.connect(...) call is run - meaning that it is possible to call
 * client.connect(...) and client.on('connnected',...) on the same tick and
 * still have the event listener fire.
 * @param {object} test the unittest interface
 */
module.exports.test_listener_fired_on_subsequent_tick = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect();
  client.on('connected', function() {
    client.disconnect();
    test.done();
  });
};


/**
 * Test that when an argument is specified to the client.connect(...) function
 * it must be a callback (e.g. of type function).
 * @param {object} test the unittest interface
 */
module.exports.test_connect_argument_is_function = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  test.throws(
      function() {
        client.connect(1234);
      },
      TypeError,
      'connect should throw TypeError if argument is not a function'
  );
  test.done();
};


/**
 * Test that the connect(...) method returns the instance of the client that
 * it is invoked on.  This is to allow chaining of methods.
 * @param {object} test the unittest interface
 */
module.exports.test_connect_method_returns_client = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  var result = client.connect(function() {client.disconnect();});
  test.ok(result === client);
  test.done();
};


/**
 * Tests that calling connect on an already connected client has no effect
 * other than to callback any supplied callback function to indicate
 * success.
 * @param {object} test the unittest interface
 */
module.exports.test_connect_when_already_connected = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
    client.on('connected', function() {
      test.ok(false, "shouldn't receive connected event if already " +
              'connected');
    });
    client.connect(function(err) {
      test.ok(!err);
      test.done();
      client.disconnect();
    });
  });
};


/**
 * Test that if too many arguments are supplied to connect - then they are
 * ignored.
 * @param {object} test the unittest interface
 */
module.exports.test_connect_too_many_arguments = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
    client.disconnect();
    test.done();
  }, 'gooseberry');
};

/**
 * Tests that calling connect to an enpoint that is currently down retries
 * until successful.
 * @param {object} test the unittest interface
 */
module.exports.test_connect_retry = function(test) {
  var client = mqlight.createClient({service : 'amqp://host'});
  var requiredConnectStatus = 2;

  client.on('error', function(err) {
    requiredConnectStatus--;
    stubproton.setConnectStatus(requiredConnectStatus);
  });

  stubproton.setConnectStatus(requiredConnectStatus);
  client.connect(function() {
    test.equals(requiredConnectStatus, 0);
    client.disconnect();
    test.done();
  });
};

/**
 * Tests that calling connect with multiple endpoints, some bad and some valid,
 * that the connect will be successful and connect to a valid endpoint.
 * 
 * @param {object} test the unittest interface
 */
module.exports.test_connect_multiple_endpoints = function(test) {
  var services = new Array();
  services[0] = 'amqp://bad1';
  services[1] = 'amqp://bad2';
  services[2] = 'amqp://host';
  services[3] = 'amqp://bad3';
  var client = mqlight.createClient({
    service : services
  });
  client.connect(function() {
    test.equals(client.getService(), 'amqp://host:5672');
    client.disconnect();
    test.done();
  });
};

/**
 * Tests that calling connect with a function to specify the endpoints, that the
 * connect operation will keep retrying, calling the function again for each
 * retry, until a valid endpoint can be connected to.
 * @param {object} test the unittest interface
 */
module.exports.test_connect_variable_endpoints = function(test) {
var services = ['amqp://bad1',
                'amqp://bad2',
                'amqp://host:1234',
                'amqp://bad3'];
  var index = 0;
  var serviceFunction = function(callback) {
    console.log("serviceFunction %d\n", index);
    test.ok(index < services.length);
    var result = services[index++];
    callback(undefined, result);
  };
  var client = mqlight.createClient({
    service: serviceFunction
  });
  client.on('error', function(err) {
    test.ok(err.message.indexOf('amqp://bad') != -1);
  });
  client.connect(function() {
    test.equals(client.getService(), 'amqp://host:1234');
    client.disconnect();
    test.done();
  });
};

/**
 * Tests that calling connect whilst still disconnecting will be
 * successful only when the disconnect completes
 * @param {object} test the unittest interface
 */
module.exports.test_connect_disconnect_timing = function(test) {
  var client = mqlight.createClient({
    service : 'amqp://host'
  });
  client.connect(function() {
    stubproton.blockSendCompletion();
    client.send('topic', 'message');
    client.disconnect();
    client.connect(function(err) {
      test.ok(err == undefined);
      client.disconnect();
      test.done();
    });
    setTimeout(stubproton.unblockSendCompletion, 10);
  });
};
