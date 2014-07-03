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
  /**
  * exported for unittest purposes
  */
  exports.reconnect = reconnect;
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
 * @return {Object} The created Client object.
 */
exports.createClient = function(options) {
  logger.entry('createClient', logger.NO_CLIENT_ID);

  if (!options) {
    var err = new TypeError('options object missing');
    logger.throw('createClient', logger.NO_CLIENT_ID, err);
    throw err;
  }

  var securityOptions = {
    propertyUser: options.user,
    propertyPassword: options.password,
    urlUser: undefined,
    urlPassword: undefined,
    sslTrustCertificate: options.sslTrustCertificate,
    sslVerifyName:options.sslVerifyName,
    toString: function() {
      return '[\n' +
          ' propertyUser: ' + this.user + '\n' +
          ' propertyPassword: ' +
          (this.propertyPassword ? '********' : undefined) + '\n' +
          ' propertyUser: ' + this.propertyUser + '\n' +
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

    if (client && client.state == 'connected') {
      try {
        client.messenger.send();
        client.disconnect();
      } catch (err) {
        logger.caught('createClient.on.exit', client.id, err);
      }
    }

    logger.exit('createClient.on.exit', logger.NO_CLIENT_ID);
  });

  logger.exit('createClient', client.id, client);
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
 * @param {Object} securityOptions - Required; an object encapsulating the
 *          security sensitive options used to establish a connection.
 * @return {Array} Valid service URLs, with port number added as appropriate.
 * @throws TypeError
 *           If service is not a string or array type.
 * @throws Error
 *           if an unsupported or invalid URL specified.
 */
var generateServiceList = function(service, securityOptions) {
  logger.entry('generateServiceList', logger.NO_CLIENT_ID);
  logger.log('parms', logger.NO_CLIENT_ID, 'service:',
      String(service).replace(/:[^:]+@/, ':********@'));
  logger.log('parms', logger.NO_CLIENT_ID, 'securityOptions:', securityOptions);

  var err;

  // Ensure the service is an Array
  var inputServiceList = [];
  if (!service) {
    err = new Error('service is undefined');
    logger.throw('generateServiceList', logger.NO_CLIENT_ID, err);
    throw err;
  } else if (service instanceof Function) {
    err = new TypeError('service cannot be a function');
    logger.throw('generateServiceList', logger.NO_CLIENT_ID, err);
    throw err;
  } else if (service instanceof Array) {
    if (service.length === 0) {
      err = new Error('service array is empty');
      logger.throw('generateServiceList', logger.NO_CLIENT_ID, err);
      throw err;
    }
    inputServiceList = service;
  } else if (typeof service === 'string') {
    inputServiceList[0] = service;
  } else {
    err = new TypeError('service must be a string or array type');
    logger.throw('generateServiceList', logger.NO_CLIENT_ID, err);
    throw err;
  }

  /*
   * Validate the list of URLs for the service, inserting default values as
   * necessary Expected format for each URL is: amqp://host:port or
   * amqps://host:port (port is optional, defaulting to 5672 or 5671 as
   * appropriate)
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
    var authUser = undefined;
    var authPassword = undefined;

    // check for auth details
    if (auth) {

      if (auth.indexOf(':') >= 0) {
        authUser = String(auth).slice(0, auth.indexOf(':'));
        authPassword = String(auth).slice(auth.indexOf(':')+1);
      } else {
        msg = "URLs supplied via the 'service' property must specify both a" +
              'user name and a password value, or omit both values';
        err = new Error(msg);
        logger.throw('generateServiceList', logger.NO_CLIENT_ID, err);
        throw err;
      }
      if (securityOptions.propertyUser && authUser &&
          (securityOptions.propertyUser !== authUser)) {
        msg = "User name supplied as 'user' property (" +
              securityOptions.propertyUser + ') does not match user name ' +
              "supplied via a URL passed via the 'service' property (" +
              authUser + ')';
        err = new Error(msg);
        logger.throw('generateServiceList', logger.NO_CLIENT_ID, err);
        throw err;
      }
      if (securityOptions.propertyPassword && authPassword &&
          (securityOptions.propertyPassword !== authPassword)) {
        msg = "Password supplied as 'password' property does not match a " +
              "password supplied via a URL passed via the 'service' property";
        err = new Error(msg);
        logger.throw('generateServiceList', logger.NO_CLIENT_ID, err);
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
        logger.throw('generateServiceList', logger.NO_CLIENT_ID, err);
        throw err;
      } else if (securityOptions.urlPassword !== authPassword) {
        msg = "URLs supplied via the 'service' property contain " +
              'inconsistent password values';
        err = new Error(msg);
        logger.throw('generateServiceList', logger.NO_CLIENT_ID, err);
        throw err;
      }
    }

    // Check we are trying to use the amqp protocol
    if (!protocol || protocol !== 'amqp:' && protocol !== 'amqps:') {
      msg = "Unsupported URL '" + inputServiceList[i] +
            "' specified for service. Only the amqp or amqps protocol are " +
            'supported.';
      err = new Error(msg);
      logger.throw('generateServiceList', logger.NO_CLIENT_ID, err);
      throw err;
    }
    // Check we have a hostname
    if (!host) {
      msg = "Unsupported URL ' " + inputServiceList[i] + "' specified for " +
            'service. Must supply a hostname.';
      err = new Error(msg);
      logger.throw('generateServiceList', logger.NO_CLIENT_ID, err);
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
      logger.throw('generateServiceList', logger.NO_CLIENT_ID, err);
      throw err;
    }
    serviceList[i] = protocol + '//' + host + ':' + port;
  }

  logger.exit('generateServiceList', logger.NO_CLIENT_ID, serviceList);
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
             String(service).replace(/:[^:]+@/, ':********@'));
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
  if (!serviceFunction) {
    serviceList = generateServiceList(service, securityOptions);
  }

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
    if (!(typeof securityOptions.sslTrustCertificate === 'string')) {
      err = new TypeError("sslTrustCertificate value '" +
                          securityOptions.sslTrustCertificate +
                          "' is invalid. Must be of type String");
      logger.throw('Client.constructor', this.id, err);
      throw err;
    }
  }

  // Save the required data as client fields
  this.serviceFunction = serviceFunction;
  this.serviceList = serviceList;
  this.id = id;

  logger.entry('proton.createMessenger', this.id);
  // Initialize ProtonMessenger with auth details
  if (securityOptions.urlUser) {
    // URI encode username and password before passing them to proton
    var usr = encodeURIComponent(String(securityOptions.urlUser));
    var pw = encodeURIComponent(String(securityOptions.urlPassword));
    this.messenger = proton.createMessenger(id, usr, pw);
  } else if (securityOptions.properyUser) {
    var usr = encodeURIComponent(String(securityOptions.propertyUser));
    var pw = encodeURIComponent(String(securityOptions.propertyPassword));
    this.messenger = proton.createMessenger(id, usr, pw);
  } else {
    this.messenger = proton.createMessenger(id);
  }
  logger.exit('proton.createMessenger', this.id, null);

  // Save the security options, but exclude the password
  // as it will be cached in the messenger (and otherwise will be traced!).
  securityOptions.propertyPassword = undefined;
  securityOptions.urlPassword = undefined;
  this.securityOptions = securityOptions;

  // Set the initial state to disconnected
  this.state = 'disconnected';
  this.service = undefined;
  //the first connect, set to false after connect and back to true on disconnect
  this.firstConnect = true;

  // List of message subscriptions
  this.subscriptions = [];
  // List of queued subscriptions
  this.queuedSubscriptions = [];

  // List of outstanding send operations waiting to be accepted, settled, etc
  // by the listener.
  this.outstandingSends = [];
  // List of queuedSends for resending on a reconnect
  this.queuedSends = [];

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
Client.prototype.connect = function(callback) {
  logger.entry('Client.connect', this.id);

  if (callback && (typeof callback !== 'function')) {
    var err = new TypeError('Callback must be a function');
    logger.throw('Client.connect', this.id, err);
    throw err;
  }

  // Performs the connect
  var performConnect = function(client, callback) {
    logger.entry('Client.connect.performConnect', client.id);

    var currentState = client.state;
    // if we are not disconnected or disconnecting return with the client object
    if (currentState !== 'disconnected') {
      if (currentState === 'disconnecting') {
        setImmediate(function() {
          stillDisconnecting(client, callback);
        });

        logger.exit('Client.connect.performConnect', client.id, null);
        return;
      } else {
        process.nextTick(function() {
          if (callback) {
            logger.entry('Client.connect.performConnect.callback', client.id);
            callback(undefined);
            logger.exit('Client.connect.performConnect.callback',
                        client.id, null);
          }
        });

        logger.exit('Client.connect.performConnect', client.id, client);
        return client;
      }
    }

    client.state = 'connecting';

    // Obtain the list of services for connect and connect to one of the
    // services, retrying until a connection can be established
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
            client.serviceList =
                generateServiceList(service, client.securityOptions);
            client.connectToService(callback);
          } catch (err) {
            var name = 'Client.connect.performConnect.serviceFunction.callback';
            logger.entry(name, client.id);
            callback.apply(client, [err]);
            logger.exit(name, client.id, null);
          }
        }
      });
    } else {
      client.connectToService(callback);
    }

    logger.exit('Client.connect.performConnect', client.id, null);
    return;
  };

  var client = this;

  var stillDisconnecting = function(client, callback) {
    logger.entry('stillDisconnecting', client.id);

    if (client.state === 'disconnecting') {
      setImmediate(function() {
        stillDisconnecting(client, callback);
      });
    } else {
      process.nextTick(function() {
        performConnect(client, callback);
      });
    }

    logger.exit('stillDisconnecting', client.id, null);
  };

  process.nextTick(function() {
    performConnect(client, callback);
  });

  logger.exit('Client.connect', client.id, client);
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
  logger.entry('Client.connectToService', client.id);

  if (client.state === 'disconnecting' ||
      client.state === 'disconnected') {
    if (callback) {
      logger.entry('Client.connectToService.callback', client.id);
      callback(new Error('connect aborted due to disconnect'));
      logger.exit('Client.connectToService.callback', client.id, null);
    }
    logger.exit('Client.connectToService', client.id, null);
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
        logger.log('data', client.id, 'attempting connect to: ' + service);
        var rc = client.messenger.connect(service,
            client.securityOptions.sslTrustCertificate,
            client.securityOptions.sslVerifyName);
        if (rc) {
          error = new Error(client.messenger.getLastErrorText());
          logger.log('data', client.id, 'failed to connect to: ' + service +
              ' due to error: ' + error);
        } else {
          logger.log('data', client.id, 'successfully connected to: ' +
              service);
          client.service = service;
          connected = true;
          break;
        }
      } catch (err) {
        // Should not get here.
        // Means that messenger.connect has been called in an invalid way
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
    // Indicate that we're connected
    client.state = 'connected';
    var statusClient;
    if (client.firstConnect) {
      statusClient = 'connected';
      client.firstConnect = false;
      //could be queued actions so need to process those here. On reconnect
      //this would be done via the callback we set, first connect its the
      //users callback so won't process anything.
      logger.log('data', client.id, 'first connect since being disconnected');
      processQueuedActions.apply(client);
    } else {
      statusClient = 'reconnected';
    }

    process.nextTick(function() {
      logger.log('emit', client.id, statusClient);
      client.emit(statusClient);
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
        logger.exit('Client.connectToService.performHeartbeat', client.id);
      };
      client.heartbeatTimeout = setTimeout(performHeartbeat, heartbeatInterval,
          client, heartbeatInterval);
    }

  } else {
    // We've tried all services without success. Pause for a while before
    // trying again
    // TODO 10 seconds is an arbitrary value, need to review if this is
    // appropriate. Timeout should be adjusted based on reconnect algo.
    logger.log('emit', client.id, 'error', error);
    client.emit('error', error);
    client.state = 'retrying';
    logger.log('data', client.id, 'trying connect again after 10 seconds');
    var retry = function() { client.connectToService(callback); };

    // if client is using serviceFunction, re-generate the list of services
    // TODO: merge these copy & paste
    if (client.serviceFunction instanceof Function) {
      client.serviceFunction(function(err, service) {
        if (err) {
          logger.log('emit', client.id, 'error', err);
          client.emit('error', err);
        } else {
          client.serviceList =
              generateServiceList(service, client.securityOptions);
          setTimeout(retry, CONNECT_RETRY_INTERVAL);
        }
      });
    } else {
      setTimeout(retry, CONNECT_RETRY_INTERVAL);
    }
  }

  logger.exit('Client.connectToService', client.id, null);
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
  logger.entry('Client.disconnect', this.id);

  var client = this;

  // Performs the disconnect
  var performDisconnect = function(client, callback) {
    logger.entry('Client.disconnect.performDisconnect', client.id);

    client.state = 'disconnecting';

    // Only disconnect when all outstanding send operations are complete
    if (client.outstandingSends.length === 0) {
      var messenger = client.messenger;
      if (messenger && !messenger.stopped) {
        messenger.stop();
        if (client.heartbeatTimeout) clearTimeout(client.heartbeatTimeout);
      }
      //clear queuedSends as we are disconnecting
      while (client.queuedSends.length > 0) {
        var msg = client.queuedSends.pop();
        //call the callback in error as we have disconnected
        process.nextTick(function() {
          logger.entry('Client.disconnect.performDisconnect.queuedSendCallback',
              client.id);
          msg.callback(new Error('send aborted due to disconnect'));
          logger.exit('Client.disconnect.performDisconnect.queuedSendCallback',
              client.id, null);
        });
      }
      // Indicate that we've disconnected
      client.state = 'disconnected';
      process.nextTick(function() {
        logger.log('emit', client.id, 'disconnected');
        client.emit('disconnected');
        client.firstConnect = true;
      });
      if (callback) {
        process.nextTick(function() {
          logger.entry('Client.disconnect.performDisconnect.callback',
                       client.id);
          callback.apply(client);
          logger.exit('Client.disconnect.performDisconnect.callback', client.id,
                      null);
        });
      }

      logger.exit('Client.disconnect.performDisconnect', client.id, null);
      return;
    }

    // try disconnect again
    setImmediate(performDisconnect, client, callback);

    logger.exit('Client.disconnect.performDisconnect', client.id, null);
  };

  if (callback && !(callback instanceof Function)) {
    var err = new TypeError('callback must be a function');
    logger.throw('Client.disconnect', client.id, err);
    throw err;
  }

  //just return if already disconnected or in the process of disconnecting
  if (client.isDisconnected()) {
    process.nextTick(function() {
      if (callback) {
        logger.entry('Client.disconnect.callback', client.id);
        callback.apply(client);
        logger.exit('Client.disconnect.callback', client.id, null);
      }
    });

    logger.exit('Client.disconnect', client.id, client);
    return client;
  }

  process.nextTick(function() {
    performDisconnect(client, callback);
  });

  logger.exit('Client.disconnect', client.id, client);
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
function reconnect(client){
  logger.entry('Client.reconnect', client.id);
  if (client.state !== 'connected') {
    if (client.isDisconnected()) {
      logger.exit('Client.reconnect', client.id, null);
      return undefined;
    } else if (client.state === 'retrying') {
      logger.exit('Client.reconnect', client.id, client);
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

  // clear the subscriptions list, if the cause of the reconnect happens during
  // check for messages we need a 0 length so it will check once reconnected.
  while (client.subscriptions.length > 0) {
    client.queuedSubscriptions.push(client.subscriptions.pop());
  }
  // also clear any left over outstanding sends
  while (client.outstandingSends.length > 0) {
    client.outstandingSends.pop();
  }

  // if client is using serviceFunction, re-generate the list of services
  // TODO: merge these copy & paste
  if (client.serviceFunction instanceof Function) {
    client.serviceFunction(function(err, service) {
      if (err) {
        logger.log('emit', client.id, 'error', err);
        client.emit('error', err);
      } else {
        setImmediate(function() {
          client.serviceList = generateServiceList(service);
          client.connectToService.apply(client, [processQueuedActions]);
        });
      }
    });
  } else {
    setImmediate(function() {
      client.connectToService.apply(client, [processQueuedActions]);
    });
  }

  logger.exit('Client.reconnect', client.id, client);
  return client;
}


/**
* Called on reconnect or first connect to process any
* actions that may have been queued.
* @this should be set to the client object that has
* connected or reconnected
*/
var processQueuedActions = function() {
  //this set to the appropriate client via apply call in connectToService
  var client = this;
  if ( client === undefined || !(client.constructor === Client) ){
    logger.entry('processQueuedActions', 'client was not set');
    logger.exit('processQueuedActions', 'client not set returning');
    return;
  }
  logger.entry('processQueuedActions', client.id);
  while (client.queuedSubscriptions.length > 0 &&
          client.state === 'connected') {
    var sub = client.queuedSubscriptions.pop();
    client.subscribe(sub.topicPattern, sub.share, sub.options, sub.callback);
  }
  while (client.queuedSends.length > 0 &&
          client.state === 'connected') {
    var msg = client.queuedSends.pop();
    client.send(msg.topic, msg.data, msg.options, msg.callback);
  }
  logger.exit('processQueuedActions', client.id);
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
    return this.state === 'connected' ? this.service : undefined;
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
Client.prototype.isDisconnected = function() {
  return (this.state === 'disconnected' || this.state === 'disconnecting');
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
  logger.entry('Client.send', this.id);
  var err;

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
  if (this.isDisconnected()) {
    err = new Error('not connected');
    logger.throw('Client.send', this.id, err);
    throw err;
  }

  // Ensure we are not retrying otherwise queue message and return
  if (this.state === 'retrying' || this.state === 'connecting') {
    this.queuedSends.push({topic: topic, data: data, options: options,
      callback: callback});
    logger.exit('Client.send', this.id);
    return;
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
      logger.entry('Client.send.utilSendComplete', client.id);

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
                logger.entry('Client.send.utilSendComplete.callback',
                             client.id);
                sendCallback.apply(client, [err, topic, body, options]);
                logger.exit('Client.send.utilSendComplete.callback', client.id,
                            null);
              });
            }
            protonMsg.destroy();

            logger.exit('Client.send.utilSendComplete', client.id, null);
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
            logger.entry('Client.send.utilSendComplete.callback', client.id);
            sendCallback.apply(client, [err, topic, protonMsg.body, options]);
            logger.exit('Client.send.utilSendComplete.callback',
                        client.id, null);
          }
          protonMsg.destroy();

          logger.exit('Client.send.utilSendComplete', client.id, null);
          return;
        }
      } catch (e) {
        logger.caught('Client.send.utilSendComplete', client.id, e);
        //error condition so won't retry send remove from list of unsent
        index = client.outstandingSends.indexOf(localMessageId);
        if (index >= 0) client.outstandingSends.splice(index, 1);
        // an error here could still mean the message made it over
        // so we only care about at least once messages
        if (qos === exports.QOS_AT_LEAST_ONCE) {
          client.queuedSends.push({topic: topic, data: data, options: options,
            callback: callback});
        }
        process.nextTick(function() {
          if (sendCallback) {
            if (qos === exports.QOS_AT_MOST_ONCE) {
              //we don't know if an at most once message made it across
              //call the callback with undefined to indicate success to
              //avoid user resending on error.
              logger.entry('Client.send.utilSendComplete.callback', client.id);
              sendCallback.apply(client, [undefined, topic, protonMsg.body,
                options]);
              logger.exit('Client.send.utilSendComplete.callback', client.id,
                  null);
            }
          }
          if (e) {
            logger.log('emit', client.id, 'error', e);
            client.emit('error', e);
          }
        });
        reconnect(client);
      }
      logger.exit('Client.send.utilSendComplete', client.id, null);
    };
    // start the timer to trigger it to keep sending until msg has sent
    setImmediate(untilSendComplete, protonMsg, localMessageId, callback);
  } catch (err) {
    logger.caught('Client.send', client.id, err);
    //error condition so won't retry send need to remove it from list of unsent
    var index = client.outstandingSends.indexOf(localMessageId);
    if (index >= 0) client.outstandingSends.splice(index, 1);
    if (qos === exports.QOS_AT_LEAST_ONCE) {
      client.queuedSends.push({topic: topic, data: data, options: options,
        callback: callback});
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
    });
    reconnect(client);
  }

  logger.exit('Client.send', this.id, null);
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
  if (client.state !== 'connected' || client.subscriptions.length === 0) {
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
        var matchedSubs = client.subscriptions.filter(function(el){
          // 1 added to length to account for the / we add
          var addressNoService = el.address.slice(client.service.length + 1);
          //possible to have 2 matches work out whether this is
          //for a share or private topic
          if (el.share === undefined &&
              protonMsg.linkAddress.indexOf('private:') === 0){
            //slice off private: and compare to the no service address
            var linkNoPrivShare = protonMsg.linkAddress.slice(8);
            if ( addressNoService === linkNoPrivShare ){
              return el;
            }
          } else if (el.share !== undefined &&
                     protonMsg.linkAddress.indexOf('share:') === 0){
            //starting after the share: look for the next : denoting the end
            //of the share name and get everything past that
            var linkNoShare = protonMsg.linkAddress.slice
            (protonMsg.linkAddress.indexOf(':',7) + 1);
            if ( addressNoService === linkNoShare ){
              return el;
            }
          }
        });
        //should only ever be one entry in matchedSubs
        if ( matchedSubs[0] !== undefined ){
          qos = matchedSubs[0].qos;
          if ( qos === exports.QOS_AT_LEAST_ONCE ){
            autoConfirm = matchedSubs[0].autoConfirm;
          }
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
              if (protonMsg) {
                messenger.settle(protonMsg);
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
    logger.caughtLevel('entry_often', 'checkForMessages', client.id, err);
    process.nextTick(function() {
      logger.log('emit', client.id, 'error', err);
      client.emit('error', err);
      reconnect(client);
    });
  }

  logger.exitLevel('exit_often', 'checkForMessages', client.id);

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
  }

  if (callback && !(callback instanceof Function)) {
    err = new TypeError('callback must be a function type');
    logger.throw('Client.subscribe', this.id, err);
    throw err;
  }

  // Ensure we have attempted a connect
  if (this.isDisconnected()) {
    err = new Error('not connected');
    logger.throw('Client.subscribe', this.id, err);
    throw err;
  }

  // Subscribe using the specified topic pattern and share options
  var messenger = this.messenger;
  var address = this.service + '/' + share + topicPattern;
  var client = this;
  var subscriptionAddress = this.service + '/' + topicPattern;
  // If retrying queue this subscribe
  if ( client.state === 'retrying' || client.state === 'connecting'){
    //first check if its already there and if so remove old and add new
    for ( var qs = 0; qs < client.queuedSubscriptions; qs++ ){
      if (client.queuedSubscriptions[qs].address === subscriptionAddress &&
          client.queuedSubscriptions[qs].share === originalShareValue){
        client.queuedSubscriptions.splice(qs,1);
      }
    }
    client.queuedSubscriptions.push({address: subscriptionAddress,
      qos: qos, autoConfirm: autoConfirm, topicPattern: topicPattern,
      share: originalShareValue, options: options, callback: callback });
    return client;
  }

  var err;
  try {
    messenger.subscribe(address, qos, ttl);

    // If this is the first subscription to be added, schedule a request to
    // start the polling loop to check for messages arriving
    if (client.subscriptions.length === 0) {
      process.nextTick(function() {
        client.checkForMessages();
      });
    }

    // Add address to list of subscriptions, replacing any existing entry
    for (var i = 0; i < client.subscriptions.length; i++) {
      if (client.subscriptions[i].address === subscriptionAddress &&
          client.subscriptions[i].share === originalShareValue) {
        client.subscriptions.splice(i, 1);
        break;
      }
    }
    client.subscriptions.push({ address: subscriptionAddress,
      qos: qos, autoConfirm: autoConfirm, topicPattern: topicPattern,
      share: originalShareValue, options: options, callback: callback });

  } catch (e) {
    logger.caught('Client.subscribe', client.id, e);
    err = e;
    //error during subscribe so add to list of queued to resub
    client.queuedSubscriptions.push({address: subscriptionAddress,
      qos: qos, autoConfirm: autoConfirm, topicPattern: topicPattern,
      share: originalShareValue, options: options, callback: callback });
    reconnect(client);
  }

  setImmediate(function() {
    if (callback) {
      //call if success or if disconnected otherwise it will be retried
      if ( err === undefined ){
        logger.entry('Client.subscribe.callback', client.id);
        logger.log('parms', client.id, 'err:', err, ', topicPattern:',
                   topicPattern, ', originalShareValue:', originalShareValue);
        callback.apply(client, [err, topicPattern, originalShareValue]);
        logger.exit('Client.subscribe.callback', client.id, null);
      } else if ( client.isDisconnected() ){
        logger.entry('Client.subscribe.callback', client.id);
        logger.log('parms', client.id, 'err:', err, ', topicPattern:',
                   topicPattern, ', originalShareValue:', originalShareValue);
        callback.apply(client, [err, topicPattern, originalShareValue]);
        logger.exit('Client.subscribe.callback', client.id, null);
      }
    }
    if (err) {
      logger.log('emit', client.id, 'error', err);
      client.emit('error', err);
    }
  });

  logger.exit('Client.subscribe', client.id, client);
  return client;
};

/* ------------------------------------------------------------------------- */
