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

var testCase = require('nodeunit').testCase;
var childProcess = require('child_process');



/** @constructor */
module.exports = testCase({
  'Test conformance to Google JavaScript Style Guide': testCase({
    'gjslint': function(test) {
      var child = childProcess.spawn('gjslint', [
        '--jslint_error=all',
        '--strict',
        '--disable',
        '1,0002,0010',
        '--unix_mode',
        'mqlight.js',
        'mqlight-log.js',
        'bin/mqlight-debug.js',
        'samples/send.js',
        'samples/recv.js',
        'tests/*.js',
        'tests/stubs/*.js'
      ], { stdio: 'inherit' });
      child.on('exit', function(code, signal) {
        if (signal) {
          console.log('gjslint killed by signal: ' + signal);
        } else {
          console.log('gjslint ended with return code: ' + code);
        }
        test.equal(signal, undefined, 'expected gjslint not to be killed by ' +
                   'signal: ' + signal);
        test.equal(code, 0, 'expected gjslint to exit with rc=0, not with ' +
                   'rc=' + code);
        test.done();
      }).on('error', function(err) {
        console.log('Unable to run gjslint for reason: ');
        console.log('  ' + err);
        test.ok(false, 'Error running gjslint');
        test.done();
      });
    }
  })
});

