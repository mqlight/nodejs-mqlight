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

var mqlight = require('mqlight');

module.exports = testCase({
  
  /**
   * Testcase to validate the mqlight.createClient function
   */
  "Test createClient" : testCase({
    
    "Test createClient - good options" : function(test) {
      test.expect(6);
      var opts = {
        service : "amqp://myhost.1234:5672",
        id : "test"
      };
      var client = mqlight.createClient(opts);
      test.ok(typeof client === 'object', "CreateClient returns an object");
      test.equal("test", client.getId(),"Client id equals what was set");
      test.equal("disconnected", client.getState(),"Initial state is disconnected");
      test.equal(undefined, client.getService(),"Service is undefined before a connect call");
      //when connect does something useful should move this out to a more suitable test
      client.connect(function(err){
        if (err) {
          //shoudln't get here
          console.log("error on connection: " +err);
          test.ok(false);
          test.done();         
        }
      });
      client.on('connected', function(){
        test.equal("connected", client.getState(), "Client state equals connected once the connected event is emitted");
        test.equal(opts.service, client.getService(), "Supplied service matches result of getService after connect");
        test.done();
      });
    },

    "Test createClient - bad options" : function(test) {
      test.expect(4);
      //service as not a string
      test.throws(function() {
        var opts = {
          service : 123,
          id : "test"
        };
        mqlight.createClient(opts);
      }, function(err) {
        if ((err instanceof TypeError) && /service must be a string or array type/.test(err)) {
          return true;
        }
      }, "Service parameter as non string/array test");
      
      //id not as a string
      test.throws(function() {
        var opts = {
          service : "amqp://localhost:5672",
          id : 1234
        };
        mqlight.createClient(opts);
      }, function(err) {
        if ((err instanceof TypeError) && /Client identifier must be a string type/.test(err)) {
          return true;
        } 
      }, "Client identifier as a non string test");
      
      //user not a string
      test.throws(function() {
        var opts = {
          service : "amqp://localhost:5672",
          id : "testid",
          user : 124
        };
        mqlight.createClient(opts);
      }, function(err) {
        if ( (err instanceof TypeError) && /user must be a string type/.test(err)) {
          return true;
        }
      }, "user parameter as a non string test");

      //password not a string
      test.throws(function() {
        var opts = {
          service : "amqp://localhost:5672",
          id : "testid",
          user : "myuser",
          password : function(){console.log("rubbish function")}
        };
        mqlight.createClient(opts);
      }, function(err) {
        if ( (err instanceof TypeError) && /password must be a string type/.test(err)) {
          return true;
        }
      }, "password parameter as a non string test");
      test.done();
    },

    "Test createClient - invalid URIs" : function(test) {

      var invalidUris = ["amqp://amqp://Wrong", "amqp://localhost:34:34",
        "amqp://test:-34", "amqp://here:34/path", "amqp://rupert:password@NotThere",
        "amqp://:34"];

      test.expect(invalidUris.length);
      for( var i = 0; i < invalidUris.length; i++ ){
          test.throws(function(){
            var opts = {
              service : invalidUris[i],
              id : "testid"
            };
            mqlight.createClient(opts);
          }, function(err) {
            if ( err instanceof Error ) {
              return true;
            }
          }, "invalid URI test ("+i+"): "+invalidUris[i]);
      }
      test.done();
    }
  })
});
