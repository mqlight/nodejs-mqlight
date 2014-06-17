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
 * Helper function that returns a stub proton message object
 * @param {String} sentTopic the (simulated) topic passed into the send
 *                 method call used to send this message.
 * @param {String} subscribedPattern the (simulated) pattern passed into the
 *                 subscribe method call used to receive this message.
 * @return {object} a stub to be used in place of a proton message object.
 */
var testMessage = function(sentTopic, subscribedPattern) {
  return {
    destroyed: false,
    body: 'Hello World!',
    contentType: 'text/plain',
    address: 'amqp://host:5672/' + sentTopic,
    linkAddress: 'private:' + subscribedPattern,
    deliveryAnnotations: undefined,
    destroy: function() {
      this.destroyed = true;
    }
  };
};


/**
 * Tests the golden path for receiving a message
 * @param {object} test the unittest interface
 */
module.exports.test_receive_message = function(test) {
  var originalReceiveMethod = mqlight.proton.messenger.receive;
  mqlight.proton.messenger.receive = function() {};

  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
    client.subscribe('/kittens/#');
    client.subscribe('/kittens/+/boots');
  });

  var first = true;
  client.on('message', function(data, delivery) {
    if (first) {
      test.deepEqual(delivery.destination.topicPattern, '/kittens/#');
      first = false;
    } else {
      test.deepEqual(delivery.destination.topicPattern, '/kittens/+/boots');
      test.done();
      client.disconnect();
      mqlight.proton.messenger.receive = originalReceiveMethod;
    }
  });

  client.on('malformed', function() {
    test.ok(false, 'malformed event should not be emitted');
  });

  client.on('error', function(err) {
    console.log(err, 'error event should not be emitted');
    test.ok(false);
  });

  var messages = [testMessage('/kittens/wearing/boots', '/kittens/#'),
                  testMessage('/kittens/wearing/boots', '/kittens/+/boots')];
  mqlight.proton.messenger.receive = function() {
    var result = messages;
    messages = [];
    return result;
  };
};


/**
 * Test that receiving a message on multiple subscriber patterns have the
 * correct topicPattern on the emitted message.
 * @param {object} test the unittest interface
 */
module.exports.test_receive_topic_pattern = function(test) {
  var originalReceiveMethod = mqlight.proton.messenger.receive;
  var messages = [testMessage('/kittens/boots', '/kittens/#')];
  mqlight.proton.messenger.receive = function() {
    var result = messages;
    messages = [];
    return result;
  };

  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
    client.subscribe('/kittens/#');
  });

  client.on('message', function(data, delivery) {
    test.deepEqual(arguments.length, 2,
                   'expected 2 arguments to message event listener');
    test.deepEqual(data, 'Hello World!');
    test.ok(delivery.message !== undefined,
            "delivery object should have 'message' property");
    test.ok(delivery.message.properties !== undefined,
            "message object should have 'properties' property");
    test.deepEqual(delivery.message.properties.contentType, 'text/plain');
    test.deepEqual(delivery.message.topic, '/kittens/boots');
    test.ok(delivery.destination !== undefined,
            "delivery object should have 'destination' property");
    test.deepEqual(delivery.destination.topicPattern, '/kittens/#');

    // Ensure that the confirmDelivery() method is available to be called
    delivery.message.confirmDelivery();

    test.done();
    client.disconnect();
    mqlight.proton.messenger.receive = originalReceiveMethod;
  });

  client.on('malformed', function() {
    test.ok(false, 'malformed event should not be emitted');
  });

  client.on('error', function(err) {
    console.log(err, 'error event should not be emitted');
    test.ok(false);
  });
};


/**
 * Tests an error in a message listener isn't accidentally caugh in mqlight.js
 * and has the correct stack (referencing this file.
 * @param {object} test the unittest interface
 */
module.exports.test_bad_listener = function(test) {
  var originalReceiveMethod = mqlight.proton.messenger.receive;
  var messages = [testMessage('x', 'x'), testMessage('x', 'x')];
  mqlight.proton.messenger.receive = function() {
    var result = messages;
    messages = [];
    return result;
  };

  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_bad_listener'
  });

  var handler = function(err) {
    var err_stack = err.stack.split('\n');
    if (err_stack[1].indexOf('testreceivemessage.js') < 0) {
      test.ok(false, 'Unexpected stack trace at ' + err_stack[1]);
      test.done();
    }
  };
  process.addListener('uncaughtException', handler);
  client.on('error', handler);

  client.connect(function() {
    var first = true;
    client.on('message', function(data, delivery) {
      // purposefully throw an exception the first time
      if (first === true) {
        first = false;
        throw new Error();
      }
      process.removeListener('uncaughtException', handler);
      test.done();
      client.disconnect();
      mqlight.proton.messenger.receive = originalReceiveMethod;
    });
    client.subscribe('/public');
  });
};


/**
 * Tests receiving a malformed message (e.g. one for which the various
 * 'x-opt-message-malformed-*' delivery annotations have been set)
 * @param {object} test the unittest interface
 */
module.exports.test_malformed_message = function(test) {
  var originalReceiveMethod = mqlight.proton.messenger.receive;
  var msg = testMessage('/kittens/fang', '/kittens/#');
  msg.deliveryAnnotations = [
    { key: 'x-opt-message-malformed-condition',
      key_type: 'symbol',
      value: 'PAYLOADNOTAMQP',
      value_type: 'symbol'
    },
    { key: 'x-opt-message-malformed-MQMD.Format',
      key_type: 'symbol',
      value: 'MQAMQP',
      value_type: 'string'
    },
    { key: 'x-opt-message-malformed-MQMD.CodedCharSetId',
      key_type: 'symbol',
      value: '1234',
      value_type: 'int32'
    },
    { key: 'x-opt-message-malformed-description',
      key_type: 'symbol',
      value: 'Not a well formed thingy.  Oh dear',
      value_type: 'string'
    }
  ];
  var messages = [msg];
  mqlight.proton.messenger.receive = function() {
    var result = messages;
    messages = [];
    return result;
  };

  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
    client.subscribe('/kittens/#');
  });

  client.on('malformed', function(data, delivery) {
    test.deepEqual(arguments.length, 2,
                   'expected 2 arguments to malformed event listener');
    test.deepEqual(data, 'Hello World!');
    test.ok(delivery.message !== undefined,
            "delivery object should have 'message' property");
    test.ok(delivery.message.properties !== undefined,
            "message object should have 'properties' property");
    test.deepEqual(delivery.message.properties.contentType, 'text/plain');
    test.deepEqual(delivery.message.topic, '/kittens/fang');
    test.ok(delivery.destination !== undefined,
            "delivery object should have 'destination' property");
    test.deepEqual(delivery.destination.topicPattern, '/kittens/#');
    test.ok(delivery.malformed !== undefined,
            "delivery object should have 'malformed' property");
    test.deepEqual(delivery.malformed.condition, 'PAYLOADNOTAMQP');
    test.deepEqual(delivery.malformed.description,
                   'Not a well formed thingy.  Oh dear');
    test.ok(delivery.malformed.MQMD !== undefined,
            "malformed object should have 'MQMD' property");
    test.deepEqual(delivery.malformed.MQMD.CodedCharSetId, 1234);
    test.deepEqual(delivery.malformed.MQMD.Format, 'MQAMQP');
    test.done();
    client.disconnect();
    mqlight.proton.messenger.receive = originalReceiveMethod;
  });

  client.on('message', function() {
    test.ok(false, 'message event should not be emitted');
  });

  client.on('error', function(err) {
    console.log(err, 'error event should not be emitted');
    test.ok(false);
  });
};

