/* %Z% %W% %I% %E% %U% */
/*
 * <copyright
 * notice="lm-source-program"
 * pids="5725-P60"
 * years="2013,2016"
 * crc="3568777996" >
 * Licensed Materials - Property of IBM
 *
 * 5725-P60
 *
 * (C) Copyright IBM Corp. 2016
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
var Promise = require('bluebird');


/**
 * Golden path for restart checking state changes.
 * @constructor
 * @param {object} test the unittest interface
 */
/*
module.exports.test_successful_restart = function(test) {
  var client = mqlight.createClient({id: 'test_successful_restart', service:
        'amqp://host'});
  var timeout = setTimeout(function() {
    test.ok(false, 'Test timed out waiting for events to be emitted');
    if (client) client.stop();
    test.done();
  }, 5000);

  client.on('started', function(err) {
    test.deepEqual(client.state, 'started',
        'client status started after start');
    stubproton.setConnectStatus(2);
    setImmediate(function() {
      mqlight.reconnect(client);
    });
  });

  client.on('error', function(err) {
    test.deepEqual(client.state, 'retrying',
        'client in retrying state after error');
    stubproton.setConnectStatus(0);
  });

  client.on('restarted', function() {
    test.deepEqual(client.state, 'started', 'client has restarted');
    clearTimeout(timeout);
    client.stop(function() {
      test.done();
    });
  });
};
*/



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
  var client = mqlight.createClient({id: 'test_multi_restart_call', service:
        'amqp://host'});
  var reconnectedEvents = 0;
  var timeout = setTimeout(function() {
    test.ok(false, 'Test timed out waiting for events to be emitted');
    if (client) client.stop();
    test.done();
  }, 5000);
  client.on('started', function() {
    stubproton.setConnectStatus(1);
    mqlight.reconnect(client);
    mqlight.reconnect(client);
    mqlight.reconnect(client);
  });
  client.on('error', function() {
    // second reconnect call should return immediately
    test.deepEqual(mqlight.reconnect(client).state, 'retrying');
    stubproton.setConnectStatus(0);
  });

  client.on('restarted', function() {
    reconnectedEvents++;
    test.equals(client.state, 'started',
        'client state started after restart');
    setTimeout(function() {
      test.equals(reconnectedEvents, 1, 'reconnected event happened once');
      clearTimeout(timeout);
      client.stop(function() {
        test.done();
      });
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
  var client = mqlight.createClient({id: 'test_resubscribe_on_restart',
    service: 'amqp://host'});

  var timeout = setTimeout(function() {
    test.ok(false, 'Test timed out waiting for events to be emitted');
    if (client) client.stop(function() {
      test.done();
    });
  }, 5000);

  var connectErrors = 0;
  client.on('error', function(err) {
    if (/connect error: 1/.test(err.message)) {
      connectErrors++;
      test.ok(client._subscriptions.length === 0, 'subs list has not ' +
              'been cleared');
      test.equal(client._queuedSubscriptions.length, 3, 'subs have ' +
                 'not been queued');
      stubproton.setConnectStatus(0);
    }
  });

  var origSubsList = [];
  client.once('started', function() {
    client.subscribe('/topic', 'myshare', function(err) {
      test.ifError(err);
      if (connectErrors > 0) return;
      client.subscribe('/another/topic', function(err) {
        test.ok(!err);
        if (connectErrors > 0) return;
        client.subscribe('/final/topic/', 'diffshare', function(err) {
          test.ok(!err);
          if (connectErrors > 0) {
            if (err) return;
            test.equal(client._subscriptions.length, origSubsList.length,
                'after reconnect subs lists does not match original');
            while (client._subscriptions.length > 0) {
              var expected = origSubsList.pop();
              expected.callback = undefined;
              var actual = client._subscriptions.pop();
              actual.callback = undefined;
              test.deepEqual(actual, expected, 'sub list objects do not match');
            }
            clearTimeout(timeout);
            client.stop(function() {
              test.done();
            });
          }
          if (connectErrors === 0) {
            setImmediate(function() {
              origSubsList = origSubsList.concat(client._subscriptions);
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
    if (client) client.stop();
    test.done();
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
      clearTimeout(timeout);
      client.removeAllListeners();
      client.stop(function() {
        test.done();
      });
    },1000);
  });
};


/**
 * Test that an error during send result in the queueing of an
 * AT_LEAST_ONCE message. Then when reconnected this gets sent
 * and the queue of messages to send is 0.
 * @param {object} test the unittest interface
 */
//module.exports.test_single_queued_send = function(test) {
//  //test.expect(4);
//  var client = mqlight.createClient({id: 'test_single_queued_send', service:
//        'amqp://host'});
//  var savedSendFunction = stubproton.sender.send;
//  var reconnected = 0;
//  stubproton.sender.send = function() {
//    return new Promise(function(resolve, reject) {
//      reject(new Error('error during send'));
//    });
//  };
//
//  var timeout = setTimeout(function() {
//    test.ok(false, 'Test timed out waiting for events to be emitted');
//    stubproton.sender.send = savedSendFunction;
//    if (client) client.stop();
//    test.done();
//  }, 5000);
//
//  var opts = {qos: mqlight.QOS_AT_LEAST_ONCE};
//  client.once('started', function(err) {
//    stubproton.setConnectStatus(1);
//    client.send('test', 'message', opts, function(err) {
//      // This callback should only happen after the restart event is emitted
//      test.equals(reconnected, 1, 'has reconnected');
//      test.deepEqual(client.state, 'started', 'state is started');
//      test.equals(client._queuedSends.length, 0, 'queued sends now 0');
//      clearTimeout(timeout);
//      client.stop(function() {
//        test.done();
//      });
//    });
//  });
//
//  client.once('error', function(err) {
//    stubproton.setConnectStatus(0);
//    test.equals(client._queuedSends.length, 1, 'check for queued send');
//  });
//
//  client.on('restarted', function(x, y) {
//    reconnected++;
//    stubproton.sender.send = savedSendFunction;
//  });
//};


/**
 * Test that when in a retrying state that any attempted
 * sends are queued and then go through following a restart event
 * in the expected order.
 *
 * @param {object} test the unittest interface.
 */
module.exports.test_queued_sends_retrying = function(test) {
  test.expect();
  var client = mqlight.createClient({id: 'test_queued_sends_retrying', service:
        'amqp://host'});
  var callbacksCalled = 0;
  var callbacksCalledInError = 0;
  var sentMessages = [];

  client.on('stopped', function() {
    test.equal(client._queuedSends.length, 0, 'expected empty queued sends');
    test.equal(callbacksCalled, 4, 'expected 4 callbacks called with success');
    test.equal(callbacksCalledInError, 0, 'expected 0 callbacks in error');
    test.equal(sentMessages.length, 4, 'expected 4 successfully sent messages');
    for (var i = 0; i < sentMessages.length; i++) {
      test.equal(sentMessages[i], 'message ' + i, 'message sent out of order');
    }
    test.done();
  });

  client.on('error', function(err) {
    test.deepEqual(client.state, 'retrying',
        'client in retrying state after error');
  });

  client.start(function(err) {
    stubproton.setConnectStatus(1);
    mqlight.reconnect(client);
    // these 4 sends should get queued
    for ( var i = 0; i < 4; i++ ) {
      client.send('topic ' + i, 'message ' + i , function(err, topic, body) {
        if (err) {
          callbacksCalledInError++;
          process.nextTick(function() {
            client.stop();
          });
        } else {
          callbacksCalled++;
          sentMessages.push(body);
          process.nextTick(function() {
            if (callbacksCalled >= 4) {
              client.stop();
            }
          });
        }
      });
    }
    test.equal(client._queuedSends.length, 4, 'Expected 4 queued ' +
               'sends. Found: ' + util.inspect(client._queuedSends));
    stubproton.setConnectStatus(0);
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
  var client = mqlight.createClient(
      {id: 'test_queued_subs_retrying', service: 'amqp://host'});

  var timeout = setTimeout(function() {
    test.ok(false, 'Test timed out waiting for events to be emitted');
    if (client) client.stop();
    test.done();
  }, 5000);

  client.on('error', function(err) {
    if (!err instanceof mqlight.NetworkError) console.error(err);
  });

  var successCallbacks = 0;
  client.once('started', function() {
    stubproton.setConnectStatus(1);
    // queue up 4 subscribes
    for (var i = 1; i < 5; i++) {
      client.subscribe('queue' + i, function(err) {
        if (!err) {
          successCallbacks++;
          if (successCallbacks === 4) {
            client.stop();
          }
        }
      });
    }
    setTimeout(function() {
      test.strictEqual(client._queuedSubscriptions.length, 4,
                       'expected to see 4 queued subscriptions, but saw ' +
          client._queuedSubscriptions.length);
      stubproton.setConnectStatus(0);
    }, 1000);
  });

  client.on('stopped', function() {
    test.equal(successCallbacks, 4, 'expecting 4 success callbacks, saw ' +
        successCallbacks);
    clearTimeout(timeout);
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
  var successCallbacks = 0;
  var onUnsubscribe = function() {
    successCallbacks++;
    if (successCallbacks === 4) {
      client.stop();
    }
  };
  var client = mqlight.createClient({
    id: 'test_queued_unsubscribe_before_connect',
    service: function(callback) {
      test.strictEqual(client.state, 'starting');
      // queue up 4 unsubscribes before allowing the connection through
      for (var i = 1; i < 5; i++) {
        client.subscribe('queue' + i);
        client.unsubscribe('queue' + i, onUnsubscribe);
      }
      test.strictEqual(client._queuedUnsubscribes.length, 4,
        'expected to see 4 queued unsubscriptions, but saw ' +
          client._queuedUnsubscribes.length);
      callback(null, 'amqp://host');
    }
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
//module.exports.test_queued_unsubscribe_via_error = function(test) {
//  var client = mqlight.createClient({
//    id: 'test_queued_unsubscribe_via_error',
//    service: 'amqp://host'
//  });
//
//  var savedSubscribedFn = mqlight.proton.messenger.subscribed;
//  mqlight.proton.messenger.subscribed = function() {
//    return true;
//  };
//
//  var unsubscribeErrors = 0;
//  client.on('error', function(err) {
//    if (/error on unsubscribe/.test(err.message)) {
//      unsubscribeErrors++;
//      return;
//    }
//
//    if (unsubscribeErrors === 4) {
//      test.strictEqual(client._queuedUnsubscribes.length, 4,
//                       'expected to see 4 queued unsubscriptions, but saw ' +
//          client._queuedUnsubscribes.length);
//      mqlight.proton.messenger.subscribed = savedSubscribedFn;
//      stubproton.setConnectStatus(0);
//      setTimeout(function() {client.stop();},1500);
//    }
//  });
//
//  var successCallbacks = 0;
//  client.once('started', function() {
//    stubproton.setConnectStatus(1);
//    // queue up 4 unsubscribes
//    for (var i = 1; i < 5; i++) {
//      client.subscribe('queue' + i, function(err, topicPattern, share) {
//        if (unsubscribeErrors >= 4) return;
//        client.unsubscribe(topicPattern, function(err) {
//          if (!err) {
//            successCallbacks++;
//          }
//        });
//      });
//    }
//  });
//
//  client.on('stopped', function() {
//    test.equal(successCallbacks, 4, 'expecting 4 success callbacks, saw ' +
//        successCallbacks);
//    test.done();
//  });
//};


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
      test.strictEqual(client._queuedSubscriptions.length, 6,
                       'expected to see 6 queued subscriptions, but saw ' +
          client._queuedSubscriptions.length);
      test.strictEqual(client._queuedUnsubscribes.length, 4,
                       'expected to see 4 queued unsubscriptions, but saw ' +
          client._queuedUnsubscribes.length);
      callback(null, 'amqp://host');
    }
  });

  var savedSubscribeFunction = client._messenger.createReceiver;
  client._messenger.createReceiver = function(address) {
    ++subscribes;
    return savedSubscribeFunction(address);
  };
  var savedUnsubscribeFunction = stubproton.receiver.detach;
  stubproton.receiver.detach = function() {
    ++unsubscribes;
    return savedUnsubscribeFunction();
  };

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
    client._messenger.createReceiver = savedSubscribeFunction;
    stubproton.receiver.detach = savedUnsubscribeFunction;
    test.done();
  });
};


/**
 * Test that a queued subscribe and unsubscribe for the same address cancel
 * each other out. We'll do this by submitting 4 subscribes and 2 unsubscribes
 * where there is an intersection between two of the topics used in these
 * cases.
 *
 * @param {object} test the unittest interface.
 */
module.exports.test_queued_via_error_unsubscribe_nop = function(test) {
  stubproton.setConnectStatus(1);
  var client = mqlight.createClient({
    id: 'test_queued_via_error_unsubscribe_nop',
    service: 'amqp://host'
  });

  var savedSubscribeFunction = client._messenger.createReceiver;
  client._messenger.createReceiver = function() {
    return new Promise(function(resolve, reject) {
      reject(new Error('error on subscribe'));
    });
  };
  var savedUnsubscribeFunction = stubproton.receiver.detach;
  stubproton.receiver.detach = function() {
    return new Promise(function(resolve, reject) {
      reject(new Error('error on unsubscribe'));
    });
  };

  var subscribeErrors = 0,
      unsubscribeErrors = 0,
      subscribeUnsubscribeErrors = 0,
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
    if (/connect error/.test(err.message)) {
      subscribeUnsubscribeErrors++;
    }

    if ((subscribeErrors === 4 && unsubscribeErrors === 2) ||
            subscribeUnsubscribeErrors === 6) {
      test.strictEqual(client._queuedSubscriptions.length, 4,
                       'expected to see 4 queued subscriptions, but saw ' +
          client._queuedSubscriptions.length);
      test.strictEqual(client._queuedUnsubscribes.length, 2,
                       'expected to see 2 queued unsubscriptions, but saw ' +
          client._queuedUnsubscribes.length);
      client._messenger.createReceiver = function() {
        ++subscribes;
        return savedSubscribeFunction();
      };
      stubproton.receiver.detach = function() {
        ++unsubscribes;
        return savedUnsubscribeFunction();
      };
      stubproton.setConnectStatus(0);
      setTimeout(function() {client.stop();},500);
    }
  });

  var successCallbacks = 0;
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
    client.unsubscribe('queue' + j, function(err) {
      if (!err) {
        successCallbacks++;
      }
    });
  }

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
    client._messenger.createReceiver = savedSubscribeFunction;
    stubproton.receiver.detach = savedUnsubscribeFunction;
    test.done();
  });
};


/**
 * Test that a queued duplicate subscribe for the same address throws the
 * expected 'already subscribed' / 'not subscribed' error
 *
 * @param {object} test the unittest interface.
 */
module.exports.test_queued_double_subscribe = function(test) {
  var callbacks = 0,
      subscribes = 0;

  var client = mqlight.createClient({
    id: 'test_queued_double_subscribe',
    service: function(callback) {
      // override client 'service' property
      client.service = 'amqp://host:5672';
      test.strictEqual(client.state, 'starting');
      // queue up 2 duplicate subscribes to queue before allowing connection
      client.subscribe('queue', function() {
        callbacks++;
      });
      test.throws(function() {
        client.subscribe('queue', function() {
          callbacks++;
        });
      }, function(err) {
        if ((err instanceof mqlight.SubscribedError) &&
            /client already has a queued subscription/.test(err)) {
          return true;
        }
      }, 'Service parameter as non string/array test');
      test.strictEqual(client._queuedSubscriptions.length, 1,
                       'expected to see 1 queued subscription, but saw ' +
          client._queuedSubscriptions.length);
      callback(null, 'amqp://host');
    }
  });
  var savedSubscribeFunction = client._messenger.createReceiver;
  client._messenger.createReceiver = function(address) {
    ++subscribes;
    return savedSubscribeFunction(address);
  };

  client.once('started', function() {
    setTimeout(function() {client.stop();},500);
  });

  client.on('stopped', function() {
    // we expect only one of the subscribes to have had a successful callback
    test.equal(callbacks, 1, 'expecting 1 callback, but saw ' + callbacks);
    test.equal(subscribes, 1, 'expecting 1 subscribe, but saw ' + subscribes);
    client._messenger.createReceiver = savedSubscribeFunction;
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
    setTimeout(function() { client.stop() }, 20);
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
      test.equal(client._queuedSubscriptions.length, 1,
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
  stubproton.setConnectStatus(1);
  var client = mqlight.createClient(
    {id: 'test_initial_failure_retry_send',
     service: 'amqp://host'}
  );
  var callbackCalled = 0;
  var first = true;
  client.on('started', function() {
    setTimeout(function() {
      client.stop();
    }, 10);
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
      test.equal(client._queuedSends.length, 1,
                 'should be a queued send');
      stubproton.setConnectStatus(0);
    }
  });

  client.on('stopped', function() {
    test.equal(callbackCalled, 1, 'should be one callback called');
    test.done();
  });
};
