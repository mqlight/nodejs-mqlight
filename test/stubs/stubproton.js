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
 * (C) Copyright IBM Corp. 2014
 *
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with
 * IBM Corp.
 * </copyright>
 */

var DEBUG = false;
  
var connectStatus = 0;
exports.setConnectStatus = function(status) {
  if (DEBUG) console.log("setting connect status to: "+status);
  connectStatus = status;
}

/**
 * A no-function stub for the native Proton code.
 */
module.exports.createProtonStub = function() {
  
	return {
	   messenger : {
	    send: function() {
	      if (DEBUG) console.log('stub send function called');
	    },
	    status: function() {
	      if (DEBUG) console.log('stub status function called');
	      return 7; // PN_STATUS_SETTLED = 7;
	    },
	    accept: function() {
	        if (DEBUG) console.log('stub accept function called');
	    },
	    settle: function() {
	      if (DEBUG) console.log('stub settle function called');
	    },
      connect: function(service) {
        if (DEBUG) console.log('stub connect function called for service: ' + service);
        if (!this.stopped) throw new Error("already connected");
        var result;
        if (service.indexOf('bad') != -1) {
          result = -2;
          this.lastErrorText = 'bad service '+service;
          if (DEBUG) console.log('connect will fail, error: ' + this.lastErrorText);
        } else {
          if (connectStatus != 0) {
            this.lastErrorText = 'connect error: ' + connectStatus;
            if (DEBUG) console.log('connect will fail, error: ' + this.lastErrorText);
          } else {
            this.lastErrorText = '';
            this.stopped = false;
            if (DEBUG) console.log('successfully connected');
          }
          result = connectStatus;
        }
        if (DEBUG) console.log('stub connect function returning ' + result);
        return result;
      },
	    receive: function() {
	      // Commented - as generates a lot of output...
	      // if (DEBUG) console.log('stub receive function called');
	      return [];
	    },
	    stop: function() {
	      if (DEBUG) console.log('stub stop function called');
 	      this.stopped = true;
	    },
	    put: function() {
	      if (DEBUG) console.log('stub put function called');
	    },
	    hasSent: function() {
	      if (DEBUG) console.log('stub hasSent function called');
	      return true;
	    },
	    stopped: true,
	    subscribe: function() {
	      if (DEBUG) console.log('stub subscribe function called');
	    },
	    lastErrorText: '',
	    getLastErrorText: function() {
        if (DEBUG) console.log('stub getLastErrorText function called, returning: '+this.lastErrorText);
        return this.lastErrorText;
      }
	  },
	  
	  createMessenger : function() {
			if (DEBUG) console.log('stub createMessenger function called');
			connectStatus = 0;
			this.messenger.lastErrorText = '';
			this.messenger.stopped = true;
			return this.messenger;
		},
		
	  createMessage : function() {
	    if (DEBUG) console.log('stub createMessage function called');
	    return {
	      destroy: function() {
	        if (DEBUG) console.log('stub destroy function called');
	      }
	    }
	  }
	}
};