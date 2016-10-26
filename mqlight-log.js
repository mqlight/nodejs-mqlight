/* %Z% %W% %I% %E% %U% */
/*
 * <copyright
 * notice="lm-source-program"
 * pids="5725-P60"
 * years="2014,2016"
 * crc="3568777996" >
 * Licensed Materials - Property of IBM
 *
 * 5725-P60
 *
 * (C) Copyright IBM Corp. 2014, 2016
 *
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with
 * IBM Corp.
 * </copyright>
 */
/* jslint node: true */
/* jshint -W083,-W097 */
'use strict';
var logger = exports;

var pkg = require('./package.json');
var os = require('os');
var moment = require('moment');
var npmlog = require('npmlog');
var fs = require('fs');
var util = require('util');

var isWin = (os.platform() === 'win32');
var stack = ['<stack unwind error>'];
var startLevel;
var historyLevel;
var ffdcSequence = 0;
var fd = 0;
var dataSize;
var exceptionThrown = null;
var potentialUnwinds = 0;

var ENTRY_IND = '>-----------------------------------------------------------';
var EXIT_IND = '<-----------------------------------------------------------';
var HEADER_BANNER = '+---------------------------------------' +
                    '---------------------------------------+';

var styles = {
  blue: { fg: 'blue', bg: 'black' },
  green: { fg: 'green', bg: 'black' },
  inverse: { inverse: true },
  red: { fg: 'red', bg: 'black' },
  yellow: { fg: 'yellow', bg: 'black' }
};

/*
 * Set the npmlog heading to include a timestamp and process identifier.
 */
Object.defineProperty(npmlog, 'heading', {
  get: function() {
    return moment().format('HH:mm:ss.SSS') + ' [' + process.pid + ']';
  }
});


/*
 * Write a log or ffdc header, including basic information about the program
 * and host.
 */
var header = function(lvl, clientId, options) {
  if (npmlog.levels[npmlog.level] <= npmlog.levels[lvl]) {
    npmlog.log(lvl, clientId, HEADER_BANNER);
    npmlog.log(lvl, clientId, '| IBM MQ Light Node.js Client Module -',
               options.title);
    npmlog.log(lvl, clientId, HEADER_BANNER);
    npmlog.log(lvl, clientId, '| Date/Time         :-',
               moment().format('ddd MMMM DD YYYY HH:mm:ss.SSS Z'));
    npmlog.log(lvl, clientId, '| Host Name         :-', os.hostname());
    npmlog.log(lvl, clientId, '| Operating System  :-',
               os.type(), os.release());
    npmlog.log(lvl, clientId, '| Architecture      :-',
               os.platform(), os.arch());
    npmlog.log(lvl, clientId, '| Node Version      :-', process.version);
    npmlog.log(lvl, clientId, '| Node Path         :-', process.execPath);
    npmlog.log(lvl, clientId, '| Node Arguments    :-', process.execArgs);
    if (!isWin) {
      npmlog.log(lvl, clientId, '| User Id           :-', process.getuid());
      npmlog.log(lvl, clientId, '| Group Id          :-', process.getgid());
    }
    npmlog.log(lvl, clientId, '| Name              :-', pkg.name);
    npmlog.log(lvl, clientId, '| Version           :-', pkg.version);
    npmlog.log(lvl, clientId, '| Description       :-', pkg.description);
    npmlog.log(lvl, clientId, '| Installation Path :-', __dirname);
    npmlog.log(lvl, clientId, '| Uptime            :-', process.uptime());
    npmlog.log(lvl, clientId, '| Log Level         :-', npmlog.level);
    npmlog.log(lvl, clientId, '| Data Size         :-', dataSize);
    if ('fnc' in options) {
      npmlog.log(lvl, clientId, '| Function          :-', options.fnc);
    }
    if ('probeId' in options) {
      npmlog.log(lvl, clientId, '| Probe Id          :-', options.probeId);
    }
    if ('ffdcSequence' in options) {
      npmlog.log(lvl, clientId, '| FFDCSequenceNumber:-',
                 options.ffdcSequence++);
    }
    if (potentialUnwinds !== 0) {
      npmlog.log(lvl, clientId, '| potentialUnwinds  :-', potentialUnwinds);
    }
    npmlog.log(lvl, clientId, HEADER_BANNER);
    if ('fnc' in options && options.fnc.indexOf('SIG') == 0) {
      npmlog.log(lvl, clientId, '(Set MQLIGHT_NODE_NO_HANDLER to ' +
                 'disable user requested FFDCs)');
    }
    npmlog.log(lvl, clientId, '');
  }
};


/**
 * Set the logging level.
 *
 * @param {String} level The logging level to write at.
 */
logger.setLevel = function(level) {
  var lvl = String(level).toLowerCase().trim();
  if (npmlog.levels[lvl]) {
    npmlog.level = lvl;

    header('header', logger.NO_CLIENT_ID, {title: 'Log'});

    var debug = process.env.PN_TRACE_FRM + ',' || '';
    if (npmlog.levels[npmlog.level] <= npmlog.levels.debug) {
      logger.log('debug', logger.NO_CLIENT_ID, 'Setting basic amqp10 debug');
      process.env.DEBUG =
          debug + 'amqp10:*,-amqp10:session,-amqp10:framing,-amqp10:sasl';
      if (npmlog.levels[npmlog.level] <= npmlog.levels.detail) {
        logger.log('debug', logger.NO_CLIENT_ID,
                   'Setting detailed amqp10 debug');
        process.env.DEBUG = debug + 'amqp10:*';
      }
    } else if (process.env.DEBUG && /amqp10:/.test(debug)) {
      logger.log('debug', logger.NO_CLIENT_ID, 'Unsetting amqp10 debug');
      debug = debug.slice(0, debug.indexOf('amqp10'));
      if (debug.length > 0) {
        process.env.DEBUG = debug;
      } else {
        delete process.env.DEBUG;
      }
    }
  } else {
    console.error('ERROR: MQ Light log level \'' + lvl + '\' is invalid');
  }
};


/**
 * Get the logging level.
 *
 * @return {String} The logging level.
 */
logger.getLevel = function() {
  return npmlog.level;
};


/**
 * Set the logging stream.
 *
 * @param {String} stream The stream to log to. If the value
 *        isn't 'stderr' or 'stdout' then stream will be treated
 *        as a file which will be written to as well as
 *        stderr/stdout.
 */
logger.setStream = function(stream) {
  if (stream === 'stderr') {
    // Log to stderr.
    npmlog.stream = process.stderr;

    // Stop writing to a file.
    if (fd) {
      fs.closeSync(fd);
    }
  } else if (stream === 'stdout') {
    // Log to stdout.
    npmlog.stream = process.stdout;

    // Stop writing to a file.
    if (fd) {
      fs.closeSync(fd);
    }
  } else {
    // A file has been specified. As well as writing to stderr/stdout, we
    // additionally write the output to a file.

    // Stop writing to an existing file.
    if (fd) {
      fs.closeSync(fd);
    }

    // Open the specified file.
    fd = fs.openSync(stream, 'a', '0644');

    // Set up a listener for log events.
    npmlog.on('log', function(m) {
      if (fd) {
        if (npmlog.levels[npmlog.level] <= npmlog.levels[m.level]) {
          // We'll get called for every log event, so filter to ones we're
          // interested in.
          fs.writeSync(fd, util.format('%s %s %s %s\n',
                                       npmlog.heading, npmlog.disp[m.level],
                                       m.prefix, m.message));
        }
      }
    });
  }
};


/**
 * Set the amount of message data that will get logged.
 *
 * @param {Number} size amount of message data that will get logged.
 */
logger.setDataSize = function(size) {
  logger.entry('logger.setDataSize', logger.NO_CLIENT_ID);
  logger.log('parms', logger.NO_CLIENT_ID, 'size:', size);

  if (typeof size === 'string') {
    dataSize = parseInt(size);
    if (isNaN(dataSize)) {
      throw new TypeError('MQLIGHT_NODE_MESSAGE_DATA_SIZE is not a number');
    }
  } else {
    dataSize = size;
  }

  logger.exit('logger.setDataSize', logger.NO_CLIENT_ID);
};


/**
 * Get the amount of message data that will get logged.
 *
 * @return {Number} The data size.
 */
logger.getDataSize = function() {
  return dataSize;
};


/**
 * Log entry into a function, specifying the logging level to
 * write at.
 *
 * @param {String} lvl The logging level to write at.
 * @param {String} name The name of the function being entered.
 * @param {String} id The id of the client causing the function
 *        to be entered.
 */
logger.entryLevel = function(lvl, name, id) {
  if (exceptionThrown) {
    logger.log('error', id, '* Uncaught exception');
    exceptionThrown = null;
    while (stack.length > 1) {
      stack.pop();
    }
  }
  npmlog.log(lvl, id, ENTRY_IND.substring(0, stack.length), name);
  stack.push(name);
};


/**
 * Log entry into a function.
 *
 * @param {String} name The name of the function being entered.
 * @param {String} id The id of the client causing the function
 *        to be entered.
 */
logger.entry = function(name, id) {
  logger.entryLevel('entry', name, id);
};


/**
 * Log exit from a function, specifying the logging level to
 * write at.
 *
 * @param {String} lvl The logging level to write at.
 * @param {String} name The name of the function being exited.
 * @param {String} id The id of the client causing the function
 *        to be exited.
 * @param {Object} rc The function return code.
 */
logger.exitLevel = function(lvl, name, id, rc) {
  // Only log object type returns if object logging is enabled.
  if (npmlog.levels[npmlog.level] <= npmlog.levels.object) {
    npmlog.log(lvl, id, EXIT_IND.substring(0, Math.max(1, stack.length - 1)),
               name, rc ? rc : '');
  } else {
    npmlog.log(lvl, id, EXIT_IND.substring(0, Math.max(1, stack.length - 1)),
               name, rc ? (typeof rc === 'object' ? '[object]' : rc) : '');
  }
  var last;
  do {
    // Check if we've unwound to the bottom of the stack.
    if (stack.length == 1) {
      // We have. Generate an FFDC if we believe the stack to be good. Most
      // likely we've exited with the wrong function name.
      if (potentialUnwinds === 0) {
        logger.ffdc('logger.exitLevel', 10, null, name);
      }
      potentialUnwinds--;
      logger.log('debug', id, 'Potential unwinds decreased to',
                 potentialUnwinds);
      break;
    }

    // Get rid of the last function put on the stack.
    last = stack.pop();
  } while (last != name);
};


/**
 * Log exit from a function.
 *
 * @param {String} name The name of the function being exited.
 * @param {String} id The id of the client causing the function
 *        to be exited.
 * @param {Object} rc The function return code.
 */
logger.exit = function(name, id, rc) {
  logger.exitLevel('exit', name, id, rc);
};


/**
 * Log data.
 *
 * @this {log}
 * @param {String} lvl The level at which to log the data.
 * @param {String} id The id of the client logging the data.
 * @param {Object} args The data to be logged.
 */
logger.log = function(lvl, id, args) {
  if (npmlog.levels[npmlog.level] <= npmlog.levels[lvl]) {
    npmlog.log.apply(this, arguments);
  }
};


/**
 * Log message body.
 *
 * @this {log}
 * @param {String} id The id of the client logging the data.
 * @param {Object} data The message body to be logged subject to
 *        specified data size. Must be either a string or a
 *        Buffer object.
                                                                */
logger.body = function(id, data) {
  if (npmlog.levels[npmlog.level] <= npmlog.levels.data) {
    npmlog.log('data', id, '! length:', data.length);
    if (typeof data === 'string') {
      if ((dataSize >= data.length) || (dataSize < 0)) {
        npmlog.log('data', id, '! string:', data);
      } else {
        npmlog.log('data', id, '! string:', data.substring(0, dataSize), '...');
      }
    } else {
      if ((dataSize >= data.length) || (dataSize < 0)) {
        npmlog.log('data', id, '! buffer:',
                   data.toString('hex'));
      } else {
        npmlog.log('data', id, '! buffer:',
                   data.toString('hex', 0, dataSize), '...');
      }
    }
  }
};


/**
 * Log an exception being thrown, specifying the logging level to
 * write at.
 *
 * @this {log}
 * @param {String} lvl The logging level to write at.
 * @param {String} name The name of the function throwing the
 *        exception.
 * @param {String} id The id of the client logging the
 *        exception.
 * @param {Object} err The exception being thrown.
                                                                */
logger.throwLevel = function(lvl, name, id, err) {
  logger.log('error', id, '* Thrown exception:', err);
  exceptionThrown = err;
  logger.exitLevel(lvl, name, id, 'Exception thrown');
  potentialUnwinds += stack.length - 1;
  logger.log('debug', id, 'Potential unwinds increased to', potentialUnwinds);
};


/**
 * Log an exception being thrown.
 *
 * @this {log}
 * @param {String} name The name of the function throwing the
 *        exception.
 * @param {String} id The id of the client logging the
 *        exception.
 * @param {Error} err The exception being thrown.
                                                                */
logger.throw = function(name, id, err) {
  logger.throwLevel('exit', name, id, err);
};


/**
 * Log an exception being caught, specifying the logging level to
 * write at.
 *
 * @this {log}
 * @param {String} lvl The logging level to write at.
 * @param {String} name The name of the function catching the
 *        exception.
 * @param {String} id The id of the client logging the data.
 * @param {Error} err The exception being caught.
                                                                */
logger.caughtLevel = function(lvl, name, id, err) {
  logger.log('error', id, '* Caught exception:', err);
  if (exceptionThrown) {
    exceptionThrown = null;
    while (stack.length > 1) {
      if (stack[stack.length - 1] === name) {
        break;
      }
      stack.pop();
      potentialUnwinds--;
      logger.log('debug', id, 'Potential unwinds decreased to',
                 potentialUnwinds);
    }
    if (stack.length == 1) {
      logger.entryLevel(lvl, name, id);
    }
  }
};


/**
 * Log an exception being caught.
 *
 * @this {log}
 * @param {String} name The name of the function catching the
 *        exception.
 * @param {String} id The id of the client logging the data.
 * @param {Error} err The exception being caught.
                                                                */
logger.caught = function(name, id, err) {
  logger.caughtLevel('entry', name, id, err);
};


/**
 * Dump First Failure Data Capture information in the event of
 * failure to aid in diagnosis of an error.
 *
 * @param {String=} opt_fnc The name of the calling function.
 * @param {Number=} opt_probeId An identifier for the error
 *        location.
 * @param {Client=} opt_client The client having a problem.
 * @param {Object=} opt_data Extra data to aid in problem
 *        diagnosis.
 */
logger.ffdc = function(opt_fnc, opt_probeId, opt_client, opt_data) {
  var opts = {
    title: 'First Failure Data Capture',
    fnc: opt_fnc || 'User-requested FFDC by function',
    probeId: opt_probeId || 255,
    ffdcSequence: ffdcSequence++,
    clientId: opt_client ? opt_client.id : logger.NO_CLIENT_ID
  };

  logger.entry('logger.ffdc', opts.clientId);
  logger.log('parms', opts.clientId, 'fnc:', opt_fnc);
  logger.log('parms', opts.clientId, 'probeId:', opt_probeId);
  logger.log('parms', opts.clientId, 'data:', opt_data);

  if (npmlog.levels[npmlog.level] <= npmlog.levels.ffdc) {
    header('ffdc', opts.clientId, opts);
    npmlog.log('ffdc', opts.clientId, new Error().stack);
    npmlog.log('ffdc', opts.clientId, '');
    npmlog.log('ffdc', opts.clientId, 'Function Stack');
    npmlog.log('ffdc', opts.clientId, stack.slice(1));
    npmlog.log('ffdc', opts.clientId, '');
    npmlog.log('ffdc', opts.clientId, 'Function History');
    for (var idx = 0; idx < npmlog.record.length; idx++) {
      var rec = npmlog.record[idx];
      if ((rec.level !== 'ffdc') &&
          (npmlog.levels[rec.level] >= npmlog.levels[historyLevel])) {
        npmlog.log('ffdc', opts.clientId, '%d %s %s %s',
                   rec.id, npmlog.disp[rec.level], rec.prefix, rec.message);
      }
    }
    if (opt_client) {
      npmlog.log('ffdc', opts.clientId, '');
      npmlog.log('ffdc', opts.clientId, 'Client');
      npmlog.log('ffdc', opts.clientId, opt_client);
    }
    if (opt_data) {
      npmlog.log('ffdc', opts.clientId, '');
      npmlog.log('ffdc', opts.clientId, 'Data');
      npmlog.log('ffdc', opts.clientId, opt_data);
    }
    npmlog.log('ffdc', opts.clientId, '');
    npmlog.log('ffdc', opts.clientId, 'Memory Usage');
    npmlog.log('ffdc', opts.clientId, process.memoryUsage());
    if ((ffdcSequence === 1) || (opts.probeId === 255)) {
      npmlog.log('ffdc', opts.clientId, '');
      npmlog.log('ffdc', opts.clientId, 'Environment Variables');
      npmlog.log('ffdc', opts.clientId, process.env);
    }
    npmlog.log('ffdc', opts.clientId, '');
  }

  // In a unit testing environment we expect to get no ffdcs.
  if (process.env.NODE_ENV === 'unittest') {
    var err = new Error('No ffdcs expected during unit tests');
    logger.throw('logger.ffdc', opts.clientId, err);
    throw err;
  }

  logger.exit('logger.ffdc', opts.clientId, null);

  // Exit if fail on FFDC is required.
  if (process.env.MQLIGHT_NODE_FAIL_ON_FFDC) {
    console.error('Aborting due to FFDC');
    process.abort();
  }
};


/**
 * The identifier used when a log entry is not associated with a
 * particular client.
 *
 * @const {string}
 */
logger.NO_CLIENT_ID = '*';

npmlog.addLevel('all', -Infinity, styles.inverse, 'all   ');
npmlog.addLevel('proton_data', -Infinity, styles.green, 'data  ');
npmlog.addLevel('proton_exit', -Infinity, styles.yellow, 'exit  ');
npmlog.addLevel('proton_entry', -Infinity, styles.yellow, 'entry ');
npmlog.addLevel('proton', -Infinity, styles.yellow, 'func  ');
npmlog.addLevel('data_often', 100, styles.green, 'data  ');
npmlog.addLevel('exit_often', 100, styles.yellow, 'exit  ');
npmlog.addLevel('entry_often', 100, styles.yellow, 'entry ');
npmlog.addLevel('often', 100, styles.yellow, 'func  ');
npmlog.addLevel('raw', 200, styles.inverse, 'raw   ');
npmlog.addLevel('detail', 300, styles.green, 'detail');
npmlog.addLevel('debug', 500, styles.inverse, 'debug ');
npmlog.addLevel('emit', 800, styles.green, 'emit  ');
npmlog.addLevel('data', 1000, styles.green, 'data  ');
npmlog.addLevel('parms', 1200, styles.yellow, 'parms ');
npmlog.addLevel('header', 1500, styles.yellow, 'header');
npmlog.addLevel('exit', 1500, styles.yellow, 'exit  ');
npmlog.addLevel('entry', 1500, styles.yellow, 'entry ');
npmlog.addLevel('entry_exit', 1500, styles.yellow, 'func  ');
npmlog.addLevel('error', 1800, styles.red, 'error ');
npmlog.addLevel('object', 1900, styles.red, 'object');
npmlog.addLevel('ffdc', 2000, styles.red, 'ffdc  ');


/**
 * Set the logging stream. By default stderr will be used, but
 * this can be changed to stdout by setting the environment
 * variable MQLIGHT_NODE_LOG_STREAM=stdout.
 */
logger.setStream(process.env.MQLIGHT_NODE_LOG_STREAM || 'stderr');


/**
 * Set the amount of message data that will get logged. The
 * default is 100 bytes, but this can be altered by setting the
 * environment variable MQLIGHT_NODE_MESSAGE_DATA_SIZE to a
 * different number.
 */
logger.setDataSize(process.env.MQLIGHT_NODE_MESSAGE_DATA_SIZE || 100);


/**
 * Set the level of logging. By default only 'ffdc' entries will
 * be logged, but this can be altered by setting the environment
 * variable MQLIGHT_NODE_LOG to one of the defined levels.
 */
startLevel = process.env.MQLIGHT_NODE_LOG || 'ffdc';
logger.setLevel(startLevel);


/**
 * Set the maximum size of logging history. By default a maximum
 * of 10,000 entries will be retained, but this can be altered
 * by setting the environment variable
 * MQLIGHT_NODE_LOG_HISTORY_SIZE to a different number.
 */
npmlog.maxRecordSize = process.env.MQLIGHT_NODE_LOG_HISTORY_SIZE || 10000;
logger.log('debug', logger.NO_CLIENT_ID,
           'npmlog.maxRecordSize:', npmlog.maxRecordSize);

/*
 * Set the level of entries that will dumped in the ffdc function history.
 * By default only entries at debug level or above will be dumped, but this can
 * be altered by setting the environment variable MQLIGHT_NODE_LOG_HISTORY to
 * one of the defined levels.
 */
historyLevel = process.env.MQLIGHT_NODE_LOG_HISTORY || 'debug';
logger.log('debug', logger.NO_CLIENT_ID, 'historyLevel:', historyLevel);


/*
 * Set up a signal handler that will cause an ffdc to be generated when
 * the signal is caught. Set the environment variable MQLIGHT_NODE_NO_HANDLER
 * to stop the signal handler being registered.
 */
if (!process.env.MQLIGHT_NODE_NO_HANDLER) {
  var signal = isWin ? 'SIGBREAK' : 'SIGUSR2';
  logger.log('debug', logger.NO_CLIENT_ID, 'Registering signal handler for',
             signal);
  process.on(signal, function() {
    logger.ffdc(signal, 255, null, 'User-requested FFDC on signal');

    // Start logging at the 'debug' level if we're not doing so, or turn off
    // logging if we already are.
    if (npmlog.levels[startLevel] > npmlog.levels.debug) {
      if (npmlog.level === startLevel) {
        logger.log('ffdc', logger.NO_CLIENT_ID, 'Setting npmlog.level: debug');
        logger.setLevel('debug');
      } else {
        logger.log('ffdc', logger.NO_CLIENT_ID, 'Setting npmlog.level:',
                   startLevel);
        logger.setLevel(startLevel);
      }
    }
  });
}

if (process.env.MQLIGHT_NODE_DEBUG_PORT) {
  /**
   * Set the port which the debugger will listen on to the value of the
   * MQLIGHT_NODE_DEBUG_PORT environment variable, if it's set.
   */
  process.debugPort = process.env.MQLIGHT_NODE_DEBUG_PORT;
}

/*
 * If the MQLIGHT_NODE_FFDC_ON_UNCAUGHT environment variable is set, then
 * an ffdc will be produced on an uncaught exception.
 */
if (process.env.MQLIGHT_NODE_FFDC_ON_UNCAUGHT) {
  logger.log('debug', logger.NO_CLIENT_ID,
             'Registering uncaught exception handler');
  process.on('uncaughtException', function(err) {
    logger.ffdc('uncaughtException', 100, null, err);
    throw err;
  });
}
