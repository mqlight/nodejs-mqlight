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
 * (C) Copyright IBM Corp. 2013, 2016
 *
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with
 * IBM Corp.
 * </copyright>
 */
/* jslint node: true */
/* jshint -W083,-W097 */
'use strict';


/** NODE_ENV = 'unittest' loads a stub instead of the Proton library */
process.env.NODE_ENV = 'unittest';
var testCase = require('nodeunit').testCase;
var mqlight = require('../mqlight');
var fs = require('fs');


/**
 * Tests the golden path through using a client.
 * @param {object} test - test case.
 */
module.exports.test_golden_path = function(test) {
  test.expect(6);
  var opts = {service: 'amqp://myhost.1234:5672', id: 'test_golden_path'};
  var client = mqlight.createClient(opts, function(err) {
    if (err) {
      console.log('error on start: ' + err);
      test.ok(false);
      test.done();
    }
  });
  test.ok(typeof client === 'object', 'CreateClient returns an object');
  test.equal('test_golden_path', client.id, 'Client id equals what was set');
  test.equal('starting', client.state,
             'Initial state is starting');
  test.equal(undefined, client.service,
             'Service is undefined before a client attains started state');


  client.on('started', function() {

    test.equal('started', client.state,
               'Client state equals started once the started event is ' +
               'emitted');
    test.equal(opts.service, client.service,
               'Supplied service matches result of client.service property ' +
               'after start');
    client.stop();
    test.done();
  });
};


/**
 * Test that a service name must be a string value.
 * @param {object} test - test case.
 */
module.exports.test_service_not_a_string = function(test) {
  test.throws(function() {
    mqlight.createClient({service: 123, id: 'test_service_not_a_string'});
  }, function(err) {
    if ((err instanceof TypeError) &&
        /service must be a string or array type/.test(err)) {
      return true;
    }
  }, 'Service parameter as non string/array test');
  test.done();
};


/**
 * Test that passing no values to createClient is not valid.
 * @param {object} test - test case.
 */
module.exports.test_createClient_must_have_a_value = function(test) {
  test.throws(function() {
    mqlight.createClient();
  }, function(err) {
    if ((err instanceof TypeError) &&
        /options object missing/.test(err)) {
      return true;
    }
  }, 'some properties must be passed to createClient(...)');

  test.throws(function() {
    mqlight.createClient(function() {});
  }, function(err) {
    if ((err instanceof TypeError) &&
        /options object missing/.test(err)) {
      return true;
    }
  }, 'some properties must be passed to createClient(...)');

  test.done();
};


/**
 * Test that only a function() is accepted as the callback argument on
 * createClient
 *
 * @param {object} test - test case.
 */
module.exports.test_createClient_callback_must_be_function = function(test) {
  test.throws(function() {
    mqlight.createClient({
      id: 'test_createClient_callback_must_be_function'
    }, 1);
  }, function(err) {
    if ((err instanceof TypeError) &&
        /Callback argument must be a function/.test(err)) {
      return true;
    }
  }, 'only a function can be passed to createClient(...) as a callback');

  test.done();
};


/**
 * Test that omitting the 'service' property from createClient causes an error.
 * @param {object} test - test case.
 */
module.exports.test_createClient_must_have_service_value = function(test) {
  test.throws(function() {
    mqlight.createClient({id: 'test_createClient_must_have_service_value'});
  }, function(err) {
    if ((err instanceof TypeError) && /service is undefined/.test(err)) {
      return true;
    }
  }, 'service property must be specified to createClient(...)');

  test.done();
};


/**
 * Test that, providing the thing passed into createClient(...) has a 'service'
 * property - then it's happy...
 * @param {object} test - test case.
 */
module.exports.test_createClient_ignores_unknown_properties = function(test) {
  var oddOpts = {};
  oddOpts.service = 'amqp://localhost';
  oddOpts.id = 'test_createClient_ignores_unknown_properties';
  oddOpts.fruit = 'avocado';
  oddOpts.size = 3;
  mqlight.createClient(oddOpts, function(err, client) {
    client.stop(function() {
      test.done();
    });
  });
};


/**
 * Test a range of types / values for client IDs.
 * @param {object} test - test case.
 */
module.exports.test_id_types_values = function(test) {
  var testData = [{data: 1234, valid: true},
                  {data: null, valid: true},
                  {data: true, valid: true},
                  {data: 'abc123', valid: true},
                  {data: ':1234', valid: false},
                  {data: '1234:', valid: false},
                  {data: '12:34', valid: false},
                  {data: new Array(257).join('x'), valid: true},
                  {data: new Array(258).join('x'), valid: false},
                  {data: 'abcDEF._/%', valid: true}];

  var runTest = function(i) {
    try {
      var opts = {service: 'amqp://localhost', id: testData[i].data};
      mqlight.createClient(opts, function(err, client) {
        test.ok(!err);
        client.stop((i == testData.length - 1) ? test.done : runTest(i + 1));
      });
      test.ok(testData[i].valid, "Expected '" + testData[i].data +
          "' to be invalid");
    } catch (_) {
      if (testData[i].valid) {
        console.log(testData[i]);
        throw _;
      }
      test.ok(_ instanceof mqlight.InvalidArgumentError);
      if (i < (testData.length - 1)) {
        runTest(i + 1);
      } else {
        test.done();
      }
    }
  };

  runTest(0);
};


/**
 * Test that if the 'id' property is omitted then a client id will be
 * generated.
 * @param {object} test - test case.
 */
module.exports.test_id_autogenerated = function(test) {
  var client =
      mqlight.createClient({service: 'amqp://localhost:5672'}, function() {
                 client.stop(test.done);
               });

  test.ok(/AUTO_[a-z0-9]{7}/.test(client.id), 'weird generated id: ' +
          client.id);
};


/**
 * Test a range of user and password types / values.
 * @param {object} test - test case.
 */
module.exports.test_user_password_types_values = function(test) {
  var testData = [{user: 'abc', password: undefined, valid: false},
                  {user: undefined, password: 'abc', valid: false},
                  {user: 'abc', password: '123', valid: true},
                  {user: 1234, password: 'abc', valid: true},
                  {user: 'abc', password: 1234, valid: true},
                  {user: '!"$%^&*()-_=+[{]};:\'@#~|<,>.?/',
          password: '!"$%^&*()-_=+[{]};:\'@#~|<,>.?/',
          valid: true}];

  var runTests = function(i) {
    try {
      var opts = {
        service: 'amqp://localhost:5672',
        id: 'test_user_password_types_values'+i,
        user: testData[i].user,
        password: testData[i].password
      };

      mqlight.createClient(opts, function(err, client) {
        test.ok(!err);
        client.stop((i < testData.length - 1) ? runTests(i + 1) : test.done);
      });
      test.ok(testData[i].valid, "Expected '" + testData[i].user + '/' +
              testData[i].password + "' to be invalid");
    } catch (_) {
      if (testData[i].valid) {
        console.log(i);
        throw _;
      }
      test.ok(_ instanceof mqlight.InvalidArgumentError);
      if (i < testData.length - 1) {
        runTests(i + 1);
      } else {
        test.done();
      }
    }
  };

  runTests(0);
};


/**
 * Test that a clear-text password isn't trivially recoverable from the client
 * object.
 * @param {object} test - test case.
 */
module.exports.test_password_hidden = function(test) {
  var opts = {
    service: 'amqp://localhost:5672',
    id: 'test_password_hidden',
    user: 'bob',
    password: 's3cret'
  };
  var client = mqlight.createClient(opts);
  var inspectedClient = require('util').inspect(client);
  test.ok(!/s3cret/.test(inspectedClient), inspectedClient);
  client.stop();
  test.done();
};


/**
 * Test a range of invalid URIs are rejected.
 * @param {object} test - test case.
 */
module.exports.test_invalid_URIs = function(test) {
  var invalidUris = ['amqp://amqp://Wrong',
                     'amqp://localhost:34:34',
                     'amqp://test:-34',
                     'amqp://here:34/path',
                     'amqp://rupert@NotThere',
                     'amqp://:34',
                     "ce n'est pas une uri"];
  test.expect(invalidUris.length);
  for (var i = 0; i < invalidUris.length; i++) {
    test.throws(function() {
      var opts = {
        service: invalidUris[i],
        id: 'test_invalid_URIs'+i
      };
      mqlight.createClient(opts);
    }, function(err) {
      if (err instanceof mqlight.InvalidArgumentError) {
        return true;
      }
    }, 'invalid URI test (' + i + '): ' + invalidUris[i]);
  }
  test.done();
};


/**
 * Test that the value returned by client.service is a lower cased URL
 * which always has a port number.
 * @param {object} test - test case.
 */
module.exports.test_valid_URIs = function(test) {
  var testData = [{uri: 'amqp://host', expected: 'amqp://host:5672'},
                  {uri: 'amqps://host', expected: 'amqps://host:5671'},
                  {uri: 'AmQp://HoSt', expected: 'amqp://host:5672'},
                  {uri: 'aMqPs://hOsT', expected: 'amqps://host:5671'},
                  {uri: 'amqp://host:1234', expected: 'amqp://host:1234'},
                  {uri: 'amqps://host:4321', expected: 'amqps://host:4321'},
                  {uri: 'aMqP://HoSt:1234', expected: 'amqp://host:1234'},
                  {uri: 'AmQpS://hOsT:4321', expected: 'amqps://host:4321'},
                  {uri: 'amqp://user:pass@host:1234',
                    expected: 'amqp://host:1234'}];
  var count = 0;
  var clientTest = function(uri, expected) {
    var client = mqlight.createClient({
      service: uri,
      id: 'test_valid_URIs'+count
    });
    client.start(function(err) {
      test.ok(!err);
      test.equals(expected, client.service);
      client.stop();
      ++count;
      if (count == testData.length) {
        test.done();
      } else {
        clientTest(testData[count].uri, testData[count].expected);
      }
    });
  };

  clientTest(testData[count].uri, testData[count].expected);
};


/**
 * Test that if too many arguments are supplied to createClient - then they are
 * ignored.
 * @param {object} test the unittest interface
 */
module.exports.test_createClient_too_many_arguments = function(test) {
  mqlight.createClient({
    service: 'amqp://host',
    id: 'test_createClient_too_many_arguments'
  }, function(err) {
    test.ok(!err);
  }, 'wallflower').stop();
  test.done();
};


/**
 * Test that bad SSL options cause createClient to fail
 * @param {object} test - test case.
 */
module.exports.test_bad_ssl_options = function(test) {
  var testData = [{sslTrustCertificate: 1, sslVerifyName: true},
                  {sslTrustCertificate: {a: 1}, sslVerifyName: true},
                  {sslTrustCertificate: true, sslVerifyName: true},
                  {sslTrustCertificate: 'ValidCertificate', sslVerifyName: 'a'},
                  {sslTrustCertificate: 'ValidCertificate', sslVerifyName: 1},
                  {sslTrustCertificate: 'ValidCertificate',
                    sslVerifyName: {a: 1}},
                  {sslTrustCertificate: 'MissingCertificate',
                    sslVerifyName: true},
                  {sslTrustCertificate: 'dirCertificate',
                    sslVerifyName: true},
                  {sslClientCertificate: 1, sslClientKey: 'ValidKey',
                    sslClientKeyPassphrase: 'b' },
                  {sslClientCertificate: {a: 1}, sslClientKey: 'ValidKey',
                    sslClientKeyPassphrase: 'b' },
                  {sslClientCertificate: true, sslClientKey: 'ValidKey',
                    sslClientKeyPassphrase: 'b' },
                  {sslClientCertificate: 'MissingCertificate',
                    sslClientKey: 'ValidKey',
                    sslClientKeyPassphrase: 'b' },
                  {sslClientCertificate: 'dirCertificate',
                    sslClientKey: 'ValidKey', sslClientKeyPassphrase: 'b' },
                  {sslClientCertificate: 'ValidCertificate',
                    sslClientKey: 1, sslClientKeyPassphrase: 'b' },
                  {sslClientCertificate: 'ValidCertificate',
                    sslClientKey: {a: 1}, sslClientKeyPassphrase: 'b'},
                  {sslClientCertificate: 'ValidCertificate',
                    sslClientKey: 'MissingKey', sslClientKeyPassphrase: 1},
                  {sslClientCertificate: 'ValidCertificate',
                    sslClientKey: 'dirCertificate', sslClientKeyPassphrase: 1},
                  {sslClientCertificate: 'ValidCertificate',
                    sslClientKey: 'ValidKey', sslClientKeyPassphrase: 1},
                  {sslClientCertificate: 'ValidCertificate',
                    sslClientKey: 'ValidKey', sslClientKeyPassphrase: {a: 1}},
                  {sslClientCertificate: 'ValidCertificate' },
                  {sslClientCertificate: 'ValidCertificate',
                    sslClientKey: 'ValidKey' },
                  {sslClientCertificate: 'ValidCertificate',
                    sslClientKeyPassphrase: 'b' },
                  {sslClientKey: 'ValidKey' },
                  {sslClientKey: 'ValidKey', sslClientKeyPassphrase: 'b' },
                  {sslClientKeyPassphrase: 'b' },
                  {sslKeystore: 'ValidKeystore'},
                  {sslKeystore: 1, sslKeystorePassphrase: 'a'},
                  {sslKeystore: {a: 1}, sslKeystorePassphrase: 'a'},
                  {sslKeystore: true, sslKeystorePassphrase: 'a'},
                  {sslKeystore: 'ValidKeystore', sslKeystorePassphrase: 1},
                  {sslKeystore: 'ValidKeystore',
                    sslKeystorePassphrase: {a: 1}},
                  {sslKeystore: 'MissingKeystore', sslKeystorePassphrase: 'a'},
                  {sslKeystore: 'dirCertificate', sslKeystorePassphrase: 'a'},
                  {sslKeystore: 'ValidKeystore', sslKeystorePassphrase: 'a',
                    sslTrustCertificate: 'ValidCertificate'},
                  {sslKeystore: 'ValidKeystore', sslKeystorePassphrase: 'a',
                    sslClientCertificate: 'ValidCertificate'},
                  {sslKeystore: 'ValidKeystore', sslKeystorePassphrase: 'a',
                    sslClientKey: 'ValidCertificate'}];
  var validCertificateFd = fs.openSync('ValidCertificate', 'w');
  var validKeyFd = fs.openSync('ValidKey', 'w');
  var validKeystoreFd = fs.openSync('ValidKeystore', 'w');
  fs.mkdirSync('dirCertificate');
  test.expect(testData.length);
  for (var i = 0; i < testData.length; i++) {
    test.throws(function() {
      var opts = {
        service: 'amqps://host',
        id: 'test_bad_ssl_options_' + i
      };
      if (testData[i].sslTrustCertificate !== undefined) {
        opts.sslTrustCertificate = testData[i].sslTrustCertificate;
      }
      if (testData[i].sslVerifyName !== undefined) {
        opts.sslVerifyName = testData[i].sslVerifyName;
      }
      if (testData[i].sslKeystore !== undefined) {
        opts.sslKeystore = testData[i].sslKeystore;
      }
      if (testData[i].sslKeystorePassphrase !== undefined) {
        opts.sslKeystorePassphrase = testData[i].sslKeystorePassphrase;
      }
      if (testData[i].sslClientCertificate !== undefined) {
        opts.sslClientCertificate = testData[i].sslClientCertificate;
      }
      if (testData[i].sslClientKey !== undefined) {
        opts.sslClientKey = testData[i].sslClientKey;
      }
      if (testData[i].sslClientKeyPassphrase !== undefined) {
        opts.sslClientKeyPassphrase = testData[i].sslClientKeyPassphrase;
      }
      mqlight.createClient(opts);
    }, function(err) {
      if (err instanceof TypeError) {
        return true;   
      }
    }, 'invalid bad ssl options test (' + i + '): ' + testData[i]);
  }
  test.done();
  fs.close(validCertificateFd); fs.unlinkSync('ValidCertificate');
  fs.close(validKeyFd); fs.unlinkSync('ValidKey');
  fs.close(validKeystoreFd); fs.unlinkSync('ValidKeystore');
  fs.rmdirSync('dirCertificate');
};


/**
 * Test that the ssl options for valid certificates cause start to be
 * successful
 * @param {object} test - test case.
 */
module.exports.test_valid_ssl_options = function(test) {
  var testData = [{
    sslTrustCertificate: 'ValidCertificate',
    sslVerifyName: false
  },
  {
    sslTrustCertificate: 'ValidCertificate',
    sslVerifyName: true
  },
  {
    sslTrustCertificate: 'ValidCertificate',
    sslVerifyName: 2 > 1
  },
  {
    sslTrustCertificate: 'ValidCertificate',
    sslVerifyName: 1 > 2
  },
  {
    sslClientCertificate: 'ValidCertificate',
    sslClientKey: 'ValidKey',
    sslClientKeyPassphrase: 'ValidKeyPassphrase'
  },
  {
    sslKeystore: 'ValidKeystore',
    sslKeystorePassphrase: 'ValidKeystorePassphrase'
  }];
  var validKeystoreFd = fs.openSync('ValidKeystore', 'w');
  var validKeyFd = fs.openSync('ValidKey', 'w');
  var validCertificateFd = fs.openSync('ValidCertificate', 'w');
  var count = 0;
  var validSSLTest = function(options) {
    var opts = {
      service: 'amqps://host',
      id: 'test_valid_ssl_options'+count
    };
    if (options.sslTrustCertificate !== undefined) {
      opts.sslTrustCertificate = options.sslTrustCertificate;
    }
    if (options.sslVerifyName !== undefined) {
      opts.sslVerifyName = options.sslVerifyName;
    }
    if (options.sslKeystore !== undefined) {
      opts.sslKeystore = options.sslKeystore;
    }
    if (options.sslKeystorePassphrase !== undefined) {
      opts.sslKeystorePassphrase = options.sslKeystorePassphrase;
    }
    if (options.sslClientCertificate !== undefined) {
      opts.sslClientCertificate = options.sslClientCertificate;
    }
    if (options.sslClientKey !== undefined) {
      opts.sslClientKey = options.sslClientKey;
    }
    if (options.sslClientKeyPassphrase !== undefined) {
      opts.sslClientKeyPassphrase = options.sslClientKeyPassphrase;
    }
    var client = mqlight.createClient(opts);
    client.on('error', function(err) {
      client.stop();
      test.ok(!err, 'unexpected error event: ' + err);
      test.done();
      fs.close(validKeystoreFd); fs.unlinkSync('ValidKeystore');
      fs.close(validKeyFd); fs.unlinkSync('ValidKey');
      fs.close(validCertificateFd); fs.unlinkSync('ValidCertificate');
    });
    client.start(function(err) {
      test.ok(!err);
      client.stop();
      ++count;
      if (count == testData.length) {
        test.done();
        fs.close(validKeystoreFd); fs.unlinkSync('ValidKeystore');
        fs.close(validKeyFd); fs.unlinkSync('ValidKey');
        fs.close(validCertificateFd); fs.unlinkSync('ValidCertificate');
      } else {
        validSSLTest(testData[count]);
      }
    });
  };

  validSSLTest(testData[count]);
};


/**
 * Test that the ssl options for invalid certificates cause start to fail
 * @param {object} test - test case.
 */
module.exports.test_invalid_ssl_options = function(test) {
  var testData = [{
    sslTrustCertificate: 'BadCertificate',
    sslVerifyName: true
  },
  {
    sslTrustCertificate: 'BadCertificate',
    sslVerifyName: false
  },
  {
    sslTrustCertificate: 'BadVerify',
    sslVerifyName: true
  },
  {
    sslTrustCertificate: 'SelfSignedCertificate',
    sslVerifyName: true
  },
  {
    sslTrustCertificate: 'SelfSignedCertificate',
    sslVerifyName: false
  },
  {
    sslTrustCertificate: 'ExpiredCertificate',
    sslVerifyName: true
  },
  {
    sslTrustCertificate: 'ExpiredCertificate',
    sslVerifyName: false
  },
  {
    sslClientCertificate: 'BadCertificate',
    sslClientKey: 'ValidKey',
    sslClientKeyPassphrase: 'ValidKeyPassphrase'
  },
  {
    sslClientCertificate: 'ValidCertificate',
    sslClientKey: 'BadKey',
    sslClientKeyPassphrase: 'BadKeyPassphrase'
  },
  {
    sslKeystore: 'BadKeystore',
    sslKeystorePassphrase: 'BadKeystorePassphrase'
  }];
  var badKeystoreFd = fs.openSync('BadKeystore', 'w');
  var badKeyFd = fs.openSync('BadKey', 'w');
  var validKeyFd = fs.openSync('ValidKey', 'w');
  var badCertificateFd = fs.openSync('BadCertificate', 'w');
  var validCertificateFd = fs.openSync('ValidCertificate', 'w');
  var badVerifyFd = fs.openSync('BadVerify', 'w');
  var selfSignedFd = fs.openSync('SelfSignedCertificate', 'w');
  var expiredFd = fs.openSync('ExpiredCertificate', 'w');
  var count = 0;
  var invalidSSLTest = function(options) {
    var firstError = true;
    var opts = {
      service: 'amqps://host',
      id: 'test_invalid_ssl_options'+count
    };
    if (options.sslTrustCertificate !== undefined) {
      opts.sslTrustCertificate = options.sslTrustCertificate;
    }
    if (options.sslVerifyName !== undefined) {
      opts.sslVerifyName = options.sslVerifyName;
    }
    if (options.sslKeystore !== undefined) {
      opts.sslKeystore = options.sslKeystore;
    }
    if (options.sslKeystorePassphrase !== undefined) {
      opts.sslKeystorePassphrase = options.sslKeystorePassphrase;
    }
    if (options.sslClientCertificate !== undefined) {
      opts.sslClientCertificate = options.sslClientCertificate;
    }
    if (options.sslClientKey !== undefined) {
      opts.sslClientKey = options.sslClientKey;
    }
    if (options.sslClientKeyPassphrase !== undefined) {
      opts.sslClientKeyPassphrase = options.sslClientKeyPassphrase;
    }
    var client = mqlight.createClient(opts);
    client.on('error', function(err) {
      test.ok(err);
      test.equal('SecurityError', err.name, 'Expected a SecurityError');
      if(firstError) {
        firstError = false;
        client.stop(function () {
          ++count;
          if (count == testData.length) {
            test.done();
            fs.close(badKeystoreFd); fs.unlinkSync('BadKeystore');
            fs.close(badKeyFd); fs.unlinkSync('BadKey');
            fs.close(validKeyFd); fs.unlinkSync('ValidKey');
            fs.close(badCertificateFd); fs.unlinkSync('BadCertificate');
            fs.close(validCertificateFd); fs.unlinkSync('ValidCertificate');
            fs.close(badVerifyFd); fs.unlinkSync('BadVerify');
            fs.close(selfSignedFd); fs.unlinkSync('SelfSignedCertificate');
            fs.close(expiredFd); fs.unlinkSync('ExpiredCertificate');
          } else {
            invalidSSLTest(testData[count]);
          }
        });
      }
    });
    client.on('started', function(err) {
      client.stop();
      test.ok(!err, 'unexpected started event');
      test.done();
      fs.close(badKeystoreFd); fs.unlinkSync('BadKeystore');
      fs.close(badKeyFd); fs.unlinkSync('BadKey');
      fs.close(validKeyFd); fs.unlinkSync('ValidKey');
      fs.close(badCertificateFd); fs.unlinkSync('BadCertificate');
      fs.close(validCertificateFd); fs.unlinkSync('ValidCertificate');
      fs.close(badVerifyFd); fs.unlinkSync('BadVerify');
      fs.close(selfSignedFd); fs.unlinkSync('SelfSignedCertificate');
      fs.close(expiredFd); fs.unlinkSync('ExpiredCertificate');
    });
    client.start();
  };

  invalidSSLTest(testData[count]);
};


/**
 * Test that, calling createClient a second time with the same id is
 * successful, replacing (invalidating) the previous instance.
 * @param {object} test - test case.
 */
module.exports.test_createClient_multiple_with_same_id = function(test) {
  var optsA = { service: 'amqp://localhost', id: 'Aname' };
  var optsB = { service: 'amqp://localhost', id: 'Bname' };

  var clientA = mqlight.createClient(optsA);
  clientA.on('started', function(err) {
    var clientB1 = mqlight.createClient(optsB);
    clientB1.on('stopped', function(err) {
      test.equal(undefined, err);
    });
    var firstTime = true;
    clientB1.on('started', function(err) {
      if (!firstTime) return;
      firstTime = false;
      test.equal(undefined, err);
      var clientB2 = mqlight.createClient(optsB);
      clientB2.on('started', function(err) {
        test.equal(undefined, err);
      });
      clientB1.on('error', function(err) {
        test.equal('ReplacedError',  err.name, 'expected a ReplacedError');
        clientA.stop(function() {
          clientB2.stop(function() {
            test.done();
          });
        });
      });
    });
  });
};


/**
 * Test that, calling createClient a second time with the same id is
 * successful, replacing (invalidating) the previous instance,
 * even when it's in retrying state.
 * @param {object} test - test case.
 */
module.exports.test_createClient_multiple_with_same_id_retry = function(test) {
  var optsA = {service: 'amqp://localhost', id: 'Aname2'};
  var optsB1 = {service: 'amqp://bad', id: 'Bname2'};
  var optsB2 = {service: 'amqp://localhost', id: 'Bname2'};

  test.expect(6);

  var clientA = mqlight.createClient(optsA, function() {
    var firstTime = true;
    var clientB1 = mqlight.createClient(optsB1).on('error', function(err) {
      if (firstTime) {
        firstTime = false;
        test.equal('NetworkError', err.name, 'expected a NetworkError');
        var clientB2 = mqlight.createClient(optsB2, function(err) {
          test.deepEqual(null, err);
          test.equal('started', clientA.state);
          test.equal('stopped', clientB1.state);
          test.equal('started', clientB2.state);

          clientA.stop(function() {
            clientB2.stop(function() {
              test.done();
            });
          });
        }).on('error', function(err) {
          test.ok(false, 'Did not expect to see error ' + err);
        });
      } else if (err instanceof mqlight.ReplacedError) {
        test.equal('ReplacedError', err.name, 'expected a ReplacedError');
      }
    });
  });
};
