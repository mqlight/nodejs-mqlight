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
var http = require('http');
var EventEmitter = require('events').EventEmitter;
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
  var client = mqlight.createClient({service: 'amqp://host'});
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
  var services = ['amqp://bad1', 'amqp://bad2', 'amqp://host', 'amqp://bad3'];
  var client = mqlight.createClient({
    service: services
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
    service: 'amqp://host'
  });
  client.connect(function() {
    stubproton.blockSendCompletion();
    client.send('topic', 'message');
    client.disconnect();
    client.connect(function(err) {
      test.ifError(err);
      client.disconnect();
      test.done();
    });
    setTimeout(stubproton.unblockSendCompletion, 10);
  });
};


/**
 * Tests that calling connect with an HTTP URI to lookup the endpoint, that
 * the connect operation will keep retrying, performing the http request for
 * each retry, until it returns a valid endpoint that can be connected to.
 * @param {object} test the unittest interface
 */
module.exports.test_connect_http_changing_endpoint = function(test) {
  var amqpServices = [
    'amqp://bad1',
    'amqp://bad2',
    'amqp://host:1234',
    'amqp://bad3'
  ];
  var originalHttpRequestMethod = http.request;
  var index = 0;
  http.request = function(url, callback) {
    var req = new EventEmitter();
    req.setTimeout = function() {};
    req.end = function() {
      try {
        var res = new EventEmitter();
        res.setEncoding = function() {};
        res.statusCode = 200;
        if (callback) callback(res);
        test.ok(index < amqpServices.length);
        var data = '{"service":["' + amqpServices[index++] + '"]}';
        res.emit('data', data);
        res.emit('end');
      } catch (e) {
        console.error(e);
        test.fail(e);
      }
    };
    return req;
  };
  var client = mqlight.createClient({
    service: 'http://127.0.0.1:9999'
  });
  client.on('error', function(err) {
    test.ok(err.message.indexOf('amqp://bad1') != -1 ||
            err.message.indexOf('amqp://bad2') != -1);
  });
  client.connect(function(err) {
    test.ifError(err);
    test.equals(client.getService(), 'amqp://host:1234',
                'Connected to wrong service. ');
    client.disconnect();
    test.done();
    http.request = originalHttpRequestMethod;
  });
};


/**
 * Tests that calling connect with an HTTP URI to lookup the endpoint, that the
 * connect operation will retry each endpoint in the returned list first,
 * before then performing the http request again.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_connect_http_multiple_endpoints = function(test) {
  var amqpServices = [
    ['amqp://bad1', 'amqp://bad2', 'amqp://bad3', 'amqp://bad4'],
    ['amqp://bad5', 'amqp://bad6', 'amqp://host:1234', 'amqp://bad7']
  ];
  var originalHttpRequestMethod = http.request;
  var index = 0;
  http.request = function(url, callback) {
    var req = new EventEmitter();
    req.setTimeout = function() {};
    req.end = function() {
      try {
        var res = new EventEmitter();
        res.setEncoding = function() {};
        res.statusCode = 200;
        if (callback) callback(res);
        test.ok(index < amqpServices.length);
        var data = '{"service":' + JSON.stringify(amqpServices[index++]) +
                   '}';
        res.emit('data', data);
        res.emit('end');
      } catch (e) {
        console.error(e);
        test.fail(e);
      }
    };
    return req;
  };
  var client = mqlight.createClient({
    service: 'http://127.0.0.1:9999'
  });
  // error will be emitted for the last service in the returned endpoint list
  client.on('error', function(err) {
    test.ok(err.message.indexOf('amqp://bad4') != -1);
  });
  client.connect(function(err) {
    test.ifError(err);
    test.equals(client.getService(), 'amqp://host:1234',
                'Connected to wrong service. ');
    client.disconnect();
    test.done();
    http.request = originalHttpRequestMethod;
  });
};


/**
 * Tests that calling connect with a bad HTTP URI returns the underlying http
 * error message to the connect callback.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_connect_http_connection_refused = function(test) {
  var originalHttpRequestMethod = http.request;
  http.request = function(url, callback) {
    var req = new EventEmitter();
    req.setTimeout = function() {};
    req.end = function() {
      req.emit('error', new Error('connect ECONNREFUSED'));
    };
    return req;
  };
  var client = mqlight.createClient({
    service: 'http://127.0.0.1:9999'
  });
  client.connect(function(err) {
    test.ok(err instanceof Error);
    test.ok(/connect ECONNREFUSED/.test(err));
    client.disconnect();
    test.done();
    http.request = originalHttpRequestMethod;
  });
};


/**
 * Tests that the HTTP URI returning malformed JSON is coped with.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_connect_http_bad_json = function(test) {
  var originalHttpRequestMethod = http.request;
  http.request = function(url, callback) {
    var req = new EventEmitter();
    req.setTimeout = function() {};
    req.end = function() {
      try {
        var res = new EventEmitter();
        res.setEncoding = function() {};
        res.statusCode = 200;
        if (callback) callback(res);
        var data = '(╯°□°)╯︵ ┻━┻';
        res.emit('data', data);
        res.emit('end');
      } catch (e) {
        console.error(e);
        test.fail(e);
      }
    };
    return req;
  };
  var client = mqlight.createClient({
    service: 'http://127.0.0.1:9999'
  });
  client.connect(function(err) {
    test.ok(err instanceof Error);
    test.ok(/unparseable JSON/.test(err));
    test.ok(/Unexpected token \(/.test(err));
    client.disconnect();
    test.done();
    http.request = originalHttpRequestMethod;
  });
};


/**
 * Tests that a bad HTTP status code is coped with.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_connect_http_bad_status = function(test) {
  var originalHttpRequestMethod = http.request;
  http.request = function(url, callback) {
    var req = new EventEmitter();
    req.setTimeout = function() {};
    req.end = function() {
      var res = new EventEmitter();
      res.setEncoding = function() {};
      res.statusCode = 404;
      try {
        if (callback) callback(res);
        res.emit('end');
      } catch (e) {
        console.error(e);
        test.fail(e);
      }
    };
    return req;
  };
  var client = mqlight.createClient({
    service: 'http://127.0.0.1:9999'
  });
  client.connect(function(err) {
    test.ok(err instanceof Error);
    test.ok(/failed with a status code of 404/.test(err));
    client.disconnect();
    test.done();
    http.request = originalHttpRequestMethod;
  });
};

/**
 * Tests that after successfully connecting a heartheat is
 * setup to call pn_messeger_work at the rate required by
 * the server.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_connect_heartbeat = function(test) {
  var heartbeatCount = 0;
  var heartbeatInterval = 10;
  stubproton.setHeartbeatInterval(heartbeatInterval, function() { heartbeatCount++; });
  var client = mqlight.createClient({service: 'amqp://host:1234'});
  client.connect(function() {
    // Function to check for heartbeats. Invoked at half the rate of heartbeats
    // This is a little crude as it is not possible to get exact timings
    waitForHeartbeats = function(count) {
      count++;
      // If out of time then there have not been enough heartbeats
      if (count === 100) {
        client.disconnect();
        stubproton.setHeartbeatInterval(-1);
        test.fail('insufficient heartbeats, only saw '+heartbeatCount+' heartbeats');
        test.done();
      // If too many heartbeats then fail (note this is only an approximation)
      } else if (heartbeatCount/count > 2) {
        client.disconnect();
        stubproton.setHeartbeatInterval(-1);
        test.fail('too many/few heartbeats (heartbeat count: '+heartbeatCount+' loop count: '+count+')');
        test.done();
      // We've had enough heartbeats within half the time, so pass
      } else if (heartbeatCount >= 100) {
        client.disconnect();
        stubproton.setHeartbeatInterval(-1);
        test.ok(heartbeatCount >= 100);
        test.done();
      } else {
        setTimeout(waitForHeartbeats, heartbeatInterval*2, count);
      }
    }
    setTimeout(waitForHeartbeats,  heartbeatInterval*2, 0);
  });
};
