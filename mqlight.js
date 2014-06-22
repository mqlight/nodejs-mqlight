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
/* jslint node: true */
/* jshint -W083,-W097 */
'use strict';


/**
 * Set up logging (to stderr by default). The level of output is
 * configured by the value of the MQLIGHT_NODE_LOG environment
 * variable. The default is 'ffdc'.
 */
GLOBAL.log = require('./mqlight-log');


/**
 * The logging level can be set programmatically by calling
 *   log.setLevel(level)
 * An ffdc can be generated programmatically by calling
 *   log.ffdc()
 */
exports.log = GLOBAL.log;
var log = GLOBAL.log;

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
var fs = require('fs');
var http = require('http');

var validClientIdChars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789%/._';


/** @const {number} */
exports.QOS_AT_MOST_ONCE = 0;


/** @const {number} */
exports.QOS_AT_LEAST_ONCE = 1;


/** @const {number} */
exports.QOS_EXACTLY_ONCE = 2;


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
var CONNECT_RETRY_INTERVAL = 10000;
if (process.env.NODE_ENV === 'unittest') CONNECT_RETRY_INTERVAL = 0;


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
 *            connection is disconnected in favour of the second instance. If
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
  log.entry('createClient', log.NO_CLIENT_ID);

  if (!options) {
    var err = new TypeError('options object missing');
    log.throw('createClient', log.NO_CLIENT_ID, err);
    throw err;
  }
  var client = new Client(options.service, options.id,
                          options.user, options.password);

  process.setMaxListeners(0);
  process.once('exit', function() {
    log.entry('createClient.on.exit', log.NO_CLIENT_ID);

    if (client && client.getState() == 'connected') {
      try {
        client.messenger.send();
        client.disconnect();
      } catch (err) {
        log.caught('createClient.on.exit', client.id, err);
      }
    }

    log.exit('createClient.on.exit', log.NO_CLIENT_ID);
  });

  log.exit('createClient', client.id, client);
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
  log.entry('generateServiceList', log.NO_CLIENT_ID);
  log.log('parms', log.NO_CLIENT_ID, 'service:', service);

  var err;

  // Validate the parameter list length
  if (arguments.length > 1) {
    err = new Error('Too many arguments');
    log.throw('generateServiceList', log.NO_CLIENT_ID, err);
    throw err;
  }

  // Ensure the service is an Array
  var inputServiceList = [];
  if (!service) {
    err = new Error('service is undefined');
    log.throw('generateServiceList', log.NO_CLIENT_ID, err);
    throw err;
  } else if (service instanceof Function) {
    err = new TypeError('service cannot be a function');
    log.throw('generateServiceList', log.NO_CLIENT_ID, err);
    throw err;
  } else if (service instanceof Array) {
    if (service.length === 0) {
      err = new Error('service array is empty');
      log.throw('generateServiceList', log.NO_CLIENT_ID, err);
      throw err;
    }
    inputServiceList = service;
  } else if (typeof service === 'string') {
    inputServiceList[0] = service;
  } else {
    err = new TypeError('service must be a string or array type');
    log.throw('generateServiceList', log.NO_CLIENT_ID, err);
    throw err;
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
      err = new Error(msg);
      log.throw('generateServiceList', log.NO_CLIENT_ID, err);
      throw err;
    }
    // Check we are trying to use the amqp protocol
    if (!protocol || protocol !== 'amqp:' && protocol !== 'amqps:') {
      msg = "Unsupported URL '" + inputServiceList[i] +
            "' specified for service. Only the amqp or amqps protocol are " +
            'supported.';
      err = new Error(msg);
      log.throw('generateServiceList', log.NO_CLIENT_ID, err);
      throw err;
    }
    // Check we have a hostname
    if (!host) {
      msg = "Unsupported URL ' " + inputServiceList[i] + "' specified for " +
            'service. Must supply a hostname.';
      err = new Error(msg);
      log.throw('generateServiceList', log.NO_CLIENT_ID, err);
      throw err;
    }
    // Set default port if not supplied
    if (!port) {
      port = (protocol === 'amqp:') ? '5672' : '5671';
    }
    // Check for no path
    if (path) {
      msg = "Unsupported URL '" + inputServiceList[i] + "' paths (" + path +
            " ) can't be part of a service URL.";
      err = new Error(msg);
      log.throw('generateServiceList', log.NO_CLIENT_ID, err);
      throw err;
    }
    serviceList[i] = protocol + '//' + host + ':' + port;
  }

  log.exit('generateServiceList', log.NO_CLIENT_ID, serviceList);
  return serviceList;
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
  log.entry('getFileServiceFunction', log.NO_CLIENT_ID);
  log.log('parms', log.NO_CLIENT_ID, 'fileUrl:', fileUrl);

  if (typeof fileUrl !== 'string') {
    var err = new TypeError('fileUrl must be a string type');
    log.throw('getFileServiceFunction', log.NO_CLIENT_ID, err);
    throw err;
  }

  var fileServiceFunction = function(callback) {
    log.entry('fileServiceFunction', log.NO_CLIENT_ID);

    fs.readFile(fileUrl, { encoding: 'utf8' }, function(err, data) {
      log.entry('fileServiceFunction.readFile.callback', log.NO_CLIENT_ID);
      log.log('parms', log.NO_CLIENT_ID, 'err:', err);
      log.log('parms', log.NO_CLIENT_ID, 'data:', data);

      if (err) {
        err.message = 'attempt to read ' + fileUrl + ' failed with the ' +
                      'following error: ' + err.message;
        log.log('error', log.NO_CLIENT_ID, err);
        log.entry('fileServiceFunction.callback', log.NO_CLIENT_ID);
        log.log('parms', log.NO_CLIENT_ID, 'err:', err);
        callback(err);
        log.exit('fileServiceFunction.callback', log.NO_CLIENT_ID, null);
      } else {
        var obj;
        try {
          obj = JSON.parse(data);
        } catch (err) {
          err.message = 'the content read from ' + fileUrl + ' contained ' +
                        'unparseable JSON: ' + err.message;
          log.caught('fileServiceFunction.readFile.callback',
                     log.NO_CLIENT_ID, err);
          log.entry('fileServiceFunction.callback', log.NO_CLIENT_ID);
          log.log('parms', log.NO_CLIENT_ID, 'err:', err);
          callback(err);
          log.exit('fileServiceFunction.callback', log.NO_CLIENT_ID, null);
        }
        if (obj) {
          log.entry('fileServiceFunction.callback', log.NO_CLIENT_ID);
          log.log('parms', log.NO_CLIENT_ID, 'service:', obj.service);
          callback(undefined, obj.service);
          log.exit('fileServiceFunction.callback', log.NO_CLIENT_ID, null);
        }
      }
      log.exit('fileServiceFunction.readFile.callback', log.NO_CLIENT_ID, null);
    });

    log.exit('fileServiceFunction', log.NO_CLIENT_ID, null);
  };

  log.exit('getFileServiceFunction', log.NO_CLIENT_ID, fileServiceFunction);
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
  log.entry('getHttpServiceFunction', log.NO_CLIENT_ID);
  log.log('parms', log.NO_CLIENT_ID, 'serviceUrl:', serviceUrl);

  if (typeof serviceUrl !== 'string') {
    var err = new TypeError('serviceUrl must be a string type');
    log.throw('getHttpServiceFunction', log.NO_CLIENT_ID, err);
    throw err;
  }

  var httpServiceFunction = function(callback) {
    log.entry('httpServiceFunction', log.NO_CLIENT_ID);

    var req = http.request(serviceUrl, function(res) {
      log.entry('httpServiceFunction.req.callback', log.NO_CLIENT_ID);

      var data = '';
      res.setEncoding('utf8');
      res.on('data', function(chunk) {
        data += chunk;
      });

      res.on('end', function() {
        log.entry('httpServiceFunction.req.on.end.callback', log.NO_CLIENT_ID);

        if (res.statusCode === 200) {
          var obj;
          try {
            obj = JSON.parse(data);
          } catch (err) {
            err.message = 'http request to ' + serviceUrl + ' returned ' +
                          'unparseable JSON: ' + err.message;
            log.caught('httpServiceFunction.req.on.end.callback',
                       log.NO_CLIENT_ID, err);
            log.entry('httpServiceFunction.callback', log.NO_CLIENT_ID);
            log.log('parms', log.NO_CLIENT_ID, 'err:', err);
            callback(err);
            log.exit('httpServiceFunction.callback', log.NO_CLIENT_ID, null);
          }
          if (obj) {
            log.entry('httpServiceFunction.callback', log.NO_CLIENT_ID);
            log.log('parms', log.NO_CLIENT_ID, 'service:', obj.service);
            callback(undefined, obj.service);
            log.exit('httpServiceFunction.callback', log.NO_CLIENT_ID, null);
          }
        } else {
          var err = new Error();
          err.message = 'http request to ' + serviceUrl + ' failed with a ' +
                        'status code of ' + res.statusCode;
          if (data) err.message += ': ' + data;
          log.log('error', log.NO_CLIENT_ID, err);
          log.entry('httpServiceFunction.callback', log.NO_CLIENT_ID);
          log.log('parms', log.NO_CLIENT_ID, 'err:', err);
          callback(err);
          log.exit('httpServiceFunction.callback', log.NO_CLIENT_ID, null);
        }
        log.exit('httpServiceFunction.req.on.end.callback', log.NO_CLIENT_ID,
                 null);
      });
      log.exit('httpServiceFunction.req.callback', log.NO_CLIENT_ID, null);
    }).on('error', function(err) {
      err.message = 'http request to ' + serviceUrl + ' failed ' +
                    'with an error: ' + err.message;
      log.log('error', log.NO_CLIENT_ID, err);
      log.entry('httpServiceFunction.callback', log.NO_CLIENT_ID);
      log.log('parms', log.NO_CLIENT_ID, 'err:', err);
      callback(err);
      log.exit('httpServiceFunction.callback', log.NO_CLIENT_ID, null);
    });
    req.setTimeout(5000, function() {
      var err = new Error('http request to ' + serviceUrl + ' timed out ' +
          'after 5000 milliseconds');
      log.log('error', log.NO_CLIENT_ID, err);
      log.entry('httpServiceFunction.callback', log.NO_CLIENT_ID);
      log.log('parms', log.NO_CLIENT_ID, 'err:', err);
      callback(err);
      log.exit('httpServiceFunction.callback', log.NO_CLIENT_ID, null);
    });
    req.end();

    log.exit('httpServiceFunction', log.NO_CLIENT_ID, null);
  };

  log.exit('getHttpServiceFunction', log.NO_CLIENT_ID, httpServiceFunction);
  return httpServiceFunction;
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
  log.entry('Client.constructor', log.NO_CLIENT_ID);
  log.log('parms', log.NO_CLIENT_ID, 'service:', service);
  log.log('parms', log.NO_CLIENT_ID, 'id:', id);
  log.log('parms', log.NO_CLIENT_ID, 'user:', user);
  log.log('parms', log.NO_CLIENT_ID,
          'password:', password ? '********' : password);

  EventEmitter.call(this);

  var err, msg;

  // Ensure the service is an Array or Function
  var serviceList, serviceFunction;
  if (service instanceof Function) {
    serviceFunction = service;
  } else if (typeof service === 'string') {
    var serviceUrl = url.parse(service);
    if (serviceUrl.protocol === 'http:' || serviceUrl.protocol === 'https:') {
      serviceFunction = getHttpServiceFunction(service);
    } else if (serviceUrl.protocol === 'file:') {
      if (serviceUrl.host.length > 0 && serviceUrl.host !== 'localhost') {
        msg = 'service contains unsupported file URI of ' + service +
            ', only file:///path or file://localhost/path are supported.';
        err = new Error(msg);
        log.throw('Client.constructor', log.NO_CLIENT_ID, err);
        throw err;
      }
      serviceFunction = getFileServiceFunction(serviceUrl.path);
    }
  }
  if (!serviceFunction) {
    serviceList = generateServiceList(service);
  }

  // If client id has not been specified then generate an id
  if (!id) id = 'AUTO_' + uuid.v4().substring(0, 7);

  // If the client id is incorrectly formatted then throw an error
  if (id.length > 48) {
    msg = "Client identifier '" + id + "' is longer than the maximum ID " +
          'length of 48.';
    err = new RangeError(msg);
    log.throw('Client.constructor', log.NO_CLIENT_ID, err);
    throw err;
  }

  id = String(id);

  // currently client ids are restricted, reject any invalid ones
  for (var i in id) {
    if (validClientIdChars.indexOf(id[i]) == -1) {
      msg = "Client Identifier '" + id + "' contains invalid char: " + id[i];
      err = new Error(msg);
      log.throw('Client.constructor', log.NO_CLIENT_ID, err);
      throw err;
    }
  }

  // User/password must either both be present, or both be absent.
  if ((user && !password) || (!user && password)) {
    err = new TypeError('both user and password properties ' +
                        'must be specified together');
    log.throw('Client.constructor', id, err);
    throw err;
  }
  // Save the required data as client fields
  this.serviceFunction = serviceFunction;
  this.serviceList = serviceList;
  this.id = id;

  log.entry('proton.createMessenger', this.id);
  // Initialize ProtonMessenger with auth details
  if (user) {
    // URI encode username and password before passing them to proton
    var usr = encodeURIComponent(String(user));
    var pw = encodeURIComponent(String(password));
    this.messenger = proton.createMessenger(id, usr, pw);
  } else {
    this.messenger = proton.createMessenger(id);
  }
  log.exit('proton.createMessenger', this.id, null);

  // Set the initial state to disconnected
  this.state = 'disconnected';
  this.service = undefined;
  //the first connect, set to false after connect and back to true on disconnect
  this.firstConnect = true;

  // List of message subscriptions
  this.subscriptions = [];

  // List of outstanding send operations waiting to be accepted, settled, etc
  // by the listener.
  this.outstandingSends = [];

  log.exit('Client.constructor', this.id, this);
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
  log.entry('Client.connect', this.id);

  if (callback && (typeof callback !== 'function')) {
    var err = new TypeError('Callback must be a function');
    log.throw('Client.connect', this.id, err);
    throw err;
  }

  // Performs the connect
  var performConnect = function(client, callback) {
    log.entry('Client.connect.performConnect', client.id);

    var currentState = client.getState();
    // if we are not disconnected or disconnecting return with the client object
    if (currentState !== 'disconnected') {
      if (currentState === 'disconnecting') {
        setImmediate(function() {
          stillDisconnecting(client, callback);
        });

        log.exit('Client.connect.performConnect', client.id, null);
        return;
      } else {
        process.nextTick(function() {
          if (callback) {
            log.entry('Client.connect.performConnect.callback', client.id);
            callback(undefined);
            log.exit('Client.connect.performConnect.callback', client.id, null);
          }
        });

        log.exit('Client.connect.performConnect', client.id, client);
        return client;
      }
    }

    client.state = 'connecting';

    // Obtain the list of services for connect and connect to one of the
    // services, retrying until a connection can be established
    if (client.serviceFunction instanceof Function) {
      client.serviceFunction(function(err, service) {
        if (err) {
          log.entry('Client.connect.performConnect.serviceFunction.callback',
                    client.id);
          callback(err);
          log.exit('Client.connect.performConnect.serviceFunction.callback',
              client.id, null);
        } else {
          try {
            client.serviceList = generateServiceList(service);
            client.connectToService(callback);
          } catch (err) {
            log.entry('Client.connect.performConnect.serviceFunction.callback',
                      client.id);
            callback(err);
            log.exit('Client.connect.performConnect.serviceFunction.callback',
                client.id, null);
          }
        }
      });
    } else {
      client.connectToService(callback);
    }

    log.exit('Client.connect.performConnect', client.id, null);
    return;
  };

  var client = this;

  var stillDisconnecting = function(client, callback) {
    log.entry('stillDisconnecting', client.id);

    if (client.getState() === 'disconnecting') {
      setImmediate(function() {
        stillDisconnecting(client, callback);
      });
    } else {
      process.nextTick(function() {
        performConnect(client, callback);
      });
    }

    log.exit('stillDisconnecting', client.id, null);
  };

  process.nextTick(function() {
    performConnect(client, callback);
  });

  log.exit('Client.connect', client.id, client);
  return client;
};


/**
* Function to connect to the service, trys each available service
* in turn. If none can connect it emits an error, waits and
* attempts to connect again. Callback happens once a successful
* connect/reconnect occurs.
* @param {connectCallback}
*  - callback called when connect/reconnect happens
*/
Client.prototype.connectToService = function(callback) {
  var client = this;
  log.entry('Client.connectToService', client.id);

  if (client.getState() === 'disconnecting' ||
      client.getState() === 'disconnected') {
    if (callback) {
      log.entry('Client.connectToService.callback', client.id);
      callback(new Error('connect aborted due to disconnect'));
      log.exit('Client.connectToService.callback', client.id, null);
    }
    log.exit('Client.connectToService', client.id, null);
    return;
  }

  var connected = false;
  var error;

  // Try each service in turn until we can successfully connect, or exhaust
  // the list
  var serviceList = client.serviceList;
  if (!error) {
    for (var i = 0; i < serviceList.length; i++) {
      try {
        var service = serviceList[i];
        log.log('data', client.id, 'attempting connect to: ' + service);
        var rc = client.messenger.connect(service);
        if (rc) {
          error = new Error(client.messenger.getLastErrorText());
          log.log('data', client.id, 'failed to connect to: ' + service +
              ' due to error: ' + error);
        } else {
          log.log('data', client.id, 'successfully connected to: ' +
              service);
          client.service = service;
          connected = true;
          break;
        }
      } catch (err) {
        // Should not get here.
        // Means that messenger.connect has been called in an invalid way
        error = err;
        log.caught('Client.connectToService', client.id, err);
        log.ffdc('Client.connectToService', 'ffdc001', client.id, err);
        log.throw('Client.connectToService', client.id, err);
        throw err;
      }
    }
  }

  // If we've successfully connected then we're done, otherwise we'll retry
  if (connected) {
    // Indicate that we're connected
    client.state = 'connected';
    var statusClient;
    if (client.firstConnect) {
      statusClient = 'connected';
      client.firstConnect = false;
    } else {
      statusClient = 'reconnected';
    }

    process.nextTick(function() {
      log.log('emit', client.id, statusClient);
      client.emit(statusClient);
    });

    if (callback) {
      process.nextTick(function() {
        log.entry('Client.connectToService.callback', client.id);
        callback.apply(client);
        log.exit('Client.connectToService.callback', client.id, null);
      });
    }

    // Setup heartbeat timer to ensure that while connected we send heartbeat
    // frames to keep the connection alive, when required.
    var remoteIdleTimeout =
        client.messenger.getRemoteIdleTimeout(client.service);
    var heartbeatInterval = remoteIdleTimeout > 0 ?
        remoteIdleTimeout / 2 : remoteIdleTimeout;
    log.log('data', client.id, 'set heartbeatInterval to: ', heartbeatInterval);
    if (heartbeatInterval > 0) {
      var performHeartbeat = function(client, heartbeatInterval) {
        log.entry('Client.connectToService.performHeartbeat', client.id);
        if (client.messenger) {
          client.messenger.work(0);
          client.heartbeatTimeout = setTimeout(performHeartbeat,
              heartbeatInterval, client, heartbeatInterval);
        }
        log.exit('Client.connectToService.performHeartbeat', client.id);
      };
      client.heartbeatTimeout = setTimeout(performHeartbeat, heartbeatInterval,
          client, heartbeatInterval);
    }

  } else {
    // We've tried all services without success. Pause for a while before
    // trying again
    // TODO 10 seconds is an arbitrary value, need to review if this is
    // appropriate. Timeout should be adjusted based on reconnect algo.
    log.log('emit', client.id, 'error', error);
    client.emit('error', error);
    client.state = 'retrying';
    log.log('data', client.id, 'trying connect again after 10 seconds');
    var retry = function() { client.connectToService(callback); };

    // if client is using serviceFunction, re-generate the list of services
    // TODO: merge these copy & paste
    if (client.serviceFunction instanceof Function) {
      client.serviceFunction(function(err, service) {
        if (err) {
          log.log('emit', client.id, 'error', err);
          client.emit('error', err);
        } else {
          client.serviceList = generateServiceList(service);
          setTimeout(retry, CONNECT_RETRY_INTERVAL);
        }
      });
    } else {
      setTimeout(retry, CONNECT_RETRY_INTERVAL);
    }
  }

  log.exit('Client.connectToService', client.id, null);
  return;
};

/**
 * @param {function(object)}
 *          disconnectCallback - callback, passed an error object if something
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
  log.entry('Client.disconnect', this.id);

  var client = this;

  // Performs the disconnect
  var performDisconnect = function(client, callback) {
    log.entry('Client.disconnect.performDisconnect', client.id);

    client.state = 'disconnecting';

    // Only disconnect when all outstanding send operations are complete
    if (client.outstandingSends.length === 0) {
      var messenger = client.messenger;
      if (messenger && !messenger.stopped) {
        messenger.stop();
        if (client.heartbeatTimeout) clearTimeout(client.heartbeatTimeout);
      }

      // Indicate that we've disconnected
      client.state = 'disconnected';
      process.nextTick(function() {
        log.log('emit', client.id, 'disconnected');
        client.emit('disconnected');
        client.firstConnect = true;
      });
      if (callback) {
        process.nextTick(function() {
          log.entry('Client.disconnect.performDisconnect.callback', client.id);
          callback.apply(client);
          log.exit('Client.disconnect.performDisconnect.callback', client.id,
                   null);
        });
      }

      log.exit('Client.disconnect.performDisconnect', client.id, null);
      return;
    }

    // try disconnect again
    setImmediate(performDisconnect, client, callback);

    log.exit('Client.disconnect.performDisconnect', client.id, null);
  };

  if (callback && !(callback instanceof Function)) {
    var err = new TypeError('callback must be a function');
    log.throw('Client.disconnect', client.id, err);
    throw err;
  }

  //just return if already disconnected or in the process of disconnecting
  if (client.getState() === 'disconnected' ||
      client.getState() === 'disconnecting') {
    process.nextTick(function() {
      if (callback) {
        log.entry('Client.disconnect.callback', client.id);
        callback.apply(client);
        log.exit('Client.disconnect.callback', client.id, null);
      }
    });

    log.exit('Client.disconnect', client.id, client);
    return client;
  }

  process.nextTick(function() {
    performDisconnect(client, callback);
  });

  log.exit('Client.disconnect', client.id, client);
  return client;
};


/**
 * Reconnects the client to the MQ Light service, implicitly closing any
 * subscriptions that the client has open. The 'reconnected' event will be
 * emitted once the client has reconnected.
 * <p>
 * TODO: Flesh this out for reconnects after a connection is broken.
 *
 * @return {Object} The instance of client that it is invoked on - allowing
 *          for chaining of other method calls on the client object.
 */
Client.prototype.reconnect = function() {
  var client = this;
  log.entry('Client.reconnect', client.id);

  if (client.getState() !== 'connected') {
    if (client.getState() === 'disconnected' ||
        client.getState() === 'disconnecting') {
      log.exit('Client.reconnect', client.id, null);
      return undefined;
    } else if (client.getState() === 'retrying') {
      log.exit('Client.reconnect', client.id, client);
      return client;
    }
  }
  client.state = 'retrying';

  // stop the messenger to free the object then attempt a reconnect
  var messenger = client.messenger;
  if (messenger && !messenger.stopped) {
    messenger.stop();
    if (client.heartbeatTimeout) clearTimeout(client.heartbeatTimeout);
  }

  var reestablishSubsList = [];
  // clear the subscriptions list, if the cause of the reconnect happens during
  // check for messages we need a 0 length so it will check once reconnected.
  while (client.subscriptions.length > 0) {
    reestablishSubsList.push(client.subscriptions.pop());
  }
  // also clear any left over outstanding sends
  while (client.outstandingSends.length > 0) {
    client.outstandingSends.pop();
  }

  var resubscribe = function() {
    log.entry('Client.reconnect.resubscribe', client.id);
    while (reestablishSubsList.length > 0) {
      var sub = reestablishSubsList.pop();
      client.subscribe(sub.topicPattern, sub.share, sub.options,
          function(err, pattern) {
            //if err we don't wanto 'lose' subs in the reestablish list add to
            //clients subscriptions list so the next reconnect picks them up.
            if (err) {
              client.subscriptions.push(sub);
              //rather than keep looping add the rest of the loop to
              //subscriptions here so we don't try another subscribe
              while (reestablishSubsList.length > 0) {
                client.subscriptions.push(reestablishSubsList.pop());
              }
            }
          });
    }
    log.exit('Client.reconnect.resubscribe');
  };
  // if client is using serviceFunction, re-generate the list of services
  // TODO: merge these copy & paste
  if (client.serviceFunction instanceof Function) {
    client.serviceFunction(function(err, service) {
      if (err) {
        log.log('emit', client.id, 'error', err);
        client.emit('error', err);
      } else {
        setImmediate(function() {
          client.serviceList = generateServiceList(service);
          client.connectToService.apply(client, [resubscribe]);
        });
      }
    });
  } else {
    setImmediate(function() {
      client.connectToService.apply(client, [resubscribe]);
    });
  }

  log.exit('Client.reconnect', client.id, client);
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
  log.log('data', this.id, 'Client.getState:', state);
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
  log.entry('Client.send', this.id);

  var err;

  // Validate the passed parameters
  if (!topic) {
    err = new TypeError('Cannot send to undefined topic');
    log.throw('Client.send', this.id, err);
    throw err;
  } else {
    topic = String(topic);
  }
  log.log('parms', this.id, 'topic:', topic);
  log.log('parms', this.id, 'data: typeof', typeof data);
  if (data === undefined) {
    err = new TypeError('Cannot send undefined data');
    log.throw('Client.send', this.id, err);
    throw err;
  } else if (data instanceof Function) {
    err = new TypeError('Cannot send a function');
    log.throw('Client.send', this.id, err);
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
  if (options !== undefined) {
    if (typeof options == 'object') {
      log.log('parms', this.id, 'options:', options);
    } else {
      err = new TypeError('options must be an object type not a ' +
                          (typeof options) + ')');
      log.throw('Client.send', this.id, err);
      throw err;
    }
  }

  var qos = exports.QOS_AT_MOST_ONCE;
  if (options) {
    if ('qos' in options) {
      if (options.qos === exports.QOS_AT_MOST_ONCE) {
        qos = exports.QOS_AT_MOST_ONCE;
      } else if (options.qos === exports.QOS_AT_LEAST_ONCE) {
        qos = exports.QOS_AT_LEAST_ONCE;
      } else {
        err = new TypeError("options:qos value '" + options.qos +
                            "' is invalid must evaluate to 0 or 1");
        log.throw('Client.send', this.id, err);
        throw err;
      }
    }
  }

  // Validate the callback parameter, when specified
  // (and must be specified for QoS of ALO)
  if (callback) {
    if (!(callback instanceof Function)) {
      err = new TypeError('callback must be a function type');
      log.throw('Client.send', this.id, err);
      throw err;
    }
  } else if (qos === exports.QOS_AT_LEAST_ONCE) {
    err = new TypeError('callback must be specified when options:qos value ' +
                        'of 1 (at least once) is specified');
    log.throw('Client.send', this.id, err);
    throw err;
  }

  // Ensure we have attempted a connect
  if (!this.hasConnected()) {
    err = new Error('not connected');
    log.throw('Client.send', this.id, err);
    throw err;
  }

  // Send the data as a message to the specified topic
  var client = this;
  var messenger = client.messenger;
  var protonMsg;
  try {
    log.entry('proton.createMessage', client.id);
    protonMsg = proton.createMessage();
    log.exit('proton.createMessage', client.id, protonMsg);
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
    messenger.put(protonMsg, qos);
    messenger.send();

    // Record that a send operation is in progress
    var localMessageId = uuid.v4();
    client.outstandingSends.push(localMessageId);

    // setup a timer to trigger the callback once the msg has been sent, or
    // immediately if no message to be sent
    var untilSendComplete = function(protonMsg, localMessageId, sendCallback) {
      log.entry('Client.send.utilSendComplete', client.id);

      try {
        var complete = false;
        var err, index;
        if (!messenger.stopped) { // if still connected
          var status = messenger.status(protonMsg);
          switch (status) {
            case PN_STATUS_ACCEPTED:
            case PN_STATUS_SETTLED:
              messenger.settle(protonMsg);
              complete = true;
              break;
            case PN_STATUS_REJECTED:
              complete = true;
              err = new Error('send failed - message was rejected');
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
          }

          // If complete then invoke the callback, when specified
          if (complete) {
            index = client.outstandingSends.indexOf(localMessageId);
            if (index >= 0) client.outstandingSends.splice(index, 1);
            if (sendCallback) {
              var body = protonMsg.body;
              setImmediate(function() {
                log.entry('Client.send.utilSendComplete.callback', client.id);
                sendCallback.apply(client, [err, topic, body, options]);
                log.exit('Client.send.utilSendComplete.callback', client.id,
                         null);
              });
            }
            protonMsg.destroy();

            log.exit('Client.send.utilSendComplete', client.id, null);
            return;
          }

          // message not sent yet, so check again in a second or so
          messenger.send();
          setImmediate(untilSendComplete, protonMsg, localMessageId,
                       sendCallback);
        } else {
          // TODO Not sure we can actually get here (so FFDC?)
          index = client.outstandingSends.indexOf(localMessageId);
          if (index >= 0) client.outstandingSends.splice(index, 1);
          if (sendCallback) {
            err = new Error('send may have not completed due to disconnect');
            log.entry('Client.send.utilSendComplete.callback', client.id);
            sendCallback.apply(client, [err, topic, protonMsg.body, options]);
            log.exit('Client.send.utilSendComplete.callback', client.id, null);
          }
          protonMsg.destroy();

          log.exit('Client.send.utilSendComplete', client.id, null);
          return;
        }
      } catch (e) {
        log.caught('Client.send.utilSendComplete', client.id, e);
        //error condition so won't retry send remove from list of unsent
        index = client.outstandingSends.indexOf(localMessageId);
        if (index >= 0) client.outstandingSends.splice(index, 1);
        client.disconnect();
        process.nextTick(function() {
          if (sendCallback) {
            log.entry('Client.send.utilSendComplete.callback', client.id);
            sendCallback.apply(client, [e, topic, protonMsg.body, options]);
            log.exit('Client.send.utilSendComplete.callback', client.id, null);
          }
          if (e) {
            log.log('emit', client.id, 'error', e);
            client.emit('error', e);
          }
        });
      }

      log.exit('Client.send.utilSendComplete', client.id, null);
    };
    // start the timer to trigger it to keep sending until msg has sent
    setImmediate(untilSendComplete, protonMsg, localMessageId, callback);
  } catch (err) {
    log.caught('Client.send', client.id, err);
    //error condition so won't retry send need to remove it from list of unsent
    var index = client.outstandingSends.indexOf(localMessageId);
    if (index >= 0) client.outstandingSends.splice(index, 1);
    process.nextTick(function() {
      if (callback) {
        log.entry('Client.send.callback', client.id);
        callback(err, protonMsg);
        log.exit('Client.send.callback', client.id, null);
      }
      log.log('emit', client.id, 'error', err);
      client.emit('error', err);
      client.reconnect();
    });
  }

  log.exit('Client.send', this.id, null);
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
  log.entryLevel('entry_often', 'checkForMessages', client.id);
  var messenger = client.messenger;
  if (client.state !== 'connected' || client.subscriptions.length === 0) {
    log.exitLevel('exit_often', 'checkForMessages', client.id);
    return;
  }

  try {
    var messages = messenger.receive(50);
    if (messages.length > 0) {
      log.log('debug', client.id, 'received %d messages', messages.length);

      for (var msg = 0, tot = messages.length; msg < tot; msg++) {
        log.log('debug', client.id, 'processing message %d', msg);
        var protonMsg = messages[msg];

        // if body is a JSON'ified object, try to parse it back to a js obj
        var data;
        if (protonMsg.contentType === 'application/json') {
          try {
            data = JSON.parse(protonMsg.body);
          } catch (_) {
            log.caughtLevel('entry_often', 'checkForMessages', client.id, _);
            console.warn(_);
          }
        } else {
          data = protonMsg.body;
        }

        var topic =
            decodeURIComponent(url.parse(protonMsg.address).path.substring(1));
        var autoConfirm = true;
        var qos = exports.QOS_AT_MOST_ONCE;
        for (var i = 0; i < client.subscriptions.length; i++) {
          if (client.subscriptions[i].address === protonMsg.address) {
            qos = client.subscriptions[i].qos;
            if (qos === exports.QOS_AT_LEAST_ONCE) {
              autoConfirm = client.subscriptions[i].autoConfirm;
            }
            break;
          }
        }

        var delivery = {
          message: {
            properties: {
              contentType: protonMsg.contentType
            },
            topic: topic,
            confirmDelivery: autoConfirm ? function() {
              log.entry('message.confirmDelivery.auto', this.id);
              log.log('data', this.id, 'delivery:', delivery);
              log.exit('message.confirmDelivery.auto', this.id, null);
            } : function() {
              log.entry('message.confirmDelivery', this.id);
              log.log('data', this.id, 'delivery:', delivery);
              if (protonMsg) {
                messenger.settle(protonMsg);
                protonMsg.destroy();
                protonMsg = undefined;
              }
              log.exit('message.confirmDelivery', this.id, null);
            }
          }
        };
        var linkAddress = protonMsg.linkAddress;
        if (linkAddress) {
          delivery.destination = {};
          var split = linkAddress.split(':', 3);
          if (linkAddress.indexOf('share:') === 0) {
            delivery.destination.share = split[1];
            delivery.destination.topicPattern = split[2];
          } else {
            delivery.destination.topicPattern = split[1];
          }
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
            log.log('emit', client.id,
                    'malformed', protonMsg.body, delivery);
            client.emit('malformed', protonMsg.body, delivery);
          } else {
            protonMsg.destroy();
            var err = new Error('No listener for "malformed" event.');
            log.throwLevel('exit_often', 'checkForMessages', this.id, err);
            throw err;
          }
        } else {
          log.log('emit', client.id, 'message', delivery);
          try {
            client.emit('message', data, delivery);
          } catch (err) {
            log.caughtLevel('entry_often', 'checkForMessages', client.id, err);
            log.log('emit', client.id, 'error', err);
            client.emit('error', err);
          }
        }
        if (qos === exports.QOS_AT_MOST_ONCE) {
          messenger.accept(protonMsg);
          messenger.settle(protonMsg);
          protonMsg.destroy();
        } else {
          if (autoConfirm) {
            messenger.settle(protonMsg);
            protonMsg.destroy();
          }
        }
      }
    }
  } catch (err) {
    log.caughtLevel('entry_often', 'checkForMessages', client.id, err);
    process.nextTick(function() {
      log.log('emit', client.id, 'error', err);
      client.emit('error', err);
      client.reconnect();
    });
  }

  log.exitLevel('exit_often', 'checkForMessages', client.id);

  setImmediate(function() {
    if (client.state === 'connected') {
      client.checkForMessages.apply(client);
    }
  });
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
 * Constructs a subscription object and starts the emission of message events
 * each time a message arrives, at the MQ Light service, that matches
 * topic pattern.
 *
 * @param {String}
 *          topicPattern used to match against the <code>address</code>
 *          attribute of messages to determine if a copy of the message should
 *          be delivered to the <code>Destination</code>.
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
 *           If the topic pattern parameter is undefined.
 */
Client.prototype.subscribe = function(topicPattern, share, options, callback) {
  log.entry('Client.subscribe', this.id);
  log.log('parms', this.id, 'topicPattern:', topicPattern);

  // Must accept at least one option - and first option is always a
  // topicPattern.
  if (arguments.length === 0) {
    err = new TypeError("You must specify a 'topicPattern' argument");
    log.throw('Client.subscribe', this.id, err);
    throw err;
  }
  if (!topicPattern) {
    err = new TypeError("You must specify a 'topicPattern' argument");
    log.throw('Client.subscribe', this.id, err);
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
      err = new Error("share argument value '" + share + "' is invalid " +
                      "because it contains a colon (\':\') character");
      log.throw('Client.subscribe', this.id, err);
      throw err;
    }
    share = 'share:' + share + ':';
  } else {
    share = 'private:';
  }

  // Validate the options parameter, when specified
  if (options !== undefined) {
    if (typeof options == 'object') {
      log.log('parms', this.id, 'options:', options);
    } else {
      err = new TypeError('options must be an object type not a ' +
                          (typeof options) + ')');
      log.throw('Client.subscribe', this.id, err);
      throw err;
    }
  }

  var qos = exports.QOS_AT_MOST_ONCE;
  var autoConfirm = true;
  if (options) {
    if ('qos' in options) {
      if (options.qos === exports.QOS_AT_MOST_ONCE) {
        qos = exports.QOS_AT_MOST_ONCE;
      } else if (options.qos === exports.QOS_AT_LEAST_ONCE) {
        qos = exports.QOS_AT_LEAST_ONCE;
      } else {
        err = new TypeError("options:qos value '" + options.qos +
                            "' is invalid must evaluate to 0 or 1");
        log.throw('Client.subscribe', this.id, err);
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
        log.throw('Client.subscribe', this.id, err);
        throw err;
      }
    }
  }

  log.log('parms', this.id, 'share:', share);
  log.log('parms', this.id, 'options:', options);

  if (callback && !(callback instanceof Function)) {
    err = new TypeError('callback must be a function type');
    log.throw('Client.subscribe', this.id, err);
    throw err;
  }

  // Ensure we have attempted a connect
  if (!this.hasConnected()) {
    err = new Error('not connected');
    log.throw('Client.subscribe', this.id, err);
    throw err;
  }

  // Subscribe using the specified topic pattern and share options
  var messenger = this.messenger;
  var address = this.getService() + '/' + share + topicPattern;
  var client = this;

  var err;
  try {
    messenger.subscribe(address, qos);

    // If this is the first subscription to be added, schedule a request to
    // start the polling loop to check for messages arriving
    if (client.subscriptions.length === 0) {
      process.nextTick(function() {
        client.checkForMessages();
      });
    }

    // Add address to list of subscriptions, replacing any existing entry
    var subscriptionAddress = this.getService() + '/' + topicPattern;
    for (var i = 0; i < client.subscriptions.length; i++) {
      if (client.subscriptions[i].address === subscriptionAddress) {
        client.subscriptions.splice(i, 1);
        break;
      }
    }
    client.subscriptions.push({ address: subscriptionAddress,
      qos: qos, autoConfirm: autoConfirm, topicPattern: topicPattern,
      share: originalShareValue, options: options });

  } catch (e) {
    log.caught('Client.subscribe', client.id, e);
    err = e;
  }

  setImmediate(function() {
    if (callback) {
      log.entry('Client.subscribe.callback', client.id);
      log.log('parms', client.id, 'err:', err, 'topicPattern:', topicPattern,
              'originalShareValue:', originalShareValue);
      callback.apply(client, [err, topicPattern, originalShareValue]);
      log.exit('Client.subscribe.callback', client.id, null);
    }
    if (err) {
      log.log('emit', client.id, 'error', err);
      client.emit('error', err);
      client.reconnect();
    }
  });

  log.exit('Client.subscribe', client.id, client);
  return client;
};

/* ------------------------------------------------------------------------- */
