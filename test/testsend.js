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
var testCase = require('nodeunit').testCase;
var mqlight = require('../mqlight');


/**
 * Test that supplying too few arguments to client.send(...) results in an
 * error being thrown.
 * @param {object} test the unittest interface
 */
module.exports.test_send_too_few_arguments = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
    test.throws(
        function() {
          client.send();
        }
    );
    test.throws(
        function() {
          client.send('topic');
        }
    );
    client.disconnect();
    test.done();
  });
};


/**
 * Test that if too many arguments are supplied to client.send(...) then the
 * additional arguments are ignore.
 * @param {object} test the unittest interface
 */
module.exports.test_send_too_many_arguments = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
    test.doesNotThrow(
        function() {
          client.send('topic', 'message', {}, function() {}, 'interloper');
        }
    );
    client.disconnect();
    test.done();
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

  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
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
    client.disconnect();
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

  // Override the implementation of the 'put' method on the stub object the
  // unit tests use in place of the native proton code.
  var savedPutMethod = mqlight.proton.messenger.put;
  var lastMsg;
  mqlight.proton.messenger.put = function(message) {
    lastMsg = message;
  };

  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
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
        switch (data[i].result) {
          case ('string'):
            test.ok(typeof lastMsg.body === 'string');
            test.deepEqual(lastMsg.body, data[i].message);
            test.equals(lastMsg.contentType, 'text/plain');
            break;
          case ('buffer'):
            test.ok(lastMsg.body instanceof Buffer);
            test.deepEqual(lastMsg.body, data[i].message);
            break;
          case ('json'):
            test.ok(typeof lastMsg.body === 'string');
            test.deepEqual(lastMsg.body, JSON.stringify(data[i].message));
            test.equals(lastMsg.contentType, 'application/json');
            break;
          default:
            test.ok(false, "unexpected result type: '" + data[i].result + "'");
        }
      }
    }

    client.disconnect(function() {
      // Restore original implementation of 'put' method before completing.
      mqlight.proton.messenger.put = savedPutMethod;
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
  var client = mqlight.createClient({service: 'amqp://host'});
  var count = 0;
  var callbackMaker = function(data) {
    return function() {
      test.equals(arguments.length, 4);
      test.equals(arguments[0], undefined);
      test.equals(arguments[1], data.topic);
      test.equals(arguments[2], data.data);
      test.equals(arguments[3], data.options);
      test.ok(this === client);
      ++count;
      if (count === testData.length) {
        client.disconnect();
        clearTimeout(timeout);
        test.done();
      }
    };
  };
  client.connect(function() {
    for (var i = 0; i < testData.length; ++i) {
      test.doesNotThrow(function() {
        client.send(testData[i].topic, testData[i].data, testData[i].options,
                    callbackMaker(testData[i]));
      });
    }
  });
};


/**
 * Tests that client.send(...) throws and error if it is called while the
 * client is in disconnected state.
 * @param {object} test the unittest interface
 */
module.exports.test_send_fails_if_disconneced = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  test.throws(
      function() {
        client.send('topic', 'message');
      },
      Error
  );
  test.done();
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

  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
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
    client.disconnect();
    test.done();
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

  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
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
            TypeError,
            'qos value should have been rejected: ' + data[i].qos
        );
      }
    }
    client.disconnect();
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

  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
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
            TypeError,
            'Should have thrown, as qos and callback combination is invalid'
        );
      }
    }
    client.disconnect();
    test.done();
  });
};


/**
* Test that any queued sends are cleared when disconnect is called
* and that the sends callback is called with an error to indicate
* failure.
* @param {object} test the unittest inteface
*/
module.exports.test_clear_queuedsends_disconnect = function(test) {
  test.expect(3);
  var client = mqlight.createClient({service: 'amqp://host'});
  var savedSendFunction = mqlight.proton.messenger.send;
  mqlight.proton.messenger.send = function() {
    throw new Error('stub error during send');
  };

  var timeout = setTimeout(function(){
    test.ok(false, 'test timed out before callback');
    mqlight.proton.messenger.send = savedSendFunction;
    client.disconnect();
  }, 5000)
  var opts = {qos: mqlight.QOS_AT_LEAST_ONCE};
           
  client.on('connected', function(x,y) {
    stubproton.setConnectStatus(1);
    client.send('test', 'message', opts, function(err){
      test.deepEqual(client.getState(), 'disconnected',
          'callback called when disconnected');
      test.notDeepEqual(err, undefined, 'not undefined so err set');
      test.equal(client.queuedSends.length, 0, 'no queued sends left');
      mqlight.proton.messenger.send = savedSendFunction;
      clearTimeout(timeout);
      test.done();
    });
  });
  
  client.on('error', function(x,y){
    client.disconnect();
  });

  client.connect();
  process.on('uncaughtException', function(err) {
    console.log(err);
  });
};
