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
var mqlight = require('../mqlight');
var os = require('os');
var fs = require('fs');
var url = require('url');
var http = require('http');
var https = require('https');
var EventEmitter = require('events').EventEmitter;
var testCase = require('nodeunit').testCase;


/**
 * Test a successful start / stop, ensuring that both the 'started'
 * event and the callback passed into client.start(...) are driven.  In both
 * cases 'this' should point at client that the event listener / callback is
 * associated with.
 * @param {object} test the unittest interface
 */
module.exports.test_successful_start_stop = function(test) {
  test.expect(9);
  var client =  mqlight.createClient({
    service: 'amqp://host',
    id: 'test_successful_start_stop'
  }, function(err, c) {
    test.equals('started', client.state);
    test.ok(this === client);
    test.ok(c == client);
  });

  client.on('started', function(x, y) {
    test.ok(this === client);
    test.equals(arguments.length, 0);
    test.equals(client.state, 'started');

    client.stop(function(err) {
      test.ok(this === client);
      test.equals(arguments.length, 0);
      test.equals(client.state, 'stopped');
      test.done();
    });
  });
};


/**
 * Test that the start event is fired on a subsequent tick from that in which
 * the createClient(...) call is run - meaning that it is possible to call
 * createClient(...) and client.on('start',...) on the same tick and
 * still have the event listener fire.
 * @param {object} test the unittest interface
 */
module.exports.test_listener_fired_on_subsequent_tick = function(test) {
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_listener_fired_on_subsequent_tick'
  });
  client.on('started', function() {
    client.stop();
    test.done();
  });
};


/**
 * Test that when an argument is specified to the client.start(...) function
 * it must be a callback (e.g. of type function).
 * @param {object} test the unittest interface
 */
module.exports.test_start_argument_is_function = function(test) {
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_start_argument_is_function'
  });
  test.throws(
      function() {
        client.start(1234);
      },
      TypeError,
      'start should throw TypeError if argument is not a function'
  );
  client.stop();
  test.done();
};


/**
 * Test that the start(...) method returns the instance of the client that
 * it is invoked on.  This is to allow chaining of methods.
 * @param {object} test the unittest interface
 */
module.exports.test_start_method_returns_client = function(test) {
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_start_method_returns_client'
  });
  var result = client.start(function() {client.stop();});
  test.ok(result === client);
  test.done();
};


/**
 * Tests that calling start on an already started client has no
 * effect other than to callback any supplied callback function
 * to indicate success.
 * @param {object} test the unittest interface
 */
module.exports.test_start_when_already_started = function(test) {
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_start_when_already_started'
  });
  client.start(function(err) {
    client.on('started', function(err) {
      test.ok(!err);
      test.ok(false, "shouldn't receive started event if already " +
              'started');
    });
    client.stop(function(err) {
      test.ok(!err);
      test.done();
    });
  });
};


/**
 * Tests that when calling start multiple times, all callbacks
 * get invoked.
 * @param {object} test the unittest interface
 */
module.exports.test_start_all_callbacks_called = function(test) {
  var count = 0;
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_start_all_callbacks_called'
  });
  var started = function(err) {
    test.ok(!err);
    count++;
    if (count == 3) {
      client.stop();
      test.done();
    }
  };
  client.start(started);
  client.start(started);
  client.start(started);
};


/**
 * Tests that when calling start, the callback gets invoked even
 * if nested inside another callback.
 * @param {object} test the unittest interface
 */
module.exports.test_start_nested_callback = function(test) {
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_start_nested_callback'
  }, function(err) {
    test.ok(!err);
    client.start(function(err) {
      test.ok(!err);
      client.stop();
      test.done();
    });
  });
};


/**
 * Test that if too many arguments are supplied to start - then they are
 * ignored.
 * @param {object} test the unittest interface
 */
module.exports.test_start_too_many_arguments = function(test) {
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_start_too_many_arguments'
  });
  client.start(function() {
    client.stop();
    test.done();
  }, 'gooseberry');
};


/**
 * Tests that calling start on an endpoint that is currently down retries
 * until successful.
 * @param {object} test the unittest interface
 */
module.exports.test_start_retry = function(test) {
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_start_retry'
  });
  var requiredConnectStatus = 2;

  client.on('error', function(err) {
    requiredConnectStatus--;
    stubproton.setConnectStatus(requiredConnectStatus);
  });

  stubproton.setConnectStatus(requiredConnectStatus);
  client.start(function(err) {
    test.ifError(err);
    test.equals(requiredConnectStatus, 0);
    client.stop();
    test.done();
  });
};


/**
 * Tests that calling start with multiple endpoints, some bad and some valid,
 * that the start will be successful and connect to a valid endpoint.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_start_multiple_endpoints = function(test) {
  var services = ['amqp://bad1', 'amqp://fail', 'amqp://host', 'amqp://bad2'];
  var client = mqlight.createClient({
    service: services,
    id: 'test_start_multiple_endpoints'
  });
  client.start(function() {
    test.equals(client.service, 'amqp://host:5672');
    client.stop();
    test.done();
  });
};


/**
 * Tests that calling start with a function to specify the endpoints, that the
 * start operation will keep retrying, calling the function again for each
 * retry, until a valid endpoint can be connected to.
 * @param {object} test the unittest interface
 */
module.exports.test_start_variable_endpoints = function(test) {
  var services = ['amqp://bad1',
    'amqp://fail',
    'amqp://host:1234',
    'amqp://bad2'];
  var index = 0;
  var serviceFunction = function(callback) {
    test.ok(index < services.length);
    var result = services[index++];
    callback(undefined, result);
  };
  var client = mqlight.createClient({
    service: serviceFunction,
    id: 'test_start_variable_endpoints'
  });
  client.on('error', function(err) {
    test.ok(err.message.indexOf('bad') != -1);
  });
  client.start(function() {
    test.equals(client.service, 'amqp://host:1234');
    client.stop();
    test.done();
  });
};


/**
 * Tests that when calling start with a function to specify the
 * endpoints invalid services are detected.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_start_bad_endpoints = function(test) {
  var services = [
    {service: 123, error: 'TypeError: service must be a string or array type'},
    {service: [], error: 'TypeError: service array is empty'},
    {service: function() {}, error: 'TypeError: service cannot be a function'}
  ];
  var index = 0;
  var serviceFunction = function(callback) {
    test.ok(index < services.length);
    var result = services[index];
    callback(undefined, result.service);
  };
  var startCallback = function(err) {
    test.ok(err instanceof TypeError);
    test.equal(err, services[index++].error, 'Incorrect error message');
    if(index === services.length) {
      this.stop();
      test.done();
    } else {
      test.equals('stopped', this.state);
      this.start(startCallback);
    }
  };
  mqlight.createClient({
    service: serviceFunction,
    id: 'test_start_bad_endpoints'
  }, startCallback);
};


/**
 * Tests that calling start whilst still stopping will be
 * successful only when the stop completes
 * @param {object} test the unittest interface
 */
module.exports.test_start_stop_timing = function(test) {
  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_start_stop_timing'
  });
  client.start(function() {
    stubproton.blockSendCompletion();
    client.send('topic', 'message');
    client.stop();
    client.start(function(err) {
      test.ifError(err);
      client.stop();
      test.done();
    });
    setTimeout(stubproton.unblockSendCompletion, 10);
  });
};


/**
 * Tests that calling start with an HTTP URI to lookup the endpoint, that
 * the start operation will keep retrying, performing the http request for
 * each retry, until it returns a valid endpoint that can be connected to.
 * @param {object} test the unittest interface
 */
module.exports.test_start_http_changing_endpoint = function(test) {
  var amqpServices = [
    'amqp://bad1',
    'amqp://fail',
    'amqp://host:1234',
    'amqp://bad2'
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
    service: 'http://127.0.0.1:9999',
    id: 'test_start_http_changing_endpoint'
  });
  client.on('error', function(err) {
    test.ok(err.message.indexOf('bad1') != -1 ||
            err.message.indexOf('fail') != -1);
  });
  client.start(function(err) {
    test.ifError(err);
    test.equals(client.service, 'amqp://host:1234',
                'Connected to wrong service. ');
    client.stop();
    test.done();
    http.request = originalHttpRequestMethod;
  });
};


/**
 * Tests that calling start with an HTTP URI to lookup the endpoint, that the
 * start operation will retry each endpoint in the returned list first,
 * before then performing the http request again.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_start_http_multiple_endpoints = function(test) {
  var amqpServices = [
    ['amqp://bad1', 'amqp://bad2', 'amqp://bad3', 'amqp://bad4'],
    ['amqp://fail', 'amqp://bad5', 'amqp://host:1234', 'amqp://bad6']
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
    service: 'http://127.0.0.1:9999',
    id: 'test_start_http_multiple_endpoints'
  });
  // error will be emitted for the last service in the returned endpoint list
  client.on('error', function(err) {
    test.ok(err.message.indexOf('bad4') != -1);
  });
  client.start(function(err) {
    test.ifError(err);
    test.equals(client.service, 'amqp://host:1234',
                'Connected to wrong service. ');
    client.stop();
    test.done();
    http.request = originalHttpRequestMethod;
  });
};


/**
 * Tests that calling start with a bad HTTP URI returns the underlying http
 * error message to the start callback.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_start_http_connection_refused = function(test) {
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
    service: 'http://127.0.0.1:9999',
    id: 'test_start_http_connection_refused'
  }, function(err) {
    test.ok(err instanceof Error);
    test.ok(/connect ECONNREFUSED/.test(err));
    client.stop();
    test.done();
    http.request = originalHttpRequestMethod;
  });
};


/**
 * Tests that calling start with a bad HTTPS URI returns the
 * underlying http error message to the start callback.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_start_https_connection_refused = function(test) {
  var originalHttpsRequestMethod = https.request;
  https.request = function(url, callback) {
    var req = new EventEmitter();
    req.setTimeout = function() {};
    req.end = function() {
      req.emit('error', new Error('connect ECONNREFUSED'));
    };
    return req;
  };
  var client = mqlight.createClient({
    service: 'https://127.0.0.1:9999',
    id: 'test_start_https_connection_refused'
  }, function(err) {
    test.ok(err instanceof Error);
    test.ok(/connect ECONNREFUSED/.test(err));
    client.stop();
    test.done();
    https.request = originalHttpsRequestMethod;
  });
};


/**
 * Tests that the HTTP URI returning malformed JSON is coped with.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_start_http_bad_json = function(test) {
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
    service: 'http://127.0.0.1:9999',
    id: 'test_start_http_bad_json'
  }, function(err) {
    test.ok(err instanceof Error);
    test.ok(/unparseable JSON/.test(err));
    test.ok(/Unexpected token \(/.test(err));
    client.stop();
    test.done();
    http.request = originalHttpRequestMethod;
  });
};


/**
 * Tests that a malformed AMQP service URL returned by HTTP function is coped
 * with.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_start_http_bad_amqp_service = function(test) {
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
        var data = '{"service":' + ' [ "amqp://myserver:****" ]}';
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
    service: 'http://127.0.0.1:9999',
    id: 'test_start_http_bad_amqp_service'
  }, function(err) {
    test.ok(err instanceof Error);
    test.ok(/Unsupported URL/.test(err));
    test.ok(/amqp:\/\/myserver:\*\*\*\*/.test(err));
    client.stop();
    test.done();
    http.request = originalHttpRequestMethod;
  });
};


/**
 * Tests that a timeout during the HTTP request is coped with.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_start_http_timeout = function(test) {
  var originalHttpRequestMethod = http.request;
  http.request = function(url, callback) {
    var req = new EventEmitter();
    req.setTimeout = function(timeout, callback) {
      // trigger the timeout callback immediately
      setTimeout(callback, 0);
    };
    req.end = function() {};
    return req;
  };
  var client = mqlight.createClient({
    service: 'http://127.0.0.1:9999',
    id: 'test_start_http_timeout'
  }, function(err) {
    test.ok(err instanceof Error);
    test.ok(/http request to http:\/\/127.0.0.1:9999\/ timed out/.test(err));
    client.stop();
    test.done();
    http.request = originalHttpRequestMethod;
  });
};


/**
 * Tests that a bad HTTP status code is coped with.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_start_http_bad_status = function(test) {
  var firstTime = true;
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
        if (firstTime) {
          firstTime = false;
          res.emit('data', 'STATUSDATA');
        }
        res.emit('end');
      } catch (e) {
        console.error(e);
        test.fail(e);
      }
    };
    return req;
  };
  var client = mqlight.createClient({
    service: 'http://127.0.0.1:9999',
    id: 'test_start_http_bad_status1'
  }, function(err) {
    test.ok(err instanceof Error);
    test.ok(/failed with a status code of 404: STATUSDATA$/.test(err));
    client.stop();
  });
  var client2 = mqlight.createClient({
    service: 'http://127.0.0.1:9999',
    id: 'test_start_http_bad_status2'
  }, function(err) {
    test.ok(err instanceof Error);
    test.ok(/failed with a status code of 404$/.test(err));
    client2.stop();
    test.done();
    http.request = originalHttpRequestMethod;
  });
};


/**
 * Tests that calling start with a FILE URI to lookup the endpoint, that
 * the start operation will keep retrying, performing the file read for
 * each retry, until it returns a valid endpoint that can be connected to.
 * @param {object} test the unittest interface
 */
module.exports.test_start_file_changing_endpoint = function(test) {
  var amqpServices = [
    'amqp://bad1',
    'amqp://fail',
    'amqp://host:1234',
    'amqp://bad2'
  ];
  var originalReadFileMethod = fs.readFile;
  var index = 0;
  fs.readFile = function(filename, options, callback) {
    try {
      test.equals(filename, '/tmp/filename.json',
                  'Incorrect filename passed: ' + filename);
      test.ok(index < amqpServices.length);
      var data = '{"service":["' + amqpServices[index++] + '"]}';
      if (callback) callback(undefined, data);
    } catch (e) {
      console.error(e);
      test.fail(e);
    }
  };
  var client = mqlight.createClient({
    service: 'file:///tmp/filename.json',
    id: 'test_start_file_changing_endpoint'
  });
  client.on('error', function(err) {
    test.ok(err.message.indexOf('bad1') != -1 ||
            err.message.indexOf('fail') != -1);
  });
  client.start(function(err) {
    test.ifError(err);
    test.ok(client.service);
    test.equals(client.service, 'amqp://host:1234',
                'Connected to wrong service. ' + client.service);
    client.stop();
    test.done();
    fs.readFile = originalReadFileMethod;
  });
};


/**
 * Tests that calling start with a FILE URI to lookup the endpoint, that the
 * start operation will retry each endpoint in the returned list first,
 * before then performing the file read again.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_start_file_multiple_endpoints = function(test) {
  var amqpServices = [
    ['amqp://bad1', 'amqp://bad2', 'amqp://bad3', 'amqp://bad4'],
    ['amqp://fail', 'amqp://bad5', 'amqp://host:1234', 'amqp://bad6']
  ];
  var originalReadFileMethod = fs.readFile;
  var index = 0;
  fs.readFile = function(filename, options, callback) {
    try {
      test.equals(filename, '/tmp/filename.json',
                  'Incorrect filename passed: ' + filename);
      test.ok(index < amqpServices.length);
      var data = '{"service":' + JSON.stringify(amqpServices[index++]) +
                 '}';
      if (callback) callback(undefined, data);
    } catch (e) {
      console.error(e);
      test.fail(e);
    }
  };
  var client = mqlight.createClient({
    service: 'file:///tmp/filename.json',
    id: 'test_start_file_multiple_endpoints'
  });
  // error will be emitted for the last service in the returned endpoint list
  client.once('error', function(err) {
    test.ok(err.message.indexOf('bad4') != -1);
  });
  client.start(function(err) {
    test.ifError(err);
    test.equals(client.service, 'amqp://host:1234',
                'Connected to wrong service. ');
    client.stop();
    test.done();
    fs.readFile = originalReadFileMethod;
  });
};


/**
 * Tests that calling start with a bad FILE URI returns the underlying
 * error message to the start callback.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_start_bad_file = function(test) {
  var client = mqlight.createClient({
    service: 'file:///badfile.json',
    id: 'test_start_bad_file'
  }, function(err) {
    test.ok(err instanceof Error);
    test.ok(/ENOENT/.test(err));
    client.stop();
    test.done();
  });
};


/**
 * Tests that calling start with a non-localhost FILE URI throws an error.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_start_bad_remote_file_uri = function(test) {
  test.throws(
      function() {
        mqlight.createClient({
          service: 'file://remote.example.com/badfile.json',
          id: 'test_start_bad_remote_file_uri'
        });
      },
      Error,
      /unsupported file URI/
  );
  test.done();
};


/**
 * Tests that calling start with a Windows drive letter works correctly.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_start_windows_drive_letter_file_uri = function(test) {
  var originalPlatformMethod = os.platform;
  os.platform = function() {
    return 'win32';
  };
  var client = mqlight.createClient({
    service: 'file:///D:/test/path/file.json',
    id: 'test_start_windows_drive_letter_file_uri'
  }, function(err) {
    test.ifError(err);
  });
  var originalReadFileMethod = fs.readFile;
  fs.readFile = function(filename, options, callback) {
    test.equals(filename, 'D:/test/path/file.json',
                'Incorrect filename passed: ' + filename);
    var data = '{"service":' + JSON.stringify('amqp://host') + '}';
    if (callback) callback(undefined, data);
    client.stop();
    test.done();
    fs.readFile = originalReadFileMethod;
    os.platform = originalPlatformMethod;
  };

};


/**
 * Tests that the FILE URI returning malformed JSON is coped with.
 *
 * @param {object} test the unittest interface
 */
module.exports.test_start_file_bad_json = function(test) {
  var originalReadFileMethod = fs.readFile;
  fs.readFile = function(filename, options, callback) {
    test.equals(filename, '/badjson.json',
                'Incorrect filename passed: ' + filename);
    try {
      var data = '(╯°□°)╯︵ ┻━┻';
      if (callback) callback(undefined, data);
    } catch (e) {
      console.error(e);
      test.fail(e);
    }
  };
  var client = mqlight.createClient({
    service: 'file://localhost/badjson.json',
    id: 'test_start_file_bad_json'
  }, function(err) {
    test.ok(err instanceof Error);
    test.ok(/unparseable JSON/.test(err));
    test.ok(/Unexpected token \(/.test(err));
    client.stop();
    test.done();
    fs.readFile = originalReadFileMethod;
  });
};

/**
 * Test that passing various combinations of user and password into the
 * createClient(...) method works (or fails) as expected.
 *
 * @param {object} test the unittest interface
 */

module.exports.test_start_user_password_options = function(test) {
  var data = [
    { desc: '00: no user or password specified anywhere',
      service: 'amqp://host',
      id: 'test_start_user_password_options.00',
      user: undefined,
      password: undefined,
      valid: true,
      expect_user: undefined,
      expect_password: undefined },
    { desc: '01: user specified as a property - but no password',
      service: 'amqp://host',
      id: 'test_start_user_password_options.01',
      user: 'user',
      password: undefined,
      valid: false },
    { desc: '02: no user or password specified anywhere',
      service: 'amqp://host',
      id: 'test_start_user_password_options.02',
      user: undefined,
      password: 'password',
      valid: false },
    { desc: '03: user in (String) URL, no properties set',
      service: 'amqp://user@host',
      id: 'test_start_user_password_options.03',
      user: undefined,
      password: undefined,
      valid: false },
    { desc: '04: user/password in (String) URL, no properties set',
      service: 'amqp://user:pass@host',
      id: 'test_start_user_password_options.04',
      user: undefined,
      password: undefined,
      valid: true,
      expect_user: 'user',
      expect_password: 'pass' },
    { desc: '05: user/password in (String) URL, user mismatches properties',
      service: 'amqp://user1:pass1@host',
      id: 'test_start_user_password_options.05',
      user: 'user2',
      password: 'pass1',
      valid: false },
    { desc: '06: password in (String) URL does not match password property',
      service: 'amqp://user1:pass1@host',
      id: 'test_start_user_password_options.06',
      user: 'user1',
      password: 'pass2',
      valid: false },
    { desc: '07: String URL and properties all specify matching values',
      service: 'amqp://user1:pass1@host',
      id: 'test_start_user_password_options.07',
      user: 'user1',
      password: 'pass1',
      valid: true,
      expect_user: 'user1',
      expect_password: 'pass1' },
    { desc: '08: Array URLs have mixture of embedded auth #1',
      service: ['amqp://user1:pass1@host', 'amqp://host'],
      id: 'test_start_user_password_options.08',
      user: undefined,
      password: undefined,
      valid: false },
    { desc: '09: Array URLs have mixture of embedded auth #2',
      service: ['amqp://host', 'amqp://user1:pass1@host'],
      id: 'test_start_user_password_options.09',
      user: undefined,
      password: undefined,
      valid: false },
    { desc: '10: Array URLs have matching users but different passwords',
      service: ['amqp://user1:pass1@host', 'amqp://user1:pass2@host'],
      id: 'test_start_user_password_options.10',
      user: undefined,
      password: undefined,
      valid: false },
    { desc: '11: Array URLs have matching passwords but different users',
      service: ['amqp://user1:pass1@host', 'amqp://user2:pass1@host'],
      id: 'test_start_user_password_options.11',
      user: undefined,
      password: undefined,
      valid: false },
    { desc: '12: Array URLs have matching user/passwords - no properties',
      service: ['amqp://user1:pass1@host', 'amqp://user1:pass1@host'],
      id: 'test_start_user_password_options.12',
      user: undefined,
      password: undefined,
      valid: true,
      expect_user: 'user1',
      expect_password: 'pass1' },
    { desc: '13: Array URLs and properties all match',
      service: ['amqp://user1:pass1@host', 'amqp://user1:pass1@host'],
      id: 'test_start_user_password_options.13',
      user: 'user1',
      password: 'pass1',
      valid: true,
      expect_user: 'user1',
      expect_password: 'pass1' },
    { desc: '14: Array URLs have same values but user property different',
      service: ['amqp://user1:pass1@host', 'amqp://user1:pass1@host'],
      id: 'test_start_user_password_options.14',
      user: 'user2',
      password: 'pass1',
      valid: false },
    { desc: '15: Array URLs have same values but password property different',
      service: ['amqp://user1:pass1@host', 'amqp://user1:pass1@host'],
      id: 'test_start_user_password_options.15',
      user: 'user1',
      password: 'pass2',
      valid: false },
    { desc: '16: Func returns String value with user/password',
      service: function(cb) {cb(undefined, 'amqp://user1:pass1@host');},
      id: 'test_start_user_password_options.16',
      user: undefined,
      password: undefined,
      valid: true,
      expect_user: 'user1',
      expect_password: 'pass1' },
    { desc: '17: Func returns String without auth, user/pass props',
      service: function(cb) {cb(undefined, 'amqp://host');},
      id: 'test_start_user_password_options.17',
      user: 'user1',
      password: 'pass1',
      valid: true,
      expect_user: 'user1',
      expect_password: 'pass1' },
    { desc: '18: Func returns String with user/pass matches properties',
      service: function(cb) {cb(undefined, 'amqp://user1:pass1@host');},
      id: 'test_start_user_password_options.18',
      user: 'user1',
      password: 'pass1',
      valid: true,
      expect_user: 'user1',
      expect_password: 'pass1' },
    { desc: '19: Func returns URI with only user - no other values',
      service: function(cb) {cb(undefined, 'amqp://user1@host');},
      id: 'test_start_user_password_options.19',
      user: undefined,
      password: undefined,
      valid: false },
    { desc: '20: Func returns Array with different credentials in URLs #1',
      service: function(cb) {
        cb(undefined, ['amqp://host', 'amqp://user1:pass1@host']);},
      id: 'test_start_user_password_options.20',
      user: undefined,
      password: undefined,
      valid: false },
    { desc: '21: Func returns Array with different credentials in URLs #2',
      service: function(cb) {
        cb(undefined, ['amqp://user1:pass1@host', 'amqp://host']);},
      id: 'test_start_user_password_options.21',
      user: undefined,
      password: undefined,
      valid: false },
    { desc: '22: Func returns Array with users mismatching in URLs',
      service: function(cb) {
        cb(undefined, ['amqp://user1:pass1@host', 'amqp://user2:pass1@host']);},
      id: 'test_start_user_password_options.22',
      user: undefined,
      password: undefined,
      valid: false },
    { desc: '23: Func returns URLs that mismatch on password',
      service: function(cb) {
        cb(undefined, ['amqp://user1:pass1@host', 'amqp://user1:pass2@host']);},
      id: 'test_start_user_password_options.23',
      user: undefined,
      password: undefined,
      valid: false },
    { desc: '24: Func returns URLs that match each other but mismatch props',
      service: function(cb) {
        cb(undefined, ['amqp://user1:pass1@host', 'amqp://user1:pass1@host']);},
      id: 'test_start_user_password_options.24',
      user: 'user2',
      password: 'pass1',
      valid: false },
    { desc: '25: Func returns URLs with user/pass that match properties',
      service: function(cb)  // 25: Everything specified, everything matches
      {cb(undefined, ['amqp://user1:pass1@host', 'amqp://user1:pass1@host']);},
      id: 'test_start_user_password_options.25',
      user: 'user1',
      password: 'pass1',
      valid: true,
      expect_user: 'user1',
      expect_password: 'pass1'
    }
  ];

  var runtest = function(i) {
    if (i === data.length) {
      test.done();
    } else {
      try {
        var lastUsr;
        var lastPw;
        var client = mqlight.createClient(data[i], function(err) {
          if (err) {
            test.ok(!data[i].valid,
                    'index #' + i + ' should have been accepted\n' +
                    data[i].desc + '\n' + err + '\n' + JSON.stringify(data[i]));
          } else {
            test.ok(data[i].valid,
                    'index #' + i + ' should have been rejected\n' +
                    data[i].desc + '\n' + JSON.stringify(data[i]));
            if (data[i].valid) {
              test.equal(lastUsr, data[i].expect_user, 'index #' + i +
                         ' passed wrong username ' + lastUsr + ' to the ' +
                         'underlying proton messenger');
              test.equal(lastPw, data[i].expect_password, 'index #' + i +
                         ' passed wrong password ' + lastPw + ' to the ' +
                         'underlying proton messenger');
            }
          }
          client.stop(function() {
            runtest(++i);
          });
        });
        var originalConnect = client._messenger.connect;
        client._messenger.connect = function(connectUrl, connOpts) {
          var auth = connectUrl.auth;
          if (auth) {
            lastUsr = String(auth).slice(0, auth.indexOf(':'));
            lastPw = String(auth).slice(auth.indexOf(':') + 1);
          } else {
            lastUsr = undefined;
            lastPw = undefined;
          }

          return originalConnect.apply(this, [connectUrl, connOpts]);
        };
      } catch (e) {
        test.ok(!data[i].valid,
                'index #' + i + ' should have been accepted\n' +
                data[i].desc + '\n' + e + '\n' + JSON.stringify(data[i]));
        runtest(++i);
      }
    }
  };

  runtest(0);
};


