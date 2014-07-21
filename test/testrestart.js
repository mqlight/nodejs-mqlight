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

  client.on('connected', function(err) {
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

  client.on('reconnected', function() {
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
  test.expect(7);
  var client = mqlight.createClient({id: 'test_resubscribe_on_reconnect',
    service: 'amqp://host'});

  var timeout = setTimeout(function() {
    test.ok(false, 'Test timed out waiting for event emitions');
    test.done();
    if (client) client.disconnect();
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
  client.once('connected', function(err) {
    client.subscribe('/topic', 'myshare', function(err) {
      client.subscribe('/another/topic', function(err) {
        client.subscribe('/final/topic/', 'diffshare', function(err) {
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

  client.once('reconnected', function() {
    // this allows the reconnected callback to get in and resubscribe
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
    for (var i = 0; i < 3; i++) {
      client.send('topic ' + i, 'message ' + i, function(err) {
        if (err) {
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
      setTimeout(function() {client.disconnect();},500);
    }
  });

  var successCallbacks = 0;
  client.once('connected', function() {
    stubproton.setConnectStatus(1);
    // queue up 4 subscribes
    for (var i = 1; i < 5; i++) {
      client.subscribe('queue' + i, function(err) {
        if (!err) {
          successCallbacks++;
        }
      });
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
 * Test that when the client is still in the 'connecting' state, any attempted
 * unsubscribes are queued and then go through following a connection.
 *
 * @param {object} test the unittest interface.
 */
module.exports.test_queued_unsubscribe_before_connect = function(test) {
  var client = mqlight.createClient({
    id: 'test_queued_unsubscribe_before_connect',
    service: function(callback) {
      test.strictEqual(client.state, 'connecting');
      // queue up 4 unsubscribes before allowing the connection through
      for (var i = 1; i < 5; i++) {
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
  client.once('connected', function() {
    setTimeout(function() {client.disconnect();},500);
  });

  client.on('disconnected', function() {
    test.equal(successCallbacks, 4, 'expecting 4 success callbacks, saw ' +
        successCallbacks);
    test.done();
  });

  // call connect to transition into 'connecting' state
  client.connect();
};


/**
 * Test that when messenger.unsubscribe throws an error, any attempted
 * unsubscribes are queued and then go through following a reconnect.
 *
 * @param {object} test the unittest interface.
 */
module.exports.test_queued_unsubscribe_via_error = function(test) {
  var client = mqlight.createClient({
    id: 'test_queued_unsubscribe_retry',
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
      setTimeout(function() {client.disconnect();},500);
    }
  });

  var successCallbacks = 0;
  client.once('connected', function() {
    stubproton.setConnectStatus(1);
    // queue up 4 unsubscribes
    for (var i = 1; i < 5; i++) {
      client.unsubscribe('queue' + i, function() {
        successCallbacks++;
      });
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
 * Test that a queued subscribe and unsubscribe for the same address cancel
 * each other out. We'll do this by submitting 4 subscribes and 4 unsubscribes
 * where there is an intersection between two of the topics used in these
 * cases.
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
      test.strictEqual(client.state, 'connecting');
      // queue up 4 subscribes to queue{1,2,3,4} before allowing connection
      for (var i = 1; i < 5; i++) {
        client.subscribe('queue' + i, function() {
          callbacks++;
        });
      }
      // queue up 4 unsubscribes to queue{2,4,6,8} before allowing connection
      for (var j = 2; j < 9; j += 2) {
        client.unsubscribe('queue' + j, function() {
          callbacks++;
        });
      }
      test.strictEqual(client.queuedSubscriptions.length, 4,
                       'expected to see 4 queued subscriptions, but saw ' +
          client.queuedSubscriptions.length);
      test.strictEqual(client.queuedUnsubscribes.length, 4,
                       'expected to see 4 queued unsubscriptions, but saw ' +
          client.queuedUnsubscribes.length);
      callback(null, 'amqp://host');
    }
  });

  client.once('connected', function() {
    setTimeout(function() {client.disconnect();},500);
  });

  client.on('disconnected', function() {
    // we expect all 8 of the subscribe and unsubscribe requests to have their
    // callbacks called
    test.equal(callbacks, 8, 'expecting 8 success callbacks, but saw ' +
        callbacks);
    // but we only expect 2 subscribes and 2 unsubscribes to have required
    // processing
    test.equal(subscribes, 2, 'expecting 2 subscribes, but saw ' +
        subscribes);
    test.equal(unsubscribes, 2, 'expecting 2 unsubscribes, but saw ' +
        unsubscribes);
    mqlight.proton.messenger.subscribe = savedSubscribeFn;
    mqlight.proton.messenger.unsubscribe = savedUnsubscribeFn;
    test.done();
  });

  // call connect to transition into 'connecting' state
  client.connect();
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

    if (subscribeErrors === 4 && unsubscribeErrors === 4) {
      test.strictEqual(client.queuedSubscriptions.length, 4,
                       'expected to see 4 queued subscriptions, but saw ' +
          client.queuedSubscriptions.length);
      test.strictEqual(client.queuedUnsubscribes.length, 4,
                       'expected to see 4 queued unsubscriptions, but saw ' +
          client.queuedUnsubscribes.length);
      mqlight.proton.messenger.subscribe = function() {
        ++subscribes;
      };
      mqlight.proton.messenger.unsubscribe = function() {
        ++unsubscribes;
      };
      stubproton.setConnectStatus(0);
      setTimeout(function() {client.disconnect();},500);
    }
  });

  var successCallbacks = 0;
  client.once('connected', function() {
    stubproton.setConnectStatus(1);
    // queue up 4 subscribes to queue{1,2,3,4}
    for (var i = 1; i < 5; i++) {
      client.subscribe('queue' + i, function(err) {
        if (!err) {
          successCallbacks++;
        }
      });
    }
    // queue up 4 unsubscribes to queue{2,4,6,8}
    for (var j = 2; j < 9; j += 2) {
      client.unsubscribe('queue' + j, function() {
        successCallbacks++;
      });
    }
  });

  client.on('disconnected', function() {
    // we expect all 8 of the subscribe and unsubscribe requests to have their
    // callbacks called
    test.equal(successCallbacks, 8, 'expecting 8 success callbacks, saw ' +
        successCallbacks);
    // but we only expect 2 subscribes and 2 unsubscribes to have required
    // processing
    test.equal(subscribes, 2, 'expecting 2 subscribes, but saw ' +
        subscribes);
    test.equal(unsubscribes, 2, 'expecting 2 unsubscribes, but saw ' +
        unsubscribes);
    mqlight.proton.messenger.subscribe = savedSubscribeFn;
    mqlight.proton.messenger.unsubscribe = savedUnsubscribeFn;
    test.done();
  });
  client.connect();
};


/**
* Test that when the initial connection fails a queued subscribe
* will get processed, when it connects.
*
* @param {object} test the unittest interface.
*/
module.exports.test_initial_failure_retry_sub = function(test) {

  var client = mqlight.createClient({id: 'test_initial_failure_retry_sub',
    service: 'amqp://host'});
  var callbackCalled = 0;
  var first = true;
  client.on('connected', function() {
    test.equal(client.queuedSubscriptions.length, 0,
        'should be no queued subs');
    setTimeout(function() { client.disconnect(); },10);
  });

  client.on('error', function() {
    if (first) {
      client.subscribe('queuedSub', function(err) {
        if (err) {
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

  client.on('disconnected', function() {
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
module.exports.test_initial_failure_retry_send = function(test) {

  var client = mqlight.createClient({id: 'test_initial_failure_retry_send',
    service: 'amqp://host'});
  var callbackCalled = 0;
  var first = true;
  client.on('connected', function() {
    test.equal(client.queuedSends.length, 0,
        'should be no queued sends');
    setTimeout(function() { client.disconnect(); },10);
  });

  client.on('error', function() {
    if (first) {
      client.send('topic', 'message', function(err) {
        if (err) {
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

  client.on('disconnected', function() {
    test.equal(callbackCalled, 1, 'should be one callback called');
    test.done();
  });
  stubproton.setConnectStatus(1);
  client.connect();
};
