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

var util = require('util');
var Promise = require('bluebird');

var DEBUG = process.env.MQLIGHT_NODE_STUB_DEBUG || false;
var log = process.env.MQLIGHT_NODE_STUB_LOG_ERROR ? console.error : console.log;

var connectStatus = 0;


/**
 * Override the proton connection status.
 *
 * @param {string} status Specifies the status to override with.
 */
exports.setConnectStatus = function(status) {
  if (DEBUG) log('setting connect status to:', status);
  connectStatus = status;
};

var sendStatus = 7; // PN_STATUS_SETTLED = 7


/**
 * Temporarily blocks message sends from completing by forcing the status to
 * return as PN_STATUS_PENDING.
 */
exports.blockSendCompletion = function() {
  if (DEBUG) log('blocking send completion');
  sendStatus = 1; // PN_STATUS_PENDING = 1
};


/**
 * Removes a block on message sends by forcing the status to PN_STATUS_SETTLED.
 */
exports.unblockSendCompletion = function() {
  if (DEBUG) log('unblocking send completion');
  sendStatus = 7;
};

var remoteIdleTimeout = -1;
var workCallback;


/**
 * Sets a remoteIdleTimeout value to return.
 *
 * @param {Number}
 *          interval the value to override the remote idle timeout
 *          property with.
 * @param {function} callback
 */
exports.setRemoteIdleTimeout = function(interval, callback) {
  if (DEBUG) log('setRemoteIdleTimeout to', interval);
  remoteIdleTimeout = interval;
  workCallback = callback;
};

exports.receiver = {
  remote: {
    handle: 0
  },
  on: function() {},
  detach: function() {
    return new Promise(function(resolve, reject) {
      if (connectStatus === 0) {
        resolve(true);
      } else {
        var err = new Error('error on unsubscribe: ' + connectStatus);
        err.name = 'NetworkError';
        reject(err);
      }
    });
  },
  _sendDetach2: function() {}
};
exports.sender = {
  send: function() {
    return new Promise(function(resolve) {
      resolve(true);
    });
  }
};

/**
 * A no-function stub for the native Proton code.
 *
 * @return {object} a stub for the proton module.
 */
module.exports.createProtonStub = function() {
  return {
    messenger: {
      on: function(event) {
        if (DEBUG) log('stub event handler added for event', event);
      },
      send: function() {
        if (DEBUG) log('stub send function called');
      },
      sending: function(address) {
        if (DEBUG) log('stub sending function called with address', address);
        return true;
      },
      status: function(msg) {
        var result = sendStatus;
        if (result === 7 && msg.unitTestQos === 0) {
          result = 0;
        }
        if (DEBUG) log('stub status function called, returning:', result);
        return result;
      },
      statusError: function() {
        if (DEBUG) log('stub statusError function called');
        return '';
      },
      accept: function() {
        if (DEBUG) log('stub accept function called');
      },
      settle: function() {
        if (DEBUG) log('stub settle function called');
      },
      settledCount: 0,
      settled: function() {
        if (DEBUG) log('stub settled function called');
        if (connectStatus !== 0) {
          var err = new Error('error on settle: ' + connectStatus);
          err.name = 'NetworkError';
          throw err;
        } else {
          if (++this.settledCount >= 2) {
            return true;
          } else {
            return false;
          }
        }
      },
      connect: function(service, options) {
        var self = this;
        return new Promise(function(resolve, reject) {
          if (DEBUG) log('stub connect function called for service:', service);
          if (!self.stopped) throw new Error('already connected');
          var href = service.href;
          var err = null;
          if (href.indexOf('fail') !== -1) {
            if (DEBUG) log('connect received bad service');
            err = new TypeError('bad service ' + href);
          } else if (options.host.indexOf('bad') !== -1) {
            if (DEBUG) log('connect received bad connection');
            err = new Error('ECONNREFUSED bad service ' + options.host);
            err.code = 'ECONNREFUSED';
          } else if (options.sslTrustCertificate === 'BadCertificate') {
            if (DEBUG) log('connect received bad certificate');
            err = new Error('Bad Certificate wrong tag');
          } else if (options.sslTrustCertificate === 'BadVerify') {
            if (DEBUG) log('connect received bad verify');
            err =
              new Error('Hostname/IP doesn\'t match certificate\'s altnames');
          } else if (options.sslTrustCertificate === 'SelfSignedCertificate') {
            if (DEBUG) log('connect received self-signed certificate');
            err =
              new Error('DEPTH_ZERO_SELF_SIGNED_CERT');
            err.code = err.message;
          } else if (options.sslTrustCertificate === 'ExpiredCertificate') {
            if (DEBUG) log('connect received expired certificate');
            err = new Error('CERT_HAS_EXPIRED');
            err.code = err.message;
          } else if (options.sslClientCertificate === 'BadCertificate') {
            if (DEBUG) log('connect received bad client certificate');
            err = new Error('Bad Certificate');
          } else if (options.sslClientKey === 'BadKey') {
            if (DEBUG) log('connect received bad client key');
            err = new Error('Bad Key');
          } else if (options.sslKeystore === 'BadKeystore') {
            if (DEBUG) log('connect received bad keystore');
            err = new Error('Bad Keystore');
          } else if (connectStatus !== 0) {
            if (DEBUG) log('connect received connect error');
            err = new Error('connect error: ' + connectStatus);
            err.name = 'NetworkError';
          }
          if (err) {
            reject(err);
          } else {
            self.stopped = false;
            if (DEBUG) log('successfully connected');
            resolve();
          }
        });
      },
      connected: function() {
        if (DEBUG) log('stub connected function called');
        return !this.stopped;
      },
      receive: function() {
        // Commented - as generates a lot of output...
        // if (DEBUG) log('stub receive function called');
        return [];
      },
      disconnect: function() {
        var self = this;
        return new Promise(function(resolve, reject) {
          if (DEBUG) log('stub disconnect function called');
          self.stopped = true;
          resolve();
        });
      },
      put: function(msg, qos) {
        if (DEBUG) log('stub put function called');
        msg.unitTestQos = qos;
      },
      hasSent: function() {
        if (DEBUG) log('stub hasSent function called');
        return true;
      },
      started: function() {
        return true;
      },
      stopped: true,
      subscribe: function() {
      },
      createSender: function() {
        return new Promise(function(resolve) {
          resolve(exports.sender);
        });
      },
      createReceiver: function() {
        return new Promise(function(resolve, reject) {
          if (DEBUG) log('stub subscribe function called');
          if (connectStatus === 0) {
            resolve(exports.receiver);
          } else {
            var err = new Error('error on subscribe: ' + connectStatus);
            err.name = 'NetworkError';
            reject(err);
          }
        });
      },
    },
  };
};
