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
if (process.env.NODE_ENV === 'unittest') {
  var proton = require('./tests/stubs/stubproton.js').createProtonStub();
  Object.defineProperty(exports, 'proton', {
    set: function(value) {
      proton = value;
    },
    get: function() {
      return proton;
    }
  });
} else {
  try {
    var proton = require('./lib/' + _system + '/proton');
  } catch (_) {
    if ('MODULE_NOT_FOUND' === _.code) {
      throw new Error('mqlight.js is not currently supported on ' + _system);
    }
    throw _;
  }
}

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var uuid = require('node-uuid');
var url = require('url');

var validClientIdChars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789%/._';


/** @const {number} */
exports.QOS_AT_MOST_ONCE = 0;


/** @const {number} */
exports.QOS_AT_LEAST_ONCE = 1;


/** @const {number} */
exports.QOS_EXACTLY_ONCE = 2;


/**
 * Constructs a new Client object in the disconnected state.
 * <p>
 * Options:
 * <ul>
 * <li>
 * service  - Required; when an instance of String this is a URL to connect to.
 *            When an instance of Array this is an array of URLs to connect to
 *            - each will be tried in turn until either a connection is
 *            successfully established to one of the URLs, or all of the URLs
 *            have been tried. When an instance of Function is specified for
 *            this argument, then function is invoked each time the client
 *            wants to establish a connection (e.g. for any of the state
 *            transitions, on the state diagram shown earlier on this page,
 *            which lead to the 'connected' state). The function must return
 *            either an instance of String or Array, which are treated in the
 *            manner described previously.
 * </li>
 * <li>
 * id       - Optional; an identifier that is used to identify this client. Two
 *            different instances of Client can have the same id, however only
 *            one instance can be connected to the MQ Light service at a given
 *            moment in time.  If two instances of Client have the same id and
 *            both try to connect then the first instance to establish its
 *            connection is diconnected in favour of the second instance. If
 *            this property is not specified then the client will generate a
 *            probabalistically unique ID.
 * </li>
 * <li>
 * user     - Optional; the user name to use for authentication to the MQ Light
 *            service.
 * </li>
 * <li>
 * password - Optional; the password to use for authentication.
 * </li>
 * </ul>
 *
 * @param {Object}
 *          options - (optional) map of options for the client.
 * @return {Object} The created Client object.
 */
exports.createClient = function(options) {
  var opt = (typeof options == 'object') ? options : {};
  var client = new Client(opt.service, opt.id, opt.user, opt.password);

  process.setMaxListeners(0);
  process.once('exit', function() {
    if (client && client.getState() == 'connected') {
      try {
        client.messenger.send();
        client.disconnect();
      } catch (_) {}
    }
  });

  return client;
};


/**
 * Function to take a single service URL, or array of service URLs, validate
 * them, returning an array of service URLs.
 *
 * @param {String|Array}
 *          service - Required; when an instance of String this is a URL to
 *          connect to. When an instance of Array this is an array of URLs to
 *          connect to
 * @return {Array} Valid service URLs, with port number added as appropriate.
 * @throws TypeError
 *           If service is not a string or array type.
 * @throws Error
 *           if an unsupported or invalid URL specified.
 */
var generateServiceList = function(service) {

  // Validate the parameter list length
  if (arguments.length > 1) {
    throw new Error('Too many arguments');
  }

  // Ensure the service is an Array
  var inputServiceList = [];
  if (!service) {
    throw new Error('service is undefined');
  } else if (service instanceof Function) {
    throw new TypeError('service cannot be a function');
  } else if (service instanceof Array) {
    if (service.length === 0) {
      throw new Error('service array is empty');
    }
    inputServiceList = service;
  } else if (typeof service === 'string') {
    inputServiceList[0] = service;
  } else {
    throw new TypeError('service must be a string or array type');
  }

  /*
   * Validate the list of URLs for the service, inserting default values as
   * necessary Expected format for each URL is: amqp://host:port or
   * amqps://host:port (port is optional, defaulting to 5672)
  */
  var serviceList = [];
  for (var i = 0; i < inputServiceList.length; i++) {
    var serviceUrl = url.parse(inputServiceList[i]);
    var protocol = serviceUrl.protocol;
    var host = serviceUrl.hostname;
    var port = serviceUrl.port;
    var path = serviceUrl.path;
    var auth = serviceUrl.auth;
    var msg;

    // check for auth details
    if (auth) {
      msg = 'Unsupported URL, auth details e.g user:pass@localhost should ' +
            'be supplied as options for createClient';
      throw new Error(msg);
    }
    // Check we are trying to use the amqp protocol
    if (!protocol || protocol !== 'amqp:' && protocol !== 'amqps:') {
      msg = "Unsupported URL '" + inputServiceList[i] +
            "' specified for service. Only the amqp or amqps protocol are " +
            ' supported.';
      throw new Error(msg);
    }
    // Check we have a hostname
    if (!host) {
      msg = "Unsupported URL ' " + inputServiceList[i] + "' specified for " +
            'service. Must supply a hostname.';
      throw new Error(msg);
    }
    // Set default port if not supplied
    if (!port) {
      port = '5672';
    }
    // Check for no path
    if (path) {
      msg = "Unsupported URL '" + inputServiceList[i] + "' paths (" + path +
            " ) can't be part of a service URL.";
      throw new Error(msg);
    }
    serviceList[i] = protocol + '//' + host + ':' + port;
  }

  return serviceList;
};



/**
 * Represents an MQ Light client instance.
 *
 * @param {String|Array|Function}
 *          service - Required; when an instance of String this is a URL to
 *          connect to. When an instance of Array this is an array of URLs to
 *          connect to - each will be tried in turn until either a connection
 *          is successfully established to one of the URLs, or all of the URLs
 *          have been tried. When an instance of Function is specified for this
 *          argument, then function is invoked each time the client wants to
 *          establish a connection. The function must return either an instance
 *          of String or Array, which are treated in the manner described
 *          previously.
 * @param {String}
 *          id - Optional; an identifier that is used to identify this client.
 *          To different instances of Client can have the same id, however only
 *          one instance can be subscribed to any particular topic at a given
 *          moment in time. If two instances of Client have the same id and
 *          both try to subscribe to the same topic pattern (or topic pattern
 *          and share name) then the first instance to establish its
 *          subscription be unsubscribed from the topic, in favour of the
 *          second instance. If this property is not specified then the client
 *          will generate a probabalistically unique ID.
 * @param {String}
 *          user - Optional; the user name to use for authentication to the MQ
 *          Light service.
 * @param {String}
 *          password - Optional; the password to use for authentication.
 * @throws {TypeError}
 *           If one of the specified parameters in of the wrong type.
 * @throws {RangeError}
 *           If the specified id is too long.
 * @throws {Error}
 *           If service is not specified or one of the parameters is
 *           incorrectly formatted.
 * @constructor
 */
var Client = function(service, id, user, password) {
  EventEmitter.call(this);

  // Ensure the service is an Array or Function
  var serviceList, serviceFunction;
  if (service instanceof Function) {
    serviceFunction = service;
  } else {
    serviceList = generateServiceList(service);
  }

  // If client id has not been specified then generate an id
  if (!id) id = 'AUTO_' + uuid.v4().substring(0, 7);

  // If the client id is incorrectly formatted then throw an error
  if (id.length > 48) {
    var msg = "Client identifier '" + id + "' is longer than the maximum ID " +
              'length of 48.';
    throw new RangeError(msg);
  }

  // If client id is not a string then throw an error
  if (typeof id !== 'string') {
    throw new TypeError('Client identifier must be a string type');
  }

  // currently client ids are restricted, reject any invalid ones
  for (var i in id) {
    if (validClientIdChars.indexOf(id[i]) == -1) {
      var err = "Client Identifier '" + id + "' contains invalid char: " +
          id[i];
      throw new Error(err);
    }
  }

  // Validate user and password parameters, when specified
  if (user && typeof user !== 'string') {
    throw new TypeError('user must be a string type');
  }
  if (password && typeof password !== 'string') {
    throw new TypeError('password must be a string type');
  }

  // Save the required data as client fields
  this.serviceFunction = serviceFunction;
  this.serviceList = serviceList;
  this.id = id;

  // Initialize ProtonMessenger with auth details
  if (user) {
    // URI encode username and password before passing them to proton
    var usr = encodeURIComponent(user);
    var pw = password ? encodeURIComponent(password) : '';
    this.messenger = proton.createMessenger(id, usr, pw);
  } else {
    this.messenger = proton.createMessenger(id);
  }

  // Set the initial state to disconnected
  this.state = 'disconnected';
  this.service = undefined;
};
util.inherits(Client, EventEmitter);

/**
 * @param {function(object)}
 *          connectCallback - callback, passed an Error if something goes wrong
 * @param {String}
 *          err - an error message if a problem occurred.
 */


/**
 * Attempts to connect the client to the MQ Light service - as per the options
 * specified when the client object was created by the mqlight.createClient()
 * method. Connects to the MQ Light service.
 * <p>
 * This method is asynchronous and calls the optional callback function when:
 * a) the client has successfully connected to the MQ Light service, or b) the
 * client.disconnect() method has been invoked before a successful connection
 * could be established, or c) the client could not connect to the MQ Light
 * service. The callback function should accept a single argument which will be
 * set to undefined if the client connects successfully or an Error object if
 * the client cannot connect to the MQ Light service or is disconnected before
 * a connection can be established.
 * <p>
 * Calling this method will result in either the 'connected' event being
 * emitted or an 'error' event being emitted (if a connection cannot be
 * established). These events are guaranteed to be dispatched on a subsequent
 * pass through the event loop - so, to avoid missing an event, the
 * corresponding listeners must be registered either prior to calling
 * client.connect() or on the same tick as calling client.connect().
 * <p>
 * If this method is invoked while the client is in 'connecting', 'connected'
 * or 'retrying' states then the method will complete without performing any
 * work or changing the state of the client. If this method is invoked while
 * the client is in 'disconnecting' state then it's effect will be deferred
 * until the client has transitioned into 'disconnected' state.
 *
 * @param {connectCallback}
 *          callback - (optional) callback to be notified of errors and
 *          completion.
 * @return {Object} The instance of client that it is invoked on - allowing
 *          for chaining of other method calls on the client object.
 * @throws {TypeError}
 *           If callback is specified and is not a function.
 */
Client.prototype.connect = function(callback) {

  // Validate the parameter list length
  if (arguments.length > 1) {
    throw new Error('Too many arguments');
  }

  // Performs the connect
  var performConnect = function(client, callback) {

    var currentState = client.getState();
    // if we are not disconnected or disconnecting return with the client object
    if (currentState !== 'disconnected') {
      if (currentState === 'disconnecting') {
        process.nextTick(function() {
          stillDisconnecting(client, callback);
        });
      } else {
        process.nextTick(function() {
          if (callback) {
            callback(undefined);
          }
        });
        return client;
      }
    }

    client.state = 'connecting';
    client.messenger.start();

    // Obtain the list of services for connect
    var serviceList;
    try {
      if (client.serviceFunction) {
        var serviceFunction = client.serviceFunction();
        serviceList = generateServiceList(serviceFunction);
      } else {
        serviceList = client.serviceList;
      }
    } catch (e) {
      // if there is an error getting the service list then ensure state is
      // disconnected
      client.disconnect();
      var err = new Error(e.message);
      process.nextTick(function() {
        if (callback) {
          callback(err);
        }
        client.emit('error', err);
      });
      return;
    }

    // Connect to one of the listed services
    try {
      // TODO - select a service (for now just select the first one)
      var service = serviceList[0];
      client.messenger.connect(service);
      client.service = service;
    } catch (e) {
      // if there is an error connecting to the service then ensure state is
      // disconnected
      client.disconnect();
      var err = new Error(e.message);
      process.nextTick(function() {
        if (callback) {
          callback(err);
        }
        client.emit('error', err);
      });
      return;
    }

    // Indicate that we're connected
    client.state = 'connected';
    process.nextTick(function() {
      client.emit('connected', true);
    });

    if (callback) {
      if (!(callback instanceof Function)) {
        throw new TypeError('callback must be a function');
      }
      process.nextTick(function() {
        callback(undefined);
      });
    }

    // Function to check for messages, outputting the contents of each to the
    // event emitter
    var messenger = client.messenger;
    var check_for_messages = function() {
      if (client.state !== 'connected') {
        return;
      }
      try {
        var messages = messenger.receive(50);
        if (messages.length > 0) {
          for (var i = 0, tot = messages.length; i < tot; i++) {
            var protonMsg = messages[i];
            // if body is a JSON'ified object, try to parse it back to a js obj
            var data;
            if (protonMsg.contentType === 'application/json') {
              try {
                data = JSON.parse(protonMsg.body);
              } catch (_) {
                console.warn(_);
              }
            } else {
              data = protonMsg.body;
            }

            var topic = url.parse(protonMsg.address).path.substring(1);
            var delivery = {
              message: {
                properties: {
                  contentType: protonMsg.contentType
                },
                topic: topic
              }
            };
            client.emit('message', data, delivery);
            protonMsg.destroy();
          }
        }
      } catch (e) {
        var err = new Error(e.message);
        client.disconnect();
        process.nextTick(function() {
          if (err) client.emit('error', err);
        });
      }
      if (client.state === 'connected') {
        setImmediate(check_for_messages);
      }
    };

    // Setup the check for messages such that each received messages is output
    // to the event emitter
    process.nextTick(function() {
      check_for_messages();
    });

    return;
  };

  var client = this;

  var stillDisconnecting = function(client, callback) {
    if (client.getState() === 'disconnecting') {
      process.nextTick(function() {
        stillDisconnecting(client, callback);
      });
    } else {
      process.nextTick(function() {
        performConnect(client, callback);
      });
    }
  };

  process.nextTick(function() {
    performConnect(client, callback);
  });

  return client;
};

/**
 * @param {function(object)}
 *          disconnectCallback - callback, passed an error object if someting
 *          goes wrong.
 * @param {String}
 *          err - an error message if a problem occurred.
 */


/**
 * Disconnects the client from the MQ Light service, implicitly closing any
 * subscriptions that the client has open. The 'disconnected' event will be
 * emitted once the client has disconnected.
 * <p>
 * This method works asynchronously, and will invoke the optional callback once
 * the client has disconnected. The callback function should accept a single
 * Error argument, although there is currently no situation where this will be
 * set to any other value than undefined.
 * <p>
 * Calling client.disconnect() when the client is in 'disconnecting' or
 * 'disconnected' state has no effect. Calling client.disconnect() from any
 * other state results in the client disconnecting and the 'disconnected' event
 * being generated.
 *
 * @param {disconnectCallback}
 *          callback - (optional) callback to be notified of errors and
 *          completion.
 * @return {Object} The instance of client that it is invoked on - allowing
 *          for chaining of other method calls on the client object.
 * @throws {TypeError}
 *           If callback is specified and is not a function.
 */
Client.prototype.disconnect = function(callback) {

  var client = this;
  // Validate the parameter list length
  if (arguments.length > 1) {
    throw new Error('Too many arguments');
  }

  // Performs the disconnect
  var performDisconnect = function(client, callback) {
    client.state = 'disconnecting';
    if (client.messenger) {
      client.messenger.stop();
    }

    // Indicate that we've disconnected
    client.state = 'disconnected';
    process.nextTick(function() {
      client.emit('disconnected', true);
    });
    if (callback) {
      process.nextTick(function() {
        callback(undefined);
      });
    }
    return;
  };

  if (callback && !(callback instanceof Function)) {
    throw new TypeError('callback must be a function');
  }

  //just return if already disconnected or in the process of disconnecting
  if (client.getState() === 'disconnected' ||
      client.getState() === 'disconnecting') {
    process.nextTick(function() {
      if (callback) {
        callback(undefined);
      }
    });
    return client;
  }

  process.nextTick(function() {
    performDisconnect(client, callback);
  });

  return client;
};


/**
 * @return {String} The identifier associated with the client. This will
 * either be: a) the identifier supplied as the id property of the options
 * object supplied to the mqlight.createClient() method, or b) an automatically
 * generated identifier if the id property was not specified when the client
 * was created.
 */
Client.prototype.getId = function() {
  var id = this.id;
  return id;
};


/**
 * @return {String} The URL of the service to which the client is currently
 * connected (when the client is in 'connected') - otherwise (for all other
 * client states) undefined is returned.
 */
Client.prototype.getService = function() {
  if (this.state === 'connected') {
    var service = this.service;
    return service;
  } else {
    return undefined;
  }
};


/**
 * @return {String} The current state of the client - can will be one of the
 * following string values: 'connected', 'connecting', 'disconnected',
* 'disconnecting', or 'retrying'.
 */
Client.prototype.getState = function() {
  var state = this.state;
  return state;
};


/**
 * @return {Boolean} <code>true</code> if a connection has been made (i.e.
 * state is connected), <code>false</code> otherwise.
 */
Client.prototype.hasConnected = function() {
  return this.state === 'connected';
};

/**
 * @param {function(object)}
 *          sendCallback - a callback which is called with an Error object
 *          if something goes wrong.
 * @param {String}
 *          err - an error message if a problem occurred
 * @param {String | Buffer | Object}
 *          body - the message body that was sent
 * @param {Object}
 *          delivery - the message delivery information
 */


/**
 * Sends a message to the MQ Light service.
 *
 * @param {String}
 *          topic - Identifies which subscriptions receive the message - based
 *          on the pattern argument supplied when the subscription is created.
 * @param {Object}
 *          data - The message body to be sent. Any object or javascript
 *          primitive type although certain types receive special treatment:
 *          String and Buffer objects are treated as immutable as they pass
 *          through the MQ Light service. E.g. if the sender sends a String,
 *          the receiver receives a String. undefined and Function objects will
 *          be rejected with an error.
 * @param {Object}
 *          options (Optional) Used to specify options that affect how the MQ
 *          Light service processes the message.
 * @param {sendCallback}
 *          callback - (Optional) callback to be notified of errors and
 *          completion. The callback function accepts a single Error argument
 *          which is used to indicate whether the message was successfully
 *          delivered to the MQ Light service. The callback may be omitted if a
 *          qos of 0 (at most once) is used - however it must be present if a
 *          qos of 1 (at least once) is specified, otherwise
 * @throws {TypeError}
 *           If one of the specified parameters is of the wrong type.
 * @throws {Error}
 *           If the topic or data parameter is undefined.
 */
Client.prototype.send = function(topic, data, options, callback) {

  // Validate the parameter list length
  if (arguments.length > 4) {
    throw new Error('Too many arguments');
  }

  // Validate the passed parameters
  if (!topic) {
    throw new TypeError('Cannot send to undefined topic');
  } else if (typeof topic !== 'string') {
    throw new TypeError('topic must be a string type');
  }
  if (data === undefined) {
    throw new TypeError('Cannot send undefined data');
  } else if (data instanceof Function) {
    throw new TypeError('Cannot send a function');
  }

  // Validate the remaining optional parameters, assigning local variables to
  // the appropriate parameter
  var /*optionsOption,*/ callbackOption;
  if (options) {
    if (options instanceof Function) {
      callbackOption = options;
    } else {
      if (options instanceof Object) {
        //optionsOption = options;
      } else {
        throw new TypeError('options must be an object type');
      }
    }
    if (callback) {
      if (callbackOption) {
        throw new TypeError('Invalid forth argument, callback already matched' +
                            'for third argument');
      }
      if (callback instanceof Function) {
        callbackOption = callback;
      } else {
        throw new TypeError('callback must be a function type');
      }
    }
  }

  // Ensure we have attempted a connect
  if (!this.hasConnected()) throw new Error('not connected');

  // Send the data as a message to the specified topic
  var client = this;
  var messenger = client.messenger;
  var protonMsg;
  try {
    protonMsg = proton.createMessage();
    protonMsg.address = this.getService();
    if (topic) {
      // need to encode the topic component but / has meaning that shouldn't be
      // encoded
      var topicLevels = topic.split('/');
      var encodedTopicLevels = topicLevels.map(function(tLevel) {
        return encodeURIComponent(tLevel);
      });
      var encodedTopic = encodedTopicLevels.join('/');
      protonMsg.address += '/' + encodedTopic;
    }
    if (typeof data === 'string') {
      protonMsg.body = data;
      protonMsg.contentType = 'text/plain';
    } else if (data instanceof Buffer) {
      protonMsg.body = data;
      protonMsg.contentType = 'application/octet-stream';
    } else {
      protonMsg.body = JSON.stringify(data);
      protonMsg.contentType = 'application/json';
    }
    messenger.put(protonMsg);
    messenger.send();

    // setup a timer to trigger the callback once the msg has been sent, or
    // immediately if no message to be sent
    var untilSendComplete = function(protonMsg, sendCallback) {
      try {
        if (messenger.hasSent(protonMsg)) {
          if (sendCallback) {
            var decoded = decodeURIComponent(protonMsg.address);
            var topic = url.parse(decoded).path.substring(1);
            var delivery = {
              message: {
                properties: {
                  contentType: protonMsg.contentType
                },
                topic: topic
              }
            };
            setImmediate(sendCallback, undefined, protonMsg.body, delivery);
          }
          protonMsg.destroy();
          return;
        }
        // if msg not yet sent and still running, check again in a second or so
        if (!messenger.stopped) {
          messenger.send();
          setImmediate(untilSendComplete, protonMsg, callbackOption);
        }
      } catch (e) {
        var err = new Error(e.message);
        client.disconnect();
        process.nextTick(function() {
          if (callbackOption) {
            callbackOption(err, protonMsg);
          }
          if (err) client.emit('error', err);
        });
      }
    };
    // start the timer to trigger it to keep sending until msg has sent
    setImmediate(untilSendComplete, protonMsg, callbackOption);
  } catch (e) {
    var err = new Error(e.message);
    client.disconnect();
    process.nextTick(function() {
      if (callbackOption) {
        callbackOption(err, protonMsg);
      }
      if (err) client.emit('error', err);
    });
  }
};

/**
 * @param {function(object)}
 *          destCallback - callback, invoked with an Error object if something
 *          goes wrong.
 * @param {String}
 *          err - an error message if a problem occurred.
 * @param {String}
 *          pattern - the pattern that was subscribed to.
 */


/**
 * Constructs a subscription object and starts the emission of message events
 * each time a message arrives, at the MQ Light service, that matches pattern.
 *
 * @param {String}
 *          pattern used to match against the <code>address</code> attribute of
 *          messages to determine if a copy of the message should be delivered
 *          to the <code>Destination</code>.
 * @param {String}
 *          share (Optional) Specifies whether to create or join a shared
 *          subscription for which messages are anycast amongst the present
 *          subscribers. If this argument is omitted then the subscription will
 *          be unshared (e.g. private to the client).
 * @param {Object}
 *          options (optional) The options argument accepts an object with
 *          properties to set.
 * @param {destCallback}
 *          callback - (optional) Invoked when the subscription request has
 *          been processed. A single Error parameter is passed to this function
 *          to indicate whether the subscription request was successful, and if
 *          not: why not.
 * @return {@link Client} the instance of the client this was called on which
 * will emit 'message' events on arrival.
 * @throws {TypeError}
 *           If one of the specified parameters is of the wrong type.
 * @throws {Error}
 *           If the pattern parameter is undefined.
 */
Client.prototype.subscribe = function(pattern, share, options, callback) {

  // Validate the parameter list length
  if (arguments.length > 4) {
    throw new Error('Too many arguments');
  }

  // Validate the pattern parameter
  if (!pattern) {
    throw new Error('Cannot subscribe to undefined pattern.');
  } else if (typeof pattern !== 'string') {
    throw new TypeError('pattern must be a string type');
  }

  // Validate the remaining optional parameters, assigning local variables to
  // the appropriate parameter
  var shareOption, optionsOption, callbackOption;
  if (share) {
    if (typeof share === 'string') {
      if (share.indexOf(':') >= 0) {
        throw new Error("share argument value '" + share + "' is invalid " +
                        "because it contains a colon (\':\') character");
      }
      shareOption = 'share:' + share + ':';
    } else if (share instanceof Function) {
      shareOption = 'private:';
      callbackOption = share;
    } else if (share instanceof Object) {
      shareOption = 'private:';
      optionsOption = share;
    } else {
      throw new TypeError('share must be a string type');
    }
    if (options) {
      if (callbackOption) {
        throw new TypeError('Invalid third argument, callback already ' +
                            'matched for second argument');
      }
      if (options instanceof Function) {
        callbackOption = options;
      } else {
        if (optionsOption) {
          throw new TypeError('Invalid third argument, options already ' +
                              'matched for second argument');
        }
        if (options instanceof Object) {
          optionsOption = options;
        } else {
          throw new TypeError('options must be an object type');
        }
      }
      if (callback) {
        if (callbackOption) {
          throw new TypeError('Invalid forth argument, callback already ' +
                              'matched for third argument');
        }
        if (callback instanceof Function) {
          callbackOption = callback;
        } else {
          throw new TypeError('callback must be a function type');
        }
      }
    }
  } else {
    shareOption = 'private:';
  }

  // Ensure we have attempted a connect
  if (!this.hasConnected()) throw new Error('not connected');

  // Subscribe using the specified pattern and share options
  var messenger = this.messenger;
  var address = this.getService() + '/' + shareOption + pattern;
  var client = this;

  var err;
  try {
    messenger.subscribe(address);
  } catch (e) {
    err = new Error(e.message);
  }

  setImmediate(function() {
    if (callbackOption) {
      callbackOption(err, pattern);
    }
    if (err) {
      client.emit('error', err);
      client.disconnect();
    }
  });

  return client;
};

/* ------------------------------------------------------------------------- */
