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
 * Golden path for restart checking state changes.
 * @constructor
 * @param {object} test the unittest interface
 */
module.exports.test_successful_restart = function(test) {
  test.expect(3);
  var client = mqlight.createClient({id: 'test_successful_restart', service:
        'amqp://host'});
  var timeout = setTimeout(function() {
    test.ok(false, 'Test timed out waiting for events to be emitted');
    test.done();
    if (client) client.stop();
  }, 5000);

  client.on('started', function(err) {
    test.deepEqual(client.state, 'started',
        'client status started after start');
    stubproton.setConnectStatus(2);
    mqlight.reconnect(client);
  });

  client.on('error', function(err) {
    test.deepEqual(client.state, 'retrying',
        'client in retrying state after error');
    stubproton.setConnectStatus(0);
  });

  client.on('restarted', function() {
    test.deepEqual(client.state, 'started', 'client has restarted');
    client.stop();
    test.done();
    clearTimeout(timeout);
  });
};



/**
* Check the client returns undefined if the reconnect method is invoked
* while the client is in stopped state.  Note that the reconnect method
* is an internal part of the client, and only exposed for unit testing.
* @constructor
* @param {object} test the unittest interface
*/
module.exports.test_reconnect_when_disconnected = function(test) {
  test.expect(1);
  var opts = {
    id: 'test_reconnect_when_disconnected',
    service: 'amqp://host'
  };
  var client = mqlight.createClient(opts, function() {
    client.stop(function() {
      test.equals(mqlight.reconnect(client), undefined,
                  'reconnect when in stopped state returns undefined');
      test.done();
    });
  });
};



/**
* Test multiple reconnect calls only cause a single restarted
* event.  Note that the reconnect method is an internal part of the client,
* and only exposed for unit testing.
* @constructor
* @param {object} test the unittest interface
*/
module.exports.test_multi_restart_call = function(test) {
  test.expect(3);
  var client = mqlight.createClient({id: 'test_multi_restart_call', service:
        'amqp://host'});
  var reconnectedEvents = 0;
  var timeout = setTimeout(function() {
    test.ok(false, 'Test timed out waiting for events to be emitted');
    test.done();
    if (client) client.stop();
  }, 5000);
  client.on('started', function(x, y) {
    stubproton.setConnectStatus(1);
    mqlight.reconnect(client);
    mqlight.reconnect(client);
    mqlight.reconnect(client);
  });
  client.on('error', function(x, y) {
    //second reconnect call should return immediately
    test.deepEqual(mqlight.reconnect(client).state, 'retrying');
    stubproton.setConnectStatus(0);
  });

  client.on('restarted', function(x, y) {
    reconnectedEvents++;
    test.equals(client.state, 'started',
        'client state started after restart');
    setTimeout(function() {
      test.equals(reconnectedEvents, 1, 'reconnected event happened once');
      client.stop();
      test.done();
      clearTimeout(timeout);
    },1000);
  });
};



/**
* Test the subscription list is emptied and re-populated when the client
* restarts
* @constructor
* @param {object} test the unittest interface
*/
module.exports.test_resubscribe_on_restart = function(test) {
  test.expect(7);
  var client = mqlight.createClient({id: 'test_resubscribe_on_restart',
    service: 'amqp://host'});

  var timeout = setTimeout(function() {
    test.ok(false, 'Test timed out waiting for events to be emitted');
    test.done();
    if (client) client.stop();
  }, 5000);

  var connectErrors = 0;
  client.on('error', function(err) {
    if (/connect error: 1/.test(err.message)) {
      connectErrors++;
      test.ok(client.subscriptions.length === 0, 'subs list has not ' +
              'been cleared');
      test.equal(client.queuedSubscriptions.length, 3, 'subs have ' +
                 'not been queued');
      stubproton.setConnectStatus(0);
    }
  });

  var origSubsList = [];
  client.once('started', function(err) {
    client.subscribe('/topic', 'myshare', function(err) {
      if (connectErrors > 0) return;
      client.subscribe('/another/topic', function(err) {
        if (connectErrors > 0) return;
        client.subscribe('/final/topic/', 'diffshare', function(err) {
          if (connectErrors > 0) return;
          if (connectErrors === 0) {
            setImmediate(function() {
              origSubsList = origSubsList.concat(client.subscriptions);
              stubproton.setConnectStatus(1);
              mqlight.reconnect(client);
            });
          }
        });
      });
    });
  });

  client.once('restarted', function() {
    // this allows the restarted callback to get in and re-subscribe
    setImmediate(function() {
      test.equal(3, origSubsList.length, 'origSubsList length is wrong');
      test.equal(client.subscriptions.length, origSubsList.length,
          'after reconect subs lists does not match original');
      while (client.subscriptions.length > 0) {
        var expected = origSubsList.pop();
        expected.callback = undefined;
        var actual = client.subscriptions.pop();
        actual.callback = undefined;
        test.deepEqual(actual, expected, 'sub list objects do not match');
      }
      test.done();
      clearTimeout(timeout);
    });
  });
};



/**
* Stop while retrying behaves as expected
* @constructor
* @param {object} test the unittest interface
*/
module.exports.test_stop_while_restarting = function(test) {
  var client = mqlight.createClient({id: 'test_stop_while_restarting',
    service: 'amqp://host'});

  var timeout = setTimeout(function() {
    test.ok(false, 'Test timed out waiting for events to be emitted');
    test.done();
    if (client) client.stop();
  }, 5000);

  client.once('started', function(x, y) {
    stubproton.setConnectStatus(1);
    mqlight.reconnect(client);
  });

  client.once('error', function(x, y) {
    client.stop();
  });

  client.once('restarted', function(x, y) {
    test.ok(false, 'should not have restarted');
  });

  client.once('stopped', function(x, y) {
    test.deepEqual(client.state, 'stopped', 'state disconected');
    // Set connect state to 0 and wait a second in case of restart
    stubproton.setConnectStatus(0);
    setTimeout(function() {
      client.stop();
      client.removeAllListeners();
      test.done();
      clearTimeout(timeout);
    },1000);
  });
};


/**
 * Test that an error during send result in the queueing of an
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
    test.ok(false, 'Test timed out waiting for events to be emitted');
    mqlight.proton.messenger.send = savedSendFunction;
    test.done();
    if (client) client.stop();
  }, 5000);

  var opts = {qos: mqlight.QOS_AT_LEAST_ONCE};
  client.once('started', function(err) {
    stubproton.setConnectStatus(1);
    client.send('test', 'message', opts, function(err) {
      // This callback should only happen after the restart event is emitted
      test.equals(reconnected, 1, 'has reconnected');
      test.deepEqual(client.state, 'started', 'state is started');
      test.equals(client.queuedSends.length, 0, 'queued sends now 0');
      client.stop();
      clearTimeout(timeout);
      test.done();
    });
  });

  client.once('error', function(err) {
    stubproton.setConnectStatus(0);
    test.equals(client.queuedSends.length, 1, 'check for queued send');
  });

  client.on('restarted', function(x, y) {
    reconnected++;
    mqlight.proton.messenger.send = savedSendFunction;
  });
};


/**
 * Test that when in a retrying state that any attempted
 * sends are queued and then go through following a restart event.
 *
 * @param {object} test the unittest interface.
 */
module.exports.test_queue_sends_retrying = function(test) {
  test.expect();
  var client = mqlight.createClient({id: 'test_queued_sends_retrying', service:
        'amqp://host'});
  var callbacksCalled = 0;
  var callbacksCalledInError = 0;

  client.on('stopped', function() {
    test.equal(client.queuedSends.length, 0, 'queued sends drained');
    test.equal(callbacksCalled, 3, '3 callbacks called with success');
    test.equal(callbacksCalledInError, 0, '0 callback in error');
    test.done();
  });

  client.start(function(err) {
    stubproton.setConnectStatus(1);
    mqlight.reconnect(client);
    // these 3 sends should get queued
    for ( var i = 0; i < 3; i++ ) {
      client.send('topic ' + i, 'message ' + i , function(err) {
        if (err){
          callbacksCalledInError++;
          process.nextTick(function() {
            client.stop();
          });
        } else {
          callbacksCalled++;
          process.nextTick(function() {
            if (callbacksCalled >= 3) {
              client.stop();
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

  var subscribeErrors = 0;
  client.on('error', function(err) {
    if (/error on subscribe/.test(err.message)) {
      subscribeErrors++;
      return;
    }

    if (subscribeErrors === 4) {
      test.strictEqual(client.queuedSubscriptions.length, 4,
                       'expected to see 4 queued subscriptions, but saw ' +
          client.queuedSubscriptions.length);
      mqlight.proton.messenger.subscribe = savedSubFunction;
      stubproton.setConnectStatus(0);
      setTimeout(function(){client.stop();},500);
    }
  });

  var successCallbacks = 0;
  client.once('started', function() {
    stubproton.setConnectStatus(1);
    // queue up 4 subscribes
    for (var i = 1; i < 5; i++) {
      client.subscribe('queue'+i, function(err) {
        if (!err) {
          successCallbacks++;
        }
      });
    }
  });

  client.on('stopped', function() {
    test.equal(successCallbacks, 4, 'expecting 4 success callbacks, saw ' +
        successCallbacks);
    test.done();
  });
};


/**
 * Test that when the client is still in the 'connecting' state, any attempted
 * unsubscribes are queued and then go through following a connection.
 *
 * @param {object} test the unittest interface.
 */
module.exports.test_queued_unsubscribe_before_connect = function(test) {
  var client = mqlight.createClient({
    id: 'test_queued_unsubscribe_before_connect',
    service: function(callback) {
      test.strictEqual(client.state, 'starting');
      // queue up 4 unsubscribes before allowing the connection through
      for (var i = 1; i < 5; i++) {
        client.subscribe('queue' + i);
        client.unsubscribe('queue' + i, function() {
          successCallbacks++;
        });
      }
      test.strictEqual(client.queuedUnsubscribes.length, 4,
                       'expected to see 4 queued unsubscriptions, but saw ' +
          client.queuedUnsubscribes.length);
      callback(null, 'amqp://host');
    }
  });

  var successCallbacks = 0;
  client.once('started', function() {
    setTimeout(function() {client.stop();},500);
  });

  client.on('stopped', function() {
    test.equal(successCallbacks, 4, 'expecting 4 success callbacks, saw ' +
        successCallbacks);
    test.done();
  });
};


/**
 * Test that when messenger.unsubscribe throws an error, any attempted
 * unsubscribes are queued and then go through following a reconnect.
 *
 * @param {object} test the unittest interface.
 */
module.exports.test_queued_unsubscribe_via_error = function(test) {
  var client = mqlight.createClient({
    id: 'test_queued_unsubscribe_via_error',
    service: 'amqp://host'
  });

  var savedUnsubscribeFn = mqlight.proton.messenger.unsubscribe;
  mqlight.proton.messenger.unsubscribe = function() {
    throw new Error('error on unsubscribe');
  };

  var unsubscribeErrors = 0;
  client.on('error', function(err) {
    if (/error on unsubscribe/.test(err.message)) {
      unsubscribeErrors++;
      return;
    }

    if (unsubscribeErrors === 4) {
      test.strictEqual(client.queuedUnsubscribes.length, 4,
                       'expected to see 4 queued unsubscriptions, but saw ' +
          client.queuedUnsubscribes.length);
      mqlight.proton.messenger.unsubscribe = savedUnsubscribeFn;
      stubproton.setConnectStatus(0);
      setTimeout(function() {client.stop();},500);
    }
  });

  var successCallbacks = 0;
  client.once('started', function() {
    stubproton.setConnectStatus(1);
    // queue up 4 unsubscribes
    for (var i = 1; i < 5; i++) {
      client.subscribe('queue' + i);
      client.unsubscribe('queue' + i, function() {
        successCallbacks++;
      });
    }
  });

  client.on('stopped', function() {
    test.equal(successCallbacks, 4, 'expecting 4 success callbacks, saw ' +
        successCallbacks);
    test.done();
  });
};


/**
 * Test that a queued subscribe and unsubscribe for the same address cancel
 * each other out. We'll do this by submitting 6 subscribes and 4 unsubscribes
 * which should leave just two subscribes.
 *
 * @param {object} test the unittest interface.
 */
module.exports.test_queued_before_connect_unsubscribe_nop = function(test) {
  var callbacks = 0,
      subscribes = 0,
      unsubscribes = 0;

  var savedSubscribeFn = mqlight.proton.messenger.subscribe;
  mqlight.proton.messenger.subscribe = function() {
    ++subscribes;
  };
  var savedUnsubscribeFn = mqlight.proton.messenger.unsubscribe;
  mqlight.proton.messenger.unsubscribe = function() {
    ++unsubscribes;
  };

  var client = mqlight.createClient({
    id: 'test_queued_before_connect_unsubscribe_nop',
    service: function(callback) {
      test.strictEqual(client.state, 'starting');
      // queue up 4 subscribes to queue{1,2,3,4,5,6} before allowing connection
      for (var i = 1; i < 7; i++) {
        client.subscribe('queue' + i, function() {
          callbacks++;
        });
      }
      // queue up 4 unsubscribes to queue{2,3,4,5} before allowing connection
      for (var j = 2; j < 6; j++) {
        client.unsubscribe('queue' + j, function() {
          callbacks++;
        });
      }
      test.strictEqual(client.queuedSubscriptions.length, 6,
                       'expected to see 6 queued subscriptions, but saw ' +
          client.queuedSubscriptions.length);
      test.strictEqual(client.queuedUnsubscribes.length, 4,
                       'expected to see 4 queued unsubscriptions, but saw ' +
          client.queuedUnsubscribes.length);
      callback(null, 'amqp://host');
    }
  });

  client.once('started', function() {
    setTimeout(function() {client.stop();},500);
  });

  client.on('stopped', function() {
    // we expect all 8 of the subscribe and unsubscribe requests to have their
    // callbacks called
    test.equal(callbacks, 10, 'expecting 10 success callbacks, but saw ' +
        callbacks);
    // but we only expect 2 subscribes and 2 unsubscribes to have required
    // processing
    test.equal(subscribes, 2, 'expecting 2 subscribes, but saw ' +
        subscribes);
    test.equal(unsubscribes, 0, 'expecting 0 unsubscribes, but saw ' +
        unsubscribes);
    mqlight.proton.messenger.subscribe = savedSubscribeFn;
    mqlight.proton.messenger.unsubscribe = savedUnsubscribeFn;
    test.done();
  });
};


/**
 * Test that a queued subscribe and unsubscribe for the same address cancel
 * each other out. We'll do this by submitting 4 subscribes and 4 unsubscribes
 * where there is an intersection between two of the topics used in these
 * cases.
 *
 * @param {object} test the unittest interface.
 */
module.exports.test_queued_via_error_unsubscribe_nop = function(test) {
  var client = mqlight.createClient({
    id: 'test_queued_via_error_unsubscribe_nop',
    service: 'amqp://host'
  });

  var savedSubscribeFn = mqlight.proton.messenger.subscribe;
  mqlight.proton.messenger.subscribe = function() {
    throw new Error('error on subscribe');
  };
  var savedUnsubscribeFn = mqlight.proton.messenger.unsubscribe;
  mqlight.proton.messenger.unsubscribe = function() {
    throw new Error('error on unsubscribe');
  };

  var subscribeErrors = 0,
      unsubscribeErrors = 0,
      subscribes = 0,
      unsubscribes = 0;
  client.on('error', function(err) {
    if (/error on subscribe/.test(err.message)) {
      subscribeErrors++;
      return;
    }
    if (/error on unsubscribe/.test(err.message)) {
      unsubscribeErrors++;
      return;
    }

    if (subscribeErrors === 4 && unsubscribeErrors === 2) {
      test.strictEqual(client.queuedSubscriptions.length, 4,
                       'expected to see 4 queued subscriptions, but saw ' +
          client.queuedSubscriptions.length);
      test.strictEqual(client.queuedUnsubscribes.length, 2,
                       'expected to see 2 queued unsubscriptions, but saw ' +
          client.queuedUnsubscribes.length);
      mqlight.proton.messenger.subscribe = function() {
        ++subscribes;
      };
      mqlight.proton.messenger.unsubscribe = function() {
        ++unsubscribes;
      };
      stubproton.setConnectStatus(0);
      setTimeout(function() {client.stop();},500);
    }
  });

  var successCallbacks = 0;
  client.once('started', function() {
    stubproton.setConnectStatus(1);
    // queue up 4 subscribes to queue{1,2,3,4}
    for (var i = 1; i < 5; i++) {
      client.subscribe('queue' + i, function(err) {
        if (!err) {
          successCallbacks++;
        }
      });
    }
    // queue up 2 unsubscribes to queue{2,4}
    for (var j = 2; j < 5; j += 2) {
      client.unsubscribe('queue' + j, function() {
        successCallbacks++;
      });
    }
  });

  client.on('stopped', function() {
    // we expect all 6 of the subscribe and unsubscribe requests to have their
    // callbacks called
    test.equal(successCallbacks, 6, 'expecting 6 success callbacks, saw ' +
        successCallbacks);
    // but we only expect 2 subscribes and 0 unsubscribes to have required
    // processing
    test.equal(subscribes, 2, 'expecting 2 subscribes, but saw ' +
        subscribes);
    test.equal(unsubscribes, 0, 'expecting 0 unsubscribes, but saw ' +
        unsubscribes);
    mqlight.proton.messenger.subscribe = savedSubscribeFn;
    mqlight.proton.messenger.unsubscribe = savedUnsubscribeFn;
    test.done();
  });
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
  client.on('started', function() {
    test.equal(client.queuedSubscriptions.length, 0,
        'should be no queued subs');
    setTimeout(function() { client.stop() }, 10);
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

  client.on('stopped', function(){
    test.equal(callbackCalled, 1, 'should have called in success');
    test.done();
  });

  stubproton.setConnectStatus(1);
};


/**
 * Test that when the initial attempt to connect to the server fails a queued
 * send operation will be processed if the client retrys and connects.
 * @param {object} test the unittest interface.
 */
module.exports.test_initial_failure_retry_send = function(test){

  var client = mqlight.createClient({id: 'test_initial_failure_retry_send',
    service: 'amqp://host'});
  var callbackCalled = 0;
  var first = true;
  client.on('started', function() {
    test.equal(client.queuedSends.length, 0,
        'should be no queued sends');
    setTimeout(function() { client.stop(); },10);
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

  client.on('stopped', function(){
    test.equal(callbackCalled, 1, 'should be one callback called');
    test.done();
  });
  stubproton.setConnectStatus(1);
};
