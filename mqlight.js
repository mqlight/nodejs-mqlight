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

var proton = require('./build/Release/proton');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

try {
  var uuid = require('node-uuid');
} catch(_) {
  var uuid = require(require.resolve('npm') + '/../../node_modules/request/node_modules/node-uuid');
}

/** @constant {number} */
exports.QOS_AT_MOST_ONCE = 0;
/** @constant {number} */
exports.QOS_AT_LEAST_ONCE = 1;
/** @constant {number} */
exports.QOS_EXACTLY_ONCE = 2;

/**
 * Creates an MQ Light client instance.
 *
 * @param {string} hostName - the remote hostname to which we will connect.
 * @param {number} [port] - (optional) the remote tcp port to connect to.
 * @param {string} [clientId] - (optional) unique identifier for this client.
 */
exports.createClient = function(hostName, port, clientId) {
  var client = new Client(hostName, port, clientId);
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
 * @param {string} hostName - the remote hostname to which we will connect.
 * @param {number} [port] - (optional) the remote tcp port to connect to.
 * @param {string} [clientId] - (optional) unique identifier for this client.
 * @constructor
 */
var Client = function(hostName, port, clientId) {
  EventEmitter.call(this);
  if (!port) port = 5672;
  if (!clientId) clientId = "AUTO:" + uuid.v4().substring(0, 7);
  if (clientId.length > 48) { 
    var msg = "Client identifier '" + clientId + "' is longer than the " +
        "maximum ID length of 48.";
    throw new Error(msg);
  }
  this.brokerUrl = "amqp://" + hostName + ':' + port;
  this.clientId = clientId;
  this.messenger = new proton.ProtonMessenger(clientId);
  this.messenger.start();
};
util.inherits(Client, EventEmitter);

/**
 * Creates and returns an MQ Light message object.
 *
 * @param {string} address - the address to which the message will be sent.
 * @param {string} [body] - (optional) a string of text to set as message body.
 * @returns {ProtonMessage}
 */
Client.prototype.createMessage = function(address, body) {
  var msg = new proton.ProtonMessage();
  msg.address = this.brokerUrl;
  if (address) msg.address += '/' + address;
  if (body) msg.body = body;
  return msg;
};

/**
 * @callback sendCallback
 * @param {string} err - an error message if a problem occurred.
 * @param {ProtonMessage} message - the message that was sent.
 */

/**
 * Sends the given MQ Light message object to its address.
 *
 * @param {ProtonMessage} message - the message to be sent.
 * @param {sendCallback} cb - (optional) callback to be notified of
 *                                       errors and completion.
 */
Client.prototype.send = function(message, cb) {
  var messenger = this.messenger;
  var callback = cb;
  try {
    if (message) {
      messenger.put(message);

      // setup a timer to trigger the callback once the message has been sent
      var untilSendComplete = function(message, callback) {
        messenger.send();
        if (messenger.hasSent(message)) {
          messenger.send();
          process.nextTick(function() {
            callback(undefined, message);
          });
          return;
        }
        // if message not yet sent, check again in a second or so
        setImmediate(untilSendComplete, message, callback);
      };
      // if a callback is set, start the timer to trigger it
      if (callback) {
        setImmediate(untilSendComplete, message, callback);
      }
    }
  } catch (e) {
    var err = new Error(e.message);
    process.nextTick(function() {
      if (callback) {
        callback(err, message);
      }
      if (err) this.emit('error', err);
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
 * The <code>pattern</code> is matched against the <code>address</code>
 * attribute of messages sent to the IBM MQ Light messaging service to
 * determine whether a particular {@link Message} will be delivered to a
 * particular <code>Destination</code>.
 * @param pattern used to match against the <code>address</code> attribute of
 * messages to determine if a copy of the message should be delivered to the
 * <code>Destination</code>.
 * @param expiryMillis the time (in milliseconds) that the destination and its
 * stored messages will remain while the <code>Client</code> that created it is
 * closed.  Setting this parameter to 0 will case the destination to be deleted
 * as soon as the <code>Client</code> is closed.  Setting this to
 * <code>EXPIRE_NEVER</code> will cause the destination to remain in existence
 * until its expiry time is adjusted using {@link Destination#setExpiry(long)}.
 * @param {destCallback} cb - (optional) callback to be notified of errors
 *
 * @return a {@link Destination} from which can applications can receive messages.
 */
Client.prototype.createDestination = function(pattern, expiryMillis, cb) {
    var messenger = this.messenger;
    var address = this.brokerUrl + '/' + pattern;
    var emitter = new EventEmitter();
    var callback = cb;

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
            emitter.emit('message', messages[i]);
          }
        }
        setImmediate(check_for_messages);
      };
      setImmediate(check_for_messages);
    }

    return emitter;
};

/* ------------------------------------------------------------------------- */
