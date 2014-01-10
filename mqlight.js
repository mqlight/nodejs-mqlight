/*
 *   <copyright 
 *   notice="oco-source" 
 *   pids="5755-P60" 
 *   years="2013" 
 *   crc="3568777996" > 
 *   IBM Confidential 
 *    
 *   OCO Source Materials 
 *    
 *   5755-P60
 *    
 *   (C) Copyright IBM Corp. 2013 
 *    
 *   The source code for the program is not published 
 *   or otherwise divested of its trade secrets, 
 *   irrespective of what has been deposited with the 
 *   U.S. Copyright Office. 
 *   </copyright> 
 */

var proton = require('./build/Release/proton');
var uuid = require('node-uuid');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

/**
 * Represents an MQ Light client instance.
 *
 * @param {string} hostName - the remote hostname to which we will connect.
 * @param {number} [port] - (optional) the remote tcp port to connect to.
 * @param {string} [clientId] - (optional) unique identifier for this client.
 * @constructor
 */
var Client = function(hostName, port, clientId) {
  if (!port) port = 5672;
  if (!clientId) clientId = uuid.v4();
  this.brokerUrl = "amqp://" + hostName + ':' + port;
  this.clientId = clientId;
  this.messenger = new proton.ProtonMessenger(clientId);
  this.messenger.start();
};

/**
 * Creates and returns an MQ Light message object.
 *
 * @param {string} address - the address to which the message will be sent.
 * @param {string} [body] - (optional) a string of text to set as message body.
 * @returns {ProtonMessage}
 */
Client.prototype.createMessage = function(address, body) {
  var msg = new proton.ProtonMessage();
  msg.address = this.brokerUrl + '/' + address;
  if (body !== 'undefined') msg.body = body;
  return msg;
};

/**
 * @callback sendCallback
 * @param {string} err - an error message if a problem occurred.
 */

/**
 * Sends the given MQ Light message object to its address.
 *
 * @param {ProtonMessage} message - the message to be sent.
 * @param {sendCallback} cb - (optional) callback to be notified of errors
 */
Client.prototype.send = function(message, cb) {
  if (message !== 'undefined') this.messenger.put(message);
  this.messenger.send();
  process.nextTick(cb);
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
 *                      
 * @return a {@link Destination} from which can applications can receive messages.
 */
Client.prototype.createDestination = function(pattern, expiryMillis) {
    var messenger = this.messenger;
    var emitter = new EventEmitter();

    messenger.subscribe(pattern);
    var check_for_messages = function() {
      var messages = messenger.receive(1000);
      if (messages.length > 0) {
        for (var i=0, tot=messages.length; i < tot; i++) {
          emitter.emit('message', messages[i]);
        }
      }
      setTimeout(check_for_messages, 1000);
    }
    process.nextTick(check_for_messages);

    return emitter;
};

module.exports = Client;

/* ------------------------------------------------------------------------- */

process.on('SIGINT', function() {
    client_.close();
    process.exit(0);
});

// simple example test run
var client_ = new Client("0.0.0.0", 5672, "client-0");

// publish registration message
var msg = client_.createMessage("register", "available for work");
client_.send(msg, function() {
  console.log("Send called with message:");
  console.log(msg);
});

// whilst the client still has pending messages, keep calling send
var checkFinished = function() {
  if (client_.messenger.hasOutgoing == false) {
    console.log("Message delivered");
  } else {
    client_.send();
    setTimeout(checkFinished, 2500);
  }
};
process.nextTick(checkFinished);

// now subscribe to topic for new work publications
var destination = client_.createDestination("amqp://0.0.0.0:5672/workers", 5000);

// listen to new message events and process them
destination.on('message', function (msg) {
  console.log('# received message');
  console.log(msg);
});

// listen for the closed destination event and shutdown
destination.on('closed', function() {
  console.log('destination closed');
});

