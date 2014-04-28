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

var testCase = require('nodeunit').testCase;

var mqlight = require('../mqlight');

module.exports = testCase({
  
  /**
   * Testcase to validate the mqlight.send function
   */
  "Test send" : testCase({

    "Test send - invalid options" : function(test) {
      
      var opts = { service : "amqp://localhost:5672"};
      var client = mqlight.createClient(opts);
      client.connect();
      var undefinedTopics = ["", undefined, null];
      test.expect(undefinedTopics.length);
      //Test you can't send to an undefined topic.
      for ( var i = 0; i < undefinedTopics.length; i++ ) {
        test.throws(function(s){
          //console.log(undefinedTopics[i]);
          client.send(undefinedTopics[i],"msg");
        }, function(err) {
          if ( err instanceof TypeError && /Cannot send to undefined topic/.test(err)){
            return true;
          } 
        }, "undefined topic test ("+i+")"); 
      }
      test.done();
    }    
  })
});
