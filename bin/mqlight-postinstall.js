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
 * (C) Copyright IBM Corp. 2013, 2014
 *
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with
 * IBM Corp.
 * </copyright>
 */


var os = require('os');
var fs = require('fs');
var childProcess = require('child_process');

// on Linux x86_64 we need to do some pre-req checking for openssl libraries
if (os.platform() === 'linux' && process.arch === 'x64') {
  // on Red Hat Linux we need to check openssl 0.9.8 is installed and also add
  // a correctly named symlink within our module's installation directory to
  // workaround a mismatch between the official openssl naming conventions and
  // what is deployed on Redhat
  var redhat = fs.existsSync('/etc/redhat-release');
  if (redhat) {
    var hasSSL = fs.existsSync('/usr/lib64/libssl.so.6');
    if (!hasSSL) {
      console.error('Before using MQ Light on Linux, you will also need ' +
          'the 0.9.8 version of an OpenSSL package. This version of the ' +
          'package is not installed by default, so to use the module ' +
          'you will need to install it.');
      console.error();
      console.error('* To install the package on RedHat, run: sudo yum ' +
          'install openssl098e');
      process.exit(1);
    }

    // if we did find libssl on redhat, we still need to add a symlink
    // within our module's lib folder (node_modules/mqlight/lib/linux-x64)
    var child = childProcess.spawn('ln', [
      '-s',
      '/usr/lib64/libssl.so.6',
      './lib/linux-x64/libssl.so.0.9.8'
    ], { stdio: 'inherit' });
    child.on('exit', function(code, signal) {
      if (signal) {
        console.error('ln killed by signal: ' + signal);
        process.exit(1);
      } else {
        if (code > 0) console.error('ln failed with return code: ' + code);
        process.exit(code);
      }
    }).on('error', function(err) {
      console.error('Unable to run ln for reason: %s', err);
      process.exit(1);
    });
  } else {
    // else we assume we are running on Ubuntu or a generic Linux distro
    // so we will simply check and report to the user if the prereq openssl
    // library version is missing from their operating system install.
    var hasSSL = fs.existsSync('/usr/lib64/libssl.so.0.9.8') ||
                 fs.existsSync('/usr/lib/x86_64-linux-gnu/libssl.so.0.9.8');
    if (!hasSSL) {
      console.error('Before using MQ Light on Linux, you will ' +
          'also need the 0.9.8 version of an OpenSSL ' +
          'package. This version of the package is not ' +
          'installed by default, so to use the module you ' +
          'will need to install it.');
      console.error();
      console.error('* To install the package on Ubuntu, run: ' +
          'sudo apt-get install libssl0.9.8');
      console.error('* To install the package on other distros ' +
          'refer to your package manager documentation');
      process.exit(1);
    }
  }
}

