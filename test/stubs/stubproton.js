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

/**
 * A no-function stub for the native Proton code.
 */
module.exports.createProtonStub = function() {

  var DEBUG = false;
  var started = false;
  
	return {
	   messenger : {
	    send: function() {
	      if (DEBUG) console.log('stub send function called');
	    },
	    start: function() {
	      if (DEBUG) console.log('stub start function called');
	      start = true;
	    },
	    status: function() {
	      if (DEBUG) console.log('stub status function called');
	      return 7; // PN_STATUS_SETTLED = 7;
	    },
	    settle: function() {
	      if (DEBUG) console.log('stub settle function called');
	    },
	    connect: function() {
	      if (DEBUG) console.log('stub connect function called');
	    },
	    receive: function() {
	      // Commented - as generates a lot of output...
	      // if (DEBUG) console.log('stub receive function called');
	      return [];
	    },
	    stop: function() {
	      if (DEBUG) console.log('stub stop function called');
	      started = false;
	    },
	    put: function() {
	      if (DEBUG) console.log('stub put function called');
	    },
	    hasSent: function() {
	      if (DEBUG) console.log('stub hasSent function called');
	      return true;
	    },
	    stopped: function() {
	      if (DEBUG) console.log('stub stopped function called');
	      return !started;
	    },
	    subscribe: function() {
	      if (DEBUG) console.log('stub subscribe function called');
	    }
	  },
	  
	  createMessenger : function() {
			if (DEBUG) console.log('stub createMessenger function called');
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