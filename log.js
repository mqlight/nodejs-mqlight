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

var pkg = require('./package.json');
var os = require('os');
var moment = require('moment');
var logger = require('npmlog');

var isWin = (os.platform() === 'win32');
var stack = ['<stack unwind error>'];
var ENTRY_IND = '>-----------------------------------------------------------';
var EXIT_IND = '<-----------------------------------------------------------';
var ffdcSequence = 0;
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
 * Log entry into a function.
 *
 * @this {log}
 * @param {String} name The name of the function being entered.
 * @param {String} id The id of the client causing the function
 *        to be entered.
 */
exports.entry = function(name, id) {
  if (logger.levels[logger.level] <= logger.levels.entry) {
    write('entry', id, ENTRY_IND.substring(0, stack.length), name);
  }
  stack.push(name);
};


/**
 * Log exit from a function.
 *
 * @this {log}
 * @param {String} name The name of the function being exited.
 * @param {String} id The id of the client causing the function
 *        to be exited.
 * @param {Object} rc The function return code.
 */
exports.exit = function(name, id, rc) {
  if (logger.levels[logger.level] <= logger.levels.entry) {
    write('exit', id, EXIT_IND.substring(0, stack.length - 1),
          name, rc ? rc : '');
  }
  do
  {
    if (stack.length == 1) {
      exports.ffdc('log.exit', 10, null, stack);
      break;
    }
    var last = stack.pop();
  } while (last != name);
};


/**
 * Log data.
 *
 * @this {log}
 * @param {String} lvl The level at which to log the data.
 * @param {String} id The id of the client logging the data.
 * @param {Object} args The data to be logged.
 */
exports.log = function(lvl, id, args) {
  if (logger.levels[logger.level] <= logger.levels[lvl]) {
    write.apply(this, arguments);
  }
};


/**
 * Dump First Failure Data Capture information in the event of
 * failure to aid in diagnosis of an error.
 *
 * @this {log}
 * @param {String} fnc The name of the calling function.
 * @param {Number} probeId An identifier for the error location.
 * @param {Client} client The client having a problem.
 * @param {Object} data Extra data to aid in problem diagnosis.
 */
exports.ffdc = function(fnc, probeId, client, data) {
  if (logger.levels[logger.level] <= logger.levels.ffdc) {
    var clientId = client ? client.Id : exports.NO_CLIENT_ID;

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
      write('ffdc', clientId, '| User Id            :-', process.getuid());
      write('ffdc', clientId, '| Group Id           :-', process.getgid());
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
    write('ffdc', clientId, 'Function Stack');
    write('ffdc', clientId, stack.slice(1));
    write('ffdc', clientId, '');
    write('ffdc', clientId, new Error().stack);
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
};


/** The identifier used when a log entry is not associated
 *  with a particular client.
 *
 *  @const {string}
 */
exports.NO_CLIENT_ID = '*';

logger.addLevel('all', -Infinity, styles.inverse, 'all   ');
logger.addLevel('debug', 800, styles.inverse, 'debug ');
logger.addLevel('detail', 1000, styles.green, 'detail');
logger.addLevel('emit', 1000, styles.green, 'emit  ');
logger.addLevel('data', 1500, styles.green, 'data  ');
logger.addLevel('parms', 1500, styles.yellow, 'parms ');
logger.addLevel('exit', 3000, styles.yellow, 'exit  ');
logger.addLevel('entry', 3000, styles.yellow, 'entry ');
logger.addLevel('entry_exit', 3000, styles.yellow, 'func  ');
logger.addLevel('error', 5000, styles.red, 'error ');
logger.addLevel('ffdc', 10000, styles.red, 'ffdc  ');


/**
 * Set the level of logging. By default only 'ffdc' entries will
 * be logged, but this can be altered by setting the environment
 * variable MQLIGHT_NODE_LOG to one of the levels defined above.
 *
 * @const {string}
 */
logger.level = process.env.MQLIGHT_NODE_LOG || 'ffdc';

exports.log('debug', exports.NO_CLIENT_ID, 'logger.level =', logger.level);
if (logger.levels[logger.level] <= logger.levels.data) {
  // Set PN_TRACE_FRM if data level logging is enabled.
  exports.log('debug', exports.NO_CLIENT_ID, 'Setting PN_TRACE_FRM');
  process.env['PN_TRACE_FRM'] = '1';
  if (logger.levels[logger.level] <= logger.levels.detail) {
    // Set PN_TRACE_RAW if detailed data level logging is enabled.
    exports.log('debug', exports.NO_CLIENT_ID, 'Setting PN_TRACE_RAW');
    process.env['PN_TRACE_RAW'] = '1';
  }
}

/*
 * Set up a signal handler that will cause an ffdc to be generated when
 * the signal is caught. Set the environment variable MQLIGHT_NODE_NO_HANDLER
 * to stop the signal handler being registered.
 */
if (!process.env.MQLIGHT_NODE_NO_HANDLER) {
  if (isWin) {
    exports.log('debug', exports.NO_CLIENT_ID,
                'Registering signal handler for SIGBREAK');
    process.on('SIGBREAK', function() {
      exports.ffdc('SIGBREAK', 255, null, null);
    });
  } else {
    exports.log('debug', exports.NO_CLIENT_ID,
                'Registering signal handler for SIGUSR2');
    process.on('SIGUSR2', function() {
      exports.ffdc('SIGUSR2', 255, null, null);
    });
  }
}
