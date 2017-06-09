#!/usr/bin/env node

/* %Z% %W% %I% %E% %U% */
/*
 * <copyright
 * notice="lm-source-program"
 * pids="5725-P60"
 * years="2014"
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

var logger = require('../mqlight-log');
var nopt = require('nopt');
var debug = require('_debugger');
var os = require('os');

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
  console.log('  -d PORT, --port PORT  the port running the debugger');
  console.log('  -n HOST, --host HOST  the host running the debugger');
  console.log('  -p PID, --pid PID     the process identifier to debug');
  console.log('');
  console.log('Command:');
  console.log('  -e CMD, --eval=CMD    evaluate command CMD');
  console.log('  -f,     --ffdc        cause an FFDC to be generated');
  console.log('  -l LVL, --level=LVL     set the logging level to LVL');
  console.log('  -s STREAM --stream=STREAM  set the logger stream to STREAM')
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
  level: String,
  pid: Number,
  port: Number,
  stream: String
};

/*
 * The list of command line option short hands.
 */
var shortHands = {
  d: ['--port'],
  e: ['--eval'],
  f: ['--ffdc'],
  h: ['--help'],
  l: ['--level'],
  n: ['--host'],
  p: ['--pid'],
  s: ['--stream']
};

/*
 * Parse the supplied command line arguments.
 */
var parsed = nopt(knownOpts, shortHands);
logger.log('debug', logger.NO_CLIENT_ID, 'parsed:', parsed);

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
  command = 'logger.ffdc()';
} else if (parsed.level) {
  command = 'logger.setLevel(\'' + parsed.level + '\')';
} else if (parsed.stream) {
  command = 'logger.setStream(\'' + parsed.stream + '\')';
} else {
  logger.log('error', logger.NO_CLIENT_ID, 'No command specified');
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
logger.log('debug', logger.NO_CLIENT_ID, 'host:', host);
logger.log('debug', logger.NO_CLIENT_ID, 'port:', port);

/*
 * If a process identifier was specified, then signal to that process that it
 * should start the debugger. We don't have any control from here what port it
 * will start the debugger on, so the --port option will need to match what it
 * starts on (or the MQLIGHT_NODE_DEBUG_PORT environment variable can be set
 * to pass it to us).
 */
if (parsed.pid) {
  try {
    if(os.platform() !== 'win32')
    {
      /* On Unix use a SIGUSR1 signal to kick start the debugger. */
      logger.entry('process.kill', logger.NO_CLIENT_ID);
      process.kill(parsed.pid, 'SIGUSR1');
      logger.exit('process.kill', logger.NO_CLIENT_ID, null);
    }

    logger.entry('process._debugProcess', logger.NO_CLIENT_ID);
    logger.log('parms', logger.NO_CLIENT_ID, 'parsed.pid:', parsed.pid);
    process._debugProcess(parsed.pid);
    logger.exit('process._debugProcess', logger.NO_CLIENT_ID, null);
  } catch (err) {
    logger.log('error', logger.NO_CLIENT_ID, err);
    console.error('Error: ' + parsed.pid +
                  ' is not a valid process identifier (' + err.message + ')');
    process.exit(1);
  }
}

/*
 * Create a debugger client object.
 */
logger.entry('debug.Client', logger.NO_CLIENT_ID);
client = new debug.Client();
logger.exit('debug.Client', logger.NO_CLIENT_ID, client);

/*
 * Connect to the debugger port on the specified host.
 */
logger.entry('client.connect', logger.NO_CLIENT_ID);
logger.log('parms', logger.NO_CLIENT_ID, 'port:', port);
logger.log('parms', logger.NO_CLIENT_ID, 'host:', host);

client.connect(port, host, function() {
  logger.entry('client.connect.callback', logger.NO_CLIENT_ID);
  logger.log('data', logger.NO_CLIENT_ID,
             'Connected to debugger on ' + host + ':' + port);
  logger.exit('client.connect.callback', logger.NO_CLIENT_ID, null);
});

logger.exit('client.connect', logger.NO_CLIENT_ID, null);

/*
 * Exit if we fail to connect to the debugger.
 */
logger.entry('client.on.error', logger.NO_CLIENT_ID);
client.on('error', function(err) {
  logger.entry('client.on.error.callback', logger.NO_CLIENT_ID);
  logger.log('error', logger.NO_CLIENT_ID, err);
  console.error('Failed to connect to ' + host + ':' + port +
                ' (' + err.message + ')');
  logger.exit('client.on.error.callback', logger.NO_CLIENT_ID, null);
  process.exit(2);
});
logger.exit('client.on.error', logger.NO_CLIENT_ID, null);

/*
 * Wait until the debugger is ready to start evaluating commands.
 */
logger.entry('client.on.ready', logger.NO_CLIENT_ID);
client.on('ready', function() {
  logger.entry('client.on.ready.callback', logger.NO_CLIENT_ID);
  logger.log('data', logger.NO_CLIENT_ID, 'Debugger ready for commands');

  sendCommand(); // Send the command.

  logger.exit('client.on.ready.callback', logger.NO_CLIENT_ID, null);
});
logger.exit('client.on.ready', logger.NO_CLIENT_ID, null);

/*
 * If the debugger breaks, send the command and continue.
 */
logger.entry('client.on.break', logger.NO_CLIENT_ID);
client.on('break', function(res) {
  logger.entry('client.on.break.callback', logger.NO_CLIENT_ID);
  logger.log('data', logger.NO_CLIENT_ID, 'Debugger break received');
  logger.log('detail', logger.NO_CLIENT_ID, 'res:', res);

  sendCommand(); // Send the command.

  logger.entry('client.reqContinue', logger.NO_CLIENT_ID);
  client.reqContinue(function(err, res) {
    logger.entry('client.reqContinue.callback', logger.NO_CLIENT_ID);
    logger.log('data', logger.NO_CLIENT_ID, 'err:', err);
    logger.log('detail', logger.NO_CLIENT_ID, 'res:', res);
    if (err) {
      logger.log('error', logger.NO_CLIENT_ID, 'Debugger failed to continue');
    }
    logger.exit('client.reqContinue.callback', logger.NO_CLIENT_ID, null);
  });
  logger.exit('client.reqContinue', logger.NO_CLIENT_ID, null);
  logger.exit('client.on.break.callback', logger.NO_CLIENT_ID, null);
});
logger.exit('client.on.break', logger.NO_CLIENT_ID, null);

/*
 * If the port is closed while we're executing, we'll need to end.
 */
logger.entry('client.on.close', logger.NO_CLIENT_ID);
client.on('close', function(had_error) {
  logger.entry('client.on.close.callback', logger.NO_CLIENT_ID);
  logger.log('parms', logger.NO_CLIENT_ID, 'had_error:', had_error);
  logger.log('data', logger.NO_CLIENT_ID, 'Connection to debugger closed');
  logger.exit('client.on.close.callback', logger.NO_CLIENT_ID, null);
  process.exit(3);
});
logger.exit('client.on.close', logger.NO_CLIENT_ID, null);

/*
 * If the port is closed while we're executing, we'll need to end.
 */
logger.entry('client.on.end', logger.NO_CLIENT_ID);
client.on('end', function() {
  logger.entry('client.on.end.callback', logger.NO_CLIENT_ID);
  logger.log('error', logger.NO_CLIENT_ID, 'Connection to debugger ended');
  logger.exit('client.on.end.callback', logger.NO_CLIENT_ID, null);
  process.exit(4);
});
logger.exit('client.on.end', logger.NO_CLIENT_ID, null);

/*
 * Send the command the user specified to the debugger and wait for the
 * response.
 */
var sendCommand = function() {
  var exitCode = 0;
  var req = { command: 'disconnect' };

  logger.entry('sendCommand', logger.NO_CLIENT_ID);

  if (evaluated) {
    // No need to send the same command twice.
    logger.log('data', logger.NO_CLIENT_ID, 'Command already sent');
  }
  else {
    // Send the command to the debugger.
    logger.entry('client.reqEval', logger.NO_CLIENT_ID);
    logger.log('parms', logger.NO_CLIENT_ID, 'command:', command);

    client.reqEval(command, function(err, res) {
      // Wait for the response from the debugger
      logger.entry('client.reqEval.callback', logger.NO_CLIENT_ID);
      logger.log('data', logger.NO_CLIENT_ID, 'err:', err);
      logger.log('detail', logger.NO_CLIENT_ID, 'res:', res);
      if (err) {
        // The debugger failed to evaluate the command.
        logger.log('error', logger.NO_CLIENT_ID,
                   'Debugger failed to evaluate command');
        console.error(res.message);
        exitCode = 20;
      } else {
        // The debugger did what we asked!
        console.log('Command evaluated successfully');
      }

      // Regardless of the result, disconnect from the debugger.
      logger.entry('client.req', logger.NO_CLIENT_ID);
      logger.log('parms', logger.NO_CLIENT_ID, 'req:', req);
      client.req(req, function(err, res) {
        logger.entry('client.req.callback', logger.NO_CLIENT_ID);
        logger.log('data', logger.NO_CLIENT_ID, 'err:', err);
        logger.log('detail', logger.NO_CLIENT_ID, 'res:', res);
        if (err) {
          logger.log('error', logger.NO_CLIENT_ID,
                     'Debugger failed to disconnect');
        }

        // Destroy the client, closing the socket.
        logger.entry('client.destroy', logger.NO_CLIENT_ID);
        client.destroy();
        logger.exit('client.destroy', logger.NO_CLIENT_ID, null);
        logger.exit('client.req.callback', logger.NO_CLIENT_ID, null);

        // Time to end.
        process.exit(exitCode);
      });
      logger.exit('client.reqEval.callback', logger.NO_CLIENT_ID, null);
    });

    // Mark that we've now sent the command.
    evaluated = true;
    logger.log('debug', logger.NO_CLIENT_ID, 'evaluated:', evaluated);
  }

  logger.exit('sendCommand', logger.NO_CLIENT_ID, null);
};
