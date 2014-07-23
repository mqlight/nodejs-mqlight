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
 * Constructs a new Client object in the started state.
 * <p>
 * Options:
 * <ul>
 * <li>
 * service  - Required: when an instance of String this is a URL to connect to.
 *            When an instance of Array this is an array of URLs to connect to
 *            - each will be tried in turn until either a connection is
 *            successfully established to one of the URLs, or all of the URLs
 *            have been tried. When an instance of Function is specified for
 *            this argument, then function is invoked each time the client
 *            wants to establish a connection (e.g. for any of the state
 *            transitions, on the state diagram shown earlier on this page,
 *            which lead to the 'connected' state) and is supplied a single
 *            parameter containing a callback in the form function(err,
 *            service). The function must supply the service URL as either an
 *            instance of String or Array to the callback function and this
 *            will be treated in the same manner described previously.
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
 * </li>
 * <li>
 * sslTrustCertificate - Optional; the SSL trust certificate to use when
 *            authentication is required for the MQ Light server. Only
 *            valid when service specifies the amqps scheme.
 * </li>
  * <li>
 * sslVerifyName - Optional; Whether or not to additionally check the
 *            MQ Light server's common name in the certificate matches
 *            the actual server's DNS name. Only valid when the
 *            sslTrustCertificate option is specified.
 *            valid values: true or false (default: true).
 * </li>
 * </ul>
 *
 * @param {Object}
 *          options - (optional) map of options for the client.
 * @param {Function}
 *          callback - (optional) callback, invoked when the client has
 *                     attained 'started' or 'stopped' state.
 * @return {Object} The created Client object.
 * @this Client
 */
exports.createClient = function(options, callback) {
  logger.entry('createClient', logger.NO_CLIENT_ID);

  if (!options) {
    var err = new TypeError('options object missing');
    logger.throw('createClient', logger.NO_CLIENT_ID, err);
    throw err;
  }

  if (callback && (typeof callback !== 'function')) {
    var err = new TypeError('Callback argument must be a function');
    logger.throw('Client.createClient', this.id, err);
    throw err;
  }

  var securityOptions = {
    propertyUser: options.user,
    propertyPassword: options.password,
    urlUser: undefined,
    urlPassword: undefined,
    sslTrustCertificate: options.sslTrustCertificate,
    sslVerifyName: options.sslVerifyName,
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

    if (client && client.state == STATE_STARTED) {
      try {
        client.messenger.send();
        client.stop();
      } catch (err) {
        logger.caught('createClient.on.exit', client.id, err);
      }
    }

    logger.exit('createClient.on.exit', logger.NO_CLIENT_ID, null);
  });

  process.nextTick(function() {
    client.performConnect(function(err) {
      if (callback) callback.apply(client, [err, client]);
    }, true);
  });

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
          callback(undefined, obj.service);
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

  if (typeof serviceUrl !== 'string') {
    var err = new TypeError('serviceUrl must be a string type');
    logger.throw('getHttpServiceFunction', logger.NO_CLIENT_ID, err);
    throw err;
  }

  var httpServiceFunction = function(callback) {
    logger.entry('httpServiceFunction', logger.NO_CLIENT_ID);

    var req = http.request(serviceUrl, function(res) {
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
            err.message = 'http request to ' + serviceUrl + ' returned ' +
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
            callback(undefined, obj.service);
            logger.exit('httpServiceFunction.callback', logger.NO_CLIENT_ID,
                        null);
          }
        } else {
          var err = new Error();
          err.message = 'http request to ' + serviceUrl + ' failed with a ' +
                        'status code of ' + res.statusCode;
          if (data) err.message += ': ' + data;
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
      err.message = 'http request to ' + serviceUrl + ' failed ' +
                    'with an error: ' + err.message;
      logger.log('error', logger.NO_CLIENT_ID, err);
      logger.entry('httpServiceFunction.callback', logger.NO_CLIENT_ID);
      logger.log('parms', logger.NO_CLIENT_ID, 'err:', err);
      callback(err);
      logger.exit('httpServiceFunction.callback', logger.NO_CLIENT_ID, null);
    });
    req.setTimeout(5000, function() {
      var err = new Error('http request to ' + serviceUrl + ' timed out ' +
          'after 5000 milliseconds');
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
 *          service  - Required; when an instance of String this is a URL to
 *          connect to.  When an instance of Array this is an array of URLs to
 *          connect to - each will be tried in turn until either a connection
 *          is successfully established to one of the URLs, or all of the URLs
 *          have been tried. When an instance of Function is specified for this
 *          argument, then function is invoked each time the client wants to
 *          establish a connection (e.g. for any of the state transitions, on
 *          the state diagram shown earlier on this page, which lead to the
 *          'connected' state) and is supplied a single parameter containing a
 *          callback in the form function(err, service). The function must
 *          supply the service URL as either an instance of String or Array to
 *          the callback function and this will be treated in the same manner
 *          described previously.
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
      serviceFunction = getHttpServiceFunction(service);
    } else if (serviceUrl.protocol === 'file:') {
      if (serviceUrl.host.length > 0 && serviceUrl.host !== 'localhost') {
        msg = 'service contains unsupported file URI of ' + service +
            ', only file:///path or file://localhost/path are supported.';
        err = new Error(msg);
        logger.throw('Client.constructor', logger.NO_CLIENT_ID, err);
        throw err;
      }
      serviceFunction = getFileServiceFunction(serviceUrl.path);
    }
  }

  // Add generateServiceList function to client with embedded securityOptions
  this.generateServiceList = function(service) {
    var client = this;
    logger.entry('generateServiceList', client.id);
    logger.log('parms', client.id, 'service:',
        String(service).replace(/:[^\/:]+@/g, ':********@'));
    logger.log('parms', client.id, 'securityOptions:',
               securityOptions.toString());

    var err;

    // Ensure the service is an Array
    var inputServiceList = [];
    if (!service) {
      err = new Error('service is undefined');
      logger.throw('generateServiceList', client.id, err);
      throw err;
    } else if (service instanceof Function) {
      err = new TypeError('service cannot be a function');
      logger.throw('generateServiceList', client.id, err);
      throw err;
    } else if (service instanceof Array) {
      if (service.length === 0) {
        err = new Error('service array is empty');
        logger.throw('generateServiceList', client.id, err);
        throw err;
      }
      inputServiceList = service;
    } else if (typeof service === 'string') {
      inputServiceList[0] = service;
    } else {
      err = new TypeError('service must be a string or array type');
      logger.throw('generateServiceList', client.id, err);
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
          err = new Error(msg);
          logger.throw('generateServiceList', client.id, err);
          throw err;
        }
        if (securityOptions.propertyUser && authUser &&
            (securityOptions.propertyUser !== authUser)) {
          msg = "User name supplied as 'user' property (" +
                securityOptions.propertyUser + ') does not match user name ' +
                "supplied via a URL passed via the 'service' property (" +
                authUser + ')';
          err = new Error(msg);
          logger.throw('generateServiceList', client.id, err);
          throw err;
        }
        if (securityOptions.propertyPassword && authPassword &&
            (securityOptions.propertyPassword !== authPassword)) {
          msg = "Password supplied as 'password' property does not match a " +
                "password supplied via a URL passed via the 'service' property";
          err = new Error(msg);
          logger.throw('generateServiceList', client.id, err);
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
          err = new Error(msg);
          logger.throw('generateServiceList', client.id, err);
          throw err;
        } else if (securityOptions.urlPassword !== authPassword) {
          msg = "URLs supplied via the 'service' property contain " +
                'inconsistent password values';
          err = new Error(msg);
          logger.throw('generateServiceList', client.id, err);
          throw err;
        }
      }

      // Check we are trying to use the amqp protocol
      if (!protocol || protocol !== 'amqp:' && protocol !== 'amqps:') {
        msg = "Unsupported URL '" + inputServiceList[i] +
              "' specified for service. Only the amqp or amqps protocol are " +
              'supported.';
        err = new Error(msg);
        logger.throw('generateServiceList', client.id, err);
        throw err;
      }
      // Check we have a hostname
      var host = serviceUrl.host;
      if (!host || !serviceUrl.hostname) {
        msg = "Unsupported URL ' " + inputServiceList[i] + "' specified for " +
              'service. Must supply a hostname.';
        err = new Error(msg);
        logger.throw('generateServiceList', client.id, err);
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
        err = new Error(msg);
        logger.throw('generateServiceList', client.id, err);
        throw err;
      }

      serviceList[i] = protocol + '//' + host;
      if (!serviceUrl.port) {
        serviceList[i] += ':' + port;
      }
    }

    logger.exit('generateServiceList', client.id,
                [
                  'serviceList:',
                  String(serviceList).replace(/:[^\/:]+@/g, ':********@'),
                  'securityOptions:', securityOptions.toString()
                ]);
    return serviceList;
  };

  // performs the connect
  this.performConnect = function(callback, newClient) {
    var client = this;
    logger.entry('Client.connect.performConnect', client.id, newClient);

    if (!newClient) {
      var currentState = client.state;
      // if we are not stopped or stopping state return with the client object
      if (currentState !== STATE_STOPPED && currentState !== STATE_RETRYING) {
        if (currentState === STATE_STOPPING) {
          var stillDisconnecting = function(client, callback) {
            logger.entry('stillDisconnecting', client.id);

            if (client.state === STATE_STOPPING) {
              setImmediate(function() {
                stillDisconnecting(client, callback);
              });
            } else {
              process.nextTick(function() {
                client.performConnect(callback, newClient);
              });
            }

            logger.exit('stillDisconnecting', client.id, null);
          };

          setImmediate(function() {
            stillDisconnecting(client, callback);
          });
          logger.exit('Client.connect.performConnect', client.id, null);
          return;
        } else {
          process.nextTick(function() {
            if (callback) {
              logger.entry('Client.connect.performConnect.callback', client.id);
              callback.apply(client);
              logger.exit('Client.connect.performConnect.callback',
                          client.id, null);
            }
          });

          logger.exit('Client.connect.performConnect', client.id, client);
          return client;
        }
      }

      if (client.state === STATE_STOPPED) {
        client.state = STATE_STARTING;
      }

      // If the messenger is not already stopped then something has gone wrong
      if (client.messenger && !client.messenger.stopped) {
        var err = new Error('messenger is not stopped');
        logger.ffdc('Client.connect.performConnect', 'ffdc002', client.id, err);
        logger.throw('Client.connect.performConnect', client.id, err);
        throw err;
      }
    } else {
      client.state = STATE_STARTING;
    }

    // Obtain the list of services for connect and connect to one of the
    // services, retrying until a connection can be established
    var serviceList;
    if (client.serviceFunction instanceof Function) {
      client.serviceFunction(function(err, service) {
        if (err) {
          logger.entry('Client.connect.performConnect.serviceFunction.callback',
                       client.id);
          callback.apply(client, [err]);
          logger.exit('Client.connect.performConnect.serviceFunction.callback',
              client.id, null);
        } else {
          try {
            serviceList =
                client.generateServiceList.apply(client, [service]);
            client.connectToService(serviceList, callback);
          } catch (err) {
            var name = 'Client.connect.performConnect.serviceFunction.callback';
            logger.entry(name, client.id);
            callback.apply(client, [err]);
            logger.exit(name, client.id, null);
          }
        }
      });
    } else {
      try {
        serviceList = client.generateServiceList.apply(client, [service]);
        client.connectToService(serviceList, callback);
      } catch (err) {
        if (callback) {
          process.nextTick(function() {
            logger.entry('Client.connect.performConnect.callback', client.id);
            callback.apply(client, [err]);
            logger.exit('Client.connect.performConnect.callback', client.id,
                        null);
          });
        }
      }
    }

    logger.exit('Client.connect.performConnect', client.id, null);
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
  this.connectToService = function(serviceList, callback) {
    var client = this;
    logger.entry('Client.connectToService', client.id);

    if (client.state === STATE_STOPPING ||
        client.state === STATE_STOPPED) {
      if (callback) {
        logger.entry('Client.connectToService.callback', client.id);
        callback(new Error('connect aborted due to stop'));
        logger.exit('Client.connectToService.callback', client.id, null);
      }
      logger.exit('Client.connectToService', client.id, null);
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
            auth = undefined;
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
          logger.log('data', client.id, 'attempting to connect to: ' + logUrl);

          var connectUrl = url.parse(service);
          // remove any path elements from the URL (for ipv6 which appends /)
          if (connectUrl.path) {
            var hrefLength = connectUrl.href.length - connectUrl.path.length;
            connectUrl.href = connectUrl.href.substr(0, hrefLength);
            connectUrl.pathname = connectUrl.path = null;
          }
          var rc = client.messenger.connect(connectUrl,
                                            securityOptions.sslTrustCertificate,
                                            securityOptions.sslVerifyName);
          if (rc) {
            error = new Error(client.messenger.getLastErrorText());
            logger.log('data', client.id, 'failed to connect to: ' + logUrl +
                       ' due to error: ' + error);
          } else {
            logger.log('data', client.id, 'successfully connected to: ' +
                logUrl);
            client.service = serviceList[i];
            connected = true;
            break;
          }
        } catch (err) {
          // should never get here, as it means that messenger.connect has been
          // called in an invalid way, so FFDC
          error = err;
          logger.caught('Client.connectToService', client.id, err);
          logger.ffdc('Client.connectToService', 'ffdc001', client.id, err);
          logger.throw('Client.connectToService', client.id, err);
          throw err;
        }
      }
    }

    // If we've successfully connected then we're done, otherwise we'll retry
    if (connected) {
      // Indicate that we're started
      client.state = STATE_STARTED;
      var eventToEmit;
      if (client.firstStart) {
        eventToEmit = 'started';
        client.firstStart = false;
        //could be queued actions so need to process those here. On reconnect
        //this would be done via the callback we set, first connect its the
        //users callback so won't process anything.
        logger.log('data', client.id, 'first start since being stopped');
        processQueuedActions.apply(client);
      } else {
        eventToEmit = 'restarted';
      }

      process.nextTick(function() {
        logger.log('emit', client.id, eventToEmit);
        client.emit(eventToEmit);
      });

      if (callback) {
        process.nextTick(function() {
          logger.entry('Client.connectToService.callback', client.id);
          callback.apply(client);
          logger.exit('Client.connectToService.callback', client.id, null);
        });
      }

      // Setup heartbeat timer to ensure that while connected we send heartbeat
      // frames to keep the connection alive, when required.
      var remoteIdleTimeout =
          client.messenger.getRemoteIdleTimeout(client.service);
      var heartbeatInterval = remoteIdleTimeout > 0 ?
          remoteIdleTimeout / 2 : remoteIdleTimeout;
      logger.log('data', client.id, 'set heartbeatInterval to: ',
                 heartbeatInterval);
      if (heartbeatInterval > 0) {
        var performHeartbeat = function(client, heartbeatInterval) {
          logger.entry('Client.connectToService.performHeartbeat', client.id);
          if (client.messenger) {
            client.messenger.work(0);
            client.heartbeatTimeout = setTimeout(performHeartbeat,
                heartbeatInterval, client, heartbeatInterval);
          }
          logger.exit('Client.connectToService.performHeartbeat',
                      client.id, null);
        };
        client.heartbeatTimeout = setTimeout(performHeartbeat,
                                             heartbeatInterval,
                                             client, heartbeatInterval);
      }

    } else {
      // We've tried all services without success. Pause for a while before
      // trying again
      client.state = STATE_RETRYING;
      var retry = function() {
        logger.entryLevel('entry_often', 'retry', client.id);
        if (!client.isStopped()) {
          client.performConnect.apply(client, [callback, false]);
        }
        logger.entryLevel('exit_often', 'retry', client.id);
      };

      // TODO 10 seconds is an arbitrary value, need to review if this is
      // appropriate. Timeout should be adjusted based on reconnect algo.
      logger.log('data', client.id, 'trying to connect again ' +
                 ((CONNECT_RETRY_INTERVAL > 0) ? ('after ' +
          CONNECT_RETRY_INTERVAL /
          1000 + ' seconds') :
          'immediately'));
      setTimeout(retry, CONNECT_RETRY_INTERVAL);
      logger.log('emit', client.id, 'error', error);
      client.emit('error', error);
    }

    logger.exit('Client.connectToService', client.id, null);
    return;
  };

  // If client id has not been specified then generate an id
  if (!id) id = 'AUTO_' + uuid.v4().substring(0, 7);

  // If the client id is incorrectly formatted then throw an error
  if (id.length > 48) {
    msg = "Client identifier '" + id + "' is longer than the maximum ID " +
          'length of 48.';
    err = new RangeError(msg);
    logger.throw('Client.constructor', logger.NO_CLIENT_ID, err);
    throw err;
  }

  id = String(id);

  // currently client ids are restricted, reject any invalid ones
  for (var i in id) {
    if (validClientIdChars.indexOf(id[i]) == -1) {
      msg = "Client Identifier '" + id + "' contains invalid char: " + id[i];
      err = new Error(msg);
      logger.throw('Client.constructor', logger.NO_CLIENT_ID, err);
      throw err;
    }
  }

  // User/password must either both be present, or both be absent.
  if ((securityOptions.propertyUser && !securityOptions.propertyPassword) ||
      (!securityOptions.propertyUser && securityOptions.propertyPassword)) {
    err = new TypeError('both user and password properties ' +
                        'must be specified together');
    logger.throw('Client.constructor', id, err);
    throw err;
  }

  // Valdate the ssl security options
  if (securityOptions.sslVerifyName !== undefined) {
    if (!(securityOptions.sslVerifyName === true ||
          securityOptions.sslVerifyName === false)) {
      err = new TypeError("sslVerifyName value '" +
                          securityOptions.sslVerifyName +
                          "' is invalid. Must evaluate to true or false");
      logger.throw('Client.constructor', this.id, err);
      throw err;
    }
  }
  if (securityOptions.sslTrustCertificate !== undefined) {
    if (typeof securityOptions.sslTrustCertificate !== 'string') {
      err = new TypeError("sslTrustCertificate value '" +
                          securityOptions.sslTrustCertificate +
                          "' is invalid. Must be of type String");
      logger.throw('Client.constructor', this.id, err);
      throw err;
    }
    if (!fs.existsSync(securityOptions.sslTrustCertificate)) {
      err = new TypeError("The file specified for sslTrustCertificate '" +
                          securityOptions.sslTrustCertificate +
                          "' does not exist");
      logger.throw('Client.constructor', this.id, err);
      throw err;
    }
    if (!fs.statSync(securityOptions.sslTrustCertificate).isFile()) {
      err = new TypeError("The file specified for sslTrustCertificate '" +
                          securityOptions.sslTrustCertificate +
                          "' is not a regular file");
      logger.throw('Client.constructor', this.id, err);
      throw err;
    }
  }

  // Save the required data as client fields
  this.serviceFunction = serviceFunction;
  this.serviceList = serviceList;
  this.id = id;

  logger.entry('proton.createMessenger', this.id);
  this.messenger = proton.createMessenger(this.id);
  logger.exit('proton.createMessenger', this.id, null);

  // Set the initial state to starting
  this.state = STATE_STARTING;
  this.service = undefined;
  // the first start, set to false after start and back to true on stop
  this.firstStart = true;

  // List of message subscriptions
  this.subscriptions = [];
  // List of queued subscriptions
  this.queuedSubscriptions = [];
  // List of queued unsubscribe requests
  this.queuedUnsubscribes = [];

  // List of outstanding send operations waiting to be accepted, settled, etc
  // by the listener.
  this.outstandingSends = [];
  // List of queuedSends for resending on a reconnect
  this.queuedSends = [];

  // No drain event initially required
  this.drainEventRequired = false;

  if (!serviceFunction) {
    serviceList = this.generateServiceList.apply(this, [service]);
  }
  logger.exit('Client.constructor', this.id, this);
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
Client.prototype.start = function(callback) {
  logger.entry('Client.start', this.id);

  if (callback && (typeof callback !== 'function')) {
    var err = new TypeError('Callback must be a function');
    logger.throw('Client.start', this.id, err);
    throw err;
  }

  var client = this;

  process.nextTick(function() {
    client.performConnect(callback, false);
  });

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
  if (client.messenger) {
    stopped = client.messenger.stop();
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
Client.prototype.stop = function(callback) {
  logger.entry('Client.stop', this.id);

  var client = this;

  // Performs the disconnect
  var performDisconnect = function(client, callback) {
    logger.entry('Client.stop.performDisconnect', client.id);

    client.state = STATE_STOPPING;

    // Only disconnect when all outstanding send operations are complete
    if (client.outstandingSends.length === 0) {
      stopMessenger(client, function(client, callback) {
        logger.entry('Client.stop.performDisconnect.stopProcessing',
            client.id);

        if (client.heartbeatTimeout) clearTimeout(client.heartbeatTimeout);

        // clear queuedSends as we are disconnecting
        while (client.queuedSends.length > 0) {
          var msg = client.queuedSends.pop();
          // call the callback in error as we have disconnected
          process.nextTick(function() {
            logger.entry('Client.stop.performDisconnect.' +
                'stopProcessing.queuedSendCallback', client.id);
            msg.callback(new Error('send aborted due to disconnect'));
            logger.exit('Client.stop.performDisconnect.' +
                'stopProcessing.queuedSendCallback', client.id, null);
          });
        }
        // clear the active subscriptions list as we were asked to disconnect
        logger.log('data', client.id, 'client.subscriptions:',
                   client.subscriptions);
        while (client.subscriptions.length > 0) {
          client.subscriptions.pop();
        }

        // Indicate that we've disconnected
        client.state = STATE_STOPPED;
        process.nextTick(function() {
          logger.log('emit', client.id, 'stopped');
          client.emit('stopped');
          client.firstStart = true;
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

  //just return if already disconnected or in the process of disconnecting
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
 * subscriptions that the client has open. The 'reconnected' event will be
 * emitted once the client has reconnected.
 * <p>
 * TODO: Flesh this out for reconnects after a connection is broken.
 *
 * @param {client} client - the client object to reconnect
 * @return {Object} The instance of client that it is invoked on - allowing
 *          for chaining of other method calls on the client object.
 */
var reconnect = function(client) {
  if (client === undefined || client.constructor !== Client) {
    logger.entry('Client.reconnect', logger.NO_CLIENT_ID);
    logger.log('parms', logger.NO_CLIENT_ID, 'client:', client);
    logger.exit('Client.reconnect', logger.NO_CLIENT_ID, undefined);
    return;
  }
  logger.entry('Client.reconnect', client.id);
  if (client.state !== STATE_STARTED) {
    if (client.isStopped()) {
      logger.exit('Client.reconnect', client.id, null);
      return undefined;
    } else if (client.state === STATE_RETRYING) {
      logger.exit('Client.reconnect', client.id, client);
      return client;
    }
  }
  client.state = STATE_RETRYING;

  // stop the messenger to free the object then attempt a reconnect
  stopMessenger(client, function(client) {
    logger.entry('Client.reconnect.stopProcessing', client.id);

    if (client.heartbeatTimeout) clearTimeout(client.heartbeatTimeout);

    // clear the subscriptions list, if the cause of the reconnect happens
    // during check for messages we need a 0 length so it will check once
    // reconnected.
    logger.log('data', client.id, 'client.subscriptions:',
               client.subscriptions);
    while (client.subscriptions.length > 0) {
      client.queuedSubscriptions.push(client.subscriptions.pop());
    }
    // also clear any left over outstanding sends
    while (client.outstandingSends.length > 0) {
      client.outstandingSends.pop();
    }
    client.performConnect.apply(client, [processQueuedActions, false]);

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
* Called on reconnect or first connect to process any
* actions that may have been queued.
* @this should be set to the client object that has
* connected or reconnected
*
* @param {Error} err if an error occurred in the performConnect function that
* calls this callback.
*/
var processQueuedActions = function(err) {
  // this set to the appropriate client via apply call in performConnect
  var client = this;
  if (client === undefined || client.constructor !== Client) {
    logger.entry('processQueuedActions', 'client was not set');
    logger.exit('processQueuedActions', 'client not set returning', null);
    return;
  }
  logger.entry('processQueuedActions', client.id);
  logger.log('parms', client.id, 'err:', err);
  logger.log('data', client.id, 'client.state:', client.state);

  if (!err) {
    logger.log('data', client.id, 'client.queuedSubscriptions',
               client.queuedSubscriptions);
    while (client.queuedSubscriptions.length > 0 &&
            client.state === STATE_STARTED) {
      var sub = client.queuedSubscriptions.pop();
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
    logger.log('data', client.id, 'client.queuedUnsubscribes',
               client.queuedUnsubscribes);
    while (client.queuedUnsubscribes.length > 0 &&
            client.state === STATE_STARTED) {
      var rm = client.queuedUnsubscribes.pop();
      if (rm.noop) {
        // no-op, so just trigger the callback without actually unsubscribing
        if (rm.callback) {
          rm.callback.apply(client, []);
        }
      } else {
        client.unsubscribe(rm.topicPattern, rm.share, rm.options, rm.callback);
      }
    }
    logger.log('data', client.id, 'client.queuedSends',
               client.queuedSends);
    while (client.queuedSends.length > 0 &&
            client.state === STATE_STARTED) {
      var msg = client.queuedSends.pop();
      client.send(msg.topic, msg.data, msg.options, msg.callback);
    }
  }
  logger.exit('processQueuedActions', client.id, null);
};


/**
 * @return {String} The identifier associated with the client. This will
 * either be: a) the identifier supplied as the id property of the options
 * object supplied to the mqlight.createClient() method, or b) an automatically
 * generated identifier if the id property was not specified when the client
 * was created.
 */
Object.defineProperty(Client, 'id', {
  get: function() {
    return this.id;
  }
});


/**
 * @return {String} The URL of the service to which the client is currently
 * connected (when the client is in 'connected') - otherwise (for all other
 * client states) undefined is returned.
 */
Object.defineProperty(Client, 'service', {
  get: function() {
    return this.state === STATE_STARTED ?
        this.service : undefined;
  }
});


/**
 * @return {String} The current state of the client - can will be one of the
 * following string values: 'connected', 'connecting', 'disconnected',
* 'disconnecting', or 'retrying'.
 */
Object.defineProperty(Client, 'state', {
  get: function() {
    logger.log('data', this.id, 'Client.state', this.state);
    return this.state;
  }
});


/**
 * @return {Boolean} <code>true</code> true if in disconnected or
 * disconnecting state, <code>false</code> otherwise.
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
 * @return {Boolean} <code>true</code> if this message was sent, or is the next
 *           to be sent, or <code>false</code> if the message was queued in user
 *           memory, due to either a backlog of messages, or because the client
 *           was not in a connected state. When the backlog of messages is
 *           cleared, <code>drain</code> will be emitted.
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
  if (data === undefined) {
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
  if (options !== undefined) {
    if (typeof options == 'object') {
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
        err = new TypeError("options:qos value '" + options.qos +
                            "' is invalid must evaluate to 0 or 1");
        logger.throw('Client.send', this.id, err);
        throw err;
      }
    }

    if ('ttl' in options) {
      ttl = Number(options.ttl);
      if (Number.isNaN(ttl) || !Number.isFinite(ttl) || ttl <= 0) {
        err = new TypeError("options:ttl value '" +
            options.ttl +
            "' is invalid, must be an unsigned non-zero integer number");
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
    err = new TypeError('callback must be specified when options:qos value ' +
                        'of 1 (at least once) is specified');
    logger.throw('Client.send', this.id, err);
    throw err;
  }

  // Ensure we have attempted a connect
  if (this.isStopped()) {
    err = new Error('not started');
    logger.throw('Client.send', this.id, err);
    throw err;
  }

  // Ensure we are not retrying otherwise queue message and return
  if (this.state === STATE_RETRYING || this.state === STATE_STARTING) {
    this.queuedSends.push({
      topic: topic,
      data: data,
      options: options,
      callback: callback
    });
    this.drainEventRequired = true;
    logger.exit('Client.send', this.id, false);
    return false;
  }

  // Send the data as a message to the specified topic
  var client = this;
  var messenger = client.messenger;
  var protonMsg;
  try {
    logger.entry('proton.createMessage', client.id);
    protonMsg = proton.createMessage();
    logger.exit('proton.createMessage', client.id, protonMsg);
    protonMsg.address = this.service;
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
    messenger.put(protonMsg, qos);
    messenger.send();

    // Record that a send operation is in progress
    var localMessageId = uuid.v4();
    client.outstandingSends.push(localMessageId);

    // setup a timer to trigger the callback once the msg has been sent, or
    // immediately if no message to be sent
    var untilSendComplete = function(protonMsg, localMessageId, sendCallback) {
      logger.entry('Client.send.untilSendComplete', client.id);

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

          // If complete then do final processing of this message.
          if (complete) {
            index = client.outstandingSends.indexOf(localMessageId);
            if (index >= 0) client.outstandingSends.splice(index, 1);

            // If previously send() returned false and now the backlog of
            // messages is cleared, emit a drain event.
            logger.log('debug', client.id,
                       'outstandingSends:', client.outstandingSends.length);
            if (client.drainEventRequired &&
                (client.outstandingSends.length <= 1)) {
              client.drainEventRequired = false;
              process.nextTick(function() {
                logger.log('emit', client.id, 'drain');
                client.emit('drain');
              });
            }

            // invoke the callback, if specified
            if (sendCallback) {
              var body = protonMsg.body;
              setImmediate(function() {
                logger.entry('Client.send.untilSendComplete.callback',
                             client.id);
                sendCallback.apply(client, [err, topic, body, options]);
                logger.exit('Client.send.untilSendComplete.callback', client.id,
                            null);
              });
            }
            protonMsg.destroy();

            logger.exit('Client.send.untilSendComplete', client.id, null);
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
            logger.entry('Client.send.untilSendComplete.callback', client.id);
            sendCallback.apply(client, [err, topic, protonMsg.body, options]);
            logger.exit('Client.send.untilSendComplete.callback',
                        client.id, null);
          }
          protonMsg.destroy();

          logger.exit('Client.send.untilSendComplete', client.id, null);
          return;
        }
      } catch (e) {
        logger.caught('Client.send.untilSendComplete', client.id, e);
        //error condition so won't retry send remove from list of unsent
        index = client.outstandingSends.indexOf(localMessageId);
        if (index >= 0) client.outstandingSends.splice(index, 1);
        // an error here could still mean the message made it over
        // so we only care about at least once messages
        if (qos === exports.QOS_AT_LEAST_ONCE) {
          client.queuedSends.push({
            topic: topic,
            data: data,
            options: options,
            callback: callback
          });
        }
        process.nextTick(function() {
          if (sendCallback) {
            if (qos === exports.QOS_AT_MOST_ONCE) {
              //we don't know if an at most once message made it across
              //call the callback with undefined to indicate success to
              //avoid user resending on error.
              logger.entry('Client.send.untilSendComplete.callback', client.id);
              sendCallback.apply(client, [undefined, topic, protonMsg.body,
                options]);
              logger.exit('Client.send.untilSendComplete.callback', client.id,
                  null);
            }
          }
          if (e) {
            logger.log('emit', client.id, 'error', e);
            client.emit('error', e);
            if (!(e instanceof TypeError)) {
              reconnect(client);
            }
          }
        });
      }
      logger.exit('Client.send.untilSendComplete', client.id, null);
    };
    // start the timer to trigger it to keep sending until msg has sent
    setImmediate(untilSendComplete, protonMsg, localMessageId, callback);

    // If we have a backlog of messages, then record the need to emit a drain
    // event later to indicate the backlog has been cleared.
    logger.log('debug', client.id,
               'outstandingSends:', client.outstandingSends.length);
    if (client.outstandingSends.length <= 1) {
      nextMessage = true;
    } else {
      client.drainEventRequired = true;
    }
  } catch (err) {
    logger.caught('Client.send', client.id, err);
    // error condition so won't retry send need to remove it from list of
    // unsent
    var index = client.outstandingSends.indexOf(localMessageId);
    if (index >= 0) client.outstandingSends.splice(index, 1);
    if (qos === exports.QOS_AT_LEAST_ONCE) {
      client.queuedSends.push({
        topic: topic,
        data: data,
        options: options,
        callback: callback
      });
    }
    setImmediate(function() {
      if (callback) {
        if (qos === exports.QOS_AT_MOST_ONCE) {
          logger.entry('Client.send.callback', client.id);
          callback(err, topic, protonMsg.body, options);
          logger.exit('Client.send.callback', client.id, null);
        }
      }
      logger.log('emit', client.id, 'error', err);
      client.emit('error', err);
      if (!(err instanceof TypeError)) {
        reconnect(client);
      }
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
  var messenger = client.messenger;
  if (client.state !== STATE_STARTED || client.subscriptions.length === 0 ||
      client.listeners('message').length === 0) {
    logger.exitLevel('exit_often', 'checkForMessages', client.id);
    return;
  }

  try {
    var messages = messenger.receive(50);
    if (messages.length > 0) {
      logger.log('debug', client.id, 'received %d messages', messages.length);

      for (var msg = 0, tot = messages.length; msg < tot; msg++) {
        logger.log('debug', client.id, 'processing message %d', msg);
        var protonMsg = messages[msg];

        // if body is a JSON'ified object, try to parse it back to a js obj
        var data;
        if (protonMsg.contentType === 'application/json') {
          try {
            data = JSON.parse(protonMsg.body);
          } catch (_) {
            logger.caughtLevel('entry_often', 'checkForMessages', client.id, _);
            console.warn(_);
          }
        } else {
          data = protonMsg.body;
        }

        var topic =
            decodeURIComponent(url.parse(protonMsg.address).path.substring(1));
        var autoConfirm = true;
        var qos = exports.QOS_AT_MOST_ONCE;
        var matchedSubs = client.subscriptions.filter(function(el) {
          // 1 added to length to account for the / we add
          var addressNoService = el.address.slice(client.service.length + 1);
          //possible to have 2 matches work out whether this is
          //for a share or private topic
          if (el.share === undefined &&
              protonMsg.linkAddress.indexOf('private:') === 0) {
            //slice off private: and compare to the no service address
            var linkNoPrivShare = protonMsg.linkAddress.slice(8);
            if (addressNoService === linkNoPrivShare) {
              return el;
            }
          } else if (el.share !== undefined &&
                     protonMsg.linkAddress.indexOf('share:') === 0) {
            //starting after the share: look for the next : denoting the end
            //of the share name and get everything past that
            var linkNoShare = protonMsg.linkAddress.slice(
                                  protonMsg.linkAddress.indexOf(':', 7) + 1);
            if (addressNoService === linkNoShare) {
              return el;
            }
          }
        });
        //should only ever be one entry in matchedSubs
        if (matchedSubs[0] !== undefined) {
          qos = matchedSubs[0].qos;
          if (qos === exports.QOS_AT_LEAST_ONCE) {
            autoConfirm = matchedSubs[0].autoConfirm;
          }
          ++matchedSubs[0].unconfirmed;
        } else {
          //shouldn't get here
          var err = new Error('No listener matched for this message: ' +
                              data + ' going to address: ' + protonMsg.address);
          throw err;
        }

        var delivery = {
          message: {
            properties: {
              contentType: protonMsg.contentType
            },
            topic: topic,
            confirmDelivery: autoConfirm ? function() {
              logger.entry('message.confirmDelivery.auto', this.id);
              logger.log('data', this.id, 'delivery:', delivery);
              logger.exit('message.confirmDelivery.auto', this.id, null);
            } : function() {
              logger.entry('message.confirmDelivery', this.id);
              logger.log('data', this.id, 'delivery:', delivery);
              var subscription = matchedSubs[0];
              if (protonMsg) {
                messenger.settle(protonMsg);
                --subscription.unconfirmed;
                ++subscription.confirmed;
                logger.log('data', this.id, '[credit,unconfirmed,confirmed]:',
                           '[' + subscription.credit + ',' +
                           subscription.unconfirmed + ',' +
                           subscription.confirmed + ']');
                // Ask to flow more messages if >= 80% of available credit
                // (e.g. not including unconfirmed messages) has been used.
                // Or we have just confirmed everything.
                var available = subscription.credit - subscription.unconfirmed;
                if ((available / subscription.confirmed) <= 1.25 ||
                    (subscription.unconfirmed == 0 &&
                     subscription.confirmed > 0)) {
                  messenger.flow(client.service + '/' + protonMsg.linkAddress,
                                 subscription.confirmed);
                  subscription.confirmed = 0;
                }
                protonMsg.destroy();
                protonMsg = undefined;
              }
              logger.exit('message.confirmDelivery', this.id, null);
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
            var err = new Error('No listener for "malformed" event.');
            logger.throwLevel('exit_often', 'checkForMessages', this.id, err);
            throw err;
          }
        } else {
          logger.log('emit', client.id, 'message', delivery);
          try {
            client.emit('message', data, delivery);
          } catch (err) {
            logger.caughtLevel('entry_often', 'checkForMessages',
                               client.id, err);
            logger.log('emit', client.id, 'error', err);
            client.emit('error', err);
          }
        }

        if (qos === exports.QOS_AT_MOST_ONCE) {
          messenger.accept(protonMsg);
        }
        if (qos === exports.QOS_AT_MOST_ONCE || autoConfirm) {
          messenger.settle(protonMsg);
          --matchedSubs[0].unconfirmed;
          ++matchedSubs[0].confirmed;
          logger.log('data', this.id, '[credit,unconfirmed,confirmed]:',
                     '[' + matchedSubs[0].credit + ',' +
                     matchedSubs[0].unconfirmed + ',' +
                     matchedSubs[0].confirmed + ']');
          // Ask to flow more messages if >= 80% of available credit
          // (e.g. not including unconfirmed messages) has been used.
          // Or we have just confirmed everything.
          var available = matchedSubs[0].credit - matchedSubs[0].unconfirmed;
          if ((available / matchedSubs[0].confirmed <= 1.25) ||
              (matchedSubs[0].unconfirmed == 0 &&
               matchedSubs[0].confirmed > 0)) {
            messenger.flow(client.service + '/' + protonMsg.linkAddress,
                           matchedSubs[0].confirmed);
            matchedSubs[0].confirmed = 0;
          }
          protonMsg.destroy();
        }
      }
    }
  } catch (err) {
    logger.caughtLevel('entry_often', 'checkForMessages', client.id, err);
    process.nextTick(function() {
      logger.log('emit', client.id, 'error', err);
      client.emit('error', err);
      if (!(err instanceof TypeError)) {
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
      err = new Error("share argument value '" + share + "' is invalid " +
                      "because it contains a colon (\':\') character");
      logger.throw('Client.subscribe', this.id, err);
      throw err;
    }
    share = 'share:' + share + ':';
  } else {
    share = 'private:';
  }
  logger.log('parms', this.id, 'share:', share);

  // Validate the options parameter, when specified
  if (options !== undefined) {
    if (typeof options == 'object') {
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
        err = new TypeError("options:qos value '" + options.qos +
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
        err = new TypeError("options:ttl value '" +
                            options.ttl +
                            "' is invalid, must be an unsigned integer number");
        logger.throw('Client.subscribe', this.id, err);
        throw err;
      }
      ttl = Math.round(ttl / 1000);
    }
    if ('credit' in options) {
      credit = Number(options.credit);
      if (Number.isNaN(credit) || !Number.isFinite(credit) || credit < 0 ||
          credit > 4294967295) {
        err = new TypeError("options:credit value '" +
                            options.credit +
                            "' is invalid, must be an unsigned integer number");
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
    err = new Error('not started');
    logger.throw('Client.subscribe', this.id, err);
    throw err;
  }

  // Subscribe using the specified topic pattern and share options
  var messenger = this.messenger;
  var address = this.service + '/' + share + topicPattern;
  var client = this;
  var subscriptionAddress = this.service + '/' + topicPattern;

  // if client is in the retrying state, then queue this subscribe request
  if (client.state === STATE_RETRYING || client.state === STATE_STARTING) {
    logger.log('data', client.id, 'client waiting for connection so queued ' +
               'subscription');
    // first check if its already there and if so remove old and add new
    for (var qs = 0; qs < client.queuedSubscriptions.length; qs++) {
      if (client.queuedSubscriptions[qs].address === subscriptionAddress &&
          client.queuedSubscriptions[qs].share === originalShareValue) {
        client.queuedSubscriptions.splice(qs, 1);
      }
    }
    client.queuedSubscriptions.push({
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
  try {
    messenger.subscribe(address, qos, ttl, credit);
  } catch (e) {
    logger.caught('Client.subscribe', client.id, e);
    err = e;
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
    if (!(err instanceof TypeError)) {
      logger.log('data', client.id, 'queued subscription and calling ' +
                 'reconnect');
      // error during subscribe so add to list of queued to resub
      client.queuedSubscriptions.push({
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
    // if no errors, add this to the stored list of subscriptions, replacing
    // any existing entry
    var isFirstSub = (client.subscriptions.length === 0);
    logger.log('data', client.id, 'isFirstSub:', isFirstSub);

    for (var i = 0; i < client.subscriptions.length; i++) {
      if (client.subscriptions[i].address === subscriptionAddress &&
          client.subscriptions[i].share === originalShareValue) {
        client.subscriptions.splice(i, 1);
        break;
      }
    }
    client.subscriptions.push({
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
 * Stops the flow of messages from a destination to this client. The client's
 * <code>message</code> callback will no longer be driven when messages arrive,
 * that match the pattern associate with the destination. The
 * <code>pattern</code> (and optional) <code>share</code> arguments must match
 * those specified when the destination was created by calling the original
 * <code>client.subscribe(...)</code> method.
 * <p>
 * The optional <code>options</code> argument can be used to specify how the
 * call to <code>client.unsubscribe(...)</code> behaves. If the
 * <code>options</code> argument has any of the following properties they will
 * be interpreted as follows:
 * <ul>
 * <li><code>ttl</code> - Optional, coerced to a <code>Number</code>, if
 * specified and must be equal to 0. If specified the client will reset the
 * destination's time to live to 0 as part of the unsubscribe operation. If
 * the destination is private to the client, then setting the TTL to zero will
 * ensure that the destination is deleted. If the destination is shared when
 * setting the TTL to zero, the destination will be deleted when no more
 * clients are associated with the destination.
 *
 * @param {String}
 *          topicPattern that was supplied in the previous call to subscribe.
 * @param {String}
 *          share (Optional) that was supplied in the previous call to
 *          subscribe.
 * @param {Object}
 *          options (Optional) The options argument accepts an object with
 *          properties set to customise the unsubscribe behaviour.
 * @param {function()}
 *          callback - (Optional) Invoked if the unsubscribe request has
 *          been processed successfully.
 * @return {@link Client} the instance of the client this was called on which
 * will emit 'message' events on arrival.
 * @throws {TypeError}
 *           If one of the specified parameters is of the wrong type or
 *           missing. Also thrown if the client is not subscribed to a
 *           subscription matching the given pattern (and share) arguments.
 * @throws {Error}
 *           If the topic pattern parameter is undefined.
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
      err = new Error("share argument value '" + share + "' is invalid " +
                      "because it contains a colon (\':\') character");
      logger.throw('Client.unsubscribe', this.id, err);
      throw err;
    }
    share = 'share:' + share + ':';
  } else {
    share = 'private:';
  }
  logger.log('parms', this.id, 'share:', share);

  // Validate the options parameter, when specified
  if (options !== undefined) {
    if (typeof options == 'object') {
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
        err = new TypeError("options:ttl value '" +
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
    err = new Error('not started');
    logger.throw('Client.unsubscribe', this.id, err);
    throw err;
  }

  // unsubscribe using the specified topic pattern and share options
  var messenger = this.messenger;
  var address = this.service + '/' + share + topicPattern;
  var client = this;
  var subscriptionAddress = this.service + '/' + topicPattern;

  var queueUnsubscribe = function() {
    // check if there's a queued subscribe for the same topic, if so mark that
    // as a no-op operation, so the callback is called but a no-op takes place
    // on reconnection
    var noop = false;
    for (var qs = 0; qs < client.queuedSubscriptions.length; qs++) {
      if (client.queuedSubscriptions[qs].address === subscriptionAddress &&
          client.queuedSubscriptions[qs].share === originalShareValue &&
          !(client.queuedSubscriptions[qs].noop)) {
        noop = client.queuedSubscriptions[qs].noop = true;
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
    client.queuedUnsubscribes.push({
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
  try {
    messenger.unsubscribe(address, ttl);

    if (callback) {
      process.nextTick(function() {
        logger.entry('Client.unsubscribe.callback', client.id);
        callback.apply(client, [undefined]);
        logger.exit('Client.unsubscribe.callback', client.id, null);
      });
    }
    // if no errors, remove this from the stored list of subscriptions
    for (var i = 0; i < client.subscriptions.length; i++) {
      if (client.subscriptions[i].address === subscriptionAddress &&
          client.subscriptions[i].share === originalShareValue) {
        client.subscriptions.splice(i, 1);
        break;
      }
    }
  } catch (err) {
    logger.caught('Client.unsubscribe', client.id, err);
    setImmediate(function() {
      logger.log('emit', client.id, 'error', err);
      client.emit('error', err);
    });
    if (!(err instanceof TypeError)) {
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
