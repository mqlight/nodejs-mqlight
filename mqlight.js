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
var _system = os.platform() + '-' + process.arch;
try {
  var proton = require('./lib/' + _system + '/proton');
} catch(_) {
  if ('MODULE_NOT_FOUND' === _.code) {
    throw new Error('mqlight.js is not currently supported on ' + _system);
  }
  throw _;
}
var EventEmitter = require('events').EventEmitter;
var util = require('util');

try {
  var uuid = require('node-uuid');
} catch(_) {
  var uuid = require(require.resolve('npm') + '/../../node_modules/request/node_modules/node-uuid');
}

var validClientIdChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789%/._';
/** @constant {number} */
exports.QOS_AT_MOST_ONCE = 0;
/** @constant {number} */
exports.QOS_AT_LEAST_ONCE = 1;
/** @constant {number} */
exports.QOS_EXACTLY_ONCE = 2;

/**
 * Creates an MQ Light client instance.
 *
 * Options:
 *  - **host**, (String, default: localhost), the remote hostname to which we will connect.
 *  - **port**, (Number, default: 5672), the remote tcp port to connect to.
 *  - **clientId (String, default: AUTO_[0-9a-f]{7}), a unique identifier for this client.
 *
 * @param {Object} [options] (optional) map of options for the client.
 */
exports.createClient = function(options) {
  var opt = (typeof options == 'object') ? options : {};
  var client = new Client(opt.host, opt.port, opt.clientId);
  // FIXME: make this actually check driver/engine connection state
  process.nextTick(function() {
    client.emit('connected', true);
  });
  process.once('exit', function() {
    if (client) {
      client.send();
      client.close();
    }
  });
  return client;
};

/**
 * Represents an MQ Light client instance.
 *
 * @param {string} host - (optional) the remote host to which we will connect.
 * @param {number} [port] - (optional) the remote tcp port to connect to.
 * @param {string} [clientId] - (optional) unique identifier for this client.
 * @constructor
 */
var Client = function(host, port, clientId) {
  EventEmitter.call(this);
  if (!host) host = "localhost";
  if (!port) port = 5672;
  if (!clientId) clientId = "AUTO_" + uuid.v4().substring(0, 7);
  if (clientId.length > 48) {
    var msg = "Client identifier '" + clientId + "' is longer than the " +
        "maximum ID length of 48.";
    throw new Error(msg);
  }
  /* currently client ids are restricted to a fixed char set, reject those not in it*/
  var i;
  for (i in clientId) {
    if (validClientIdChars.indexOf(clientId[i]) == -1) {
      var err = "Client Identifier '" + clientId + "' contains invalid char: " +
        clientId[i];
      throw new Error(err);
    }
  }
  this.brokerUrl = "amqp://" + host + ':' + port;
  this.clientId = clientId;
  this.messenger = new proton.ProtonMessenger(clientId);
  this.messenger.start();
};
util.inherits(Client, EventEmitter);

/**
 * @callback sendCallback
 * @param {string} err - an error message if a problem occurred.
 * @param {ProtonMessage} message - the message that was sent.
 */

/**
 * Sends the given MQ Light message object to its address.
 *
 * @param {string} topic - the topic to which the message will be sent.
 * @param {Object} message - the message body to be sent.
 * @param {Object} [options] (optional) map of additional options for the send.
 * @param {sendCallback} cb - (optional) callback to be notified of
 *                                       errors and completion.
 */
Client.prototype.send = function(topic, message, options, cb) {
  var messenger = this.messenger;
  var callback = (typeof options === 'function') ? options : cb;
  try {
    if (message) {
      var protonMsg = new proton.ProtonMessage();
      protonMsg.address = this.brokerUrl;
      if (topic) protonMsg.address += '/' + topic;
      if (typeof message === 'string') {
        protonMsg.body = message;
      } else if (typeof message === 'object') {
        protonMsg.body = JSON.stringify(message);
      } else {
        throw new Error("TypeError: unsupported message type " + typeof message);
      }
      messenger.put(protonMsg);

      // setup a timer to trigger the callback once the msg has been sent
      var untilSendComplete = function(protonMsg, callback) {
        messenger.send();
        if (messenger.hasSent(protonMsg)) {
          messenger.send();
          process.nextTick(function() {
            callback(undefined, protonMsg);
          });
          return;
        }
        // if msg not yet sent and still running, check again in a second or so
        if (!messenger.stopped) {
          setImmediate(untilSendComplete, protonMsg, callback);
        }
      };
      // if a callback is set, start the timer to trigger it
      if (callback) {
        setImmediate(untilSendComplete, protonMsg, callback);
      }
    }
  } catch (e) {
    var client = this;
    var err = new Error(e.message);
    process.nextTick(function() {
      if (callback) {
        callback(err, protonMsg);
      }
      if (err) client.emit('error', err);
    });
  }
};

/**
 * Disconnects this Client from the messaging server and frees the system
 * resources that it uses. Calling this method also implicitly closes any
 * Destination objects that have been created using the client's
 * {@linkClient#createDestination} method.
 */
Client.prototype.close = function() {
  this.messenger.stop();
};

/**
 * @callback destCallback
 * @param {string} err - an error message if a problem occurred.
 * @param {string} address - the address that was subscribed to.
 */

/**
 * Create a {@link Destination} and associates it with a <code>pattern</code>.
 *
 * The <code>pattern</code> is matched against the <code>address</code>
 * attribute of messages sent to the IBM MQ Light messaging service to
 * determine whether a particular message will be delivered to a particular
 * <code>Destination</code>.
 *
 * @param pattern used to match against the <code>address</code> attribute of
 * messages to determine if a copy of the message should be delivered to the
 * <code>Destination</code>.
 * @param {Object} [options] (optional) map of additional options for the
 *        destination.
 * @param {destCallback} cb - (optional) callback to be notified of errors
 * @return a {@link Destination} which will emit 'message' events on arrival.
 */
Client.prototype.createDestination = function(pattern, options, cb) {
    var messenger = this.messenger;
    var address = this.brokerUrl + '/' + pattern;
    var emitter = new EventEmitter();
    var callback = (typeof options === 'function') ? options : cb;

    try {
      messenger.subscribe(address);
    } catch (e) {
      var err = new Error(e.message);
    }

    process.nextTick(function() {
      if (callback) {
        callback(err, address);
      }
      if (err) emitter.emit('error', err);
    });

    if (!err) {
      var check_for_messages = function() {
        var messages = messenger.receive(50);
        if (messages.length > 0) {
          for (var i=0, tot=messages.length; i < tot; i++) {
            var protonMsg = messages[i];
            var message = { address: protonMsg.address, body: protonMsg.body };

            // if body is a JSON'ified object, parse it back to a js obj
            try {
                var obj = JSON.parse(message.body);
                if (typeof obj === 'object') {
                    message.body = obj;
                }
            } catch(_) {}
            
            emitter.emit('message', message);
          }
        }
        if (!messenger.stopped) {
          setImmediate(check_for_messages);
        }
      };
      setImmediate(check_for_messages);
    }

    return emitter;
};

/* ------------------------------------------------------------------------- */
