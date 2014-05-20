#!/usr/bin/env node

/* %Z% %W% %I% %E% %U% */
/*
 * <copyright
 * notice="lm-source-program"
 * pids="5755-P60"
 * years="2014"
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

var log = require('../mqlight-log');
var nopt = require('nopt');
var debug = require('_debugger');

var port = process.debugPort;
var host = 'localhost';
var command;
var evaluated = false;

/*
 * Show the usage statement and exit.
 */
var showUsage = function(rc) {
  console.log('Usage: mqlight-debug.js [options] command');
  console.log('');
  console.log('Options:');
  console.log('  -h, --help            show this help message and exit');
  console.log('  -i PID, --pid PID     the process identifier to debug');
  console.log('  -n HOST, --host HOST  the host running the debugger');
  console.log('  -p PORT, --port PORT  the port running the debugger');
  console.log('');
  console.log('Command:');
  console.log('  -e CMD, --eval=CMD    evaluate command CMD');
  console.log('  -f,     --ffdc        cause an FFDC to be generated');
  console.log('  -l LVL, --log=LVL     set the log level to LVL');
  console.log('');
  process.exit(rc);
};

/*
 * The list of known command line options.
 */
var knownOpts = {
  eval: String,
  ffdc: Boolean,
  help: Boolean,
  host: String,
  log: String,
  pid: Number,
  port: Number
};

/*
 * The list of command line option short hands.
 */
var shortHands = {
  e: ['--eval'],
  f: ['--ffdc'],
  h: ['--help'],
  i: ['--pid'],
  l: ['--log'],
  n: ['--host'],
  p: ['--port']
};

/*
 * Parse the supplied command line arguments.
 */
var parsed = nopt(knownOpts, shortHands);
log.log('debug', log.NO_CLIENT_ID, 'parsed:', parsed);

/*
 * Display the usage statement if it was asked for.
 */
if (parsed.help) {
  showUsage(0);
}

/*
 * Check that a debug command was specified.
 */
if (parsed.eval) {
  command = parsed.eval;
} else if (parsed.ffdc) {
  command = 'log.debug()';
} else if (parsed.log) {
  command = 'log.setLevel(\'' + parsed.log + '\')';
} else {
  log.log('error', log.NO_CLIENT_ID, 'No command specified');
  showUsage(1);
}

/*
 * Save the host and port, if they were specified.
 */
if (parsed.host) {
  host = parsed.host;
}
if (parsed.port) {
  port = parsed.port;
}

/*
 * Log the options.
 */
log.log('debug', log.NO_CLIENT_ID, 'host:', host);
log.log('debug', log.NO_CLIENT_ID, 'port:', port);

/*
 * If a process identifier was specified, then signal to that process that it
 * should start the debugger. We don't have any control from here what port it
 * will start the debugger on, so the --port option will need to match what it
 * starts on (or the MQLIGHT_NODE_DEBUG_PORT environment variable can be set
 * to pass it to us).
 */
if (parsed.pid) {
  try {
    log.entry('process._debugProcess', log.NO_CLIENT_ID);
    log.log('parms', log.NO_CLIENT_ID, 'parsed.pid:', parsed.pid);

    process._debugProcess(parsed.pid);

    log.exit('process._debugProcess', log.NO_CLIENT_ID, null);
  } catch (err) {
    log.log('error', log.NO_CLIENT_ID, err);
    console.error('Error: ' + parsed.pid +
                  ' is not a valid process identifier (' + err.message + ')');
    process.exit(1);
  }
}

/*
 * Create a debugger client object.
 */
log.entry('debug.Client', log.NO_CLIENT_ID);
client = new debug.Client();
log.exit('debug.Client', log.NO_CLIENT_ID, client);

/*
 * Connect to the debugger port on the specified host.
 */
log.entry('client.connect', log.NO_CLIENT_ID);
log.log('parms', log.NO_CLIENT_ID, 'port:', port);
log.log('parms', log.NO_CLIENT_ID, 'host:', host);

client.connect(port, host, function() {
  log.entry('client.connect.callback', log.NO_CLIENT_ID);
  log.log('data', log.NO_CLIENT_ID,
          'Connected to debugger on ' + host + ':' + port);
  log.exit('client.connect.callback', log.NO_CLIENT_ID, null);
});

log.exit('client.connect', log.NO_CLIENT_ID, null);

/*
 * Exit if we fail to connect to the debugger.
 */
log.entry('client.on.error', log.NO_CLIENT_ID);
client.on('error', function(err) {
  log.entry('client.on.error.callback', log.NO_CLIENT_ID);
  log.log('error', log.NO_CLIENT_ID, err);
  console.error('Failed to connect to ' + host + ':' + port +
                ' (' + err.message + ')');
  log.exit('client.on.error.callback', log.NO_CLIENT_ID, null);
  process.exit(2);
});
log.exit('client.on.error', log.NO_CLIENT_ID, null);

/*
 * Wait until the debugger is ready to start evaluating commands.
 */
log.entry('client.on.ready', log.NO_CLIENT_ID);
client.on('ready', function() {
  log.entry('client.on.ready.callback', log.NO_CLIENT_ID);
  log.log('data', log.NO_CLIENT_ID, 'Debugger ready for commands');

  sendCommand(); // Send the command.

  log.exit('client.on.ready.callback', log.NO_CLIENT_ID, null);
});
log.exit('client.on.ready', log.NO_CLIENT_ID, null);

/*
 * If the debugger breaks, send the command and continue.
 */
log.entry('client.on.break', log.NO_CLIENT_ID);
client.on('break', function(res) {
  log.entry('client.on.break.callback', log.NO_CLIENT_ID);
  log.log('data', log.NO_CLIENT_ID, 'Debugger break received');
  log.log('detail', log.NO_CLIENT_ID, 'res:', res);

  sendCommand(); // Send the command.

  log.entry('client.reqContinue', log.NO_CLIENT_ID);
  client.reqContinue(function(err, res) {
    log.entry('client.reqContinue.callback', log.NO_CLIENT_ID);
    log.log('data', log.NO_CLIENT_ID, 'err:', err);
    log.log('detail', log.NO_CLIENT_ID, 'res:', res);
    if (err) {
      log.log('error', log.NO_CLIENT_ID, 'Debugger failed to continue');
    }
    log.exit('client.reqContinue.callback', log.NO_CLIENT_ID, null);
  });
  log.exit('client.reqContinue', log.NO_CLIENT_ID, null);
  log.exit('client.on.break.callback', log.NO_CLIENT_ID, null);
});
log.exit('client.on.break', log.NO_CLIENT_ID, null);

/*
 * If the port is closed while we're executing, we'll need to end.
 */
log.entry('client.on.close', log.NO_CLIENT_ID);
client.on('close', function(had_error) {
  log.entry('client.on.close.callback', log.NO_CLIENT_ID);
  log.log('parms', log.NO_CLIENT_ID, 'had_error:', had_error);
  log.log('data', log.NO_CLIENT_ID, 'Connection to debugger closed');
  log.exit('client.on.close.callback', log.NO_CLIENT_ID, null);
  process.exit(3);
});
log.exit('client.on.close', log.NO_CLIENT_ID, null);

/*
 * If the port is closed while we're executing, we'll need to end.
 */
log.entry('client.on.end', log.NO_CLIENT_ID);
client.on('end', function() {
  log.entry('client.on.end.callback', log.NO_CLIENT_ID);
  log.log('error', log.NO_CLIENT_ID, 'Connection to debugger ended');
  log.exit('client.on.end.callback', log.NO_CLIENT_ID, null);
  process.exit(4);
});
log.exit('client.on.end', log.NO_CLIENT_ID, null);

/*
 * Send the command the user specified to the debugger and wait for the
 * response.
 */
var sendCommand = function() {
  var exitCode = 0;
  var req = { command: 'disconnect' };

  log.entry('sendCommand', log.NO_CLIENT_ID);

  if (evaluated) {
    // No need to send the same command twice.
    log.log('data', log.NO_CLIENT_ID, 'Command already sent');
  }
  else {
    // Send the command to the debugger.
    log.entry('client.reqEval', log.NO_CLIENT_ID);
    log.log('parms', log.NO_CLIENT_ID, 'command:', command);

    client.reqEval(command, function(err, res) {
      // Wait for the response from the debugger
      log.entry('client.reqEval.callback', log.NO_CLIENT_ID);
      log.log('data', log.NO_CLIENT_ID, 'err:', err);
      log.log('detail', log.NO_CLIENT_ID, 'res:', res);
      if (err) {
        // The debugger failed to evaluate the command.
        log.log('error', log.NO_CLIENT_ID,
                'Debugger failed to evaluate command');
        console.error(res.message);
        exitCode = 20;
      } else {
        // The debugger did what we asked!
        console.log('Command evaluated successfully');
      }

      // Regardless of the result, disconnect from the debugger.
      log.entry('client.req', log.NO_CLIENT_ID);
      log.log('parms', log.NO_CLIENT_ID, 'req:', req);
      client.req(req, function(err, res) {
        log.entry('client.req.callback', log.NO_CLIENT_ID);
        log.log('data', log.NO_CLIENT_ID, 'err:', err);
        log.log('detail', log.NO_CLIENT_ID, 'res:', res);
        if (err) {
          log.log('error', log.NO_CLIENT_ID, 'Debugger failed to disconnect');
        }

        // Destroy the client, closing the socket.
        log.entry('client.destroy', log.NO_CLIENT_ID);
        client.destroy();
        log.exit('client.destroy', log.NO_CLIENT_ID, null);
        log.exit('client.req.callback', log.NO_CLIENT_ID, null);

        // Time to end.
        process.exit(exitCode);
      });
      log.exit('client.reqEval.callback', log.NO_CLIENT_ID, null);
    });

    // Mark that we've now sent the command.
    evaluated = true;
    log.log('debug', log.NO_CLIENT_ID, 'evaluated:', evaluated);
  }

  log.exit('sendCommand', log.NO_CLIENT_ID, null);
};
