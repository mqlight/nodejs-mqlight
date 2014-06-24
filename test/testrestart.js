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

var stubproton = require('./stubs/stubproton');
var mqlight = require('../mqlight');
var testCase = require('nodeunit').testCase;



/**
 * Golden path for reconnect checking state changes.
 * @constructor
 * @param {object} test the unittest interface
 */
module.exports.test_successful_reconnect = function(test) {
  test.expect(3);
  var client = mqlight.createClient({service: 'amqp://host'});
  var timeout = setTimeout(function() {
    test.ok(false, 'Test timed out waiting for event emitions');
    test.done();
    if (client) client.disconnect();
  }, 5000);

  client.on('connected', function(x, y) {
    test.deepEqual(client.getState(), 'connected',
        'client status connected after connect');
    stubproton.setConnectStatus(2);
    client.reconnect();
  });

  client.on('error', function(err) {
    test.deepEqual(client.getState(), 'retrying',
        'client in retrying state after error');
    stubproton.setConnectStatus(0);
  });

  client.on('reconnected', function(x, y) {
    test.deepEqual(client.getState(), 'connected', 'client has reconnected');
    client.disconnect();
    test.done();
    clearTimeout(timeout);
  });
  client.connect();
};



/**
* check we return undefined when reconnecting when disconnected
* @constructor
* @param {object} test the unittest interface
*/
module.exports.test_reconnect_when_disconnected = function(test) {
  test.expect(1);
  var client = mqlight.createClient({service: 'amqp://host'});
  test.equals(client.reconnect(), undefined,
      'reconnect when disconnected returns undefined');
  test.done();
};



/**
* Test multiple reconnect calls only cause a single reconnected
* event.
* @constructor
* @param {object} test the unittest interface
*/
module.exports.test_multi_reconnect_call = function(test) {
  test.expect(3);
  var client = mqlight.createClient({service: 'amqp://host'});
  var reconnectedEvents = 0;
  var timeout = setTimeout(function() {
    test.ok(false, 'Test timed out waiting for event emitions');
    test.done();
    if (client) client.disconnect();
  }, 5000);
  client.on('connected', function(x, y) {
    stubproton.setConnectStatus(1);
    client.reconnect();
    client.reconnect();
    client.reconnect();
  });
  client.on('error', function(x, y) {
    //second reconnect should return immediately
    test.deepEqual(client.reconnect().getState(), 'retrying');
    stubproton.setConnectStatus(0);
  });

  client.on('reconnected', function(x, y) {
    reconnectedEvents++;
    test.equals(client.getState(), 'connected',
        'client state connected after reconnect');
    setTimeout(function() {
      test.equals(reconnectedEvents, 1, 'reconnected event happened once');
      client.disconnect();
      test.done();
      clearTimeout(timeout);
    },1000);
  });
  client.connect();
};



/**
* Test the subscription list is emptied and repopulated
* on a reconnect.
* @constructor
* @param {object} test the unittest interface
*/
module.exports.test_resubscribe_on_reconnect = function(test) {
  test.expect(5);
  var client = mqlight.createClient({service: 'amqp://host'});
  var timeout = setTimeout(function() {
    test.ok(false, 'Test timed out waiting for event emitions');
    test.done();
    if (client) client.disconnect();
  }, 5000);
  var origSubsList = [];
  client.on('connected', function(x, y) {
    client.subscribe('/topic', 'myshare');
    client.subscribe('/another/topic');
    client.subscribe('/final/topic/', 'diffshare');
    origSubsList = origSubsList.concat(client.subscriptions);
    stubproton.setConnectStatus(1);
    client.reconnect();
  });

  client.on('error', function(x, y) {
    test.equals(client.subscriptions.length, 0, 'Check subs list is cleared');
    stubproton.setConnectStatus(0);
  });

  client.on('reconnected', function(x, y) {
    //this allows the reconnected callback to get in and resubscribe
    setImmediate(function() {
      test.equals(client.subscriptions.length, origSubsList.length,
          'On reconect subs lists match');
      while (client.subscriptions.length > 0) {
        test.deepEqual(origSubsList.pop(), client.subscriptions.pop(),
            'sub list objects equal');
      }
      client.disconnect();
      test.done();
      clearTimeout(timeout);
    });
  });
  client.connect();
};



/**
* Disconnect during reconnect behaves properly
* @constructor
* @param {object} test the unittest interface
*/
module.exports.test_disconnect_while_reconnecting = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});

  var timeout = setTimeout(function() {
    test.ok(false, 'Test timed out waiting for event emitions');
    test.done();
    if (client) client.disconnect();
  }, 5000);

  client.on('connected', function(x, y) {
    stubproton.setConnectStatus(1);
    client.reconnect();
  });

  client.on('error', function(x, y) {
    client.disconnect();
  });

  client.on('reconnected', function(x, y) {
    test.ok(false, 'should not have reconnected');
  });

  client.on('disconnected', function(x, y) {
    test.deepEqual(client.getState(), 'disconnected', 'state disconected');
    //set connect state to 0 and wait a second incase of reconnect
    stubproton.setConnectStatus(0);
    setTimeout(function() {
      test.done();
      clearTimeout(timeout);
    },1000);
  });

  client.connect();
};


/**
*
* Test that an error during send result in the queuing of an
* AT_LEAST_ONCE message. Then when reconnected this gets sent
* and the queue of messages to send is 0.
* @param {object} test the unittest interface
*/
module.exports.test_single_queued_send = function(test) {
  test.expect(4);
  var client = mqlight.createClient({service: 'amqp://host'});
  var savedSendFunction = mqlight.proton.messenger.send;
  var reconnected = 0;
  mqlight.proton.messenger.send = function() {
    throw new Error('error during send');
  };


  var timeout = setTimeout(function() {
    test.ok(false, 'Test timed out waiting for event emitions');
    mqlight.proton.messenger.send = savedSendFunction;
    test.done();
    if (client) client.disconnect();
  }, 5000);

  var opts = {qos: mqlight.QOS_AT_LEAST_ONCE};
  client.on('connected', function(x,y) {
    stubproton.setConnectStatus(1);
    client.send('test', 'message', opts, function() {
      //this callback should only happen after reconnect
      test.equals(reconnected, 1, 'has reconnected');
      test.deepEqual(client.getState(), 'connected', 'state is connected');
      test.equals(client.queuedSends.length, 0, 'queued sends now 0');
      client.disconnect();
      clearTimeout(timeout);
      test.done();
    });
  });

  client.on('error', function(x, y) {
    stubproton.setConnectStatus(0);
    test.equals(client.queuedSends.length, 1, 'check for queued send'); 
  });

  client.on('reconnected', function(x, y) {
    reconnected++;
    mqlight.proton.messenger.send = savedSendFunction;
  });

  client.connect();
};

