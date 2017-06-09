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

var stubproton = require('./stubs/stubproton');
var testCase = require('nodeunit').testCase;
var mqlight = require('../mqlight');
var AMQP = require('mqlight-forked-amqp10');
var Promise = require('bluebird');


/**
 * Test that supplying too few arguments to client.send(...) results in an
 * error being thrown.
 * @param {object} test the unittest interface
 */
module.exports.test_send_too_few_arguments = function(test) {
  var client = mqlight.createClient({
    id: 'test_send_too_few_arguments',
    service: 'amqp://host'
  });
  client.on('started', function() {
    test.throws(function() {
      client.send();
    }, TypeError);
    test.throws(function() {
      client.send('topic');
    }, TypeError);
    client.stop(function() {
      test.done();
    });
  });
};


/**
 * Test that if too many arguments are supplied to client.send(...) then the
 * additional arguments are ignored.
 * @param {object} test the unittest interface
 */
module.exports.test_send_too_many_arguments = function(test) {
  var client = mqlight.createClient({id: 'test_send_too_many_arguments',
    service: 'amqp://host'});
  client.on('started', function() {
    test.doesNotThrow(
        function() {
          client.send('topic', 'message', {}, function() {}, 'interloper');
        }
    );
    client.stop(function() {
      test.done();
    });
  });
};


/**
 * Test that if a bad callback is specified then an exception is
 * thrown.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_send_callback_must_be_a_function = function(test) {
  var client = mqlight.createClient({
    id: 'test_send_callback_must_be_a_function',
    service: 'amqp://host'});
  client.on('started', function() {
    test.throws(
        function() {
          client.send('topic', 'message', {}, 123);
        }
    );
    client.stop(function() {
      test.done();
    });
  });
};


/**
 * Test a variety of valid and invalid topic names.  Invalid topic names
 * should result in the client.send(...) method throwing a TypeError.
 * @param {object} test the unittest interface
 */
module.exports.test_send_topics = function(test) {
  var data = [{valid: false, topic: ''},
              {valid: false, topic: undefined},
              {valid: false, topic: null},
              {valid: true, topic: 1234},
              {valid: true, topic: function() {}},
              {valid: true, topic: 'kittens'},
              {valid: true, topic: '/kittens'}];

  var client = mqlight.createClient({id: 'test_send_topics', service:
        'amqp://host'});
  client.on('started', function() {
    for (var i = 0; i < data.length; ++i) {
      if (data[i].valid) {
        test.doesNotThrow(
            function() {
              client.send(data[i].topic, 'message');
            }
        );
      } else {
        test.throws(
            function() {
              client.send(data[i].topic, 'message');
            },
            TypeError,
            'topic should have been rejected: ' + data[i].topic
        );
      }
    }
    client.stop();
    test.done();
  });
};


/**
 * Tests sending a variety of different message body types.  Each type should
 * result in one of the following outcomes:
 * <ul>
 *   <li>error - the client.send(...) call throws an error.</li>
 *   <li>string - the data is passed to proton as a string.</li>
 *   <li>buffer - the data is passed to proton as a buffer.</li>
 *   <li>json - the data is passed to proton as a string containing JSON.</li>
 * </li>
 * @param {object} test the unittest interface
 */
module.exports.test_send_payloads = function(test) {
  var data = [{result: 'error', message: undefined},
              {result: 'error', message: function() {}},
              {result: 'string', message: 'a string'},
              {result: 'string', message: ''},
              {result: 'buffer', message: new Buffer('abc')},
              {result: 'buffer', message: new Buffer(0)},
              {result: 'json', message: null},
              {result: 'json', message: {}},
              {result: 'json', message: {color: 'red'}},
              {result: 'json', message: {func: function() {}}},
              {result: 'json', message: []},
              {result: 'json', message: [1, 'red']},
              {result: 'json', message: [true, function() {}]},
              {result: 'json', message: 123},
              {result: 'json', message: 3.14159},
              {result: 'json', message: true}];

  var client = mqlight.createClient({id: 'test_send_payloads', service:
        'amqp://host'});
  client.on('started', function() {
    for (var i = 0; i < data.length; ++i) {
      if (data[i].result === 'error') {
        test.throws(
            function() {client.send('topic', data[i].message);},
            TypeError,
            'expected send(...) to reject a payload of ' + data[i].message);
      } else {
        test.doesNotThrow(
            function() {
              client.send('topic', data[i].message);
            }
        );
        var lastMsg = client._outstandingSends.shift().msg;
        switch (data[i].result) {
          case ('string'):
            test.ok(typeof lastMsg.body === 'string');
            test.deepEqual(lastMsg.body, data[i].message);
            test.equals(lastMsg.properties.contentType, 'text/plain');
            break;
          case ('buffer'):
            test.ok(lastMsg.body instanceof AMQP.DescribedType);
            test.deepEqual(lastMsg.body.value, data[i].message);
            break;
          case ('json'):
            test.ok(typeof lastMsg.body === 'string');
            test.deepEqual(lastMsg.body, JSON.stringify(data[i].message));
            test.equals(lastMsg.properties.contentType, 'application/json');
            break;
          default:
            test.ok(false, "unexpected result type: '" + data[i].result + "'");
        }
      }
    }

    client.stop(function() {
      test.done();
    });
  });
};


/**
 * Tests that, if a callback function is supplied to client.test(...) then the
 * function is invoked when the send operation completes, and this references
 * the client.
 * @param {object} test the unittest interface
 */
module.exports.test_send_callback = function(test) {
  var timeout = setTimeout(function() {
    test.ok(false, 'test timed out before all callbacks were triggered.');
    test.done();
  }, 5000);
  var testData = [{topic: 'topic1', data: 'data1', options: {}},
                  {topic: 'topic2', data: 'data2', options: undefined}];
  test.expect(testData.length * 7);
  var client = mqlight.createClient({id: 'test_send_callback', service:
        'amqp://host'});
  var count = 0;
  var callback = function() {
    test.equals(arguments.length, 4);
    test.equals(arguments[0], undefined);
    test.equals(arguments[1], testData[count].topic);
    test.equals(arguments[2], testData[count].data);
    test.equals(arguments[3], testData[count].options);
    test.ok(this === client);
    ++count;
    if (count === testData.length) {
      client.stop();
      clearTimeout(timeout);
      test.done();
    }
  };
  client.on('started', function() {
    for (var i = 0; i < testData.length; ++i) {
      test.doesNotThrow(function() {
        client.send(testData[i].topic, testData[i].data, testData[i].options,
                    callback);
      });
    }
  });
};


/**
 * Tests that client.send(...) throws and error if it is called while the
 * client is in stopped state.
 * @param {object} test the unittest interface
 */
module.exports.test_send_fails_if_stopped = function(test) {
  var opts = {
    id: 'test_send_fails_if_stopped',
    service: 'amqp://host'
  };
  var client = mqlight.createClient(opts, function() {
    client.stop(function() {
      test.throws(
          function() {
            client.send('topic', 'message');
          },
          mqlight.StoppedError
      );
      test.done();
    });
  });
};


/**
 * Test a variety of valid and invalid options values. Invalid options
 * should result in the client.send(...) method throwing a TypeError.
 * <p>
 * Note that this test just checks that the options parameter is only
 * accepted when it is of the correct type. The actual validation of
 * individual options will be in separate tests.
 * @param {object} test the unittest interface
 */
module.exports.test_send_options = function(test) {
  var data = [{valid: false, options: ''},
              {valid: true, options: undefined},
              {valid: true, options: null},
              {valid: false, options: function() {}},
              {valid: false, options: '1'},
              {valid: false, options: 2},
              {valid: false, options: true},
              {valid: true, options: {}},
              {valid: true, options: data},
              {valid: true, options: { a: 1 } }];

  var client = mqlight.createClient({id: 'test_send_options', service:
        'amqp://host'});
  client.on('started', function() {
    for (var i = 0; i < data.length; ++i) {
      if (data[i].valid) {
        test.doesNotThrow(
            function() {
              client.send('test', 'message', data[i].options, function() {});
            }
        );
      } else {
        test.throws(
            function() {
              client.send('test', 'message', data[i].options, function() {});
            },
            TypeError,
            'options should have been rejected: ' + data[i].options
        );
      }
    }
    client.stop(function() {
      test.done();
    });
  });
};


/**
 * Test a variety of valid and invalid QoS values.  Invalid QoS values
 * should result in the client.send(...) method throwing a TypeError.
 * @param {object} test the unittest interface
 */
module.exports.test_send_qos = function(test) {
  var number = Number(1);
  var data = [{valid: false, qos: ''},
              {valid: false, qos: undefined},
              {valid: false, qos: null},
              {valid: false, qos: function() {}},
              {valid: false, qos: '1'},
              {valid: false, qos: 2},
              {valid: true, qos: 0},
              {valid: true, qos: 1},
              {valid: true, qos: number},
              {valid: true, qos: 9 - 8},
              {valid: true, qos: mqlight.QOS_AT_MOST_ONCE},
              {valid: true, qos: mqlight.QOS_AT_LEAST_ONCE}];

  var client = mqlight.createClient({id: 'test_send_qos', service:
        'amqp://host'});
  client.on('started', function() {
    for (var i = 0; i < data.length; ++i) {
      var opts = { qos: data[i].qos };
      if (data[i].valid) {
        test.doesNotThrow(
            function() {
              client.send('test', 'message', opts, function() {});
            }
        );
      } else {
        test.throws(
            function() {
              client.send('test', 'message', opts);
            },
            RangeError,
            'qos value should have been rejected: ' + data[i].qos
        );
      }
    }
    client.stop();
    test.done();
  });
};


/**
 * Test that a function is required when QoS is 1.
 * @param {object} test the unittest interface
 */
module.exports.test_send_qos_function = function(test) {
  var data = [{valid: false, qos: 1, callback: undefined},
              {valid: true, qos: 1, callback: function() {}},
              {valid: true, qos: 0, callback: undefined},
              {valid: true, qos: 0, callback: function() {}}];

  var client = mqlight.createClient({id: 'test_send_qos_function', service:
        'amqp://host'});
  client.on('started', function() {
    for (var i = 0; i < data.length; ++i) {
      var opts = { qos: data[i].qos };
      if (data[i].valid) {
        test.doesNotThrow(
            function() {
              client.send('test', 'message', opts, data[i].callback);
            }
        );
      } else {
        test.throws(
            function() {
              client.send('test', 'message', opts, data[i].callback);
            },
            mqlight.InvalidArgumentError,
            'Should have thrown, as qos and callback combination is invalid'
        );
      }
    }
    client.stop(function() {
      test.done();
    });
  });
};


/**
 * Test that any queued sends are cleared when stop is called
 * and that the sends callback is called with an error to indicate
 * failure.
 * @param {object} test the unittest interface
 */
module.exports.test_clear_queuedsends_disconnect = function(test) {
  var client = mqlight.createClient({id: 'test_clear_queuedsends_disconnect',
    service: 'amqp://host'});
  var savedSendFunction = stubproton.sender.send;
  stubproton.sender.send = function() {
    return new Promise(function(resolve, reject) {
      reject(new Error('stub error during send'));
    });
  };

  var timeout = setTimeout(function() {
    test.ok(false, 'test timed out before callback');
    stubproton.sender.send = savedSendFunction;
    client.stop();
    test.done();
  },
  5000);
  var opts = {qos: mqlight.QOS_AT_LEAST_ONCE};

  client.on('started', function(err) {
    stubproton.setConnectStatus(1);
    client.send('test', 'message', opts, function(err) {
      //test.deepEqual(client.state, 'stopped',
      //    'callback called when stopped');
      test.notEqual(err, undefined, 'not undefined so err set');
      test.equal(client._queuedSends.length, 0, 'no queued sends left');
      stubproton.sender.send = savedSendFunction;
      clearTimeout(timeout);
      stubproton.setConnectStatus(0);
      test.done();
    });
  });

  client.on('error', function(err) {
    client.stop();
  });
};


/**
 * Test that supplying a valid time-to-live value for a send operation is
 * correctly propagated to the proton message object.  Also test that
 * supplying invalid values result in the client.send(...) method throwing
 * a TypeError.
 * @param {object} test the unittest interface
 */
module.exports.test_send_ttl = function(test) {
  var data = [
              {valid: false, ttl: undefined},
              {valid: false, ttl: function() {}},
              {valid: false, ttl: -9007199254740992},
              {valid: false, ttl: -NaN},
              {valid: false, ttl: NaN},
              {valid: false, ttl: -Infinity},
              {valid: false, ttl: Infinity},
              {valid: false, ttl: -1},
              {valid: false, ttl: 0},
              {valid: false, ttl: null}, // treated as 0
              {valid: false, ttl: ''},   // treated as 0
              {expected: 1, valid: true, ttl: 1},
              {expected: 1, valid: true, ttl: 9 - 8},
              {expected: 4294967295, valid: true, ttl: 9007199254740992}
  ];

  var client =
      mqlight.createClient({id: 'test_send_ttl', service: 'amqp://host'});
  var savedSendFunction = stubproton.sender.send;
  var lastMsg;
  stubproton.sender.send = function(msg) {
    lastMsg = msg;
    return savedSendFunction(msg);
  };
  var sendNext = function() {
    var next = data.shift();
    if (next) {
      var opts = {ttl: next.ttl};
      if (next.valid) {
        test.doesNotThrow(function() {
          client.send('topic', 'data', opts, function() {
            test.deepEqual(lastMsg.header.ttl, next.expected,
              'ttl value in proton message should match that ' +
                'passed into the send(...) method');
            sendNext();
          });
        });
      } else {
        test.throws(function() {
          client.send('topic', 'data', opts);
        }, RangeError, 'ttl should have been rejected: ' + next.ttl);
        sendNext();
      }
    } else {
      client.stop(function() {
        stubproton.sender.send = savedSendFunction;
        test.done();
      });
    }
  };
  client.on('started', function() {
    sendNext();
  });
};


/**
 * Test that if send returns false then, in time, a drain event is emitted.
 * @param {object} test the unittest interface
 */
module.exports.test_send_drain_event = function(test) {
  var client = mqlight.createClient({id: 'test_send_drain_event', service:
        'amqp://host'});
  client.on('started', function() {
    var drainExpected = false;

    var timeout = setTimeout(function() {
      test.ok(false, 'Test timed out waiting for drain event to be emitted');
      test.done();
      if (client) client.stop();
    }, 5000);

    client.on('drain', function() {
      test.ok(drainExpected, 'Drain event not expected to be emitted');
      clearTimeout(timeout);
      if (client) {
        client.stop(function() {test.done()});
      } else {
        test.done();
      }
    });

    for(var i = 0; i < 100; i++) {
      if(client.send('topic', 'data') == false)
      {
        drainExpected = true;
        break;
      }
    }

    test.ok(drainExpected, 'send always returned true');
  });
};


/**
 * Tests that the client correctly handles the server rejecting messages,
 * by invoking the callback function supplied to send (if any).
 * @param {object} test the unittest interface
 */
module.exports.test_message_rejected = function(test) {
  var rejectErrorMessage = 'get away from me!';
  var savedSendFunction = stubproton.sender.send;
  stubproton.sender.send = function() {
    return new Promise(function(resolve, reject) {
      reject(new Error(rejectErrorMessage));
    });
  };
  var client = mqlight.createClient({
    id: 'test_message_rejected',
    service: 'amqp://host'});

  client.on('started', function() {
    test.doesNotThrow(function() {
      // Test that a message being rejected result in the send(...) method's
      // callback being run.
      client.send('topic', 'data', {qos: 1}, function(err) {
        test.ok(err);
        test.equals(err.message, rejectErrorMessage);

        stubproton.sender.send = savedSendFunction;
        client.stop(function() {
          test.done();
        });
      });
    });
  });
};


///**
// * This is a simple test to confirm that a client that attempts to send, but
// * which has been replaced by another client with the same id, gets the
// * ReplacedError
// *
// * @param {object} test the unittest interface
// */
//module.exports.test_send_client_replaced = function(test) {
//  var client = mqlight.createClient({
//    service: 'amqp://host',
//    id: 'test_send_client_replaced'
//  });
//  var savedSendFunction = stubproton.sender.send;
//  stubproton.sender.send = function() {
//    return new Promise(function(resolve, reject) {
//      var err = new Error('CONNECTION ERROR (ServerContext_Takeover)');
//      err.name = 'ReplacedError';
//      reject(err);
//    });
//  };
//
//  client.on('error', function() {});
//
//  client.once('started', function() {
//    test.ok(this === client);
//    test.equals(arguments.length, 0);
//    test.equals(client.state, 'started');
//    test.equals(client._messenger.stopped, false);
//
//    client.send('topic', 'data', function(err) {
//      test.ok(err instanceof Error);
//      test.ok(err instanceof mqlight.ReplacedError);
//      test.ok(/ReplacedError: /.test(err.toString()));
//      stubproton.sender.send = savedSendFunction;
//      client.stop();
//      test.done();
//    });
//  });
//};


/**
 * Unit test for the fix to defect 74527.  Calls send twice, each time
 * specifying a different callback.  The expected behaviour is that both send
 * calls complete in order and invoke their respective callbacks.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_sends_call_correct_callbacks = function(test) {
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_sends_call_correct_callbacks'
  });
  var firstCallbackRun = false;
  var secondCallbackRun = false;

  client.once('started', function() {
    client.send('topic', 'data', function(err) {
      test.ok(!firstCallbackRun, 'first callback run twice!');
      test.ok(!secondCallbackRun, 'second callback called before first(1)!');
      firstCallbackRun = true;
    });

    client.send('topic', 'data', function(err) {
      test.ok(!secondCallbackRun, 'second callback called twice!');
      test.ok(firstCallbackRun, 'second callback called before first(2)!');
      secondCallbackRun = true;
      client.stop();
      test.done();
    });
  });
};
