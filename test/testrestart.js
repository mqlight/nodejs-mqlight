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
var util = require('util');



/**
 * Golden path for reconnect checking state changes.
 * @constructor
 * @param {object} test the unittest interface
 */
module.exports.test_successful_reconnect = function(test) {
  test.expect(3);
  var client = mqlight.createClient({id: 'test_successful_reconnect', service:
        'amqp://host'});
  var timeout = setTimeout(function() {
    test.ok(false, 'Test timed out waiting for event emitions');
    test.done();
    if (client) client.disconnect();
  }, 5000);

  client.on('connected', function(x, y) {
    test.deepEqual(client.state, 'connected',
        'client status connected after connect');
    stubproton.setConnectStatus(2);
    mqlight.reconnect(client);
  });

  client.on('error', function(err) {
    test.deepEqual(client.state, 'retrying',
        'client in retrying state after error');
    stubproton.setConnectStatus(0);
  });

  client.on('reconnected', function(x, y) {
    test.deepEqual(client.state, 'connected', 'client has reconnected');
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
  var client = mqlight.createClient({id: 'test_reconnect_when_disconnected',
    service: 'amqp://host'});
  test.equals(mqlight.reconnect(client), undefined,
      'reconnect when disconnected returns undefined');
  test.done();
  if (client) client.disconnect();
};



/**
* Test multiple reconnect calls only cause a single reconnected
* event.
* @constructor
* @param {object} test the unittest interface
*/
module.exports.test_multi_reconnect_call = function(test) {
  test.expect(3);
  var client = mqlight.createClient({id: 'test_multi_reconnect_call', service:
        'amqp://host'});
  var reconnectedEvents = 0;
  var timeout = setTimeout(function() {
    test.ok(false, 'Test timed out waiting for event emitions');
    test.done();
    if (client) client.disconnect();
  }, 5000);
  client.on('connected', function(x, y) {
    stubproton.setConnectStatus(1);
    mqlight.reconnect(client);
    mqlight.reconnect(client);
    mqlight.reconnect(client);
  });
  client.on('error', function(x, y) {
    //second reconnect should return immediately
    test.deepEqual(mqlight.reconnect(client).state, 'retrying');
    stubproton.setConnectStatus(0);
  });

  client.on('reconnected', function(x, y) {
    reconnectedEvents++;
    test.equals(client.state, 'connected',
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
  var client = mqlight.createClient({id: 'test_resubscribe_on_reconnect',
    service: 'amqp://host'});
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
    mqlight.reconnect(client);
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
  var client = mqlight.createClient({id: 'test_disconnect_while_reconnecting',
    service: 'amqp://host'});

  var timeout = setTimeout(function() {
    test.ok(false, 'Test timed out waiting for event emitions');
    test.done();
    if (client) client.disconnect();
  }, 5000);

  client.once('connected', function(x, y) {
    stubproton.setConnectStatus(1);
    mqlight.reconnect(client);
  });

  client.once('error', function(x, y) {
    client.disconnect();
  });

  client.once('reconnected', function(x, y) {
    test.ok(false, 'should not have reconnected');
  });

  client.once('disconnected', function(x, y) {
    test.deepEqual(client.state, 'disconnected', 'state disconected');
    //set connect state to 0 and wait a second incase of reconnect
    stubproton.setConnectStatus(0);
    setTimeout(function() {
      client.disconnect();
      client.removeAllListeners();
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
  //test.expect(4);
  var client = mqlight.createClient({id: 'test_single_queued_send', service:
        'amqp://host'});
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
  client.once('connected', function(err) {
    stubproton.setConnectStatus(1);
    client.send('test', 'message', opts, function(err) {
      // this callback should only happen after reconnect
      test.equals(reconnected, 1, 'has reconnected');
      test.deepEqual(client.state, 'connected', 'state is connected');
      test.equals(client.queuedSends.length, 0, 'queued sends now 0');
      client.disconnect();
      clearTimeout(timeout);
      test.done();
    });
  });

  client.once('error', function(err) {
    stubproton.setConnectStatus(0);
    test.equals(client.queuedSends.length, 1, 'check for queued send'); 
  });

  client.on('reconnected', function(x, y) {
    reconnected++;
    mqlight.proton.messenger.send = savedSendFunction;
  });

  client.connect();
};


/**
* Test that when in a retrying state that any attempted
* sends are queued and then go through following a reconnect.
*
* @param {object} test the unittest interface.
*/
module.exports.test_queue_sends_retrying = function(test) {
  test.expect();
  var client = mqlight.createClient({id: 'test_queued_sends_retrying', service:
        'amqp://host'});
  var callbacksCalled = 0;
  var callbacksCalledInError = 0;
  
  client.on('disconnected', function() {
    test.equal(client.queuedSends.length, 0, 'queued sends drained');
    test.equal(callbacksCalled, 3, '3 callbacks called with success');
    test.equal(callbacksCalledInError, 0, '0 callback in error');
    test.done();
  });

  client.connect(function(err) {
    stubproton.setConnectStatus(1);
    mqlight.reconnect(client);
    // these 3 sends should get queued
    for ( var i = 0; i < 3; i++ ) { 
      client.send('topic ' + i, 'message ' + i , function(err) {
        if (err){
          callbacksCalledInError++;
          process.nextTick(function() {
            client.disconnect();
          });
        } else {
          callbacksCalled++;
          process.nextTick(function() {
            if (callbacksCalled >= 3) {
              client.disconnect();
            }
          });
        }
      });
    }
    test.equal(client.queuedSends.length, 3, 'Expected 3 queued ' +
               'sends. Found: ' + util.inspect(client.queuedSends));
    stubproton.setConnectStatus(0);
    mqlight.reconnect(client);
    mqlight.reconnect(client);
    mqlight.reconnect(client);
  });
};


/**
* Test that when in a retrying state that any attempted
* subscribes are queued and then go through following a reconnect.
*
* @param {object} test the unittest interface.
*/
module.exports.test_queued_subs_retrying = function(test) {
  var client = mqlight.createClient({id: 'test_queued_subs_retrying', service:
        'amqp://host'}); 

  var savedSubFunction = mqlight.proton.messenger.subscribe;
  mqlight.proton.messenger.subscribe = function() {
    throw new Error('error on subscribe');
  };

  var successCallbacks = 0; 
  client.on('connected', function() {
    stubproton.setConnectStatus(1);
    client.subscribe('/test', function(err){
      if(err){
        test.ok(false, 'should not be called in err');
      } else {
        successCallbacks++;
      }
    });
  });

  var first = true; 
  client.on('error', function(err) {
    if (first) {
      first = false;
      // queue up 3 subscribes
      for (var i = 0; i < 3; i++) {
        client.subscribe('queue'+i, function(err) {
          if (err){
            test.ok(false, 'should not be called in err');
          } else {
            successCallbacks++;
          }
        });
      }
    } else {
      test.equals(client.queuedSubscriptions.length, 4, 
          'all 4 attempted subs queued');
      mqlight.proton.messenger.subscribe = savedSubFunction;
      stubproton.setConnectStatus(0);
      setTimeout(function(){client.disconnect();},500);
    }

  });
  
  client.on('disconnected', function() {
    test.equal(successCallbacks, 4, 'expecting 4 success callbacks, saw ' +
        successCallbacks);
    test.done();
  });
  client.connect();
};


/**
* Test that when the initial connection fails a queued subscribe
* will get processed, when it connects.
* @param {object} test the unittest interface.
*/
module.exports.test_initial_failure_retry_sub = function(test){

  var client = mqlight.createClient({id: 'test_initial_failure_retry_sub',
    service: 'amqp://host'});
  var callbackCalled = 0;
  var first = true;
  client.on('connected', function() {
    test.equal(client.queuedSubscriptions.length, 0, 
        'should be no queued subs');
    setTimeout(function(){  client.disconnect() },10);
  });

  client.on('error', function() {
    if ( first ) {
      client.subscribe('queuedSub', function(err){
        if (err){
          test.ok(false, 'should not be called in err');
        } else {
          callbackCalled++;
        }
      });
      first = false;
    } else {
      test.equal(client.queuedSubscriptions.length, 1, 
                 'should be a queued sub');
      stubproton.setConnectStatus(0);
    } 
  });

  client.on('disconnected', function(){
    test.equal(callbackCalled, 1, 'should have called in success');
    test.done();
  });

  stubproton.setConnectStatus(1);
  client.connect();
};


/**
* Test that when the initial connection fails a queued send
* will get processed, when it connects.
* @param {object} test the unittest interface.
*/
module.exports.test_initial_failure_retry_send = function(test){

  var client = mqlight.createClient({id: 'test_initial_failure_retry_send',
    service: 'amqp://host'});
  var callbackCalled = 0;
  var first = true;
  client.on('connected', function() {
    test.equal(client.queuedSends.length, 0, 
        'should be no queued sends');
    setTimeout(function(){  client.disconnect() },10);
  });

  client.on('error', function() {
    if ( first ) {
      client.send('topic', 'message', function(err){
        if (err){
          test.ok(false, 'should not be called in err');
        } else {
          callbackCalled++;
        }
      });
      first = false;
    } else {
      test.equal(client.queuedSends.length, 1, 
                 'should be a queued send');
      stubproton.setConnectStatus(0);
    }
  }); 

  client.on('disconnected', function(){
    test.equal(callbackCalled, 1, 'should be one callback called');
    test.done();
  });
  stubproton.setConnectStatus(1);
  client.connect();
};
