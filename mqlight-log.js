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
var log = exports;

var pkg = require('./package.json');
var os = require('os');
var moment = require('moment');
var logger = require('npmlog');

var isWin = (os.platform() === 'win32');
var stack = ['<stack unwind error>'];
var startLevel;
var historyLevel;
var ffdcSequence = 0;

var ENTRY_IND = '>-----------------------------------------------------------';
var EXIT_IND = '<-----------------------------------------------------------';
var FFDC_BANNER = '+---------------------------------------' +
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


/**
 * Set the logging level.
 *
 * @param {String} lvl The logging level to write at.
 */
log.setLevel = function(lvl) {
  logger.level = lvl;
  log.log('debug', log.NO_CLIENT_ID, 'logger.level:', logger.level);
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
 * Log entry into a function, specifying the logging level to
 * write at.
 *
 * @param {String} lvl The logging level to write at.
 * @param {String} name The name of the function being entered.
 * @param {String} id The id of the client causing the function
 *        to be entered.
 */
log.entryLevel = function(lvl, name, id) {
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
  write(lvl, id, EXIT_IND.substring(0, stack.length - 1),
        name, rc ? rc : '');
  do
  {
    if (stack.length == 1) {
      log.ffdc('log.exitLevel', 10, null, name);
      break;
    }
    var last = stack.pop();
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
  log.exitLevel('exit', name, id);
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
 * Dump First Failure Data Capture information in the event of
 * failure to aid in diagnosis of an error.
 *
 * @param {String} fnc The name of the calling function.
 * @param {Number} probeId An identifier for the error location.
 * @param {Client} client The client having a problem.
 * @param {Object} data Extra data to aid in problem diagnosis.
 */
log.ffdc = function(fnc, probeId, client, data) {
  var clientId = client ? client.Id : log.NO_CLIENT_ID;

  log.entry('log.ffdc', clientId);
  log.log('parms', clientId, 'fnc:', fnc);
  log.log('parms', clientId, 'probeId:', probeId);
  log.log('parms', clientId, 'data:', data);

  if (logger.levels[logger.level] <= logger.levels.ffdc) {

    write('ffdc', clientId, FFDC_BANNER);
    write('ffdc', clientId, '| IBM MQ Light Node.js Client Module -',
        'First Failure Data Capture');
    write('ffdc', clientId, FFDC_BANNER);
    write('ffdc', clientId, '| Date/Time         :-',
        moment(new Date()).format('ddd MMMM DD YYYY HH:mm:ss.SSS Z'));
    write('ffdc', clientId, '| Host Name         :-', os.hostname());
    write('ffdc', clientId, '| Operating System  :-', os.type(), os.release());
    write('ffdc', clientId, '| Architecture      :-', os.platform(), os.arch());
    write('ffdc', clientId, '| Node Version      :-', process.version);
    write('ffdc', clientId, '| Node Path         :-', process.execPath);
    write('ffdc', clientId, '| Node Arguments    :-', process.execArgs);
    write('ffdc', clientId, '| Program Arguments :- ', process.argv);
    if (!isWin) {
      write('ffdc', clientId, '| User Id           :-', process.getuid());
      write('ffdc', clientId, '| Group Id          :-', process.getgid());
    }
    write('ffdc', clientId, '| Name              :-', pkg.name);
    write('ffdc', clientId, '| Version           :-', pkg.version);
    write('ffdc', clientId, '| Description       :-', pkg.description);
    write('ffdc', clientId, '| Installation Path :-', __dirname);
    write('ffdc', clientId, '| Uptime            :-', process.uptime());
    write('ffdc', clientId, '| Function          :-', fnc);
    write('ffdc', clientId, '| Probe Id          :-', probeId);
    write('ffdc', clientId, '| FDCSequenceNumber :-', ffdcSequence++);
    write('ffdc', clientId, FFDC_BANNER);
    write('ffdc', clientId, '');
    write('ffdc', clientId, new Error().stack);
    write('ffdc', clientId, '');
    write('ffdc', clientId, 'Function Stack');
    write('ffdc', clientId, stack.slice(1));
    write('ffdc', clientId, '');
    write('ffdc', clientId, 'Function History');
    for (var idx = 0; idx < logger.record.length; idx++) {
      var rec = logger.record[idx];
      if ((rec.level !== 'ffdc') &&
          (logger.levels[rec.level] >= logger.levels[historyLevel])) {
        write('ffdc', clientId, '%d %s %s %s',
              rec.id, rec.level, rec.prefix, rec.message);
      }
    }
    if (client) {
      write('ffdc', clientId, '');
      write('ffdc', clientId, 'Client');
      write('ffdc', clientId, client);
    }
    if (data) {
      write('ffdc', clientId, '');
      write('ffdc', clientId, 'Data');
      write('ffdc', clientId, data);
    }
    write('ffdc', clientId, '');
    write('ffdc', clientId, 'Memory Usage');
    write('ffdc', clientId, process.memoryUsage());
    if ((ffdcSequence === 1) || (probeId === 255)) {
      write('ffdc', clientId, '');
      write('ffdc', clientId, 'Environment Variables');
      write('ffdc', clientId, process.env);
    }
    write('ffdc', clientId, '');
  }

  log.exit('log.ffdc', clientId, null);
};


/**
 * Easily dump an FFDC when running under the node debugger.
 */
log.debug = function() {
  log.ffdc('log.debug', 255, null, 'User-requested FFDC by function');
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
logger.addLevel('raw', 500, styles.inverse, 'raw   ');
logger.addLevel('detail', 800, styles.green, 'detail');
logger.addLevel('debug', 1000, styles.inverse, 'debug ');
logger.addLevel('emit', 1200, styles.green, 'emit  ');
logger.addLevel('data', 1500, styles.green, 'data  ');
logger.addLevel('parms', 2000, styles.yellow, 'parms ');
logger.addLevel('exit', 3000, styles.yellow, 'exit  ');
logger.addLevel('entry', 3000, styles.yellow, 'entry ');
logger.addLevel('entry_exit', 3000, styles.yellow, 'func  ');
logger.addLevel('error', 5000, styles.red, 'error ');
logger.addLevel('ffdc', 10000, styles.red, 'ffdc  ');


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

if (process.env.MQLIGHT_NODE_LOG_STREAM === 'stdout') {
  /**
   * Set the logging stream. By default stderr will be used, but
   * this can be changed to stdout by setting the environment
   * variable MQLIGHT_NODE_LOG_STREAM=stdout.
   */
  logger.stream = process.stdout;
}

if (logger.levels[logger.level] <= logger.levels.detail) {
  // Set PN_TRACE_FRM if detailed data level logging is enabled.
  log.log('debug', log.NO_CLIENT_ID, 'Setting PN_TRACE_FRM');
  process.env['PN_TRACE_FRM'] = '1';
  if (logger.levels[logger.level] <= logger.levels.raw) {
    // Set PN_TRACE_RAW if raw level logging is enabled.
    log.log('debug', log.NO_CLIENT_ID, 'Setting PN_TRACE_RAW');
    process.env['PN_TRACE_RAW'] = '1';
  }
}

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
        log.setLevel('debug');
      } else {
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
