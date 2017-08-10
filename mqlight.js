/* %Z% %W% %I% %E% %U% */
/*
 * <copyright
 * notice="lm-source-program"
 * pids="5725-P60"
 * years="2013,2016"
 * crc="3568777996" >
 * Licensed Materials - Property of IBM
 *
 * 5725-P60
 *
 * (C) Copyright IBM Corp. 2013, 2016
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
global.logger = require('./mqlight-log');

/**
 * The logging level can be set programmatically by calling
 *   logger.setLevel(level)
 * An ffdc can be generated programmatically by calling
 *   logger.ffdc()
 */
exports.logger = global.logger;
var logger = global.logger;

var os = require('os');
var util = require('util');

var EventEmitter = require('events').EventEmitter;
var uuid = require('uuid');
var url = require('url');
var fs = require('fs');
var http = require('http');
var https = require('https');

var AMQP = require('mqlight-forked-amqp10');
var linkCache = require('amqp10-link-cache');
AMQP.use(linkCache({ttl: Infinity}));

var invalidClientIdRegex = /[^A-Za-z0-9%/._]+/;
var pemCertRegex = new RegExp('-----BEGIN CERTIFICATE-----(.|[\r\n])*?' +
                              '-----END CERTIFICATE-----', 'gm');

/**
 * List of active clients to prevent duplicates, in the started state, with
 * the same id existing.
 */
var activeClientList = {
  clients: new Map(),
  add: function(client) {
    logger.entry('activeClientList.add', client.id);
    this.clients.set(client.id, client);
    logger.exit('activeClientList.add', client.id, null);
  },
  remove: function(id) {
    logger.entry('activeClientList.remove', id);
    this.clients.delete(id);
    logger.exit('activeClientList.remove', id, null);
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

/** The connection retry interval in milliseconds. */
var CONNECT_RETRY_INTERVAL = 1;
if (process.env.NODE_ENV === 'unittest') CONNECT_RETRY_INTERVAL = 0;

/** Client state: connectivity with the server re-established */
var STATE_RESTARTED = 'restarted';

/** Client state: trying to re-establish connectivity with the server */
var STATE_RETRYING = 'retrying';

/** Client state: ready to do messaging */
var STATE_STARTED = 'started';

/** Client state: becoming ready to do messaging */
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
  } else {
    logger.ffdc('setupError', 'ffdc001', null, 'Client object not provided');
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
  setupError(this, 'InvalidArgumentError', message);
  Error.captureStackTrace(this, this.constructor);
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
  setupError(this, 'NetworkError', message);
  Error.captureStackTrace(this, this.constructor);
};
var NetworkError = exports.NetworkError;
util.inherits(NetworkError, Error);

/**
 * This is a subtype of Error defined by the MQ Light client. It is considered
 * an operational error. NotPermittedError is thrown to indicate that a
 * requested operation has been rejected because the remote end does not
 * permit it.
 *
 * @param {String}
 *          message - Human-readable description of the error
 *
 * @constructor
 */
exports.NotPermittedError = function(message) {
  setupError(this, 'NotPermittedError', message);
  Error.captureStackTrace(this, this.constructor);
};
var NotPermittedError = exports.NotPermittedError;
util.inherits(NotPermittedError, Error);

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
  setupError(this, 'ReplacedError', message);
  Error.captureStackTrace(this, this.constructor);
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
  setupError(this, 'SecurityError', message);
  Error.captureStackTrace(this, this.constructor);
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
  setupError(this, 'StoppedError', message);
  Error.captureStackTrace(this, this.constructor);
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
  setupError(this, 'SubscribedError', message);
  Error.captureStackTrace(this, this.constructor);
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
  setupError(this, 'UnsubscribedError', message);
  Error.captureStackTrace(this, this.constructor);
};
var UnsubscribedError = exports.UnsubscribedError;
util.inherits(UnsubscribedError, Error);

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
          !(err instanceof NotPermittedError) &&
          !(err instanceof ReplacedError) &&
          !(err instanceof StoppedError) &&
          !(err instanceof SubscribedError) &&
          !(err instanceof UnsubscribedError)
  );
}

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
    logger.ffdc('getFileServiceFunction', 'ffdc001', null, err);
    logger.throw('getFileServiceFunction', logger.NO_CLIENT_ID, err);
    throw err;
  }

  var filePath = fileUrl;
  // special case for Windows drive letters in file URIs, trim the leading /
  if (os.platform() === 'win32' && filePath.match('^/[a-zA-Z]:/')) {
    filePath = filePath.substring(1);
  }

  var fileServiceFunction = function(callback) {
    logger.entry('fileServiceFunction', logger.NO_CLIENT_ID);
    logger.log('parms', logger.NO_CLIENT_ID, 'filePath:', filePath);

    fs.readFile(filePath, {encoding: 'utf8'}, function(err, data) {
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
    logger.ffdc('getHttpServiceFunction', 'ffdc001', null, err);
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
          var err = new NetworkError(message);
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
 * @param {function(object)}
 *          stopProcessingCallback - callback to perform post stop processing.
 * @param {client} client - the client object to stop the messenger for.
 * @param {callback}
 *          callback - passed an error object if something goes wrong.
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
  logger.log('parms', client.id, 'stopProcessingCallback:',
             stopProcessingCallback);
  logger.log('parms', client.id, 'callback:', callback);

  var cb = function() {
    if (stopProcessingCallback) {
      stopProcessingCallback(client, callback);
    }
  };

  // If messenger available then request it to stop
  // (otherwise it must have already been stopped)
  try {
    if (client._messenger) {
      logger.log('debug', client.id, 'disconnecting messenger');
      client._messenger.disconnect().then(function() {
        logger.log('debug', client.id, 'messenger disconnected');
        process.nextTick(cb);
      }).catch(function(err) {
        logger.caught('stopMessenger', client.id, err);
        callback(err);
      }).error(function(err) {
        logger.caught('stopMessenger', client.id, err);
        callback(err);
      });
    } else {
      logger.log('debug', client.id, 'no active messenger to stop');
      cb();
    }
  } catch (err) {
    console.error(util.inspect(err, true));
  }

  logger.exit('stopMessenger', client.id);
};

/**
* Called on reconnect or first connect to process any actions that may have
* been queued.
*
* @param {Error} err if an error occurred in the performConnect function that
* calls this callback.
*/
var processQueuedActions = function(err) {
  // this set to the appropriate client via apply call in performConnect
  var client = this;
  if (typeof client === 'undefined'/* || client.constructor !== Client*/) {
    logger.entry('processQueuedActions', 'client was not set');
    logger.exit('processQueuedActions', 'client not set returning', null);
    return;
  }
  logger.entry('processQueuedActions', client.id);
  logger.log('parms', client.id, 'err:', err);
  logger.log('data', client.id, 'client.state:', client.state);

  if (!err) {
    var performSend = function() {
      logger.entry('performSend', client.id);
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

      logger.exit('performSend', client.id, null);
    };

    var performUnsub = function() {
      logger.entry('performUnsub', client.id);

      if (client._queuedUnsubscribes.length > 0 &&
          client.state === STATE_STARTED) {
        var rm = client._queuedUnsubscribes.shift();
        logger.log('data', client.id, 'rm:', rm);
        if (rm.noop) {
          // no-op, so just trigger the callback without actually unsubscribing
          if (rm.callback) {
            logger.entry('performUnsub.callback', client.id);
            rm.callback.apply(client, [null, rm.topicPattern, rm.share]);
            logger.exit('performUnsub.callback', client.id, null);
          }
          setImmediate(function() {
            performUnsub.apply(client);
          });
        } else {
          client.unsubscribe(rm.topicPattern, rm.share, rm.options,
              function(err, topicPattern, share) {
                if (rm.callback) {
                  logger.entry('performUnsub.callback', client.id);
                  rm.callback.apply(client, [err, topicPattern, share]);
                  logger.exit('performUnsub.callback', client.id, null);
                }
                setImmediate(function() {
                  performUnsub.apply(client);
                });
              }
          );
        }
      } else {
        performSend.apply(client);
      }

      logger.exit('performUnsub', client.id, null);
    };

    var performSub = function() {
      logger.entry('performSub', client.id);

      if (client._queuedSubscriptions.length > 0 &&
          client.state === STATE_STARTED) {
        var sub = client._queuedSubscriptions.shift();
        logger.log('data', client.id, 'sub:', sub);
        if (sub.noop) {
          // no-op, so just trigger the callback without actually subscribing
          if (sub.callback) {
            process.nextTick(function() {
              logger.entry('performSub.callback', client.id);
              logger.log('parms', client.id, 'err:', err, ', topicPattern:',
                         sub.topicPattern, ', originalShareValue:', sub.share);
              sub.callback.apply(client,
                  [err, sub.topicPattern, sub.originalShareValue]);
              logger.exit('performSub.callback', client.id, null);
            });
          }
          setImmediate(function() {
            performSub.apply(client);
          });
        } else {
          client.subscribe(sub.topicPattern, sub.share, sub.options,
              function(err, topicPattern, share) {
                if (sub.callback) {
                  process.nextTick(function() {
                    logger.entry('performSub.callback',
                                 client.id);
                    logger.log('parms', client.id, 'err:', err,
                               ', topicPattern:', topicPattern,
                               ', share:', share);
                    sub.callback.apply(client,
                        [err, topicPattern, share]);
                    logger.exit('performSub.callback',
                                client.id, null);
                  });
                }
                setImmediate(function() {
                  performSub.apply(client);
                });
              }
          );
        }
      } else {
        performUnsub.apply(client);
      }

      logger.exit('performSub', client.id, null);
    };

    performSub();
  }
  logger.exit('processQueuedActions', client.id, null);
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
  if (typeof client === 'undefined'/* || client.constructor !== Client*/) {
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

  setImmediate(function() {
    // stop the messenger to free the object then attempt a reconnect
    stopMessenger(client, function(client) {
      logger.entry('Client.reconnect.stopProcessing', client.id);

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
      client._queuedStartCallbacks.push({
        callback: processQueuedActions,
        create: false
      });
      process.nextTick(function() {
        client._performConnect(false, true);
      });

      logger.exit('Client.reconnect.stopProcessing', client.id, null);
    });
  });

  logger.exit('Client.reconnect', client.id, client);
  return client;
};

var processMessage = function(client, receiver, protonMsg) {
  logger.entryLevel('entry_often', 'processMessage', client.id);
  Object.defineProperty(protonMsg, 'connectionId', {
    value: client._connectionId
  });

  // if body is a JSON'ified object, try to parse it back to a js obj
  var data;
  var err;
  if (protonMsg.properties.contentType === 'application/json') {
    try {
      data = JSON.parse(protonMsg.body);
    } catch (_) {
      logger.caughtLevel('entry_often', 'processMessage', client.id, _);
      console.warn(_);
    }
  } else {
    data = protonMsg.body;
  }

  var topic = protonMsg.properties.to;
  var prefixMatch = topic.match('^amqp[s]?://');
  if (prefixMatch) {
    topic = topic.slice(prefixMatch[0].length);
    topic = topic.slice(topic.indexOf('/') + 1);
  }
  var autoConfirm = true;
  var qos = exports.QOS_AT_MOST_ONCE;
  var matchedSubs = client._subscriptions.filter(function(el) {
    // 1 added to length to account for the / we add
    var addressNoService = el.address.slice(client._getService().length + 1);
    // possible to have 2 matches work out whether this is
    // for a share or private topic
    var linkAddress;
    if (receiver.name.indexOf('private:') === 0 && !el.share) {
      // slice off 'private:' prefix
      linkAddress = receiver.name.slice(8);
    } else if (receiver.name.indexOf('share:') === 0 && el.share) {
      // starting after the share: look for the next : denoting the end
      // of the share name and get everything past that
      linkAddress = receiver.name.slice(receiver.name.indexOf(':', 7) + 1);
    }
    return (addressNoService === linkAddress);
  });
  // should only ever be one entry in matchedSubs
  if (matchedSubs.length > 1) {
    err = new Error('received message matched more than one ' +
        'subscription');
    logger.ffdc('processMessage', 'ffdc003', client, err);
  }
  var subscription = matchedSubs[0];
  if (typeof subscription === 'undefined') {
    // ideally we shouldn't get here, but it can happen in a timing
    // window if we had received a message from a subscription we've
    // subsequently unsubscribed from
    logger.log('debug', client.id, 'No subscription matched message: ' +
        data + ' going to address: ' + protonMsg.properties.to);
    protonMsg = null;
    return;
  }

  qos = subscription.qos;
  if (qos === exports.QOS_AT_LEAST_ONCE) {
    autoConfirm = subscription.autoConfirm;
  }
  ++subscription.unconfirmed;

  var delivery = {
    message: {
      topic: topic
    }
  };

  if (qos >= exports.QOS_AT_LEAST_ONCE && !autoConfirm) {
    var deliveryConfirmed = false;
    delivery.message.confirmDelivery = function(callback) {
      logger.entry('message.confirmDelivery', client.id);
      logger.log('data', client.id, 'delivery:', delivery);

      var err;
      if (client.isStopped()) {
        err = new NetworkError('not started');
        logger.throw('message.confirmDelivery', client.id, err);
        throw err;
      }

      if (callback && (typeof callback !== 'function')) {
        err = new TypeError('Callback must be a function');
        logger.throw('message.confirmDelivery', client.id, err);
        throw err;
      }

      logger.log('data', client.id, 'deliveryConfirmed:', deliveryConfirmed);

      if (!deliveryConfirmed && protonMsg) {
        // also throw NetworkError if the client has disconnected at some point
        // since this particular message was received
        if (protonMsg.connectionId !== client._connectionId) {
          err = new NetworkError('client has reconnected since this ' +
                                 'message was received');
          logger.throw('message.confirmDelivery', client.id, err);
          throw err;
        }
        deliveryConfirmed = true;
        receiver.accept(protonMsg);
        if (callback) {
          // FIXME: we shouldn't really have a callback at all here...
          //        and if we do, it should at least track the 'sending' of the
          //        settlement
          process.nextTick(function() {
            logger.entry('message.confirmDelivery.callback', client.id);
            callback.apply(client);
            logger.exit('message.confirmDelivery.callback', client.id,
                        null);
          });
        }
      }
      logger.exit('message.confirmDelivery', client.id, null);
    };
  }

  var linkAddress = receiver.name;
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
  if (protonMsg.header.ttl > 0) {
    delivery.message.ttl = protonMsg.header.ttl;
  }

  if (protonMsg.applicationProperties) {
    delivery.message.properties = protonMsg.applicationProperties;
  }

  var da = protonMsg.deliveryAnnotations;
  var malformed = {};
  if (da && 'x-opt-message-malformed-condition' in da) {
    malformed = {
      condition: da['x-opt-message-malformed-condition'],
      description: da['x-opt-message-malformed-description'],
      MQMD: {
        CodedCharSetId:
            Number(da['x-opt-message-malformed-MQMD.CodedCharSetId']),
        Format: da['x-opt-message-malformed-MQMD.Format']
      }
    };
  }
  if (malformed.condition) {
    if (client.listeners('malformed').length > 0) {
      delivery.malformed = malformed;
      logger.log('emit', client.id,
          'malformed', protonMsg.body, delivery);
      client.emit('malformed', protonMsg.body, delivery);
    } else {
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
  } else {
    if (qos === exports.QOS_AT_MOST_ONCE) {
      // XXX: is this needed/correct any more?
      receiver.accept(protonMsg);
    }
    if (qos === exports.QOS_AT_MOST_ONCE || autoConfirm) {
      receiver.accept(protonMsg);
    }
  }
  logger.exitLevel('exit_often', 'processMessage', client.id, null);
};

var lookupError = function(err) {
  if (/ECONNREFUSED/.test(err.code) ||
      err instanceof AMQP.Errors.DisconnectedError) {
    var msg = 'CONNECTION ERROR: The remote computer refused ' +
      'the network connection. ';
    if (err && err.message) {
      msg += err.message;
    }
    err = new NetworkError(msg);
  } else if (/DEPTH_ZERO_SELF_SIGNED_CERT/.test(err.code) ||
             /SELF_SIGNED_CERT_IN_CHAIN/.test(err.code) ||
             /UNABLE_TO_GET_ISSUER_CERT_LOCALLY/.test(err.code)
  ) {
    // Convert DEPTH_ZERO_SELF_SIGNED_CERT or SELF_SIGNED_CERT_IN_CHAIN
    // into a clearer error message.
    err = new SecurityError('SSL Failure: certificate verify failed');
  } else if (/CERT_HAS_EXPIRED/.test(err.code)) {
    // Convert CERT_HAS_EXPIRED into a clearer error message.
    err = new SecurityError('SSL Failure: certificate verify failed ' +
                            '- certificate has expired');
  } else if (/Hostname\/IP doesn't match certificate's altnames/.test(
                 err)) {
    err = new SecurityError(err);
  } else if (/mac verify failure/.test(err)) {
    err = new SecurityError('SSL Failure: ' + err +
        ' (likely due to a keystore access failure)');
  } else if (/wrong tag/.test(err)) {
    err = new SecurityError('SSL Failure: ' + err +
        ' (likely due to the specified keystore being invalid)');
  } else if (/bad decrypt/.test(err)) {
    err = new SecurityError('SSL Failure: ' + err +
        ' (likely due to the specified passphrase being wrong)');
  } else if (/no start line/.test(err)) {
    err = new SecurityError('SSL Failure: ' + err +
        ' (likely due to an invalid certificate PEM file being ' +
        'specified)');
  } else if (err instanceof AMQP.Errors.AuthenticationError) {
    err = new SecurityError('sasl authentication failed');
  } else if (err.condition === 'amqp:precondition-failed' ||
             err.condition === 'amqp:resource-limit-exceeded' ||
             err.condition === 'amqp:not-allowed' ||
             err.condition === 'amqp:link:detach-forced' ||
             err.condition === 'amqp:link:message-size-exceeded' ||
             err.condition === 'amqp:not-implemented') {
    if (/to a different adapter/.test(err.description)) {
      err = new NetworkError(err.description);
    } else {
      err = new NotPermittedError(err.description);
    }
  } else if (err.condition === 'amqp:unauthorized-access') {
    err = new SecurityError(err.description);
  } else if (err.condition === 'amqp:link:stolen') {
    err = new ReplacedError(err.description);
  }
  return err;
};

if (process.env.NODE_ENV === 'unittest') {
  /**
   * Export for unittest purposes.
   */
  exports.processMessage = processMessage;
  exports.reconnect = reconnect;
}

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
    if (_state != value) {
      logger.log('data', _id, 'Client.state', value);
      _state = value;
    }
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
      return _state;
    }
  });

  logger.entry('Client.constructor', logger.NO_CLIENT_ID);
  logger.log('parms', logger.NO_CLIENT_ID, 'service:',
             String(service).replace(/:[^/:]+@/g, ':********@'));
  logger.log('parms', logger.NO_CLIENT_ID, 'id:', id);
  logger.log('parms', logger.NO_CLIENT_ID, 'securityOptions:',
             securityOptions.toString());

  EventEmitter.call(this);

  var msg;
  var err;

  // Ensure the service is an Array or Function
  var serviceFunction;
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
        String(service).replace(/:[^/:]+@/g, ':********@'));
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
    var authUser;
    var authPassword;
    var msg;

    for (var i = 0; i < inputServiceList.length; i++) {
      var serviceUrl = url.parse(inputServiceList[i]);
      var protocol = serviceUrl.protocol;

      // check for auth details
      var auth = serviceUrl.auth;
      authUser = undefined;
      authPassword = undefined;
      if (auth) {
        if (auth.indexOf(':') >= 0) {
          authUser = String(auth).slice(0, auth.indexOf(':'));
          authPassword = String(auth).slice(auth.indexOf(':') + 1);
        } else {
          msg = 'URLs supplied via the \'service\' property must specify ' +
                'both a user name and a password value, or omit both values';
          err = new InvalidArgumentError(msg);
          logger.throw('_generateServiceList', _id, err);
          throw err;
        }
        if (securityOptions.propertyUser && authUser &&
            (securityOptions.propertyUser !== authUser)) {
          msg = 'User name supplied as \'user\' property (' +
                securityOptions.propertyUser + ') does not match user name ' +
                'supplied via a URL passed via the \'service\' property (' +
                authUser + ')';
          err = new InvalidArgumentError(msg);
          logger.throw('_generateServiceList', _id, err);
          throw err;
        }
        if (securityOptions.propertyPassword && authPassword &&
            (securityOptions.propertyPassword !== authPassword)) {
          msg = 'Password supplied as \'password\' property does not match a ' +
                'password supplied via a URL passed via the \'service\' ' +
                'property';
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
          msg = 'URLs supplied via the \'service\' property contain ' +
                'inconsistent user names';
          err = new InvalidArgumentError(msg);
          logger.throw('_generateServiceList', _id, err);
          throw err;
        } else if (securityOptions.urlPassword !== authPassword) {
          msg = 'URLs supplied via the \'service\' property contain ' +
                'inconsistent password values';
          err = new InvalidArgumentError(msg);
          logger.throw('_generateServiceList', _id, err);
          throw err;
        }
      }

      // Check we are trying to use the amqp protocol
      if (!protocol || (protocol !== 'amqp:' && protocol !== 'amqps:')) {
        msg = 'Unsupported URL \'' + inputServiceList[i] +
              '\' specified for service. Only the amqp or amqps protocol are ' +
              'supported.';
        err = new InvalidArgumentError(msg);
        logger.throw('_generateServiceList', _id, err);
        throw err;
      }
      // Check we have a hostname
      var host = serviceUrl.host;
      if (!host || !serviceUrl.hostname) {
        msg = 'Unsupported URL \' ' + inputServiceList[i] + '\' specified ' +
              'for service. Must supply a hostname.';
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
        msg = 'Unsupported URL \'' + inputServiceList[i] + '\' paths (' + path +
              ' ) can\'t be part of a service URL.';
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
        String(serviceList).replace(/:[^/:]+@/g, ':********@'),
        'securityOptions:', securityOptions.toString()
      ]);
    return serviceList;
  };

  /**
  * Function to invoke all callbacks waiting on a started event.
  *
  * @param {Error} err Set if an error occurred while starting.
  */
  this._invokeStartedCallbacks = function(err) {
    var client = this;
    logger.entry('Client._invokeStartedCallbacks', _id);

    var callbacks = client._queuedStartCallbacks.length;
    logger.log('debug', _id, 'callbacks:', callbacks);

    for (var i = 0; i < callbacks; i++) {
      var invocation = client._queuedStartCallbacks.shift();
      if (invocation.callback) {
        logger.entry('Client._invokeStartedCallbacks.callback',
                     client.id, invocation.create);
        if (invocation.create) {
          invocation.callback.apply(client, [err ? err : null, client]);
        } else {
          invocation.callback.apply(client, [err]);
        }
        logger.exit('Client._invokeStartedCallbacks.callback', client.id, null);
      } else {
        logger.ffdc('Client._invokeStartedCallbacks', 'ffdc001', client,
                    'No callback provided');
      }
    }

    logger.exit('Client._invokeStartedCallbacks', _id, null);
  };

  // performs the connect
  this._performConnect = function(newClient, retrying) {
    var client = this;
    logger.entry('Client._performConnect', _id, newClient);

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
      if (!client.isStopped()) {
        logger.ffdc('Client._performConnect', 'ffdc005', client,
                    'Replaced client not in stopped state');
      }
      client._invokeStartedCallbacks(new LocalReplacedError(_id));
      logger.exit('Client._performConnect', _id, null);
      return;
    }

    if (newClient) {
      client._setState(STATE_STARTING);
    } else {
      var currentState = _state;
      logger.log('debug', _id, 'currentState:', currentState);
      logger.log('debug', _id, 'retrying:', retrying);

      // if we are not stopped or stopping state return with the client object
      if (currentState !== STATE_STOPPED && !retrying) {
        if (currentState === STATE_STOPPING) {
          var stillDisconnecting = function(client) {
            logger.entry('stillDisconnecting', _id);

            if (_state === STATE_STOPPING) {
              setImmediate(function() {
                stillDisconnecting(client);
              });
            } else {
              process.nextTick(function() {
                client._performConnect(newClient, retrying);
              });
            }

            logger.exit('stillDisconnecting', _id, null);
          };

          setImmediate(function() {
            stillDisconnecting(client);
          });
          logger.exit('Client._performConnect', _id, null);
          return;
        }
        if (currentState === STATE_STARTED) {
          // if the client is already started, then drive any callbacks
          // waiting to be notified
          process.nextTick(function() {
            client._invokeStartedCallbacks(null);
          });
        }
        logger.exit('Client._performConnect', _id, client);
        return client;
      }

      if (_state === STATE_STOPPED) {
        client._setState(STATE_STARTING);
      }
    }

    // Obtain the list of services for connect and connect to one of the
    // services, retrying until a connection can be established
    var serviceList;
    if (client._serviceFunction instanceof Function) {
      logger.entry('_serviceFunction', client.id);
      var serviceFunctionCallback = function(err, service) {
        if (err) {
          // The service 'lookup' function returned an error. Wait a few
          // seconds and then try again (unless we're in a unit test)
          if (process.env.NODE_ENV === 'unittest') {
            client._setState(STATE_STOPPED);
            client._invokeStartedCallbacks(err);
          } else {
            client._serviceFunctionTimeout = setTimeout(function() {
              client._serviceFunction(serviceFunctionCallback);
            }, 5000);
          }
        } else {
          try {
            client._setState(STATE_STARTING);
            serviceList =
                client._generateServiceList(service);
            client._connectToService(serviceList);
          } catch (err) {
            logger.caught('_serviceFunction', client.id, err);
            client._setState(STATE_STOPPED);
            client._invokeStartedCallbacks(err);
          }
        }
      };
      client._serviceFunction(serviceFunctionCallback);
      logger.exit('_serviceFunction', client.id, null);
    } else {
      try {
        serviceList = client._generateServiceList(service);
        client._connectToService(serviceList);
      } catch (err) {
        logger.caught('Client._performConnect', client.id, err);
        client._setState(STATE_STOPPED);
        client._invokeStartedCallbacks(err);
      }
    }

    logger.exit('Client._performConnect', _id, null);
    return;
  };

  /**
  * Function to connect to a service. Callback happens once a successful
  * connect/reconnect occurs.
  *
  * @param {Array} serviceList list of services to connect to.
  */
  this._tryService = function(serviceList) {
    var client = this;
    logger.entry('Client._tryService', _id);

    if (serviceList.length === 0) {
      logger.ffdc('Client._tryService', 'ffdc004', client);
    } else {
      try {
        var service = serviceList[0];
        logger.log('data', _id, 'service:', service);

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
        var serviceUrl = url.parse(service);
        // reparse the service url to prepend authentication information
        // back on as required
        if (auth) {
          service = serviceUrl.protocol + '//' + auth + serviceUrl.host;
          logUrl = serviceUrl.protocol + '//' +
                   auth.replace(/:[^/:]+@/g, ':********@') + serviceUrl.host;
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

        // Try and connect to the next service in the list, or retry from the
        // beginning if we've run out of services.
        var tryNextService = function(error) {
          logger.entry('Client._tryService.tryNextService', _id);

          if (serviceList.length === 1) {
            // We've tried all services without success. Pause for a while
            // before trying again
            logger.log('data', _id, 'End of service list');

            client._setState(STATE_RETRYING);
            var retry = function() {
              logger.entryLevel('entry_often', 'Client._tryService.retry', _id);
              if (!client.isStopped()) {
                process.nextTick(function() {
                  client._performConnect(false, true);
                });
              }
              logger.exitLevel('exit_often', 'Client._tryService.retry',
                               _id, null);
            };

            client._retryCount++;
            var retryCap = 60000;
            // Limit to the power of 8 as anything above this will put the
            // interval higher than the cap straight away.
            var exponent = (client._retryCount <= 8) ? client._retryCount : 8;
            var upperBound = Math.pow(2, exponent);
            var lowerBound = 0.75 * upperBound;
            var jitter = Math.random() * (0.25 * upperBound);
            var interval = Math.min(retryCap, (lowerBound + jitter) * 1000);
            // times by CONNECT_RETRY_INTERVAL for unittest purposes
            interval = Math.round(interval) * CONNECT_RETRY_INTERVAL;
            logger.log('data', _id, 'trying to connect again ' +
                       'after ' + (interval / 1000) + ' seconds');
            setTimeout(retry, interval);
            if (error) {
              setImmediate(function() {
                logger.log('emit', _id, 'error', error);
                client.emit('error', error);
              });
            }
          } else {
            // Try the next service in the list
            logger.log('data', _id, 'Trying next service');
            client._tryService(serviceList.slice(1));
          }

          logger.exit('Client._tryService.tryNextService', _id, null);
        };

        // Define an error handler for connection errors. Log the failure and
        // then try the next service.
        var connError = function(err) {
          logger.entry('Client._tryService.connError', _id);

          err = lookupError(err);
          logger.log('data', _id, 'failed to connect to: ' + logUrl +
                     ' due to error: ' + util.inspect(err));

          // This service failed to connect. Try the next one.
          // XXX: wrap in shouldReconnect ?
          tryNextService(err);

          logger.exit('Client._tryService.connError', _id, null);
        };

        var connected = function() {
          logger.log('data', _id, 'successfully connected to:', logUrl);
          _service = serviceList[0];

          // Indicate that we're started
          client._setState(STATE_STARTED);
          var eventToEmit;
          if (client._firstStart) {
            eventToEmit = STATE_STARTED;
            client._firstStart = false;
            client._retryCount = 0;
            // could be queued actions so need to process those here. On
            // reconnect this would be done via the callback we set, first
            // connect its the users callback so won't process anything.
            logger.log('data', _id, 'first start since being stopped');
            setImmediate(function() {
              processQueuedActions.apply(client);
            });
          } else {
            client._retryCount = 0;
            eventToEmit = STATE_RESTARTED;
          }
          ++client._connectionId;

          process.nextTick(function() {
            logger.log('emit', _id, eventToEmit);
            client.emit(eventToEmit);
            client._invokeStartedCallbacks(null);
          });
          return null;
        };

        // Otherwise do a standard net connect.
        // Get messenger to connect if it hasn't already.
        var promise;
        if (process.env.NODE_ENV === 'unittest') {
          logger.log('debug', _id, 'connecting via stub');
          // XXX: hack for unittesting purposes
          var connOpts = {
            host: serviceUrl.hostname,
            port: serviceUrl.port,
            rejectUnauthorized: false,
            sslTrustCertificate: securityOptions.sslTrustCertificate,
            sslVerifyName: securityOptions.sslVerifyName
          };
          promise = client._messenger.connect(connectUrl, connOpts);
        } else {
          logger.log('debug', _id, 'connecting via net');
          promise = client._messenger.connect(connectUrl, {
            saslMechanism: (auth) ? 'PLAIN' : 'ANONYMOUS'
          });
        }
        promise.then(connected)
          .catch(function(err) {
            logger.caught('Client._tryService', _id, err);
            connError(err);
          })
          .error(function(err) {
            logger.caught('Client._tryService', _id, err);
            connError(err);
          });
      } catch (err) {
        // should never get here, as it means that messenger.connect has been
        // called in an invalid way, so FFDC
        logger.caught('Client._tryService', _id, err);
        logger.ffdc('Client._tryService', 'ffdc002', client, err);
        client._setState(STATE_STOPPED);
        logger.throw('Client._tryService', _id, err);
        throw err;
      }
    }

    logger.exit('Client._tryService', _id, null);
  };

  /**
  * Function to connect to the service, trys each available service
  * in turn. If none can connect it emits an error, waits and
  * attempts to connect again. Callback happens once a successful
  * connect/reconnect occurs.
  *
  * @param {Array} serviceList list of services to connect to.
  */
  this._connectToService = function(serviceList) {
    var client = this;
    logger.entry('Client._connectToService', _id);

    if (client.isStopped()) {
      client._invokeStartedCallbacks(
          new StoppedError('connect aborted due to stop'));
      logger.exit('Client._connectToService', _id, null);
      return;
    }

    this._tryService(serviceList);

    logger.exit('Client._connectToService', _id, null);
    return;
  };

  // If client id has not been specified then generate an id
  if (!id) id = 'AUTO_' + uuid.v4().substring(0, 7);

  // If the client id is too long then throw an error
  if (id.length > 256) {
    msg = 'Client identifier \'' + id + '\' is longer than the maximum ' +
          'ID length of 256.';
    err = new InvalidArgumentError(msg);
    logger.throw('Client.constructor', logger.NO_CLIENT_ID, err);
    throw err;
  }

  id = String(id);

  // currently client ids are restricted, reject any invalid ones
  var matches = invalidClientIdRegex.exec(id);
  if (matches) {
    msg =
        'Client Identifier \'' + id + '\' contains invalid char: ' + matches[0];
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
  var keystoreOption = '';
  var keystoreOptionCount = 0;
  if (typeof securityOptions.sslKeystorePassphrase !== 'undefined') {
    keystoreOption = 'sslKeystorePassphrase';
    keystoreOptionCount++;
  }
  if (typeof securityOptions.sslKeystore !== 'undefined') {
    if (keystoreOptionCount > 0) keystoreOption += ', ';
    keystoreOption += 'sslKeystore';
    keystoreOptionCount++;
  }

  var clientCertOption = '';
  var clientCertOptionCount = 0;
  if (typeof securityOptions.sslClientCertificate !== 'undefined') {
    clientCertOption = 'sslClientCertificate';
    clientCertOptionCount++;
  }
  if (typeof securityOptions.sslClientKey !== 'undefined') {
    if (clientCertOptionCount > 0) clientCertOption += ', ';
    clientCertOption += 'sslClientKey';
    clientCertOptionCount++;
  }
  if (typeof securityOptions.sslClientKeyPassphrase !== 'undefined') {
    if (clientCertOptionCount > 0) clientCertOption += ', ';
    clientCertOption += 'sslClientKeyPassphrase';
    clientCertOptionCount++;
  }

  var certificateOption = '';
  if (typeof securityOptions.sslTrustCertificate === 'undefined') {
    certificateOption = clientCertOption;
  } else {
    if (clientCertOptionCount > 0) certificateOption += ', ';
    certificateOption += 'sslTrustCertificate';
  }

  if ((keystoreOption.length > 0) && (certificateOption.length > 0)) {
    err = new TypeError(keystoreOption + ' and ' + certificateOption +
                        ' options cannot be specified together');
    logger.throw('Client.constructor', _id, err);
    throw err;
  }
  if ((keystoreOption.length > 0) && (keystoreOptionCount !== 2)) {
    err = new TypeError('sslKeystore and sslKeystorePassphrase options' +
                        ' must both be specified');
    logger.throw('Client.constructor', _id, err);
    throw err;
  }
  if ((clientCertOption.length > 0) && (clientCertOptionCount !== 3)) {
    err = new TypeError('sslClientCertificate, sslClientKey and' +
                        ' sslClientKeyPassphrase options must all be' +
                        ' specified');
    logger.throw('Client.constructor', _id, err);
    throw err;
  }

  var sslOptions = [
    {name: 'sslKeystore', value: securityOptions.sslKeystore},
    {name: 'sslTrustCertificate', value: securityOptions.sslTrustCertificate},
    {name: 'sslClientCertificate',
      value: securityOptions.sslClientCertificate},
    {name: 'sslClientKey', value: securityOptions.sslClientKey}
  ];
  for (var i = 0; i < sslOptions.length; i++) {
    var sslOption = sslOptions[i];
    if (typeof sslOption.value !== 'undefined') {
      if (typeof sslOption.value !== 'string') {
        err = new TypeError(sslOption.name + ' value \'' +
                            sslOption.value +
                            '\' is invalid. Must be of type String');
        logger.throw('Client.constructor', _id, err);
        throw err;
      }
      if (!fs.existsSync(sslOption.value)) {
        err = new TypeError('The file specified for ' + sslOption.name + ' \'' +
                            sslOption.value +
                            '\' does not exist');
        logger.throw('Client.constructor', _id, err);
        throw err;
      }
      if (!fs.statSync(sslOption.value).isFile()) {
        err = new TypeError('The file specified for ' + sslOption.name + ' \'' +
                            sslOption.value +
                            '\' is not a regular file');
        logger.throw('Client.constructor', _id, err);
        throw err;
      }
    }
  }
  if ((typeof securityOptions.sslKeystorePassphrase !== 'undefined') &&
      (typeof securityOptions.sslKeystorePassphrase !== 'string')) {
    err = new TypeError('sslKeystorePassphrase value \'' +
                        securityOptions.sslKeystorePassphrase +
                        '\' is invalid. Must be of type String');
    logger.throw('Client.constructor', _id, err);
    throw err;
  }
  if ((typeof securityOptions.sslClientKeyPassphrase !== 'undefined') &&
      (typeof securityOptions.sslClientKeyPassphrase !== 'string')) {
    err = new TypeError('sslClientKeyPassphrase value \'' +
                        securityOptions.sslClientKeyPassphrase +
                        '\' is invalid. Must be of type String');
    logger.throw('Client.constructor', _id, err);
    throw err;
  }
  if (typeof securityOptions.sslVerifyName !== 'boolean') {
    err = new TypeError('sslVerifyName value \'' +
        securityOptions.sslVerifyName +
        '\' is invalid. Must be of type Boolean');
    logger.throw('Client.constructor', _id, err);
    throw err;
  }

  // Save the required data as client fields
  this._serviceFunction = serviceFunction;
  _id = id;

  logger.entry('proton.createMessenger', _id);
  if (process.env.NODE_ENV === 'unittest') {
    this._messenger =
        require('./test/stubs/stubproton.js').createProtonStub().messenger;
  } else {
    var policy = AMQP.Policy.merge({
      defaultSubjects: false,
      reconnect: {
        retries: 0,
        strategy: 'exponential',
        forever: false
      },
      connect: {
        options: {
          containerId: _id,
          idleTimeout: 0
        }
      }
    });

    sslOptions = {
      keyFile: null,
      certFile: null,
      caFile: null,
      rejectUnauthorized: true
    };

    if (securityOptions.sslVerifyName === false) {
      sslOptions.checkServerIdentity = function() {
        return null;
      };
    }

    // Replace the default AMQP policy for parsing addresses (because it is too
    // simplistic and looks for the first colon (':') character in the decoded
    // URI, breaking if either the username or password contain this character).
    if (policy.parseAddress) {
      var originalParseAddress = policy.parseAddress;
      policy.parseAddress = function(amqpAddress) {
        var result = originalParseAddress(amqpAddress);
        if (amqpAddress.auth) {
          // Capture the part of the encoded URI between '//' and '@'
          var matchAuth = /.+\/\/([^@]+).+/g;
          var auth = matchAuth.exec(amqpAddress.href)[1];
          var authSplit = auth.split(':');
          result.user = decodeURIComponent(authSplit[0]);
          if (authSplit[1]) {
            result.pass = decodeURIComponent(authSplit[1]);
          }
        }
        return result;
      };
    }

    // Read the client keystore or pem files as appropriate, setting the
    // required security related connection options
    if (typeof securityOptions.sslKeystore === 'undefined') {
      if (typeof securityOptions.sslClientCertificate !== 'undefined') {
        sslOptions.cert =
          fs.readFileSync(securityOptions.sslClientCertificate, 'utf-8');
      }
      if (typeof securityOptions.sslClientKey !== 'undefined') {
        sslOptions.key = fs.readFileSync(securityOptions.sslClientKey,
          'utf-8');
        sslOptions.passphrase = securityOptions.sslClientKeyPassphrase;
      }
      // Read the pem file and load multiple certs up into a separate entry
      if (typeof securityOptions.sslTrustCertificate !== 'undefined') {
        sslOptions.ca = fs.readFileSync(securityOptions.sslTrustCertificate,
          'utf-8').match(pemCertRegex);
      }
    } else {
      sslOptions.pfx = fs.readFileSync(securityOptions.sslKeystore);
      sslOptions.passphrase = securityOptions.sslKeystorePassphrase;
    }

    policy.connect.options.sslOptions = sslOptions;
    logger.log('debug', _id, 'sslOptions', sslOptions);

    this._messenger = new AMQP.Client(policy);
  }
  logger.exit('proton.createMessenger', _id, null);

  var client = this;
  this._messenger.on(AMQP.Client.ErrorReceived, function(err) {
    logger.entry('Client._messenger.on.ErrorReceived', _id);
    if (err) {
      err = lookupError(err);
      logger.log('parms', _id, 'err:', err);
      logger.log('data', _id, _state);
      if (_state === STATE_STARTED || err instanceof SecurityError ||
          err instanceof NotPermittedError) {
        if (!(err instanceof NotPermittedError) || _state !== STATE_STARTED) {
          logger.log('debug', _id, '_state', _state);
          logger.log('emit', _id, 'error', err);
          client.emit('error', err);
        }
        if (shouldReconnect(err)) {
          setImmediate(function() {
            logger.log('data', _id, 'calling reconnect', err);
            reconnect(client);
          });
        } else {
          stopMessenger(client);
        }
      }
    }
    logger.exit('Client._messenger.on.ErrorReceived', _id, null);
  });

  this._messenger.on(AMQP.Client.ConnectionClosed, function() {
    logger.entry('Client._messenger.on.ConnectionClosed', _id);
    if (_state === STATE_STARTED) {
      logger.log('data', client.id, 'calling reconnect');
      reconnect(client);
    } else if (_state === STATE_RETRYING || _state === STATE_STARTING) {
      //
    }
    logger.exit('Client._messenger.on.ConnectionClosed', _id, null);
  });

  // Set the initial state to starting
  _state = STATE_STARTING;
  _service = null;
  // The stream associated with the client
  this._stream = null;
  // The first start, set to false after start and back to true on stop
  this._firstStart = true;
  // List of callbacks to notify when a start operation completes
  this._queuedStartCallbacks = [];

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

  // List of chunks ready to push into proton
  this._queuedChunks = [];
  this._queuedChunksSize = 0;

  if (!serviceFunction) {
    this._serviceList = this._generateServiceList(service);
  }
  logger.exit('Client.constructor', _id, this);
};
util.inherits(Client, EventEmitter);

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
    sslKeystore: options.sslKeystore,
    sslKeystorePassphrase: options.sslKeystorePassphrase,
    sslClientCertificate: options.sslClientCertificate,
    sslClientKey: options.sslClientKey,
    sslClientKeyPassphrase: options.sslClientKeyPassphrase,
    sslTrustCertificate: options.sslTrustCertificate,
    sslVerifyName: (typeof options.sslVerifyName === 'undefined') ? true :
        options.sslVerifyName,
    toString: function() {
      return '[\n' +
          ' propertyUser: ' + this.propertyUser + '\n' +
          ' propertyPassword: ' +
          (this.propertyPassword ? '********' : undefined) + '\n' +
          ' propertyUser: ' + this.urlUser + '\n' +
          ' urlPassword: ' + (this.urlPassword ? '********' : undefined) +
          '\n' +
          ' sslKeystore: ' + this.sslKeystore + '\n' +
          ' sslKeystorePassphrase: ' +
          (this.sslKeystorePassphrase ? '********' : undefined) + '\n' +
          ' sslClientCertificate: ' + this.sslClientCertificate + '\n' +
          ' sslClientKey: ' + this.sslClientKey + '\n' +
          ' sslClientKeyPassphrase: ' +
          (this.sslClientKeyPassphrase ? '********' : undefined) + '\n' +
          ' sslTrustCertificate: ' + this.sslTrustCertificate + '\n' +
          ' sslVerifyName: ' + this.sslVerifyName + '\n]';
    }
  };
  var client = new Client(options.service, options.id, securityOptions);

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
      if (callback) {
        client._queuedStartCallbacks.push({
          callback: callback,
          create: true
        });
        logger.log('debug', client.id, 'callback function queued');
      }
      process.nextTick(function() {
        client._performConnect(true, false);
      });
    });
  } else {
    activeClientList.add(client);
    if (callback) {
      client._queuedStartCallbacks.push({
        callback: callback,
        create: true
      });
      logger.log('debug', client.id, 'callback function queued');
    }
    process.nextTick(function() {
      client._performConnect(true, false);
    });
  }

  logger.exit('createClient', client.id, client);
  return client;
};

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
      if (callback) {
        client._queuedStartCallbacks.push({
          callback: callback,
          create: false
        });
        logger.log('debug', client.id, 'callback function queued');
      }
      process.nextTick(function() {
        client._performConnect(false, false);
      });
    });
  } else {
    activeClientList.add(client);
    if (callback) {
      client._queuedStartCallbacks.push({
        callback: callback,
        create: false
      });
      logger.log('debug', client.id, 'callback function queued');
    }
    process.nextTick(function() {
      client._performConnect(false, false);
    });
  }

  logger.exit('Client.start', client.id, client);
  return client;
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

    // If this client is still starting, then wait until the state changes
    // before we attempt to stop.
    if (client.state === STATE_STARTING) {
      var stillConnecting = function(client) {
        logger.entry('stillConnecting', client.id);

        if (client.state === STATE_STARTING) {
          setImmediate(function() {
            stillConnecting(client);
          });
        } else {
          process.nextTick(function() {
            performDisconnect(client, callback);
          });
        }

        logger.exit('stillConnecting', client.id, null);
      };

      setImmediate(function() {
        stillConnecting(client);
      });
      logger.exit('Client.stop.performDisconnect', client.id, null);
      return;
    }

    client._setState(STATE_STOPPING);

    if (client._serviceFunctionTimeout) {
      // if we previously set a timeout to retry the serviceFunction, clear it.
      clearTimeout(client._serviceFunctionTimeout);
    }
    client._serviceFunctionTimeout = null;

    // Only disconnect when all outstanding send operations are complete
    if (client._outstandingSends.length === 0) {
      stopMessenger(client, function(client, callback) {
        logger.entry('Client.stop.performDisconnect.stopProcessing',
            client.id);
        // clear queuedSends as we are disconnecting
        var messages = [];
        while (client._queuedSends.length > 0) {
          messages.push(client._queuedSends.shift());
        }
        // call the msg callbacks in error as we have disconnected
        process.nextTick(function() {
          logger.entry('Client.stop.performDisconnect.' +
              'stopProcessing.queuedSendCallback', client.id);
          while (messages.length > 0) {
            var msg = messages.shift();
            if (msg.callback) {
              msg.callback(new StoppedError('send aborted due to client stop'));
            }
          }
          logger.exit('Client.stop.performDisconnect.' +
              'stopProcessing.queuedSendCallback', client.id, null);
        });
        // Clear the active and queued subscriptions lists as we were
        // asked to disconnect.
        logger.log('data', client.id, 'client._subscriptions:',
                   client._subscriptions);
        while (client._subscriptions.length > 0) {
          client._subscriptions.shift();
        }
        while (client._queuedSubscriptions.length > 0) {
          client._queuedSubscriptions.shift();
        }
        // Close our end of the socket
        if (client._stream) {
          client._stream.removeAllListeners('close');
          client._stream.end();
          client._stream = null;
        }
        client._queuedChunks = [];
        client._queuedChunksSize = 0;

        // Indicate that we've disconnected
        client._setState(STATE_STOPPED);
        // Remove ourself from the active client list
        var activeClient = activeClientList.get(client.id);
        if (client === activeClient) activeClientList.remove(client.id);
        setImmediate(function() {
          if (!client._firstStart) {
            client._firstStart = true;
            logger.log('emit', client.id, STATE_STOPPED);
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
  if (topic) {
    topic = String(topic);
  } else {
    err = new TypeError('Cannot send to undefined topic');
    logger.throw('Client.send', this.id, err);
    throw err;
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
        err = new RangeError('options:qos value \'' + options.qos +
                             '\' is invalid must evaluate to 0 or 1');
        logger.throw('Client.send', this.id, err);
        throw err;
      }
    }

    if ('ttl' in options) {
      ttl = Number(options.ttl);
      if (Number.isNaN(ttl) || !Number.isFinite(ttl) || ttl <= 0) {
        err = new RangeError('options:ttl value \'' +
            options.ttl +
            '\' is invalid, must be an unsigned non-zero integer number');
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
    protonMsg = {
      header: {},
      properties: {}
    };
    logger.exit('proton.createMessage', client.id, protonMsg);
    protonMsg.properties.to = client._getService() + '/' + topic;
    if (ttl) {
      protonMsg.header.ttl = ttl;
    }
    if (options && 'properties' in options) {
      var properties = {};
      for (var property in options.properties) {
        if ({}.hasOwnProperty.call(options.properties, property)) {
          var key = String(property);
          var val = options.properties[property];
          var type = typeof (val);
          if (val !== null && type !== 'boolean' && type !== 'number' &&
              type !== 'string' && !(val instanceof Buffer)) {
            var msg = 'Property key \'' + key + '\' specifies a value which ' +
                      'is not of a supported type';
            err = new InvalidArgumentError(msg);
            logger.throw('Client.send', this.id, err);
            throw err;
          }
          properties[key] = val;
        }
      }
      protonMsg.applicationProperties = properties;
    }
    if (typeof data === 'string') {
      protonMsg.body = data;
      protonMsg.properties.contentType = 'text/plain';
    } else if (data instanceof Buffer) {
      protonMsg.body = new AMQP.DescribedType(0x77, data); // wrap in AMQPValue
      protonMsg.properties.contentType = 'application/octet-stream';
    } else {
      protonMsg.body = JSON.stringify(data);
      protonMsg.properties.contentType = 'application/json';
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
  messenger.createSender(topic, {
    attach: {
      sndSettleMode:
        (qos === exports.QOS_AT_MOST_ONCE) ?
        AMQP.Constants.senderSettleMode.settled :
        AMQP.Constants.senderSettleMode.unsettled
    },
    callback: (qos === exports.QOS_AT_MOST_ONCE) ? 'sent' : 'settled',
    reattach: false
  }).then(function(sender) {
    return sender.send(protonMsg);
  }).then(function() {
    client._outstandingSends.shift();
    // generate drain event, if required.
    if (client._drainEventRequired &&
      (client._outstandingSends.length <= 1)) {
      client._drainEventRequired = false;
      process.nextTick(function() {
        logger.log('emit', client.id, 'drain');
        client.emit('drain');
      });
    }
    if (callback) {
      // TODO: check if we need to handle different values of state
      callback.apply(client, [null, topic, data, options]);
    }
  }).catch(function(err) {
    logger.caught('Client.send', client.id, err);
    client._outstandingSends.shift();
    if (callback) {
      err = lookupError(err);
      callback.apply(client, [err, topic, data, options]);
    }
  }).error(function(err) {
    logger.caught('Client.send', client.id, err);
    client._outstandingSends.shift();
    if (callback) {
      err = lookupError(err);
      callback.apply(client, [err, topic, data, options]);
    }
  });

  logger.exit('Client.send', this.id, nextMessage);
  return nextMessage;
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
 * @return {Client} the instance of the client subscribe was invoked on.
 * @throws {TypeError} one of the parameters is of the wrong type.
 * @throws {Error} the topic pattern parameter is undefined.
 */
Client.prototype.subscribe = function(topicPattern, share, options, callback) {
  logger.entry('Client.subscribe', this.id);
  logger.log('parms', this.id, 'topicPattern:', topicPattern);

  // Must accept at least one option - and first option is always a
  // topicPattern.
  var err;
  if (arguments.length === 0) {
    err = new TypeError('You must specify a \'topicPattern\' argument');
    logger.throw('Client.subscribe', this.id, err);
    throw err;
  }
  if (!topicPattern) {
    err = new TypeError('You must specify a \'topicPattern\' argument');
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
      err = new InvalidArgumentError('share argument value \'' + share +
                                     '\' is invalid because it contains a ' +
                                     'colon (\':\') character');
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
        err = new RangeError('options:qos value \'' + options.qos +
                             '\' is invalid must evaluate to 0 or 1');
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
        err = new TypeError('options:autoConfirm value \'' +
                            options.autoConfirm +
                            '\' is invalid must evaluate to true or false');
        logger.throw('Client.subscribe', this.id, err);
        throw err;
      }
    }
    if ('ttl' in options) {
      ttl = Number(options.ttl);
      if (Number.isNaN(ttl) || !Number.isFinite(ttl) || ttl < 0) {
        err = new RangeError('options:ttl value \'' +
                             options.ttl +
                             '\' is invalid, must be an unsigned integer ' +
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
        err = new RangeError('options:credit value \'' +
                             options.credit +
                             '\' is invalid, must be an unsigned integer ' +
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
  var address = share + topicPattern;
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

  var finishedSubscribing = function(err, callback) {
    logger.entry('Client.subscribe.finishedSubscribing', client.id);
    logger.log('parms', client.id, 'err:', err, ', topicPattern:',
               topicPattern);

    if (callback) {
      process.nextTick(function() {
        logger.entry('Client.subscribe.finishedSubscribing.callback',
                     client.id);
        logger.log('parms', client.id, 'err:', err, ', topicPattern:',
                   topicPattern, ', originalShareValue:', originalShareValue);
        callback.apply(client, [err, topicPattern, originalShareValue]);
        logger.exit('Client.subscribe.finishedSubscribing.callback',
                    client.id, null);
      });
    }

    if (err) {
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
        reconnect(client);
      }

      if (!callback) {
        process.nextTick(function() {
          logger.log('emit', client.id, 'error', err);
          client.emit('error', err);
        });
      }
    } else {
      // if no errors, add to the stored list of subscriptions
      client._subscriptions.push({
        receiver: this,
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
    }

    logger.exit('Client.subscribe.finishedSubscribing', client.id, null);
  };

  if (err) {
    finishedSubscribing(err, callback);
  } else {
    var link = {
      name: address,
      bypassCache: true,
      credit:
        (qos === exports.QOS_AT_MOST_ONCE) ?
        // XXX: previously we renewed credit at 80% rather than 50%...
        AMQP.Policy.Utils.CreditPolicies.RefreshAtHalf :
        AMQP.Policy.Utils.CreditPolicies.RefreshSettled(
          Math.max(1, credit / 2)),
      creditQuantum: credit,
      attach: {
        source: {
          address: address
        },
        target: {
          address: address
        }
      },
      reattach: false,
      settlement:
        (qos === exports.QOS_AT_MOST_ONCE) ?
        AMQP.Constants.settlement.auto :
        AMQP.Constants.settlement.manual
    };
    // if (ttl) {
    link.attach.source.expiryPolicy = link.attach.target.expiryPolicy =
        'link-detach';
    link.attach.source.timeout = link.attach.target.timeout = ttl;
    // }
    var handleLinkError = function(receiver, err) {
      if (err.description && err.description !== 'detach-forced') {
        var matchedSubs = client._subscriptions.filter(function(el) {
          var addressNoService =
              el.address.slice(client._getService().length + 1);
          var linkAddress;
          if (receiver.name.indexOf('private:') === 0 && !el.share) {
            linkAddress = receiver.name.slice(8);
          } else if (receiver.name.indexOf('share:') === 0 && el.share) {
            linkAddress =
                receiver.name.slice(receiver.name.indexOf(':', 7) + 1);
          }
          return (addressNoService === linkAddress);
        });
        err = lookupError(err);
        if (matchedSubs.length > 0) {
          logger.log('debug', client.id, 'matchedSubs', matchedSubs);
          logger.log('emit', client.id, 'error', err);
          client.emit('error', err);
        } else {
          finishedSubscribing(err, callback);
        }
      }
    };
    messenger.createReceiver(address, link).then(function(receiver) {
      logger.log('debug', client.id, 'createReceiver', receiver);
      receiver.on('message', function(message) {
        processMessage(client, receiver, message);
      });
      receiver.on('detached', function(info) {
        logger.log('debug', client.id, 'detached', info);
        if (info.error) {
          var err = info.error;
          handleLinkError(receiver, err);
        }
      });
      receiver.on('errorReceived', function(err) {
        logger.log('debug', client.id, 'errorReceived', err);
        handleLinkError(receiver, err);
      });
      if (receiver.remote.handle === undefined) {
        if (receiver.remote.detach === undefined) {
          // ignore for now as we should receive a 'detached' event shortly
        } else {
          handleLinkError(receiver, receiver.remote.detach.error);
        }
      } else {
        finishedSubscribing.apply(receiver, [null, callback]);
      }
    }).catch(function(err) {
      logger.caught('Client.subscribe', client.id, err);
      finishedSubscribing(err, callback);
    }).error(function(err) {
      logger.caught('Client.subscribe', client.id, err);
      finishedSubscribing(err, callback);
    });
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
 * @return {Client} the instance of the client that the subscribe method was
 *                  invoked on.
 * @throws {TypeError} one of the  parameters is of the wrong type.
 * @throws {Error} if the topic pattern parameter is undefined.
 */
Client.prototype.unsubscribe = function(topicPattern, share, options,
                                        callback) {
  logger.entry('Client.unsubscribe', this.id);
  logger.log('parms', this.id, 'topicPattern:', topicPattern);

  // Must accept at least one option - and first option is always a
  // topicPattern.
  var err;
  if (arguments.length === 0) {
    err = new TypeError('You must specify a \'topicPattern\' argument');
    logger.throw('Client.unsubscribe', this.id, err);
    throw err;
  }
  if (!topicPattern) {
    err = new TypeError('You must specify a \'topicPattern\' argument');
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
      err = new InvalidArgumentError('share argument value \'' + share +
                                     '\' is invalid because it contains a ' +
                                     'colon (\':\') character');
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
        err = new RangeError('options:ttl value \'' +
                             options.ttl +
                             '\' is invalid, only 0 is a supported value for ' +
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
  var subscriptionAddress = client._getService() + '/' + topicPattern;

  // Check that there is actually a subscription for the pattern and share
  var subscribed = false;
  var receiver;
  var i = 0;
  for (i = 0; i < client._subscriptions.length; i++) {
    if (client._subscriptions[i].address === subscriptionAddress &&
        client._subscriptions[i].share === originalShareValue) {
      subscribed = true;
      receiver = client._subscriptions[i].receiver;
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

  if (!subscribed) {
    err = new UnsubscribedError('client is not subscribed to this address');
    logger.throw('Client.unsubscribe', this.id, err);
    throw err;
  }

  var finishedUnsubscribing = function(err, callback) {
    logger.entry('Client.unsubscribe.finishedUnsubscribing', client.id);
    logger.log('parms', client.id, 'err:', err, ', topicPattern:',
               topicPattern);

    if (callback) {
      setTimeout(function() {
        logger.entry('Client.unsubscribe.finishedUnsubscribing.callback',
                     client.id);
        logger.log('parms', client.id, 'err:', err, ', topicPattern:',
                   topicPattern, ', originalShareValue:', originalShareValue);
        callback.apply(client, [err, topicPattern, originalShareValue]);
        logger.exit('Client.unsubscribe.finishedUnsubscribing.callback',
                    client.id, null);
      }, 100);
    }

    if (err) {
      if (shouldReconnect(err)) {
        logger.log('data', client.id, 'client error "' + err + '" during ' +
                   'messenger.unsubscribe call so queueing the unsubscribe ' +
                   'request');
        queueUnsubscribe();
        reconnect(client);
      }

      process.nextTick(function() {
        logger.log('emit', client.id, 'error', err);
        client.emit('error', err);
      });
    } else {
      // if no errors, remove this from the stored list of subscriptions
      for (i = 0; i < client._subscriptions.length; i++) {
        if (client._subscriptions[i].address === subscriptionAddress &&
            client._subscriptions[i].share === originalShareValue) {
          client._subscriptions.splice(i, 1);
          break;
        }
      }
    }

    logger.exit('Client.unsubscribe.finishedUnsubscribing', client.id, null);
  };

  // unsubscribe using the specified topic pattern and share options
  try {
    var closed = (ttl === 0);
    receiver.detach({closed: closed}).then(function() {
      finishedUnsubscribing(null, callback);
    }).catch(function(err) {
      if (closed || err !== 'link not closed') {
        logger.caught('Client.unsubscribe', client.id, err);
        finishedUnsubscribing(err, callback);
      } else {
        finishedUnsubscribing(null, callback);
      }
    });
  } catch (err) {
    logger.caught('Client.unsubscribe', client.id, err);
    finishedUnsubscribing(err, callback);
  }

  logger.exit('Client.unsubscribe', client.id, client);
  return client;
};

/* ------------------------------------------------------------------------- */
