/* %Z% %W% %I% %E% %U% */
/*
 * <copyright
 * notice="lm-source-program"
 * pids="5725-P60"
 * years="2013,2014"
 * crc="3568777996" >
 * Licensed Materials - Property of IBM
 *
 * 5725-P60
 *
 * (C) Copyright IBM Corp. 2013, 2014
 *
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with
 * IBM Corp.
 * </copyright>
 */
/* jslint node: true */
/* jshint -W083,-W097 */
'use strict';


/**
 * Set up logging (to stderr by default). The level of output is
 * configured by the value of the MQLIGHT_NODE_LOG environment
 * variable. The default is 'ffdc'.
 */
GLOBAL.logger = require('./mqlight-log');


/**
 * The logging level can be set programmatically by calling
 *   logger.setLevel(level)
 * An ffdc can be generated programmatically by calling
 *   logger.ffdc()
 */
exports.logger = GLOBAL.logger;
var logger = GLOBAL.logger;

var os = require('os');
var _system = os.platform() + '-' + process.arch;
if (process.env.NODE_ENV === 'unittest') {
  var proton = require('./test/stubs/stubproton.js').createProtonStub();
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
var fs = require('fs');
var http = require('http');
var https = require('https');

var invalidClientIdRegex = /[^A-Za-z0-9%/\._]+/;

var HashMap = require('hashmap').HashMap;


/**
 * List of active clients to prevent duplicates, in the started state, with
 * the same id existing.
 */
var activeClientList = {
  clients: new HashMap(),
  add: function(client) {
    logger.entry('activeClientList.add', client.id);
    this.clients.set(client.id, client);
    logger.exit('activeClientList.add', client.id);
  },
  remove: function(id) {
    logger.entry('activeClientList.remove', id);
    this.clients.remove(id);
    logger.exit('activeClientList.remove', id);
  },
  get: function(id) {
    logger.entry('activeClientList.get', id);
    var client = this.clients.get(id);
    logger.exit('activeClientList.get', id, client);
    return client;
  },
  has: function(id) {
    logger.entry('activeClientList.has', id);
    var found = this.clients.has(id);
    logger.exit('activeClientList.has', id, found);
    return found;
  }
};


/** @const {number} */
exports.QOS_AT_MOST_ONCE = 0;


/** @const {number} */
exports.QOS_AT_LEAST_ONCE = 1;


/** Proton Messenger status values (returned from ProtonMessenger.Status()) */


/** The status unknown. */
var PN_STATUS_UNKNOWN = 0;


/** The message is in flight. */
var PN_STATUS_PENDING = 1;


/** The message was accepted. */
var PN_STATUS_ACCEPTED = 2;


/** The message was rejected. */
var PN_STATUS_REJECTED = 3;


/** The message was released. */
var PN_STATUS_RELEASED = 4;


/** The message was modified. */
var PN_STATUS_MODIFIED = 5;


/** The message was aborted. */
var PN_STATUS_ABORTED = 6;


/** The remote party has settled the message. */
var PN_STATUS_SETTLED = 7;


/** The connection retry interval in milliseconds. */
var CONNECT_RETRY_INTERVAL = 1;
if (process.env.NODE_ENV === 'unittest') CONNECT_RETRY_INTERVAL = 0;


/** Client state: connectivity with the server re-established */
var STATE_RESTARTED = 'restarted';


/** Client state: trying to re-establish connectivity with the server */
var STATE_RETRYING = 'retrying';


/** Client state: becoming ready to do messaging */
var STATE_STARTED = 'started';


/** Client state: ready to do messaging */
var STATE_STARTING = 'starting';


/** Client state: client disconnected from server, not ready for messaging */
var STATE_STOPPED = 'stopped';


/** Client state: in the process of transitioning to STATE_STOPPED */
var STATE_STOPPING = 'stopping';


/**
 * Generic helper method to use for Error sub-typing
 *
 * @param {Object}
 *          obj - the object upon which to define Error properties
 * @param {String}
 *          name - the sub-type Error object name
 * @param {String}
 *          message - Human-readable description of the error
 */
function setupError(obj, name, message) {
  if (obj) {
    Error.call(obj);
    Object.defineProperty(obj, 'name', {
      value: name,
      enumerable: false
    });
    Object.defineProperty(obj, 'message', {
      value: message,
      enumerable: false
    });
  }
}


/**
 * Generic helper method to map a named Error object into the correct
 * sub-type so that instanceof checking works as expected.
 *
 * @param {Object}
 *          obj - the Error object to remap.
 * @return {Object} a sub-typed Error object.
 */
function getNamedError(obj) {
  if (obj && obj instanceof Error && 'name' in obj) {
    var Constructor = exports[obj.name];
    if (typeof Constructor === 'function') {
      var res = new Constructor(obj.message);
      if (res) {
        res.stack = obj.stack;
        return res;
      }
    }
  }
  return obj;
}


/**
 * Generic helper method to determine if we should automatically reconnect
 * for the given type of error.
 *
 * @param {Object}
 *          err - the Error object to check.
 * @return {Object} true if we should reconnect, false otherwise.
 */
function shouldReconnect(err) {
  // exclude all programming errors
  return (!(err instanceof TypeError) &&
          !(err instanceof InvalidArgumentError) &&
          !(err instanceof ReplacedError) &&
          !(err instanceof StoppedError) &&
          !(err instanceof SubscribedError) &&
          !(err instanceof UnsubscribedError)
         );
}



/**
 * A subtype of Error defined by the MQ Light client. It is considered a
 * programming error. The underlying cause for this error are the parameter
 * values passed into a method.
 *
 * @param {String}
 *          message - Human-readable description of the error
 *
 * @constructor
 */
exports.InvalidArgumentError = function(message) {
  Error.captureStackTrace(this, this.constructor);
  setupError(this, 'InvalidArgumentError', message);
};
var InvalidArgumentError = exports.InvalidArgumentError;
util.inherits(InvalidArgumentError, Error);



/**
 * This is a subtype of Error defined by the MQ Light client. It is considered
 * an operational error. NetworkError is passed to an application if the client
 * cannot establish a network connection to the MQ Light server, or if an
 * established connection is broken.
 *
 * @param {String}
 *          message - Human-readable description of the error
 *
 * @constructor
 */
exports.NetworkError = function(message) {
  Error.captureStackTrace(this, this.constructor);
  setupError(this, 'NetworkError', message);
};
var NetworkError = exports.NetworkError;
util.inherits(NetworkError, Error);



/**
 * This is a subtype of Error defined by the MQ Light client. It is considered
 * an operational error. ReplacedError is thrown to signify that an instance of
 * the client has been replaced by another instance that connected specifying
 * the exact same client id.
 *
 * @param {String}
 *          message - Human-readable description of the error
 *
 * @constructor
 */
exports.ReplacedError = function(message) {
  Error.captureStackTrace(this, this.constructor);
  setupError(this, 'ReplacedError', message);
};
var ReplacedError = exports.ReplacedError;
util.inherits(ReplacedError, Error);



/**
 * Special type of ReplacedError thrown when an active Client instance is
 * replaced by the application starting another Client instance with the same
 * id.
 *
 * @param {String}
 *          id - Client id
 *
 *  @constructor
 */
var LocalReplacedError = function(id) {
  ReplacedError.apply(this, ['Client Replaced. Application has started a ' +
                             'second Client instance with id ' + id]);
};
util.inherits(LocalReplacedError, ReplacedError);



/**
 * This is a subtype of Error defined by the MQ Light client. It is considered
 * an operational error. SecurityError is thrown when an operation fails due to
 * a security related problem.
 *
 * @param {String}
 *          message - Human-readable description of the error
 *
 * @constructor
 */
exports.SecurityError = function(message) {
  Error.captureStackTrace(this, this.constructor);
  setupError(this, 'SecurityError', message);
};
var SecurityError = exports.SecurityError;
util.inherits(SecurityError, Error);



/**
 * This is a subtype of Error defined by the MQ Light client.  It is
 * considered a programming error - but is unusual in that, in some
 * circumstances, a client may reasonably expect to receive StoppedError as a
 * result of its actions and would typically not be altered to avoid this
 * condition occurring.  StoppedError is thrown by methods which require
 * connectivity to the server (e.g. send, subscribe) when they are invoked
 * while the client is in the stopping or stopped states
 *
 * @param {String}
 *          message - Human-readable description of the error
 *
 * @constructor
 */
exports.StoppedError = function(message) {
  Error.captureStackTrace(this, this.constructor);
  setupError(this, 'StoppedError', message);
};
var StoppedError = exports.StoppedError;
util.inherits(StoppedError, Error);



/**
 * This is a subtype of Error defined by the MQ Light client.  It is considered
 * a programming error.  SubscribedError is thrown from the
 * client.subscribe(...) method call when a request is made to subscribe to a
 * destination that the client is already subscribed to.
 *
 * @param {String}
 *          message - Human-readable description of the error
 *
 * @constructor
 */
exports.SubscribedError = function(message) {
  Error.captureStackTrace(this, this.constructor);
  setupError(this, 'SubscribedError', message);
};
var SubscribedError = exports.SubscribedError;
util.inherits(SubscribedError, Error);



/**
 * This is a subtype of Error defined by the MQ Light client.  It is considered
 * a programming error.  UnsubscribedError is thrown from the
 * client.unsubscribe(...) method call when a request is made to unsubscribe
 * from a destination that the client is not subscribed to.
 *
 * @param {String}
 *          message - Human-readable description of the error
 *
 * @constructor
 */
exports.UnsubscribedError = function(message) {
  Error.captureStackTrace(this, this.constructor);
  setupError(this, 'UnsubscribedError', message);
};
var UnsubscribedError = exports.UnsubscribedError;
util.inherits(UnsubscribedError, Error);


/**
 * Creates and returns a new instance of the Client object.
 * <p>
 * See README.md for more details.
 *
 * @param {Object}   options - properties that define the
 *                             characteristics of the client.
 * @param {Function} callback - (optional) callback, invoked when the client has
 *                              attained 'started' or 'stopped' state.
 * @return {Object} A new Client object.
 * @this Client
 */
exports.createClient = function(options, callback) {
  logger.entry('createClient', logger.NO_CLIENT_ID);

  var err;

  if (!options || (typeof options !== 'object')) {
    err = new TypeError('options object missing');
    logger.throw('createClient', logger.NO_CLIENT_ID, err);
    throw err;
  }

  if (callback && (typeof callback !== 'function')) {
    err = new TypeError('Callback argument must be a function');
    logger.throw('createClient', logger.NO_CLIENT_ID, err);
    throw err;
  }

  var securityOptions = {
    propertyUser: options.user,
    propertyPassword: options.password,
    urlUser: undefined,
    urlPassword: undefined,
    sslTrustCertificate: options.sslTrustCertificate,
    sslVerifyName: (typeof options.sslVerifyName === 'undefined') ? true :
                           Boolean(options.sslVerifyName),
    toString: function() {
      return '[\n' +
          ' propertyUser: ' + this.propertyUser + '\n' +
          ' propertyPassword: ' +
          (this.propertyPassword ? '********' : undefined) + '\n' +
          ' propertyUser: ' + this.urlUser + '\n' +
          ' urlPassword: ' + (this.urlPassword ? '********' : undefined) +
          '\n' +
          ' sslTrustCertificate: ' + this.sslTrustCertificate + '\n' +
          ' sslVerifyName: ' + this.sslVerifyName + '\n' + ']';
    }
  };
  var client = new Client(options.service, options.id, securityOptions);

  process.setMaxListeners(0);
  process.once('exit', function() {
    logger.entry('createClient.on.exit', logger.NO_CLIENT_ID);

    if (client && client.state === STATE_STARTED) {
      try {
        client._messenger.send();
        client.stop();
      } catch (err) {
        logger.caught('createClient.on.exit', client.id, err);
      }
    }

    logger.exit('createClient.on.exit', logger.NO_CLIENT_ID, null);
  });

  // Check that the id for this instance is not already in use. If it is then
  // we need to stop the active instance before starting
  if (activeClientList.has(client.id)) {
    logger.log('debug', client.id,
        'stopping previously active client with same client id');
    var previousActiveClient = activeClientList.get(client.id);
    activeClientList.add(client);
    previousActiveClient.stop(function() {
      logger.log('debug', client.id,
          'stopped previously active client with same client id');
      var err = new LocalReplacedError(client.id);
      var error = getNamedError(err);
      logger.log('emit', previousActiveClient.id, 'error', error);
      previousActiveClient.emit('error', error);
      process.nextTick(function() {
        client._performConnect(function(err) {
          if (callback) callback.apply(client, [err, client]);
        }, true);
      });
    });
  } else {
    activeClientList.add(client);
    process.nextTick(function() {
      client._performConnect(function(err) {
        if (callback) callback.apply(client, [err, client]);
      }, true);
    });
  }

  logger.exit('createClient', client.id, client);
  return client;
};


/**
 * Function to take a single FILE URL and using the JSON retrieved from it to
 * return an array of service URLs.
 *
 * @param {String}
 *          fileUrl - Required; a FILE address to retrieve service info
 *          from (e.g., file:///tmp/config.json).
 * @return {function(callback)} a function which will call the given callback
 *          with a list of AMQP service URLs retrieved from the FILE.
 * @throws TypeError
 *           If fileUrl is not a string.
 * @throws Error
 *           if an unsupported or invalid FILE address is specified.
 */
var getFileServiceFunction = function(fileUrl) {
  logger.entry('getFileServiceFunction', logger.NO_CLIENT_ID);
  logger.log('parms', logger.NO_CLIENT_ID, 'fileUrl:', fileUrl);

  if (typeof fileUrl !== 'string') {
    var err = new TypeError('fileUrl must be a string type');
    logger.throw('getFileServiceFunction', logger.NO_CLIENT_ID, err);
    throw err;
  }

  var filePath = fileUrl;
  // special case for Windows drive letters in file URIs, trim the leading /
  if (os.platform() === 'win32' && filePath.match('^\/[a-zA-Z]:\/')) {
    filePath = filePath.substring(1);
  }

  var fileServiceFunction = function(callback) {
    logger.entry('fileServiceFunction', logger.NO_CLIENT_ID);
    logger.log('parms', logger.NO_CLIENT_ID, 'filePath:', filePath);

    fs.readFile(filePath, { encoding: 'utf8' }, function(err, data) {
      logger.entry('fileServiceFunction.readFile.callback',
                   logger.NO_CLIENT_ID);
      logger.log('parms', logger.NO_CLIENT_ID, 'err:', err);
      logger.log('parms', logger.NO_CLIENT_ID, 'data:', data);

      if (err) {
        err.message = 'attempt to read ' + filePath + ' failed with the ' +
                      'following error: ' + err.message;
        logger.log('error', logger.NO_CLIENT_ID, err);
        logger.entry('fileServiceFunction.callback', logger.NO_CLIENT_ID);
        logger.log('parms', logger.NO_CLIENT_ID, 'err:', err);
        callback(err);
        logger.exit('fileServiceFunction.callback', logger.NO_CLIENT_ID, null);
      } else {
        var obj;
        try {
          obj = JSON.parse(data);
        } catch (err) {
          err.message = 'the content read from ' + filePath + ' contained ' +
                        'unparseable JSON: ' + err.message;
          logger.caught('fileServiceFunction.readFile.callback',
                        logger.NO_CLIENT_ID, err);
          logger.entry('fileServiceFunction.callback', logger.NO_CLIENT_ID);
          logger.log('parms', logger.NO_CLIENT_ID, 'err:', err);
          callback(err);
          logger.exit('fileServiceFunction.callback', logger.NO_CLIENT_ID,
                      null);
        }
        if (obj) {
          logger.entry('fileServiceFunction.callback', logger.NO_CLIENT_ID);
          logger.log('parms', logger.NO_CLIENT_ID, 'service:', obj.service);
          callback(null, obj.service);
          logger.exit('fileServiceFunction.callback', logger.NO_CLIENT_ID,
                      null);
        }
      }
      logger.exit('fileServiceFunction.readFile.callback', logger.NO_CLIENT_ID,
                  null);
    });

    logger.exit('fileServiceFunction', logger.NO_CLIENT_ID, null);
  };

  logger.exit('getFileServiceFunction', logger.NO_CLIENT_ID,
              fileServiceFunction);
  return fileServiceFunction;
};


/**
 * Function to take a single HTTP URL and using the JSON retrieved from it to
 * return an array of service URLs.
 *
 * @param {String}
 *          serviceUrl - Required; an HTTP address to retrieve service info
 *          from.
 * @return {function(callback)} a function which will call the given callback
 *          with a list of AMQP service URLs retrieved from the URL.
 * @throws TypeError
 *           If serviceUrl is not a string.
 * @throws Error
 *           if an unsupported or invalid URL specified.
 */
var getHttpServiceFunction = function(serviceUrl) {
  logger.entry('getHttpServiceFunction', logger.NO_CLIENT_ID);
  logger.log('parms', logger.NO_CLIENT_ID, 'serviceUrl:', serviceUrl);

  var serviceHref = serviceUrl.href;
  if (typeof serviceHref !== 'string') {
    var err = new TypeError('serviceUrl must be a string type');
    logger.throw('getHttpServiceFunction', logger.NO_CLIENT_ID, err);
    throw err;
  }

  var httpServiceFunction = function(callback) {
    logger.entry('httpServiceFunction', logger.NO_CLIENT_ID);
    var request = (serviceUrl.protocol === 'https:') ? https.request :
                                                       http.request;
    var req = request(serviceHref, function(res) {
      logger.entry('httpServiceFunction.req.callback', logger.NO_CLIENT_ID);

      var data = '';
      res.setEncoding('utf8');
      res.on('data', function(chunk) {
        data += chunk;
      });

      res.on('end', function() {
        logger.entry('httpServiceFunction.req.on.end.callback',
                     logger.NO_CLIENT_ID);

        if (res.statusCode === 200) {
          var obj;
          try {
            obj = JSON.parse(data);
          } catch (err) {
            err.message = 'http request to ' + serviceHref + ' returned ' +
                          'unparseable JSON: ' + err.message;
            logger.caught('httpServiceFunction.req.on.end.callback',
                          logger.NO_CLIENT_ID, err);
            logger.entry('httpServiceFunction.callback', logger.NO_CLIENT_ID);
            logger.log('parms', logger.NO_CLIENT_ID, 'err:', err);
            callback(err);
            logger.exit('httpServiceFunction.callback', logger.NO_CLIENT_ID,
                        null);
          }
          if (obj) {
            logger.entry('httpServiceFunction.callback', logger.NO_CLIENT_ID);
            logger.log('parms', logger.NO_CLIENT_ID, 'service:', obj.service);
            callback(null, obj.service);
            logger.exit('httpServiceFunction.callback', logger.NO_CLIENT_ID,
                        null);
          }
        } else {
          var message = 'http request to ' + serviceHref + ' failed with a ' +
                        'status code of ' + res.statusCode;
          if (data) message += ': ' + data;
          err = new NetworkError(message);
          logger.log('error', logger.NO_CLIENT_ID, err);
          logger.entry('httpServiceFunction.callback', logger.NO_CLIENT_ID);
          logger.log('parms', logger.NO_CLIENT_ID, 'err:', err);
          callback(err);
          logger.exit('httpServiceFunction.callback', logger.NO_CLIENT_ID,
                      null);
        }
        logger.exit('httpServiceFunction.req.on.end.callback',
                    logger.NO_CLIENT_ID, null);
      });
      logger.exit('httpServiceFunction.req.callback', logger.NO_CLIENT_ID,
                  null);
    }).on('error', function(err) {
      err.message = 'http request to ' + serviceHref + ' failed ' +
                    'with an error: ' + err.message;
      err.name = 'NetworkError';
      err = getNamedError(err);
      logger.log('error', logger.NO_CLIENT_ID, err);
      logger.entry('httpServiceFunction.callback', logger.NO_CLIENT_ID);
      logger.log('parms', logger.NO_CLIENT_ID, 'err:', err);
      callback(err);
      logger.exit('httpServiceFunction.callback', logger.NO_CLIENT_ID, null);
    });
    req.setTimeout(5000, function() {
      var message = 'http request to ' + serviceHref + ' timed out ' +
                    'after 5000 milliseconds';
      var err = new NetworkError(message);
      logger.log('error', logger.NO_CLIENT_ID, err);
      logger.entry('httpServiceFunction.callback', logger.NO_CLIENT_ID);
      logger.log('parms', logger.NO_CLIENT_ID, 'err:', err);
      callback(err);
      logger.exit('httpServiceFunction.callback', logger.NO_CLIENT_ID, null);
    });
    req.end();

    logger.exit('httpServiceFunction', logger.NO_CLIENT_ID, null);
  };

  logger.exit('getHttpServiceFunction', logger.NO_CLIENT_ID,
              httpServiceFunction);
  return httpServiceFunction;
};



/**
 * Represents an MQ Light client instance.
 *
 * @param {String|Array|Function}
 *          service  - Required; One or more URLs representing the TCP/IP
 *          endpoints to which the client will attempt to connect, in turn.
 *          When a function is specified, it is invoked each time an endpoint
 *          is required and is supplied a callback, in the form
 *          function(err, service), as its only argument. The function should
 *          invoke the callback supplying a URL String (or an Array of URL
 *          strings) as the second argument.
 * @param {String}
 *          id - Optional; an identifier that is used to identify this client.
 *          If omitted - a probabilistically unique ID will be generated.
 * @param {Object}
 *          securityOptions - Any required security options for
 *          user name/password authentication and SSL.
 * @throws {TypeError}
 *           If one of the specified parameters in of the wrong type.
 * @throws {RangeError}
 *           If the specified id is too long.
 * @throws {Error}
 *           If service is not specified or one of the parameters is
 *           incorrectly formatted.
 * @constructor
 */
var Client = function(service, id, securityOptions) {
  /** The current service being used */
  var _service;

  /** The current state */
  var _state;

  /** The client identifier */
  var _id;

  /*
   * Internal helper function for public methods, to return the current value of
   * _service, regardless of state.
   */
  this._getService = function() {
    return _service;
  };

  /*
   * Internal helper function for public methods, to be able to change the state
   * TODO - Ideally we should not have this (i.e. methods that change state
   *        should be defined in the constructor.
   */
  this._setState = function(value) {
    _state = value;
  };

  /**
   * @return {String} The URL of the service to which the client is currently
   *         connected (when the client is in 'started' state) - otherwise (for
   *         all other client states) undefined is returned.
   */
  Object.defineProperty(this, 'service', {
    get: function() {
      return _state === STATE_STARTED ?
          _service : undefined;
    },
    set: function(value) {
      if (process.env.NODE_ENV === 'unittest') {
        _service = value;
      }
    }
  });


  /**
   * @return {String} The identifier associated with the client. This will
   *         either be: a) the identifier supplied as the id property of the
   *         options object supplied to the mqlight.createClient() method, or b)
   *         an automatically generated identifier if the id property was not
   *         specified when the client was created.
   */
  Object.defineProperty(this, 'id', {
    get: function() {
      return _id;
    }
  });


  /**
   * @return {String} The current state of the client - can will be one of the
   *         following string values: 'started', 'starting', 'stopped',
   *         'stopping', or 'retrying'.
   */
  Object.defineProperty(this, 'state', {
    get: function() {
      logger.log('data_often', _id, 'Client.state', _state);
      return _state;
    }
  });


  logger.entry('Client.constructor', logger.NO_CLIENT_ID);
  logger.log('parms', logger.NO_CLIENT_ID, 'service:',
             String(service).replace(/:[^\/:]+@/g, ':********@'));
  logger.log('parms', logger.NO_CLIENT_ID, 'id:', id);
  logger.log('parms', logger.NO_CLIENT_ID, 'securityOptions:',
             securityOptions.toString());

  EventEmitter.call(this);

  var err, msg;

  // Ensure the service is an Array or Function
  var serviceList, serviceFunction;
  if (service instanceof Function) {
    serviceFunction = service;
  } else if (typeof service === 'string') {
    var serviceUrl = url.parse(service);
    if (serviceUrl.protocol === 'http:' || serviceUrl.protocol === 'https:') {
      serviceFunction = getHttpServiceFunction(serviceUrl);
    } else if (serviceUrl.protocol === 'file:') {
      if (serviceUrl.host.length > 0 && serviceUrl.host !== 'localhost') {
        msg = 'service contains unsupported file URI of ' + service +
            ', only file:///path or file://localhost/path are supported.';
        err = new InvalidArgumentError(msg);
        logger.throw('Client.constructor', logger.NO_CLIENT_ID, err);
        throw err;
      }
      serviceFunction = getFileServiceFunction(serviceUrl.path);
    }
  }

  // Add generateServiceList function to client with embedded securityOptions
  this._generateServiceList = function(service) {
    logger.entry('_generateServiceList', _id);
    logger.log('parms', _id, 'service:',
        String(service).replace(/:[^\/:]+@/g, ':********@'));
    logger.log('parms', _id, 'securityOptions:',
               securityOptions.toString());

    var err;

    // Ensure the service is an Array
    var inputServiceList = [];
    if (!service) {
      err = new TypeError('service is undefined');
      logger.throw('_generateServiceList', _id, err);
      throw err;
    } else if (service instanceof Function) {
      err = new TypeError('service cannot be a function');
      logger.throw('_generateServiceList', _id, err);
      throw err;
    } else if (service instanceof Array) {
      if (service.length === 0) {
        err = new TypeError('service array is empty');
        logger.throw('_generateServiceList', _id, err);
        throw err;
      }
      inputServiceList = service;
    } else if (typeof service === 'string') {
      inputServiceList[0] = service;
    } else {
      err = new TypeError('service must be a string or array type');
      logger.throw('_generateServiceList', _id, err);
      throw err;
    }

    /*
     * Validate the list of URLs for the service, inserting default values as
     * necessary Expected format for each URL is: amqp://host:port or
     * amqps://host:port (port is optional, defaulting to 5672 or 5671 as
     * appropriate)
    */
    var serviceList = [];
    var authUser, authPassword;

    for (var i = 0; i < inputServiceList.length; i++) {
      var serviceUrl = url.parse(inputServiceList[i]);
      var protocol = serviceUrl.protocol;
      var msg;

      // check for auth details
      var auth = serviceUrl.auth;
      authUser = undefined;
      authPassword = undefined;
      if (auth) {
        if (auth.indexOf(':') >= 0) {
          authUser = String(auth).slice(0, auth.indexOf(':'));
          authPassword = String(auth).slice(auth.indexOf(':') + 1);
        } else {
          msg = "URLs supplied via the 'service' property must specify both a" +
                ' user name and a password value, or omit both values';
          err = new InvalidArgumentError(msg);
          logger.throw('_generateServiceList', _id, err);
          throw err;
        }
        if (securityOptions.propertyUser && authUser &&
            (securityOptions.propertyUser !== authUser)) {
          msg = "User name supplied as 'user' property (" +
                securityOptions.propertyUser + ') does not match user name ' +
                "supplied via a URL passed via the 'service' property (" +
                authUser + ')';
          err = new InvalidArgumentError(msg);
          logger.throw('_generateServiceList', _id, err);
          throw err;
        }
        if (securityOptions.propertyPassword && authPassword &&
            (securityOptions.propertyPassword !== authPassword)) {
          msg = "Password supplied as 'password' property does not match a " +
                "password supplied via a URL passed via the 'service' property";
          err = new InvalidArgumentError(msg);
          logger.throw('_generateServiceList', _id, err);
          throw err;
        }
        if (i === 0) {
          securityOptions.urlUser = authUser;
          securityOptions.urlPassword = authPassword;
        }
      }

      // Check whatever URL user names / passwords are present this time
      // through the loop - match the ones set on securityOptions by the first
      // pass through the loop.
      if (i > 0) {
        if (securityOptions.urlUser !== authUser) {
          msg = "URLs supplied via the 'service' property contain " +
                'inconsistent user names';
          err = new InvalidArgumentError(msg);
          logger.throw('_generateServiceList', _id, err);
          throw err;
        } else if (securityOptions.urlPassword !== authPassword) {
          msg = "URLs supplied via the 'service' property contain " +
                'inconsistent password values';
          err = new InvalidArgumentError(msg);
          logger.throw('_generateServiceList', _id, err);
          throw err;
        }
      }

      // Check we are trying to use the amqp protocol
      if (!protocol || protocol !== 'amqp:' && protocol !== 'amqps:') {
        msg = "Unsupported URL '" + inputServiceList[i] +
              "' specified for service. Only the amqp or amqps protocol are " +
              'supported.';
        err = new InvalidArgumentError(msg);
        logger.throw('_generateServiceList', _id, err);
        throw err;
      }
      // Check we have a hostname
      var host = serviceUrl.host;
      if (!host || !serviceUrl.hostname) {
        msg = "Unsupported URL ' " + inputServiceList[i] + "' specified for " +
              'service. Must supply a hostname.';
        err = new InvalidArgumentError(msg);
        logger.throw('_generateServiceList', _id, err);
        throw err;
      }
      // Set default port if not supplied
      var port = serviceUrl.port;
      if (!port) {
        port = (protocol === 'amqp:') ? '5672' : '5671';
      }
      // Check for no path
      var path = serviceUrl.path;
      if (path && path !== '/') {
        msg = "Unsupported URL '" + inputServiceList[i] + "' paths (" + path +
              " ) can't be part of a service URL.";
        err = new InvalidArgumentError(msg);
        logger.throw('_generateServiceList', _id, err);
        throw err;
      }

      serviceList[i] = protocol + '//' + host;
      if (!serviceUrl.port) {
        serviceList[i] += ':' + port;
      }
    }

    logger.exit('_generateServiceList', _id,
                [
                  'serviceList:',
                  String(serviceList).replace(/:[^\/:]+@/g, ':********@'),
                  'securityOptions:', securityOptions.toString()
                ]);
    return serviceList;
  };

  // performs the connect
  this._performConnect = function(callback, newClient) {
    var client = this;
    logger.entry('Client.connect._performConnect', _id, newClient);

    var err = null;

    // If there is no active client (i.e. we've been stopped) then add
    // ourselves back to the active list. Otherwise if there is another
    // active client (that's replaced us) then exit function now
    var activeClient = activeClientList.get(_id);
    if (activeClient === undefined) {
      logger.log('debug', _id, 'Adding client to active list, as there' +
          ' is no currently active client');
      activeClientList.add(_id);
    } else if (client !== activeClient) {
      logger.log('debug', _id,
          'Not connecting because client has been replaced');
      if (callback) {
        err = new LocalReplacedError(_id);
        process.nextTick(function() {
          logger.entry('Client.connect._performConnect.callback', _id);
          callback.apply(client, [err]);
          logger.exit('Client.connect._performConnect.callback', _id,
              null);
        });
      }
      logger.exit('Client.connect._performConnect', _id, null);
      return;
    }

    if (!newClient) {
      var currentState = _state;
      // if we are not stopped or stopping state return with the client object
      if (currentState !== STATE_STOPPED && currentState !== STATE_RETRYING) {
        if (currentState === STATE_STOPPING) {
          var stillDisconnecting = function(client, callback) {
            logger.entry('stillDisconnecting', _id);

            if (_state === STATE_STOPPING) {
              setImmediate(function() {
                stillDisconnecting(client, callback);
              });
            } else {
              process.nextTick(function() {
                client._performConnect(callback, newClient);
              });
            }

            logger.exit('stillDisconnecting', _id, null);
          };

          setImmediate(function() {
            stillDisconnecting(client, callback);
          });
          logger.exit('Client.connect._performConnect', _id, null);
          return;
        } else {
          process.nextTick(function() {
            if (callback) {
              logger.entry('Client.connect._performConnect.callback',
                  _id);
              callback.apply(client);
              logger.exit('Client.connect._performConnect.callback',
                          _id, null);
            }
          });

          logger.exit('Client.connect._performConnect', _id, client);
          return client;
        }
      }

      if (_state === STATE_STOPPED) {
        _state = STATE_STARTING;
      }

      // If the messenger is not already stopped then something has gone wrong
      if (client._messenger && !client._messenger.stopped) {
        err = new Error('messenger is not stopped');
        logger.ffdc('Client.connect._performConnect', 'ffdc001', _id,
            err);
        logger.throw('Client.connect._performConnect', _id, err);
        throw err;
      }
    } else {
      _state = STATE_STARTING;
    }

    // Obtain the list of services for connect and connect to one of the
    // services, retrying until a connection can be established
    var serviceList;
    if (client._serviceFunction instanceof Function) {
      client._serviceFunction(function(err, service) {
        if (err) {
          logger.entry('Client._serviceFunction.callback',
                       _id);
          callback.apply(client, [err]);
          logger.exit('Client._serviceFunction.callback',
              _id, null);
        } else {
          try {
            serviceList =
                client._generateServiceList.apply(client, [service]);
            client._connectToService(serviceList, callback);
          } catch (err) {
            logger.entry('Client._serviceFunction.callback', _id);
            callback.apply(client, [err]);
            logger.exit('Client._serviceFunction.callback', _id, null);
          }
        }
      });
    } else {
      try {
        serviceList = client._generateServiceList.apply(client, [service]);
        client._connectToService(serviceList, callback);
      } catch (err) {
        if (callback) {
          process.nextTick(function() {
            logger.entry('Client.connect._performConnect.callback', _id);
            callback.apply(client, [err]);
            logger.exit('Client.connect._performConnect.callback', _id,
                        null);
          });
        }
      }
    }

    logger.exit('Client.connect._performConnect', _id, null);
    return;
  };

  /**
  * Function to connect to the service, trys each available service
  * in turn. If none can connect it emits an error, waits and
  * attempts to connect again. Callback happens once a successful
  * connect/reconnect occurs.
  * @constructor
  * @param {Array} serviceList list of services to connect to.
  * @param {connectCallback}
  *  - callback called when connect/reconnect happens
  */
  this._connectToService = function(serviceList, callback) {
    var client = this;
    logger.entry('Client._connectToService', _id);

    if (client.isStopped()) {
      if (callback) {
        logger.entry('Client._connectToService.callback', _id);
        callback.apply(client,
                       [new StoppedError('connect aborted due to stop')]);
        logger.exit('Client._connectToService.callback', _id, null);
      }
      logger.exit('Client._connectToService', _id, null);
      return;
    }

    var connected = false;
    var error;

    // Try each service in turn until we can successfully connect, or exhaust
    // the list
    if (!error) {
      for (var i = 0; i < serviceList.length; i++) {
        try {
          var service = serviceList[i];
          // check if we will be providing authentication information
          var auth;
          if (securityOptions.urlUser) {
            auth = encodeURIComponent(String(securityOptions.urlUser));
            auth += ':';
            auth += encodeURIComponent(String(securityOptions.urlPassword));
            auth += '@';
          } else if (securityOptions.propertyUser) {
            auth = encodeURIComponent(String(securityOptions.propertyUser));
            auth += ':';
            auth +=
                encodeURIComponent(String(securityOptions.propertyPassword));
            auth += '@';
          } else {
            auth = null;
          }
          var logUrl;
          // reparse the service url to prepend authentication information
          // back on as required
          if (auth) {
            var serviceUrl = url.parse(service);
            service = serviceUrl.protocol + '//' + auth + serviceUrl.host;
            logUrl = serviceUrl.protocol + '//' +
                     auth.replace(/:[^\/:]+@/g, ':********@') +
                     serviceUrl.host + ':' + serviceUrl.port;
          } else {
            logUrl = service;
          }
          logger.log('data', _id, 'attempting to connect to: ' + logUrl);

          var connectUrl = url.parse(service);
          // remove any path elements from the URL (for ipv6 which appends /)
          if (connectUrl.path) {
            var hrefLength = connectUrl.href.length - connectUrl.path.length;
            connectUrl.href = connectUrl.href.substr(0, hrefLength);
            connectUrl.pathname = connectUrl.path = null;
          }
          try {
            client._messenger.connect(connectUrl,
                                      securityOptions.sslTrustCertificate,
                                      securityOptions.sslVerifyName);
            logger.log('data', _id, 'successfully connected to: ' +
                logUrl);
            _service = serviceList[i];
            connected = true;
            break;
          } catch (err) {
            error = getNamedError(err);
            logger.log('data', _id, 'failed to connect to: ' + logUrl +
                       ' due to error: ' + error);
          }
        } catch (err) {
          // should never get here, as it means that messenger.connect has been
          // called in an invalid way, so FFDC
          error = err;
          logger.caught('Client._connectToService', _id, err);
          logger.ffdc('Client._connectToService', 'ffdc002', _id, err);
          logger.throw('Client._connectToService', _id, err);
          throw err;
        }
      }
    }

    // If we've successfully connected then we're done, otherwise we'll retry
    if (connected) {
      // Indicate that we're started
      _state = STATE_STARTED;
      var eventToEmit;
      if (client._firstStart) {
        eventToEmit = STATE_STARTED;
        client._firstStart = false;
        client._retryCount = 0;
        // could be queued actions so need to process those here. On reconnect
        // this would be done via the callback we set, first connect its the
        // users callback so won't process anything.
        logger.log('data', _id, 'first start since being stopped');
        processQueuedActions.apply(client);
      } else {
        client._retryCount = 0;
        eventToEmit = STATE_RESTARTED;
      }
      ++client._connectionId;

      process.nextTick(function() {
        logger.log('emit', _id, eventToEmit);
        client.emit(eventToEmit);
      });

      if (callback) {
        process.nextTick(function() {
          logger.entry('Client._connectToService.callback', _id);
          callback.apply(client);
          logger.exit('Client._connectToService.callback', _id, null);
        });
      }

      // Setup heartbeat timer to ensure that while connected we send heartbeat
      // frames to keep the connection alive, when required.
      var remoteIdleTimeout =
          client._messenger.getRemoteIdleTimeout(_service);
      var heartbeatInterval = remoteIdleTimeout > 0 ?
          remoteIdleTimeout / 2 : remoteIdleTimeout;
      logger.log('data', _id, 'set heartbeatInterval to: ',
                 heartbeatInterval);
      if (heartbeatInterval > 0) {
        var performHeartbeat = function(client, heartbeatInterval) {
          logger.entry('Client._connectToService.performHeartbeat', _id);
          if (client._messenger) {
            client._messenger.work(0);
            client.heartbeatTimeout = setTimeout(performHeartbeat,
                heartbeatInterval, client, heartbeatInterval);
          }
          logger.exit('Client._connectToService.performHeartbeat',
                      _id, null);
        };
        client.heartbeatTimeout = setTimeout(performHeartbeat,
                                             heartbeatInterval,
                                             client, heartbeatInterval);
      }

    } else {
      // We've tried all services without success. Pause for a while before
      // trying again
      _state = STATE_RETRYING;
      var retry = function() {
        logger.entryLevel('entry_often', 'retry', _id);
        if (!client.isStopped()) {
          client._performConnect.apply(client, [callback, false]);
        }
        logger.exitLevel('exit_often', 'retry', _id);
      };

      client._retryCount++;
      var retryCap = 60000;
      //limit to the power of 8 as anything above this will put the interval
      //higher than the cap straight away.
      var exponent = (client._retryCount <= 8) ? client._retryCount : 8;
      var upperBound = Math.pow(2, exponent);
      var lowerBound = 0.75 * upperBound;
      var jitter = Math.random() * (0.25 * upperBound);
      var interval = Math.min(retryCap, (lowerBound + jitter) * 1000);
      //times by CONNECT_RETRY_INTERVAL for unittest purposes
      interval = Math.round(interval) * CONNECT_RETRY_INTERVAL;
      logger.log('data', _id, 'trying to connect again ' +
                 'after ' + interval / 1000 + ' seconds');
      setTimeout(retry, interval);
      if (error) {
        logger.log('emit', _id, 'error', error);
        client.emit('error', error);
      }
    }

    logger.exit('Client._connectToService', _id, null);
    return;
  };

  // If client id has not been specified then generate an id
  if (!id) id = 'AUTO_' + uuid.v4().substring(0, 7);

  // If the client id is incorrectly formatted then throw an error
  if (id.length > 48) {
    msg = "Client identifier '" + id + "' is longer than the maximum ID " +
          'length of 48.';
    err = new InvalidArgumentError(msg);
    logger.throw('Client.constructor', logger.NO_CLIENT_ID, err);
    throw err;
  }

  id = String(id);

  // currently client ids are restricted, reject any invalid ones
  var matches = invalidClientIdRegex.exec(id);
  if (matches) {
    msg = "Client Identifier '" + id + "' contains invalid char: " + matches[0];
    err = new InvalidArgumentError(msg);
    logger.throw('Client.constructor', logger.NO_CLIENT_ID, err);
    throw err;
  }

  // User/password must either both be present, or both be absent.
  if ((securityOptions.propertyUser && !securityOptions.propertyPassword) ||
      (!securityOptions.propertyUser && securityOptions.propertyPassword)) {
    err = new InvalidArgumentError('both user and password properties ' +
                                   'must be specified together');
    logger.throw('Client.constructor', id, err);
    throw err;
  }

  // Validate the ssl security options
  if (typeof securityOptions.sslTrustCertificate !== 'undefined') {
    if (typeof securityOptions.sslTrustCertificate !== 'string') {
      err = new TypeError("sslTrustCertificate value '" +
                          securityOptions.sslTrustCertificate +
                          "' is invalid. Must be of type String");
      logger.throw('Client.constructor', _id, err);
      throw err;
    }
    if (!fs.existsSync(securityOptions.sslTrustCertificate)) {
      err = new TypeError("The file specified for sslTrustCertificate '" +
                          securityOptions.sslTrustCertificate +
                          "' does not exist");
      logger.throw('Client.constructor', _id, err);
      throw err;
    }
    if (!fs.statSync(securityOptions.sslTrustCertificate).isFile()) {
      err = new TypeError("The file specified for sslTrustCertificate '" +
                          securityOptions.sslTrustCertificate +
                          "' is not a regular file");
      logger.throw('Client.constructor', _id, err);
      throw err;
    }
  }

  // Save the required data as client fields
  this._serviceFunction = serviceFunction;
  this._serviceList = serviceList;
  _id = id;

  logger.entry('proton.createMessenger', _id);
  this._messenger = proton.createMessenger(_id);
  logger.exit('proton.createMessenger', _id, null);

  // Set the initial state to starting
  _state = STATE_STARTING;
  _service = null;
  // the first start, set to false after start and back to true on stop
  this._firstStart = true;

  // List of message subscriptions
  this._subscriptions = [];
  // List of queued subscriptions
  this._queuedSubscriptions = [];
  // List of queued unsubscribe requests
  this._queuedUnsubscribes = [];

  // List of outstanding send operations waiting to be accepted, settled, etc
  // by the listener.
  this._outstandingSends = [];
  // List of queuedSends for resending on a reconnect
  this._queuedSends = [];
  // List of callbacks to notify when a send operation completes
  this._queuedSendCallbacks = [];

  // No drain event initially required
  this._drainEventRequired = false;

  // Number of attempts the client has tried to reconnect
  this._retryCount = 0;

  // An identifier for the connection
  this._connectionId = 0;

  if (!serviceFunction) {
    serviceList = this._generateServiceList.apply(this, [service]);
  }
  logger.exit('Client.constructor', _id, this);
};
util.inherits(Client, EventEmitter);


/**
 * @param {function(object)}
 *          connectCallback - callback, passed an Error if something goes wrong
 * @param {String}
 *          err - an error message if a problem occurred.
 */


/**
 * Prepares the client to send and/or receive messages from the server.
 * <p>
 * See README.md for more details.
 *
 * @param {connectCallback}
 *          callback - (optional) callback to be notified when the operation
 *          completes.
 * @return {Object} The instance of client that it is invoked on.
 * @throws {TypeError} If callback is specified and is not a function.
 */
Client.prototype.start = function(callback) {
  logger.entry('Client.start', this.id);

  if (callback && (typeof callback !== 'function')) {
    var err = new TypeError('Callback must be a function');
    logger.throw('Client.start', this.id, err);
    throw err;
  }

  var client = this;

  // Check that the id for this instance is not already in use. If it is then
  // we need to stop the active instance before starting
  var previousActiveClient = activeClientList.get(client.id);
  if (previousActiveClient !== undefined && previousActiveClient !== client) {
    logger.log('debug', client.id,
        'stopping previously active client with same client id');
    activeClientList.add(client);
    previousActiveClient.stop(function() {
      logger.log('debug', client.id,
          'stopped previously active client with same client id');
      var err = new LocalReplacedError(client.id);
      var error = getNamedError(err);
      logger.log('emit', previousActiveClient.id, 'error', error);
      previousActiveClient.emit('error', error);
      process.nextTick(function() {
        client._performConnect(callback, false);
      });
    });
  } else {
    activeClientList.add(client);
    process.nextTick(function() {
      client._performConnect(callback, false);
    });
  }

  logger.exit('Client.start', client.id, client);
  return client;
};


/**
 * @param {function(object)}
 *          stopProcessingCallback - callback to perform post stop processing.
 * @param {client} client - the client object to stop the messenger for.
 * @param {callback}
 *          callback, passed an error object if something goes wrong.
 */


/**
 * Stops the messenger.  The messenger stop function merely requests it to stop,
 * so we need to keep checking until it is actually stopped. Then any post
 * stop processing can be performed.
 *
 * @param {client} client - the client object to stop the messenger for.
 * @param {stopProcessingCallback}
 *          stopProcessingCallback - Function to perform the required post stop
 *          processing.
 * @param {callback}
 *          callback - (optional) The application callback to be notified of
 *          errors and completion (passed to the stopProcessingCallback).
 */
var stopMessenger = function(client, stopProcessingCallback, callback) {
  logger.entry('stopMessenger', client.id);

  var stopped = true;

  // If messenger available then request it to stop
  // (otherwise it must have already been stopped)
  if (client._messenger) {
    stopped = client._messenger.stop();
  }

  // If stopped then perform the required stop processing
  if (stopped) {
    stopProcessingCallback(client, callback);

  // Otherwise check for the messenger being stopped again
  } else {
    setImmediate(stopMessenger, client, stopProcessingCallback, callback);
  }

  logger.exit('stopMessenger', client.id, null);
};


/**
 * @param {function(object)}
 *          disconnectCallback - callback, passed an error object if something
 *          goes wrong.
 * @param {String}
 *          err - an error message if a problem occurred.
 */


/**
 * Stops the client from sending and/or receiving messages from the server.
 * <p>
 * See README.md for more details.
 *
 * @param {disconnectCallback}
 *          callback - (optional) callback to be notified when the call
 *          completes.
 * @return {Object} The instance of client that it is invoked on - allowing
 *          for chaining of other method calls on the client object.
 * @throws {TypeError}
 *           If callback is specified and is not a function.
 */
Client.prototype.stop = function(callback) {
  logger.entry('Client.stop', this.id);

  var client = this;

  // Performs the disconnect
  var performDisconnect = function(client, callback) {
    logger.entry('Client.stop.performDisconnect', client.id);

    client._setState(STATE_STOPPING);

    // Only disconnect when all outstanding send operations are complete
    if (client._outstandingSends.length === 0) {
      stopMessenger(client, function(client, callback) {
        logger.entry('Client.stop.performDisconnect.stopProcessing',
            client.id);
        if (client.heartbeatTimeout) clearTimeout(client.heartbeatTimeout);
        // clear queuedSends as we are disconnecting
        while (client._queuedSends.length > 0) {
          var msg = client._queuedSends.shift();
          // call the callback in error as we have disconnected
          process.nextTick(function() {
            logger.entry('Client.stop.performDisconnect.' +
                'stopProcessing.queuedSendCallback', client.id);
            msg.callback(new StoppedError('send aborted due to client stop'));
            logger.exit('Client.stop.performDisconnect.' +
                'stopProcessing.queuedSendCallback', client.id, null);
          });
        }
        // clear the active subscriptions list as we were asked to disconnect
        logger.log('data', client.id, 'client._subscriptions:',
                   client._subscriptions);
        while (client._subscriptions.length > 0) {
          client._subscriptions.shift();
        }
        // Indicate that we've disconnected
        client._setState(STATE_STOPPED);
        // Remove ourself from the active client list
        var activeClient = activeClientList.get(client.id);
        if (client === activeClient) activeClientList.remove(client.id);
        process.nextTick(function() {
          logger.log('emit', client.id, STATE_STOPPED);
          if (!client._firstStart) {
            client._firstStart = true;
            client.emit(STATE_STOPPED);
          }
        });
        if (callback) {
          process.nextTick(function() {
            logger.entry('Client.stop.performDisconnect.stopProcessing.' +
                'callback', client.id);
            callback.apply(client);
            logger.exit('Client.stop.performDisconnect.stopProcessing.' +
                'callback', client.id, null);
          });
        }

        logger.exit('Client.stop.performDisconnect.stopProcessing',
            client.id, null);
      }, callback);

      logger.exit('Client.stop.performDisconnect', client.id, null);
      return;
    }

    // try disconnect again
    setImmediate(performDisconnect, client, callback);

    logger.exit('Client.stop.performDisconnect', client.id, null);
  };

  if (callback && !(callback instanceof Function)) {
    var err = new TypeError('callback must be a function');
    logger.throw('Client.stop', client.id, err);
    throw err;
  }

  // just return if already stopped or in the process of stopping
  if (client.isStopped()) {
    process.nextTick(function() {
      if (callback) {
        logger.entry('Client.stop.callback', client.id);
        callback.apply(client);
        logger.exit('Client.stop.callback', client.id, null);
      }
    });

    logger.exit('Client.stop', client.id, client);
    return client;
  }

  process.nextTick(function() {
    performDisconnect(client, callback);
  });

  logger.exit('Client.stop', client.id, client);
  return client;
};


/**
 * Reconnects the client to the MQ Light service, implicitly closing any
 * subscriptions that the client has open. The 'restarted' event will be
 * emitted once the client has reconnected.
 *
 * @param {client} client - the client object to reconnect
 * @return {Object} The instance of client that it is invoked on - allowing
 *          for chaining of other method calls on the client object.
 */
var reconnect = function(client) {
  if (typeof client === 'undefined' || client.constructor !== Client) {
    logger.entry('Client.reconnect', logger.NO_CLIENT_ID);
    logger.log('parms', logger.NO_CLIENT_ID, 'client:', client);
    logger.exit('Client.reconnect', logger.NO_CLIENT_ID, undefined);
    return;
  }
  logger.entry('Client.reconnect', client.id);
  if (client.state !== STATE_STARTED) {
    if (client.isStopped()) {
      logger.exit('Client.reconnect', client.id, null);
      return;
    } else if (client.state === STATE_RETRYING) {
      logger.exit('Client.reconnect', client.id, client);
      return client;
    }
  }
  client._setState(STATE_RETRYING);

  // stop the messenger to free the object then attempt a reconnect
  stopMessenger(client, function(client) {
    logger.entry('Client.reconnect.stopProcessing', client.id);

    if (client.heartbeatTimeout) clearTimeout(client.heartbeatTimeout);

    // clear the subscriptions list, if the cause of the reconnect happens
    // during check for messages we need a 0 length so it will check once
    // reconnected.
    logger.log('data', client.id, 'client._subscriptions:',
               client._subscriptions);
    while (client._subscriptions.length > 0) {
      client._queuedSubscriptions.push(client._subscriptions.shift());
    }
    // also clear any left over outstanding sends
    while (client._outstandingSends.length > 0) {
      client._outstandingSends.shift();
    }
    client._performConnect.apply(client, [processQueuedActions, false]);

    logger.exit('Client.reconnect.stopProcessing', client.id, null);
  });

  logger.exit('Client.reconnect', client.id, client);
  return client;
};
if (process.env.NODE_ENV === 'unittest') {
  /**
   * Export for unittest purposes.
   */
  exports.reconnect = reconnect;
}


/**
* Called on reconnect or first connect to process any actions that may have
* been queued.
*
* @this should be set to the client object that has connected or reconnected
* @param {Error} err if an error occurred in the performConnect function that
* calls this callback.
*/
var processQueuedActions = function(err) {
  // this set to the appropriate client via apply call in performConnect
  var client = this;
  if (typeof client === 'undefined' || client.constructor !== Client) {
    logger.entry('processQueuedActions', 'client was not set');
    logger.exit('processQueuedActions', 'client not set returning', null);
    return;
  }
  logger.entry('processQueuedActions', client.id);
  logger.log('parms', client.id, 'err:', err);
  logger.log('data', client.id, 'client.state:', client.state);

  if (!err) {
    logger.log('data', client.id, 'client._queuedSubscriptions',
               client._queuedSubscriptions);
    while (client._queuedSubscriptions.length > 0 &&
            client.state === STATE_STARTED) {
      var sub = client._queuedSubscriptions.shift();
      if (sub.noop) {
        // no-op, so just trigger the callback without actually subscribing
        if (sub.callback) {
          process.nextTick(function() {
            logger.entry('Client.subscribe.callback', client.id);
            logger.log('parms', client.id, 'err:', err, ', topicPattern:',
                       sub.topicPattern, ', originalShareValue:', sub.share);
            sub.callback.apply(client,
                [err, sub.topicPattern, sub.originalShareValue]);
            logger.exit('Client.subscribe.callback', client.id, null);
          });
        }
      } else {
        client.subscribe(sub.topicPattern, sub.share, sub.options,
                         sub.callback);
      }
    }
    logger.log('data', client.id, 'client._queuedUnsubscribes',
               client._queuedUnsubscribes);
    while (client._queuedUnsubscribes.length > 0 &&
            client.state === STATE_STARTED) {
      var rm = client._queuedUnsubscribes.shift();
      if (rm.noop) {
        // no-op, so just trigger the callback without actually unsubscribing
        if (rm.callback) {
          rm.callback.apply(client, [null, rm.topicPattern, rm.share]);
        }
      } else {
        client.unsubscribe(rm.topicPattern, rm.share, rm.options, rm.callback);
      }
    }
    logger.log('data', client.id, 'client._queuedSends',
               client._queuedSends);
    while (client._queuedSends.length > 0 &&
            client.state === STATE_STARTED) {
      var remaining = client._queuedSends.length;
      var msg = client._queuedSends.shift();
      client.send(msg.topic, msg.data, msg.options, msg.callback);
      if (client._queuedSends.length >= remaining) {
        // Calling client.send can cause messages to be added back into
        // _queuedSends, if the network connection is broken.  Check that the
        // size of the array is decreasing to avoid looping forever...
        break;
      }
    }
  }
  logger.exit('processQueuedActions', client.id, null);
};


/**
 * @return {Boolean} <code>true</code> true if in 'stopping' or 'stopped' state,
 * <code>false</code> otherwise.
 */
Client.prototype.isStopped = function() {
  return (this.state === STATE_STOPPING ||
          this.state === STATE_STOPPED);
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
 * Sends a message to the MQ Light server.
 * <p>
 * See README.md for more details.
 *
 * @param {String} topic - The topic to which the message will be sent.
 * @param {Object} data - The message body.
 * @param {Object} options (Optional) - Affect how the send method operates.
 * @param {sendCallback} callback (optional) - Invoked when then the send
 *                       operation completes.
 * @throws {TypeError} - If one of the parameters is of the wrong type.
 * @throws {Error} If the topic or data parameter is undefined.
 * @return {Boolean} true if the message was sent. False if the message was
 *                   buffered in memory (due to a backlog of messages to send).
 */
Client.prototype.send = function(topic, data, options, callback) {
  logger.entry('Client.send', this.id);
  var err;
  var nextMessage = false;

  // Validate the passed parameters
  if (!topic) {
    err = new TypeError('Cannot send to undefined topic');
    logger.throw('Client.send', this.id, err);
    throw err;
  } else {
    topic = String(topic);
  }
  logger.log('parms', this.id, 'topic:', topic);
  logger.log('parms', this.id, 'data: typeof', typeof data);
  if (typeof data === 'undefined') {
    err = new TypeError('Cannot send undefined data');
    logger.throw('Client.send', this.id, err);
    throw err;
  } else if (data instanceof Function) {
    err = new TypeError('Cannot send a function');
    logger.throw('Client.send', this.id, err);
    throw err;
  }

  // If the last argument is a Function then it must be a callback, and not
  // options
  if (arguments.length === 3) {
    if (arguments[2] instanceof Function) {
      callback = options;
      options = undefined;
    }
  }

  // Validate the options parameter, when specified
  if (typeof options !== 'undefined') {
    if (typeof options === 'object') {
      logger.log('parms', this.id, 'options:', options);
    } else {
      err = new TypeError('options must be an object type not a ' +
                          (typeof options) + ')');
      logger.throw('Client.send', this.id, err);
      throw err;
    }
  }

  var qos = exports.QOS_AT_MOST_ONCE;
  var ttl;
  if (options) {
    if ('qos' in options) {
      if (options.qos === exports.QOS_AT_MOST_ONCE) {
        qos = exports.QOS_AT_MOST_ONCE;
      } else if (options.qos === exports.QOS_AT_LEAST_ONCE) {
        qos = exports.QOS_AT_LEAST_ONCE;
      } else {
        err = new RangeError("options:qos value '" + options.qos +
                             "' is invalid must evaluate to 0 or 1");
        logger.throw('Client.send', this.id, err);
        throw err;
      }
    }

    if ('ttl' in options) {
      ttl = Number(options.ttl);
      if (Number.isNaN(ttl) || !Number.isFinite(ttl) || ttl <= 0) {
        err = new RangeError("options:ttl value '" +
            options.ttl +
            "' is invalid, must be an unsigned non-zero integer number");
        logger.throw('Client.send', this.id, err);
        throw err;
      } else if (ttl > 4294967295) {
        ttl = 4294967295; // Cap at max AMQP value for TTL (2^32-1)
      }
    }
  }

  // Validate the callback parameter, when specified
  // (and must be specified for QoS of ALO)
  if (callback) {
    if (!(callback instanceof Function)) {
      err = new TypeError('callback must be a function type');
      logger.throw('Client.send', this.id, err);
      throw err;
    }
  } else if (qos === exports.QOS_AT_LEAST_ONCE) {
    err = new InvalidArgumentError('callback must be specified when ' +
                                   'options:qos value of 1 (at least once) ' +
                                   'is specified');
    logger.throw('Client.send', this.id, err);
    throw err;
  }

  // Ensure we have attempted a connect
  if (this.isStopped()) {
    err = new StoppedError('not started');
    logger.throw('Client.send', this.id, err);
    throw err;
  }

  // Ensure we are not retrying otherwise queue message and return
  if (this.state === STATE_RETRYING || this.state === STATE_STARTING) {
    this._queuedSends.push({
      topic: topic,
      data: data,
      options: options,
      callback: callback
    });
    this._drainEventRequired = true;
    logger.exit('Client.send', this.id, false);
    return false;
  }

  // Send the data as a message to the specified topic
  var client = this;
  var messenger = client._messenger;
  var protonMsg;
  var inOutstandingSends = false;
  try {
    logger.entry('proton.createMessage', client.id);
    protonMsg = proton.createMessage();
    logger.exit('proton.createMessage', client.id, protonMsg);
    protonMsg.address = client._getService();
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
    if (ttl) {
      protonMsg.ttl = ttl;
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

    // Record that a send operation is in progress
    client._outstandingSends.push({
      msg: protonMsg,
      qos: qos,
      callback: callback,
      topic: topic,
      options: options
    });
    inOutstandingSends = true;

    messenger.put(protonMsg, qos);
    messenger.send();

    if (client._outstandingSends.length === 1) {
      var sendOutboundMessages = function() {
        logger.entry('Client.send.sendOutboundMessages', client.id);
        logger.log('debug', client.id,
                   'outstandingSends:', client._outstandingSends.length);
        try {
          var inFlight;
          if (!messenger.stopped) {
            // Write any data buffered within messenger
            var tries = 50;
            while (tries-- > 0 &&
                   messenger.pendingOutbound(client._getService())) {
              messenger.send();
            }
            if (tries === 0) {
              logger.log('debug', client.id, 'output still pending!');
            }

            // See if any of the outstanding send operations have now completed
            while (client._outstandingSends.length > 0) {
              inFlight = client._outstandingSends.slice(0, 1)[0];
              var status = messenger.status(inFlight.msg);
              var complete = false;
              var err = null;
              if (inFlight.qos == exports.QOS_AT_MOST_ONCE) {
                complete = (status === PN_STATUS_UNKNOWN);
              } else {
                switch (status) {
                  case PN_STATUS_ACCEPTED:
                  case PN_STATUS_SETTLED:
                    messenger.settle(inFlight.msg);
                    complete = true;
                    break;
                  case PN_STATUS_REJECTED:
                    complete = true;
                    var rejectMsg = messenger.statusError(inFlight.msg);
                    if (!rejectMsg || rejectMsg === '') {
                      rejectMsg = 'send failed - message was rejected';
                    }
                    err = new RangeError(rejectMsg);
                    break;
                  case PN_STATUS_RELEASED:
                    complete = true;
                    err = new Error('send failed - message was released');
                    break;
                  case PN_STATUS_MODIFIED:
                    complete = true;
                    err = new Error('send failed - message was modified');
                    break;
                  case PN_STATUS_ABORTED:
                    complete = true;
                    err = new Error('send failed - message was aborted');
                    break;
                  case PN_STATUS_PENDING:
                    messenger.send();
                    break;
                }
              }

              if (complete) {
                // Remove send operation from list of outstanding send ops.
                client._outstandingSends.shift();

                // Generate drain event, if required.
                if (client._drainEventRequired &&
                    (client._outstandingSends.length <= 1)) {
                  client._drainEventRequired = false;
                  process.nextTick(function() {
                    logger.log('emit', client.id, 'drain');
                    client.emit('drain');
                  });
                }

                // invoke the callback, if specified
                if (inFlight.callback) {
                  setImmediate(
                      function(client, cbFunc, err, topic, body, options) {
                        logger.entry(
                            'Client.send.sendOutboundMessages.callback',
                            client.id);
                        cbFunc.apply(client, [err,
                                              topic,
                                              body,
                                              options]);
                        logger.exit('Client.send.sendOutboundMessages.callback',
                            client.id, null);
                      }, client, inFlight.callback, err, inFlight.topic,
                      inFlight.msg.body, inFlight.options);
                }

                // Free resources used by the message
                inFlight.msg.destroy();
              } else {
                // Can't make any more progress for now - schedule remaining
                // work for processing in the future.
                setImmediate(sendOutboundMessages);
                logger.exit('Client.send.sendOutboundMessages', client.id,
                            null);
                return;
              }
            }
          } else {
            // messenger has been stopped.
            while (client._outstandingSends.length > 0) {
              inFlight = client._outstandingSends.shift();
              client._queuedSends.push({
                topic: inFlight.topic,
                data: inFlight.msg.body,
                options: inFlight.options,
                callback: callback
              });
              inFlight.msg.destroy();
            }
          }
        } catch (e) {
          var error = getNamedError(e);
          var callbackError = null;
          logger.caught('Client.send.sendOutboundMessages', client.id, error);

          // Error - so empty the outstandingSends array:
          while (client._outstandingSends.length > 0) {
            inFlight = client._outstandingSends.shift();
            if (inFlight.qos === exports.QOS_AT_LEAST_ONCE) {
              // Retry at-least-once qos messages
              client._queuedSends.push({
                topic: inFlight.topic,
                data: inFlight.msg.body,
                options: inFlight.options,
                callback: callback
              });
            } else {
              // we don't know if an at-most-once message made it across.
              // Call the callback with an err of null to indicate success
              // otherwise the application could decide to resend (duplicate)
              // the message
              if (inFlight.callback) {
                setImmediate(function(client, error, topic, body, options) {
                  logger.entry('Client.send.sendOutboundMessages.callback',
                      client.id);
                  try {
                    inFlight.callback.apply(client,
                        [null, topic, body, options]);
                  } catch (cberr) {
                    logger.caught('Client.send.sendOutboundMessages.callback',
                                  client.id, cberr);
                    if (callbackError === null) callbackError = cberr;
                  }
                  logger.exit('Client.send.sendOutboundMessages.callback',
                              client.id, null);

                }, client, error, inFlight.topic, inFlight.msg.body,
                inFlight.options);
              }
            }
          }

          if (error) {
            logger.log('emit', client.id, 'error', error);
            client.emit('error', error);
          }
          inFlight.msg.destroy();

          if (shouldReconnect(error)) {
            reconnect(client);
          }

          if (callbackError !== null) {
            logger.throw('Client.send.sendOutboundMessages',
                         client.id, callbackError);
            throw callbackError;
          }
        }
        logger.exit('Client.send.sendOutboundMessages', client.id, null);
      };
      setImmediate(sendOutboundMessages);
    }

    // If we have a backlog of messages, then record the need to emit a drain
    // event later to indicate the backlog has been cleared.
    logger.log('debug', client.id,
               'outstandingSends:', client._outstandingSends.length);
    if (client._outstandingSends.length <= 1) {
      nextMessage = true;
    } else {
      client._drainEventRequired = true;
    }
  } catch (exception) {
    err = getNamedError(exception);
    logger.caught('Client.send', client.id, err);

    // error condition so won't retry send need to remove it from list of
    // unsent
    if (inOutstandingSends) {
      client._outstandingSends.shift();
    }

    if (qos === exports.QOS_AT_LEAST_ONCE) {
      client._queuedSends.push({
        topic: topic,
        data: data,
        options: options,
        callback: callback
      });
    }

    // Reconnect can result in many callbacks being fired in a single tick,
    // group these together into a single setImmediate - to avoid them being
    // spread out over a, potentially, long period of time.
    if (client._queuedSendCallbacks.length === 0) {
      setImmediate(function() {
        var doReconnect = false;
        while (client._queuedSendCallbacks.length > 0) {
          var invocation = client._queuedSendCallbacks.shift();
          if (invocation.callback) {
            if (invocation.qos === exports.QOS_AT_MOST_ONCE) {
              logger.entry('Client.send.callback', client.id);
              logger.log('parms', client.id, 'err:', invocation.error,
                         ', topic:', invocation.topic, ', protonMsg.body:',
                         invocation.body, ', options:', invocation.options);
              invocation.callback.apply(client, [
                invocation.error,
                invocation.topic,
                invocation.body,
                invocation.options]);
              logger.exit('Client.send.callback', client.id, null);
            }
          }
          logger.log('emit', client.id, 'error', invocation.error);
          client.emit('error', invocation.error);
          doReconnect |= shouldReconnect(invocation.error);
        }
        if (doReconnect) {
          reconnect(client);
        }
      });
    }

    client._queuedSendCallbacks.push({
      body: protonMsg.body,
      callback: callback,
      error: err,
      options: options,
      qos: qos,
      topic: topic
    });
  }

  logger.exit('Client.send', this.id, nextMessage);
  return nextMessage;
};


/**
 * Function to force the client to check for messages, outputting the contents
 * of any that have arrived to the client event emitter.
 *
 * @throws {Error}
 *           If a listener hasn't been reqistered for the 'malformed' event and
 *           one needs to be emitted.
 */
Client.prototype.checkForMessages = function() {
  var client = this;
  logger.entryLevel('entry_often', 'checkForMessages', client.id);
  var messenger = client._messenger;
  if (client.state !== STATE_STARTED || client._subscriptions.length === 0 ||
      client.listeners('message').length === 0) {
    logger.exitLevel('exit_often', 'checkForMessages', client.id);
    return;
  }

  var err;

  try {
    var messages = messenger.receive(50);
    if (messages.length > 0) {
      logger.log('debug', client.id, 'received %d messages', messages.length);

      for (var msg = 0, tot = messages.length; msg < tot; msg++) {
        logger.log('debug', client.id, 'processing message %d', msg);
        var protonMsg = messages[msg];
        processMessage(client, protonMsg);
        if (msg < (tot - 1)) {
          // Unless this is the last pass around the loop, call work() so that
          // Messenger has a chance to respond to any heartbeat requests
          // that may have arrived from the server.
          client._messenger.work(0);
        }
      }
    }
  } catch (e) {
    err = getNamedError(e);
    logger.caughtLevel('entry_often', 'checkForMessages', client.id, err);
    process.nextTick(function() {
      logger.log('emit', client.id, 'error', err);
      client.emit('error', err);
      if (shouldReconnect(err)) {
        reconnect(client);
      }
    });
  }

  logger.exitLevel('exit_often', 'checkForMessages', client.id);

  setImmediate(function() {
    if (client.state === STATE_STARTED) {
      client.checkForMessages.apply(client);
    }
  });
};

var processMessage = function(client, protonMsg) {
  logger.entryLevel('entry_often', 'processMessage', client.id);
  var messenger = client._messenger;
  Object.defineProperty(protonMsg, 'connectionId', {
    value: client._connectionId
  });

  // if body is a JSON'ified object, try to parse it back to a js obj
  var data;
  var err;
  if (protonMsg.contentType === 'application/json') {
    try {
      data = JSON.parse(protonMsg.body);
    } catch (_) {
      logger.caughtLevel('entry_often', 'processMessage', client.id, _);
      console.warn(_);
    }
  } else {
    data = protonMsg.body;
  }

  var topic =
      decodeURIComponent(url.parse(protonMsg.address).path.substring(1));
  var autoConfirm = true;
  var qos = exports.QOS_AT_MOST_ONCE;
  var matchedSubs = client._subscriptions.filter(function(el) {
    // 1 added to length to account for the / we add
    var addressNoService = el.address.slice(client._getService().length + 1);
    // possible to have 2 matches work out whether this is
    // for a share or private topic
    var linkAddress;
    if (protonMsg.linkAddress.indexOf('private:') === 0 && !el.share) {
      // slice off 'private:' prefix
      linkAddress = protonMsg.linkAddress.slice(8);
    } else if (protonMsg.linkAddress.indexOf('share:') === 0 && el.share) {
      // starting after the share: look for the next : denoting the end
      // of the share name and get everything past that
      linkAddress = protonMsg.linkAddress.slice(
          protonMsg.linkAddress.indexOf(':', 7) + 1);
    }
    if (addressNoService === linkAddress) {
      return el;
    }
  });
  // should only ever be one entry in matchedSubs
  if (matchedSubs.length > 1) {
    err = new Error('received message matched more than one ' +
        'subscription');
    logger.ffdc('processMessage', 'ffdc003', client.id,
        err);
  }
  var subscription = matchedSubs[0];
  if (typeof subscription !== 'undefined') {
    qos = subscription.qos;
    if (qos === exports.QOS_AT_LEAST_ONCE) {
      autoConfirm = subscription.autoConfirm;
    }
    ++subscription.unconfirmed;
  } else {
    // ideally we shouldn't get here, but it can happen in a timing
    // window if we had received a message from a subscription we've
    // subsequently unsubscribed from
    logger.log('debug', client.id, 'No subscription matched message: ' +
        data + ' going to address: ' + protonMsg.address);
    protonMsg.destroy();
    protonMsg = null;
    return;
  }

  var delivery = {
    message: {
      topic: topic
    }
  };

  if (qos >= exports.QOS_AT_LEAST_ONCE && !autoConfirm) {
    delivery.message.confirmDelivery = function() {
      logger.entry('message.confirmDelivery', client.id);
      logger.log('data', client.id, 'delivery:', delivery);
      if (client.isStopped()) {
        err = new NetworkError('not started');
        logger.throw('message.confirmDelivery', client.id, err);
        throw err;
      }
      if (protonMsg) {
        // also throw NetworkError if the client has
        // disconnected at some point since this particular message was
        // received
        if (protonMsg.connectionId !== client._connectionId) {
          err = new NetworkError('client has reconnected since this ' +
                                       'message was received');
          logger.throw('message.confirmDelivery', client.id, err);
          throw err;
        }
        messenger.settle(protonMsg);
        --subscription.unconfirmed;
        ++subscription.confirmed;
        logger.log('data', client.id, '[credit,unconfirmed,confirmed]:',
            '[' + subscription.credit + ',' +
            subscription.unconfirmed + ',' +
            subscription.confirmed + ']');
        // Ask to flow more messages if >= 80% of available credit
        // (e.g. not including unconfirmed messages) has been used.
        // Or we have just confirmed everything.
        var available = subscription.credit - subscription.unconfirmed;
        if ((available / subscription.confirmed) <= 1.25 ||
            (subscription.unconfirmed === 0 &&
            subscription.confirmed > 0)) {
          messenger.flow(client._getService() + '/' + protonMsg.linkAddress,
                               subscription.confirmed);
          subscription.confirmed = 0;
        }
        protonMsg.destroy();
        protonMsg = null;
      }
      logger.exit('message.confirmDelivery', client.id, null);
    };
  }

  var linkAddress = protonMsg.linkAddress;
  if (linkAddress) {
    delivery.destination = {};
    var link = linkAddress;
    if (link.indexOf('share:') === 0) {
      // remove 'share:' prefix from link name
      link = link.substring(6, linkAddress.length);
      // extract share name and add to delivery information
      delivery.destination.share = link.substring(0, link.indexOf(':'));
    }
    // extract topicPattern and add to delivery information
    delivery.destination.topicPattern =
        link.substring(link.indexOf(':') + 1, link.length);
  }
  if (protonMsg.ttl > 0) {
    delivery.message.ttl = protonMsg.ttl;
  }

  var da = protonMsg.deliveryAnnotations;
  var malformed = {};
  malformed.MQMD = {};
  for (var an = 0; da && (an < da.length); ++an) {
    if (da[an] && da[an].key) {
      switch (da[an].key) {
        case 'x-opt-message-malformed-condition':
          malformed.condition = da[an].value;
          break;
        case 'x-opt-message-malformed-description':
          malformed.description = da[an].value;
          break;
        case 'x-opt-message-malformed-MQMD.CodedCharSetId':
          malformed.MQMD.CodedCharSetId = Number(da[an].value);
          break;
        case 'x-opt-message-malformed-MQMD.Format':
          malformed.MQMD.Format = da[an].value;
          break;
        default:
          break;
      }
    }
  }
  if (malformed.condition) {
    if (client.listeners('malformed').length > 0) {
      delivery.malformed = malformed;
      logger.log('emit', client.id,
          'malformed', protonMsg.body, delivery);
      client.emit('malformed', protonMsg.body, delivery);
    } else {
      protonMsg.destroy();
      err = new Error('No listener for "malformed" event.');
      logger.throwLevel('exit_often', 'processMessage', client.id, err);
      throw err;
    }
  } else {
    logger.log('emit', client.id, 'message', delivery);
    try {
      client.emit('message', data, delivery);
    } catch (err) {
      logger.caughtLevel('entry_often', 'processMessage',
                               client.id, err);
      logger.log('emit', client.id, 'error', err);
      client.emit('error', err);
    }
  }

  if (client.isStopped()) {
    logger.log('debug', client.id,
        'client is stopped so not accepting or settling message');
    protonMsg.destroy();
  } else {
    if (qos === exports.QOS_AT_MOST_ONCE) {
      messenger.accept(protonMsg);
    }
    if (qos === exports.QOS_AT_MOST_ONCE || autoConfirm) {
      messenger.settle(protonMsg);
      --subscription.unconfirmed;
      ++subscription.confirmed;
      logger.log('data', client.id, '[credit,unconfirmed,confirmed]:',
          '[' + subscription.credit + ',' +
          subscription.unconfirmed + ',' +
          subscription.confirmed + ']');
      // Ask to flow more messages if >= 80% of available credit
      // (e.g. not including unconfirmed messages) has been used.
      // Or we have just confirmed everything.
      var available = subscription.credit - subscription.unconfirmed;
      if ((available / subscription.confirmed <= 1.25) ||
          (subscription.unconfirmed === 0 &&
          subscription.confirmed > 0)) {
        messenger.flow(client._getService() + '/' + protonMsg.linkAddress,
                             subscription.confirmed);
        subscription.confirmed = 0;
      }
      protonMsg.destroy();
    }
  }
  logger.exitLevel('exit_often', 'processMessage', client.id);
};
/**
 * @param {function(object)}
 *          destCallback - callback, invoked with an Error object if
 *          something
 *          goes wrong.
 * @param {String}
 *          err - an error message if a problem occurred.
 * @param {String}
 *          topicPattern - the topic pattern that was subscribed to
 */


/**
 * Subscribes to a destination. The client will be eligible to receive messages
 * that arrive at the destination.
 * <p>
 * See README.md for more details.
 *
 * @param {String} topicPattern matched against the topic specified when a
 *                 message is sent.
 * @param {String} share (optional) join a shared destination, with the
 *                 specified name. Messages are anycast amongst clients
 *                 subscribed to a shared destination.
 * @param {Object} options (optional) affect how the subscribe method behaves.
 * @param {destCallback} callback (optional) invoked when the subscribe
 *                       operation completes.
 * @return {@link Client} the instance of the client subscribe was invoked on.
 * @throws {TypeError} one of the parameters is of the wrong type.
 * @throws {Error} the topic pattern parameter is undefined.
 */
Client.prototype.subscribe = function(topicPattern, share, options, callback) {
  logger.entry('Client.subscribe', this.id);
  logger.log('parms', this.id, 'topicPattern:', topicPattern);

  // Must accept at least one option - and first option is always a
  // topicPattern.
  if (arguments.length === 0) {
    err = new TypeError("You must specify a 'topicPattern' argument");
    logger.throw('Client.subscribe', this.id, err);
    throw err;
  }
  if (!topicPattern) {
    err = new TypeError("You must specify a 'topicPattern' argument");
    logger.throw('Client.subscribe', this.id, err);
    throw err;
  }
  topicPattern = String(topicPattern);

  // Two or three arguments are the interesting cases - the rules we use to
  // disambiguate are:
  //   1) If the last argument is a function - it's the callback
  //   2) If we are unsure if something is the share or the options then
  //      a) It's the share if it's a String
  //      b) It's the options if it's an Object
  //      c) If it's neither of the above, then it's the share
  //         (and convert it to a String).
  if (arguments.length === 2) {
    if (arguments[1] instanceof Function) {
      callback = share;
      share = undefined;
    } else if (!(arguments[1] instanceof String) &&
               (arguments[1] instanceof Object)) {
      options = share;
      share = undefined;
    }
  } else if (arguments.length === 3) {
    if (arguments[2] instanceof Function) {
      callback = arguments[2];
      if (!(arguments[1] instanceof String) &&
          (arguments[1] instanceof Object)) {
        options = arguments[1];
        share = undefined;
      } else {
        options = undefined;
      }
    }
  }

  var originalShareValue = share;
  if (share) {
    share = String(share);
    if (share.indexOf(':') >= 0) {
      err = new InvalidArgumentError("share argument value '" + share +
                                     "' is invalid because it contains a " +
                                     "colon (\':\') character");
      logger.throw('Client.subscribe', this.id, err);
      throw err;
    }
    share = 'share:' + share + ':';
  } else {
    share = 'private:';
  }
  logger.log('parms', this.id, 'share:', share);

  // Validate the options parameter, when specified
  if (typeof options !== 'undefined') {
    if (typeof options === 'object') {
      logger.log('parms', this.id, 'options:', options);
    } else {
      err = new TypeError('options must be an object type not a ' +
                          (typeof options) + ')');
      logger.throw('Client.subscribe', this.id, err);
      throw err;
    }
  }

  var qos = exports.QOS_AT_MOST_ONCE;
  var autoConfirm = true;
  var ttl = 0;
  var credit = 1024;
  if (options) {
    if ('qos' in options) {
      if (options.qos === exports.QOS_AT_MOST_ONCE) {
        qos = exports.QOS_AT_MOST_ONCE;
      } else if (options.qos === exports.QOS_AT_LEAST_ONCE) {
        qos = exports.QOS_AT_LEAST_ONCE;
      } else {
        err = new RangeError("options:qos value '" + options.qos +
                             "' is invalid must evaluate to 0 or 1");
        logger.throw('Client.subscribe', this.id, err);
        throw err;
      }
    }
    if ('autoConfirm' in options) {
      if (options.autoConfirm === true) {
        autoConfirm = true;
      } else if (options.autoConfirm === false) {
        autoConfirm = false;
      } else {
        err = new TypeError("options:autoConfirm value '" +
                            options.autoConfirm +
                            "' is invalid must evaluate to true or false");
        logger.throw('Client.subscribe', this.id, err);
        throw err;
      }
    }
    if ('ttl' in options) {
      ttl = Number(options.ttl);
      if (Number.isNaN(ttl) || !Number.isFinite(ttl) || ttl < 0) {
        err = new RangeError("options:ttl value '" +
                             options.ttl +
                             "' is invalid, must be an unsigned integer " +
                             'number');
        logger.throw('Client.subscribe', this.id, err);
        throw err;
      }
      ttl = Math.round(ttl / 1000);
    }
    if ('credit' in options) {
      credit = Number(options.credit);
      if (Number.isNaN(credit) || !Number.isFinite(credit) || credit < 0 ||
          credit > 4294967295) {
        err = new RangeError("options:credit value '" +
                             options.credit +
                             "' is invalid, must be an unsigned integer " +
                             'number');
        logger.throw('Client.subscribe', this.id, err);
        throw err;
      }
    }
  }

  if (callback && !(callback instanceof Function)) {
    err = new TypeError('callback must be a function type');
    logger.throw('Client.subscribe', this.id, err);
    throw err;
  }

  // Ensure we have attempted a connect
  if (this.isStopped()) {
    err = new StoppedError('not started');
    logger.throw('Client.subscribe', this.id, err);
    throw err;
  }

  // Subscribe using the specified topic pattern and share options
  var client = this;
  var messenger = client._messenger;
  var address = client._getService() + '/' + share + topicPattern;
  var subscriptionAddress = client._getService() + '/' + topicPattern;

  var i = 0;

  // if client is in the retrying state, then queue this subscribe request
  if (client.state === STATE_RETRYING || client.state === STATE_STARTING) {
    // reject queued subscription if one already exists
    for (i = 0; i < client._queuedSubscriptions.length; i++) {
      if (client._queuedSubscriptions[i].address === subscriptionAddress &&
          client._queuedSubscriptions[i].share === originalShareValue) {
        err = new SubscribedError('client already has a queued subscription ' +
                                  'to this address');
        logger.throw('Client.subscribe', this.id, err);
        throw err;
      }
    }
    logger.log('data', client.id, 'client waiting for connection so queued ' +
               'subscription');
    client._queuedSubscriptions.push({
      address: subscriptionAddress,
      qos: qos,
      autoConfirm: autoConfirm,
      topicPattern: topicPattern,
      share: originalShareValue,
      options: options,
      callback: callback
    });
    logger.exit('Client.subscribe', client.id, client);
    return client;
  }

  var err;

  // if we already believe this subscription exists, we should reject the
  // request to subscribe by throwing a SubscribedError
  for (i = 0; i < client._subscriptions.length; i++) {
    if (client._subscriptions[i].address === subscriptionAddress &&
        client._subscriptions[i].share === originalShareValue) {
      err = new SubscribedError('client is already subscribed to this address');
      logger.throw('Client.subscribe', this.id, err);
      throw err;
    }
  }

  if (!err) {
    try {
      messenger.subscribe(address, qos, ttl, credit);
    } catch (e) {
      logger.caught('Client.subscribe', client.id, e);
      err = getNamedError(e);
    }
  }

  if (callback) {
    process.nextTick(function() {
      logger.entry('Client.subscribe.callback', client.id);
      logger.log('parms', client.id, 'err:', err, ', topicPattern:',
                 topicPattern, ', originalShareValue:', originalShareValue);
      callback.apply(client, [err, topicPattern, originalShareValue]);
      logger.exit('Client.subscribe.callback', client.id, null);
    });
  }

  if (err) {
    setImmediate(function() {
      logger.log('emit', client.id, 'error', err);
      client.emit('error', err);
    });
    if (shouldReconnect(err)) {
      logger.log('data', client.id, 'queued subscription and calling ' +
                 'reconnect');
      // error during subscribe so add to list of queued to resub
      client._queuedSubscriptions.push({
        address: subscriptionAddress,
        qos: qos,
        autoConfirm: autoConfirm,
        topicPattern: topicPattern,
        share: originalShareValue,
        options: options,
        callback: callback
      });
      // schedule a reconnect
      setImmediate(function() {
        reconnect(client);
      });
    }
  } else {
    // if no errors, add this to the stored list of subscriptions
    var isFirstSub = (client._subscriptions.length === 0);
    logger.log('data', client.id, 'isFirstSub:', isFirstSub);

    client._subscriptions.push({
      address: subscriptionAddress,
      qos: qos,
      autoConfirm: autoConfirm,
      topicPattern: topicPattern,
      share: originalShareValue,
      options: options,
      callback: callback,
      credit: credit,
      unconfirmed: 0,
      confirmed: 0
    });

    // If this is the first subscription to be added, schedule a request to
    // start the polling loop to check for messages arriving
    if (isFirstSub) {
      setImmediate(function() {
        client.checkForMessages.apply(client);
      });
    }
  }

  logger.exit('Client.subscribe', client.id, client);
  return client;
};


/**
 * Stops the flow of messages from a destination to this client.  The client's
 * message callback will not longer be driven when messages arrive that match
 * the pattern associated with the destination.
 * <p>
 * See README.md for more details.
 *
 * @param {String} topicPattern that was specified when the client subscribed
 *                 to the destination.
 * @param {String} share (optional) that was specified when the client
 *                 subscribed to the destination.
 * @param {Object} options (optional) options that affect the behaviour of the
 *                 unsubscribe method call.
 * @param {function()} callback (optional) invoked when the subscribe operation
 *                     has completed.
 * @return {@link Client} the instance of the client that the subscribe method
 *                        was invoked on.
 * @throws {TypeError} one of the  parameters is of the wrong type.
 * @throws {Error} if the topic pattern parameter is undefined.
 */
Client.prototype.unsubscribe = function(topicPattern, share, options, callback)
                               {
  logger.entry('Client.unsubscribe', this.id);
  logger.log('parms', this.id, 'topicPattern:', topicPattern);

  // Must accept at least one option - and first option is always a
  // topicPattern.
  if (arguments.length === 0) {
    err = new TypeError("You must specify a 'topicPattern' argument");
    logger.throw('Client.unsubscribe', this.id, err);
    throw err;
  }
  if (!topicPattern) {
    err = new TypeError("You must specify a 'topicPattern' argument");
    logger.throw('Client.unsubscribe', this.id, err);
    throw err;
  }
  topicPattern = String(topicPattern);

  // Two or three arguments are the interesting cases - the rules we use to
  // disambiguate are:
  //   1) If the last argument is a function - it's the callback
  //   2) If we are unsure if something is the share or the options then
  //      a) It's the share if it's a String
  //      b) It's the options if it's an Object
  //      c) If it's neither of the above, then it's the share
  //         (and convert it to a String).
  if (arguments.length === 2) {
    if (arguments[1] instanceof Function) {
      callback = share;
      share = undefined;
    } else if (!(arguments[1] instanceof String) &&
               (arguments[1] instanceof Object)) {
      options = share;
      share = undefined;
    }
  } else if (arguments.length === 3) {
    if (arguments[2] instanceof Function) {
      callback = arguments[2];
      if (!(arguments[1] instanceof String) &&
          (arguments[1] instanceof Object)) {
        options = arguments[1];
        share = undefined;
      } else {
        options = undefined;
      }
    }
  }

  var originalShareValue = share;
  if (share) {
    share = String(share);
    if (share.indexOf(':') >= 0) {
      err = new InvalidArgumentError("share argument value '" + share +
                                     "' is invalid because it contains a " +
                                     "colon (\':\') character");
      logger.throw('Client.unsubscribe', this.id, err);
      throw err;
    }
    share = 'share:' + share + ':';
  } else {
    share = 'private:';
  }
  logger.log('parms', this.id, 'share:', share);

  // Validate the options parameter, when specified
  if (typeof options !== 'undefined') {
    if (typeof options === 'object') {
      logger.log('parms', this.id, 'options:', options);
    } else {
      err = new TypeError('options must be an object type not a ' +
                          (typeof options) + ')');
      logger.throw('Client.unsubscribe', this.id, err);
      throw err;
    }
  }

  var ttl;
  if (options) {
    if ('ttl' in options) {
      ttl = Number(options.ttl);
      if (Number.isNaN(ttl) || ttl !== 0) {
        err = new RangeError("options:ttl value '" +
                             options.ttl +
                             "' is invalid, only 0 is a supported value for " +
                             ' an unsubscribe request');
        logger.throw('Client.unsubscribe', this.id, err);
        throw err;
      }
    }
  }

  if (callback && !(callback instanceof Function)) {
    err = new TypeError('callback must be a function type');
    logger.throw('Client.unsubscribe', this.id, err);
    throw err;
  }

  // Ensure we have attempted a connect
  if (this.isStopped()) {
    err = new StoppedError('not started');
    logger.throw('Client.unsubscribe', this.id, err);
    throw err;
  }

  var client = this;
  var messenger = client._messenger;
  var address = client._getService() + '/' + share + topicPattern;
  var subscriptionAddress = client._getService() + '/' + topicPattern;

  // Check that there is actually a subscription for the pattern and share
  var subscribed = false;
  var i = 0;
  for (i = 0; i < client._subscriptions.length; i++) {
    if (client._subscriptions[i].address === subscriptionAddress &&
        client._subscriptions[i].share === originalShareValue) {
      subscribed = true;
      break;
    }
  }
  if (!subscribed) {
    for (i = 0; i < client._queuedSubscriptions.length; i++) {
      if (client._queuedSubscriptions[i].address === subscriptionAddress &&
          client._queuedSubscriptions[i].share === originalShareValue &&
          !(client._queuedSubscriptions[i].noop)) {
        subscribed = true;
        break;
      }
    }
  }

  var queueUnsubscribe = function() {
    // check if there's a queued subscribe for the same topic, if so mark that
    // as a no-op operation, so the callback is called but a no-op takes place
    // on reconnection
    var noop = false;
    for (var qs = 0; qs < client._queuedSubscriptions.length; qs++) {
      if (client._queuedSubscriptions[qs].address === subscriptionAddress &&
          client._queuedSubscriptions[qs].share === originalShareValue &&
          !(client._queuedSubscriptions[qs].noop)) {
        noop = client._queuedSubscriptions[qs].noop = true;
      }
    }

    // queue unsubscribe request as appropriate
    if (noop) {
      logger.log('data', client.id, 'client already had a queued subscribe ' +
                 'request for this address, so marked that as a noop and ' +
                 'will queue this unsubscribe request as a noop too');
    } else {
      logger.log('data', client.id, 'client waiting for connection so ' +
                 'queueing the unsubscribe request');
    }
    client._queuedUnsubscribes.push({
      noop: noop,
      address: subscriptionAddress,
      topicPattern: topicPattern,
      share: originalShareValue,
      options: options,
      callback: callback
    });
  };

  // if client is in the retrying state, then queue this unsubscribe request
  if (client.state === STATE_RETRYING || client.state === STATE_STARTING) {
    logger.log('data', client.id, 'client is still in the process of ' +
               'connecting so queueing the unsubscribe request');
    queueUnsubscribe();
    logger.exit('Client.unsubscribe', client.id, client);
    return client;
  }

  var err;

  if (!subscribed) {
    err = new UnsubscribedError('client is not subscribed to this address');
    logger.throw('Client.unsubscribe', this.id, err);
    throw err;
  }

  // unsubscribe using the specified topic pattern and share options
  try {
    messenger.unsubscribe(address, ttl);

    if (callback) {
      setTimeout(function() {
        logger.entry('Client.unsubscribe.callback', client.id);
        callback.apply(client, [null, topicPattern, originalShareValue]);
        logger.exit('Client.unsubscribe.callback', client.id, null);
      }, 100);
    }
    // if no errors, remove this from the stored list of subscriptions
    for (i = 0; i < client._subscriptions.length; i++) {
      if (client._subscriptions[i].address === subscriptionAddress &&
          client._subscriptions[i].share === originalShareValue) {
        client._subscriptions.splice(i, 1);
        break;
      }
    }
  } catch (e) {
    err = getNamedError(e);
    logger.caught('Client.unsubscribe', client.id, err);
    setImmediate(function() {
      logger.log('emit', client.id, 'error', err);
      client.emit('error', err);
    });
    if (shouldReconnect(err)) {
      logger.log('data', client.id, 'client error "' + err + '" during ' +
                 'messenger.unsubscribe call so queueing the unsubscribe ' +
                 'request');
      queueUnsubscribe();
      setImmediate(function() {
        reconnect(client);
      });
    }
  }

  logger.exit('Client.unsubscribe', client.id, client);
  return client;
};

/* ------------------------------------------------------------------------- */
