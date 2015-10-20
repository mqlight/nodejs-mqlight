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

var testCase = require('nodeunit').testCase;
var childProcess = require('child_process');



/** @constructor */
module.exports.test_gjslint_strict = testCase({
  'Test strict conformance to the Google JavaScript Style Guide': testCase({
    'test_gjslint_strict': function(test) {
      var gjslint = (process.platform === 'win32') ? 'gjslint.exe' : 'gjslint';
      var child = childProcess.spawn(gjslint, [
        '--jslint_error=all',
        '--strict',
        '--unix_mode',
        'mqlight.js',
        'mqlight-log.js',
        'samples/send.js',
        'samples/recv.js',
        'samples/uiworkout.js'
      ], { stdio: 'inherit' });
      child.on('exit', function(code, signal) {
        if (signal) {
          console.error('gjslint killed by signal: ' + signal);
        } else if (code > 0) {
          console.error('gjslint ended with return code: ' + code);
        }
        test.equal(signal, undefined, 'expected gjslint not to be killed by ' +
                   'signal: ' + signal);
        test.equal(code, 0, 'expected gjslint to exit with rc=0, not with ' +
                   'rc=' + code);
        test.done();
      }).on('error', function(err) {
        console.error('Unable to run gjslint for reason: ');
        console.error('  ' + err);
        if (err && 'errno' in err && err.errno === 'ENOENT') {
          console.error('PATH=%s', process.env.PATH);
        }
        test.ok(false, 'Error running gjslint');
        test.done();
      });
    }
  })
});



/** @constructor */
module.exports.test_gjslint_basic = testCase({
  'Test basic conformance to the Google JavaScript Style Guide': testCase({
    'test_gjslint_basic': function(test) {
      var child = childProcess.spawn('gjslint', [
        '--jslint_error=all',
        '--strict',
        '--disable',
        '1,0002,0010',
        '--unix_mode',
        'bin/mqlight-debug.js',
        'test/*.js',
        'test/stubs/*.js'
      ], { stdio: 'inherit' });
      child.on('exit', function(code, signal) {
        if (signal) {
          console.error('gjslint killed by signal: ' + signal);
        } else if (code > 0) {
          console.error('gjslint ended with return code: ' + code);
        }
        test.equal(signal, undefined, 'expected gjslint not to be killed by ' +
                   'signal: ' + signal);
        test.equal(code, 0, 'expected gjslint to exit with rc=0, not with ' +
                   'rc=' + code);
        test.done();
      }).on('error', function(err) {
        console.error('Unable to run gjslint for reason: ');
        console.error('  ' + err);
        test.ok(false, 'Error running gjslint');
        test.done();
      });
    }
  })
});
