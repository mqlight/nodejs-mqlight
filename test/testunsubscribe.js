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
 * Test a calling client.unsubscribe(...) with too few arguments (no arguments)
 * causes an Error to be thrown.
 * @param {object} test the unittest interface
 */
module.exports.test_unsubscribe_too_few_arguments = function(test) {
  var client = mqlight.createClient({id: 'test_unsubscribe_too_few_arguments',
    service: 'amqp://host'});
  client.connect(function() {
    test.throws(function() {
      client.unsubscribe();
    });
    client.disconnect();
    test.done();
  });
};


/**
 * Test that calling client.unsubscribe(...) with too many arguments results in
 * the additional arguments being ignored.
 * @param {object} test the unittest interface
 */
module.exports.test_unsubscribe_too_many_arguments = function(test) {
  var client = mqlight.createClient({id: 'test_unsubscribe_too_many_arguments',
    service: 'amqp://host'});
  client.connect(function() {
    test.doesNotThrow(function() {
      client.unsubscribe('/foo', 'share1', {}, function() {}, 'stowaway');
    });
    client.disconnect();
    test.done();
  });
};


/**
 * Test that the callback argument to client.unsubscribe(...) must be a
 * function
 *
 * @param {object} test the unittest interface
 */
module.exports.test_unsubscribe_callback_must_be_function = function(test) {
  var client = mqlight.createClient({id:
        'test_unsubscribe_callback_must_be_function',
    service: 'amqp://host'});
  client.connect(function() {
    test.throws(function() {
      client.unsubscribe('/foo', 'share', {}, 7);
    });
    test.doesNotThrow(function() {
      client.unsubscribe('/foo', function() {});
    });
    test.doesNotThrow(function() {
      client.unsubscribe('/foo', 'share', function() {});
    });
    test.doesNotThrow(function() {
      client.unsubscribe('/foo', 'share', {}, function() {});
    });
    client.disconnect();
    test.done();
  });
};


/**
 * Test that unsubscribe correctly interprets its parameters.  This can be
 * tricky for two and three parameter invocations where there is the
 * potential for ambiguity between what is a share name and what is the
 * options object.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_unsubscribe_parameters = function(test) {
  var service = 'amqp://host:5672';
  var pattern = '/pattern';
  var currentCallbackInvocations = 0;
  var expectedCallbackInvocations = 0;
  var cb = function() {
    ++currentCallbackInvocations;
  };
  var share = 'share';
  var object = {};

  // Data to drive the test with. 'args' is the argument list to pass into
  // the unsubscribe function.  The 'share', 'object' and 'callback' properties
  // indicate the expected interpretation of 'args'.
  var data = [{args: [pattern]},
              {args: [pattern, cb], callback: cb},
              {args: [pattern, share], share: share},
              {args: [pattern, object], object: object},
              {args: [pattern, share, cb], share: share, callback: cb},
              {args: [pattern, object, cb], object: object, callback: cb},
              {args: [pattern, share, object], share: share, object: object},
              {args: [pattern, 7], share: 7},
              {args: [pattern, 'boo'], share: 'boo'},
              {args: [pattern, {}], object: {}},
              {args: [pattern, 7, cb], share: 7, callback: cb},
              {args: [pattern, {}, cb], object: {}, callback: cb},
              {args: [pattern, [], []], share: [], object: []},
              {args: [pattern, share, object, cb],
                share: share, object: object, callback: cb}];

  // Count up the expected number of callback invocations, so the test can
  // wait for these to complete.
  for (var i = 0; i < data.length; ++i) {
    if (data[i].callback) ++expectedCallbackInvocations;
  }

  // Replace the messeneger unsubscribe method with our own implementation
  // that simply records the address that mqlight.js tries to unsubscribe from.
  var lastUnsubscribedAddress;
  var savedUnsubscribe = mqlight.proton.messenger.unsubscribe;
  mqlight.proton.messenger.unsubscribe = function(address) {
    lastUnsubscribedAddress = address;
  };

  var client = mqlight.createClient({
    id: 'test_unsubscribe_parameters',
    service: service
  });
  client.connect(function() {
    for (var i = 0; i < data.length; ++i) {
      var clientUnsubscribeMethod = client.unsubscribe;
      lastUnsubscribedAddress = undefined;
      clientUnsubscribeMethod.apply(client, data[i].args);

      var expectedAddress =
          service + '/' +
          ((data[i].share) ? ('share:' + data[i].share + ':') : 'private:') +
          pattern;

      test.deepEqual(lastUnsubscribedAddress, expectedAddress);
    }

    // Restore the saved messenger unsubscribe implementation
    mqlight.proton.messenger.unsubscribe = savedUnsubscribe;
    client.disconnect();

  });

  // Callbacks passed into unsubscribe(...) are scheduled to be run once
  // outside of the main loop - so use setImmediate(...) to schedule checking
  // for test completion.
  var testIsDone = function() {
    if (currentCallbackInvocations === expectedCallbackInvocations) {
      test.done();
    } else {
      setImmediate(testIsDone);
    }
  };
  testIsDone();
};


/**
 * Test that the callback (invoked when the unsubscribe operation completes
 * successfully) specifies the right number of arguments, and is invoked with
 * 'this' set to reference the client that the corresponding invocation of
 * unsubscribe(...) was made against.
 * @param {object} test the unittest interface
 */
module.exports.testun_subscribe_ok_callback = function(test) {
  var client = mqlight.createClient({
    id: 'test_unsubscribe_ok_callback',
    service: 'amqp://host'
  });
  client.connect(function() {
    client.unsubscribe('/foo', function() {
      test.equals(arguments.length, 1);
      test.deepEqual(arguments[0], undefined);  // error argument
      test.ok(this === client);
      client.disconnect();
      test.done();
    });
  });
};


/**
 * Test that trying to remove a subscription, while the client is in
 * disconnected state, throws an Error.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_unsubscribe_when_disconnected = function(test) {
  var client = mqlight.createClient({id: 'test_unsubscribe_when_disconnected',
    service: 'amqp://host'});
  test.throws(function() {
    client.unsubscribe('/foo');
  }, Error);
  test.done();
};


/**
 * Test that calling the unsubscribe(...) method returns, as a value, the
 * client object that the method was invoked on (for method chaining purposes).
 *
 * @param {object} test the unittest interface
 */
module.exports.test_unsubscribe_returns_client = function(test) {
  var client = mqlight.createClient({id: 'test_unsubscribe_returns_client',
    service: 'amqp://host'});
  client.connect(function() {
    test.deepEqual(client.unsubscribe('/foo'), client);
    client.disconnect();
    test.done();
  });
};


/**
 * Test a variety of valid and invalid patterns.  Invalid patterns
 * should result in the client.unsubscribe(...) method throwing a TypeError.
 * @param {object} test the unittest interface
 */
module.exports.test_unsubscribe_topics = function(test) {
  var data = [{valid: false, pattern: ''},
              {valid: false, pattern: undefined},
              {valid: false, pattern: null},
              {valid: true, pattern: 1234},
              {valid: true, pattern: function() {}},
              {valid: true, pattern: 'kittens'},
              {valid: true, pattern: '/kittens'},
              {valid: true, pattern: '+'},
              {valid: true, pattern: '#'},
              {valid: true, pattern: '/#'},
              {valid: true, pattern: '/+'}];

  var client = mqlight.createClient({id: 'test_unsubscribe_topics', service:
        'amqp://host'});
  client.connect(function() {
    for (var i = 0; i < data.length; ++i) {
      if (data[i].valid) {
        test.doesNotThrow(function() {
          client.unsubscribe(data[i].pattern);
        });
      } else {
        test.throws(function() {
          client.unsubscribe(data[i].pattern);
        }, TypeError, 'pattern should have been rejected: ' + data[i].pattern);
      }
    }
    client.disconnect();
    test.done();
  });
};


/**
 * Tests a variety of valid and invalid share names to check that they are
 * accepted or rejected (by throwing an Error) as appropriate.
 * @param {object} test the unittest interface
 */
module.exports.test_unsubscribe_share_names = function(test) {
  var data = [{valid: true, share: 'abc'},
              {valid: true, share: 7},
              {valid: false, share: ':'},
              {vaild: false, share: 'a:'},
              {valid: false, share: ':a'}];

  var client = mqlight.createClient({
    id: 'test_unsubscribe_share_names',
    service: 'amqp://host'
  });
  client.connect(function() {
    for (var i = 0; i < data.length; ++i) {
      if (data[i].valid) {
        test.doesNotThrow(function() {
          client.unsubscribe('/foo', data[i].share);
        });
      } else {
        test.throws(function() {
          client.unsubscribe('/foo', data[i].share);
        }, Error, i);
      }
    }
    client.disconnect();
    test.done();
  });
};


/**
 * Test a variety of valid and invalid options values. Invalid options
 * should result in the client.unsubscribe(...) method throwing a TypeError.
 * <p>
 * Note that this test just checks that the options parameter is only
 * accepted when it is of the correct type. The actual validation of
 * individual options will be in separate tests.
 * @param {object} test the unittest interface
 */
module.exports.test_unsubscribe_options = function(test) {
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

  var client = mqlight.createClient({id: 'test_unsubscribe_options', service:
        'amqp://host'});
  client.connect(function() {
    for (var i = 0; i < data.length; ++i) {
      if (data[i].valid) {
        test.doesNotThrow(
            function() {
              client.unsubscribe('testpattern', 'share', data[i].options,
                  function() {});
            }
        );
      } else {
        test.throws(
            function() {
              client.unsubscribe('testpattern', 'share', data[i].options,
                  function() {});
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
