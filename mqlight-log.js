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
/* jslint node: true */
/* jshint -W083,-W097 */
'use strict';
var log = exports;

var pkg = require('./package.json');
var os = require('os');
var moment = require('moment');
var logger = require('npmlog');
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
var processedExceptions = 0;

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
 * Write the log entry, including a timestamp and process identifier in the
 * heading.
 */
var write = function(lvl, prefix, args) {
  logger.heading = moment(new Date()).format('HH:mm:ss.SSS') +
                   ' [' + process.pid + ']';
  logger.log.apply(this, arguments);
};


/*
 * Write a log or ffdc header, including basic information about the program
 * and host.
 */
var header = function(lvl, clientId, options) {
  if (logger.levels[logger.level] <= logger.levels[lvl]) {
    write(lvl, clientId, HEADER_BANNER);
    write(lvl, clientId, '| IBM MQ Light Node.js Client Module -',
          options.title);
    write(lvl, clientId, HEADER_BANNER);
    write(lvl, clientId, '| Date/Time         :-',
          moment(new Date()).format('ddd MMMM DD YYYY HH:mm:ss.SSS Z'));
    write(lvl, clientId, '| Host Name         :-', os.hostname());
    write(lvl, clientId, '| Operating System  :-', os.type(), os.release());
    write(lvl, clientId, '| Architecture      :-', os.platform(), os.arch());
    write(lvl, clientId, '| Node Version      :-', process.version);
    write(lvl, clientId, '| Node Path         :-', process.execPath);
    write(lvl, clientId, '| Node Arguments    :-', process.execArgs);
    write(lvl, clientId, '| Program Arguments :- ', process.argv);
    if (!isWin) {
      write(lvl, clientId, '| User Id           :-', process.getuid());
      write(lvl, clientId, '| Group Id          :-', process.getgid());
    }
    write(lvl, clientId, '| Name              :-', pkg.name);
    write(lvl, clientId, '| Version           :-', pkg.version);
    write(lvl, clientId, '| Description       :-', pkg.description);
    write(lvl, clientId, '| Installation Path :-', __dirname);
    write(lvl, clientId, '| Uptime            :-', process.uptime());
    write(lvl, clientId, '| Log Level         :-', logger.level);
    write(lvl, clientId, '| Data Size         :-', dataSize);
    if ('fnc' in options) {
      write(lvl, clientId, '| Function          :-', options.fnc);
    }
    if ('probeId' in options) {
      write(lvl, clientId, '| Probe Id          :-', options.probeId);
    }
    if ('ffdcSequence' in options) {
      write(lvl, clientId, '| FDCSequenceNumber :-', options.ffdcSequence++);
    }
    write(lvl, clientId, '| Exceptions        :-', processedExceptions);
    write(lvl, clientId, HEADER_BANNER);
    write(lvl, clientId, '');
  }
};


/**
 * Set the logging level.
 *
 * @param {String} lvl The logging level to write at.
 */
log.setLevel = function(lvl) {
  if (logger.levels[lvl.toLowerCase()]) {
    logger.level = lvl.toLowerCase();

    header('header', log.NO_CLIENT_ID, {title: 'Log'});

    if (logger.levels[logger.level] <= logger.levels.detail) {
      // Set PN_TRACE_FRM if detailed data level logging is enabled.
      log.log('debug', log.NO_CLIENT_ID, 'Setting PN_TRACE_FRM');
      process.env.PN_TRACE_FRM = '1';
      if (logger.levels[logger.level] <= logger.levels.raw) {
        // Set PN_TRACE_RAW if raw level logging is enabled.
        log.log('debug', log.NO_CLIENT_ID, 'Setting PN_TRACE_RAW');
        process.env.PN_TRACE_RAW = '1';
      } else {
        log.log('debug', log.NO_CLIENT_ID, 'Unsetting PN_TRACE_RAW');
        delete process.env.PN_TRACE_RAW;
      }
    }
    else {
      if (process.env.PN_TRACE_RAW) {
        log.log('debug', log.NO_CLIENT_ID, 'Unsetting PN_TRACE_RAW');
        delete process.env.PN_TRACE_RAW;
      }
      if (process.env.PN_TRACE_FRM) {
        log.log('debug', log.NO_CLIENT_ID, 'Unsetting PN_TRACE_FRM');
        delete process.env.PN_TRACE_FRM;
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
log.getLevel = function() {
  return logger.level;
};


/**
 * Set the logging stream.
 *
 * @param {String} stream The stream to log to. If the value
 *        isn't 'stderr' or 'stdout' then stream will be treated
 *        as a file which will be written to as well as
 *        stderr/stdout.
 */
log.setStream = function(stream) {
  if (stream === 'stderr') {
    // Log to stderr.
    logger.stream = process.stderr;

    // Stop writing to a file.
    if (fd) {
      fs.closeSync(fd);
    }
  } else if (stream === 'stdout') {
    // Log to stdout.
    logger.stream = process.stdout;

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
    logger.on('log', function(m) {
      if (fd) {
        if (logger.levels[logger.level] <= logger.levels[m.level]) {
          // We'll get called for every log event, so filter to ones we're
          // interested in.
          fs.writeSync(fd, util.format('%s %s %s %s\n',
                                       logger.heading, logger.disp[m.level],
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
log.setDataSize = function(size) {
  log.entry('log.setDataSize', log.NO_CLIENT_ID);
  log.log('parms', log.NO_CLIENT_ID, 'size:', size);

  if (typeof size === 'string') {
    dataSize = parseInt(size);
    if (isNaN(dataSize)) {
      throw new TypeError('MQLIGHT_NODE_MESSAGE_DATA_SIZE is not a number');
    }
  } else {
    dataSize = size;
  }

  log.exit('log.setDataSize', log.NO_CLIENT_ID);
};


/**
 * Get the amount of message data that will get logged.
 *
 * @return {Number} The data size.
 */
log.getDataSize = function() {
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
log.entryLevel = function(lvl, name, id) {
  if (exceptionThrown) {
    log.log('error', id, '* Uncaught exception');
    processedExceptions++;
    exceptionThrown = null;
    while(stack.length > 1) {
      stack.pop();
    }
  }
  write(lvl, id, ENTRY_IND.substring(0, stack.length), name);
  stack.push(name);
};


/**
 * Log entry into a function.
 *
 * @param {String} name The name of the function being entered.
 * @param {String} id The id of the client causing the function
 *        to be entered.
 */
log.entry = function(name, id) {
  log.entryLevel('entry', name, id);
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
log.exitLevel = function(lvl, name, id, rc) {
  write(lvl, id, EXIT_IND.substring(0, Math.max(1, stack.length - 1)),
        name, rc ? rc : '');
  var last;
  do
  {
    if (stack.length == 1) {
      if (processedExceptions == 0) {
        log.ffdc('log.exitLevel', 10, null, name);
      }
      break;
    }
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
log.exit = function(name, id, rc) {
  log.exitLevel('exit', name, id, rc);
};


/**
 * Log data.
 *
 * @this {log}
 * @param {String} lvl The level at which to log the data.
 * @param {String} id The id of the client logging the data.
 * @param {Object} args The data to be logged.
 */
log.log = function(lvl, id, args) {
  if (logger.levels[logger.level] <= logger.levels[lvl]) {
    write.apply(this, arguments);
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
log.body = function(id, data) {
  if (logger.levels[logger.level] <= logger.levels.data) {
    write('data', id, '! length:', data.length);
    if (typeof data === 'string') {
      if ((dataSize >= data.length) || (dataSize < 0)) {
        write('data', id, '! string:', data);
      } else {
        write('data', id, '! string:', data.substring(0, dataSize), '...');
      }
    } else {
      if ((dataSize >= data.length) || (dataSize < 0)) {
        write('data', id, '! buffer:',
              data.toString('hex'));
      } else {
        write('data', id, '! buffer:',
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
log.throwLevel = function(lvl, name, id, err) {
  log.log('error', id, '* Thrown exception:', err);
  exceptionThrown = err;
  log.exitLevel(lvl, name, id, 'Exception thrown');
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
log.throw = function(name, id, err) {
  log.throwLevel('exit', name, id, err);
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
log.caughtLevel = function(lvl, name, id, err) {
  log.log('error', id, '* Caught exception:', err);
  if (exceptionThrown) {
    processedExceptions++;
    exceptionThrown = null;
    while(stack.length > 1) {
      if (stack[stack.length - 1] === name) {
        break;
      }
      stack.pop();
    }
    if (stack.length == 1) {
      log.entryLevel(lvl, name, id);
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
log.caught = function(name, id, err) {
  log.caughtLevel('entry', name, id, err);
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
log.ffdc = function(opt_fnc, opt_probeId, opt_client, opt_data) {
  var opts = {
    title: 'First Failure Data Capture',
    fnc: opt_fnc || 'User-requested FFDC by function',
    probeId: opt_probeId || 255,
    ffdcSequence: ffdcSequence++,
    clientId: opt_client ? opt_client.id : log.NO_CLIENT_ID
  };

  log.entry('log.ffdc', opts.clientId);
  log.log('parms', opts.clientId, 'fnc:', opt_fnc);
  log.log('parms', opts.clientId, 'probeId:', opt_probeId);
  log.log('parms', opts.clientId, 'data:', opt_data);

  if (logger.levels[logger.level] <= logger.levels.ffdc) {
    header('ffdc', opts.clientId, opts);
    write('ffdc', opts.clientId, new Error().stack);
    write('ffdc', opts.clientId, '');
    write('ffdc', opts.clientId, 'Function Stack');
    write('ffdc', opts.clientId, stack.slice(1));
    write('ffdc', opts.clientId, '');
    write('ffdc', opts.clientId, 'Function History');
    for (var idx = 0; idx < logger.record.length; idx++) {
      var rec = logger.record[idx];
      if ((rec.level !== 'ffdc') &&
          (logger.levels[rec.level] >= logger.levels[historyLevel])) {
        write('ffdc', opts.clientId, '%d %s %s %s',
              rec.id, logger.disp[rec.level], rec.prefix, rec.message);
      }
    }
    if (opt_client) {
      write('ffdc', opts.clientId, '');
      write('ffdc', opts.clientId, 'Client');
      write('ffdc', opts.clientId, opt_client);
    }
    if (opt_data) {
      write('ffdc', opts.clientId, '');
      write('ffdc', opts.clientId, 'Data');
      write('ffdc', opts.clientId, opt_data);
    }
    write('ffdc', opts.clientId, '');
    write('ffdc', opts.clientId, 'Memory Usage');
    write('ffdc', opts.clientId, process.memoryUsage());
    if ((ffdcSequence === 1) || (opts.probeId === 255)) {
      write('ffdc', opts.clientId, '');
      write('ffdc', opts.clientId, 'Environment Variables');
      write('ffdc', opts.clientId, process.env);
    }
    write('ffdc', opts.clientId, '');
  }

  log.exit('log.ffdc', opts.clientId, null);
};


/**
 * The identifier used when a log entry is not associated with a
 * particular client.
 *
 * @const {string}
 */
log.NO_CLIENT_ID = '*';

logger.addLevel('all', -Infinity, styles.inverse, 'all   ');
logger.addLevel('data_often', -Infinity, styles.green, 'data  ');
logger.addLevel('exit_often', -Infinity, styles.yellow, 'exit  ');
logger.addLevel('entry_often', -Infinity, styles.yellow, 'entry ');
logger.addLevel('raw', 200, styles.inverse, 'raw   ');
logger.addLevel('detail', 300, styles.green, 'detail');
logger.addLevel('debug', 500, styles.inverse, 'debug ');
logger.addLevel('emit', 800, styles.green, 'emit  ');
logger.addLevel('data', 1000, styles.green, 'data  ');
logger.addLevel('parms', 1200, styles.yellow, 'parms ');
logger.addLevel('header', 1500, styles.yellow, 'header');
logger.addLevel('exit', 1500, styles.yellow, 'exit  ');
logger.addLevel('entry', 1500, styles.yellow, 'entry ');
logger.addLevel('entry_exit', 1500, styles.yellow, 'func  ');
logger.addLevel('error', 1800, styles.red, 'error ');
logger.addLevel('ffdc', 2000, styles.red, 'ffdc  ');


/**
 * Set the logging stream. By default stderr will be used, but
 * this can be changed to stdout by setting the environment
 * variable MQLIGHT_NODE_LOG_STREAM=stdout.
 */
log.setStream(process.env.MQLIGHT_NODE_LOG_STREAM || 'stderr');


/**
 * Set the amount of message data that will get logged. The
 * default is 100 bytes, but this can be altered by setting the
 * environment variable MQLIGHT_NODE_MESSAGE_DATA_SIZE to a
 * different number.
 */
log.setDataSize(process.env.MQLIGHT_NODE_MESSAGE_DATA_SIZE || 100);


/**
 * Set the level of logging. By default only 'ffdc' entries will
 * be logged, but this can be altered by setting the environment
 * variable MQLIGHT_NODE_LOG to one of the defined levels.
 */
startLevel = process.env.MQLIGHT_NODE_LOG || 'ffdc';
log.setLevel(startLevel);


/**
 * Set the maximum size of logging history. By default a maximum
 * of 10,000 entries will be retained, but this can be altered
 * by setting the environment variable
 * MQLIGHT_NODE_LOG_HISTORY_SIZE to a different number.
 */
logger.maxRecordSize = process.env.MQLIGHT_NODE_LOG_HISTORY_SIZE || 10000;
log.log('debug', log.NO_CLIENT_ID,
        'logger.maxRecordSize:', logger.maxRecordSize);

/*
 * Set the level of entries that will dumped in the ffdc function history.
 * By default only entries at debug level or above will be dumped, but this can
 * be altered by setting the environment variable MQLIGHT_NODE_LOG_HISTORY to
 * one of the defined levels.
 */
historyLevel = process.env.MQLIGHT_NODE_LOG_HISTORY || 'debug';
log.log('debug', log.NO_CLIENT_ID, 'historyLevel:', historyLevel);


/*
 * Set up a signal handler that will cause an ffdc to be generated when
 * the signal is caught. Set the environment variable MQLIGHT_NODE_NO_HANDLER
 * to stop the signal handler being registered.
 */
if (!process.env.MQLIGHT_NODE_NO_HANDLER) {
  var signal = isWin ? 'SIGBREAK' : 'SIGUSR2';
  log.log('debug', log.NO_CLIENT_ID, 'Registering signal handler for', signal);
  process.on(signal, function() {
    log.ffdc(signal, 255, null, 'User-requested FFDC on signal');

    // Start logging at the 'debug' level if we're not doing so, or turn off
    // logging if we already are.
    if (logger.levels[startLevel] > logger.levels.debug) {
      if (logger.level === startLevel) {
        log.log('ffdc', log.NO_CLIENT_ID, 'Setting logger.level: debug');
        log.setLevel('debug');
      } else {
        log.log('ffdc', log.NO_CLIENT_ID, 'Setting logger.level:', startLevel);
        log.setLevel(startLevel);
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
  log.log('debug', log.NO_CLIENT_ID, 'Registering uncaught exception handler');
  process.on('uncaughtException', function(err) {
    log.ffdc('uncaughtException', 100, null, err);
    throw err;
  });
}
