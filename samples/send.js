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

var mqlight = require('mqlight') || require('../../lib/node_modules/mqlight');
var nopt = require('nopt') || require(require.resolve('npm') + '/../../node_modules/nopt');

// parse the commandline arguments
var types = { address: String };
var shorthands = { a: ["--address"], h: ["--help"] };
var parsed = nopt(types, shorthands, process.argv, 2);

if (parsed.help) {
  console.log("Usage: send.js [options] <msg_1> ... <msg_n>");
  console.log("");
  console.log("simple message sender");
  console.log("");
  console.log("Options:");
  console.log("  -h, --help            show this help message and exit");
  console.log("  -a ADDRESS, --address=ADDRESS");
  console.log("                        address: //<domain>[/<name>] (default amqp://localhost)");
  process.exit(0);
}

// extract appropriate values from arguments
var broker = parsed.address || "amqp://localhost";
var hostname = broker.replace("amqp://", '');
var address = '';
if (hostname.indexOf('/') > -1) {
  address = hostname.substring(hostname.indexOf('/')+1);
  hostname = hostname.substring(0, hostname.indexOf('/'));
}
var port = 5672;
if (hostname.indexOf(':') > -1) {
  var split = hostname.split(':');
  hostname = split[0];
  port = split[1];
}

// connect client to broker
var client = mqlight.createClient(hostname, port, "send.js");

// catch Ctrl-C and cleanly shutdown
process.on('SIGINT', function() {
  if (client) client.close();
  process.exit(0);
});

// function to check if the client still has pending messages
var checkFinished = function() {
  client.send();
  if (client.messenger.hasOutgoing) {
    setTimeout(checkFinished, 2500);
  } else {
    console.log("Messages delivered");
    console.log("");
    console.log("Press <Ctrl-C> to exit.");

    // keep the client around for up to 2 minutes after all messages delivered
    setTimeout(function() {
      if (client) client.close();
      process.exit(0);
    }, 120000);
  }
};

// get message body data to send
var remain = parsed.argv.remain;
var data = (remain.length > 0) ? remain : ["Hello World!"];

client.on('connected', function() {
  console.log("Connected to " + hostname + ":" + port + " using client-id " + client.clientId);
  // publish message callback
  var cb = function(err, msg) {
    if (msg) {
      console.log("Send called with message:");
      console.log(msg);
    }
  };

  // queue all messages for sending
  var i = 0;
  var sendNextMessage = function(cb) {
    var body = data[i];
    var msg = client.createMessage(address, body);
    if (msg) client.send(msg, cb);
    // if there are more messages pending, send the next in 5 seconds time
    if (++i < data.length) {
      setTimeout(sendNextMessage, 5000, cb);
    } else {
      client.send();
      setTimeout(checkFinished, 5000);
    }
  };
  sendNextMessage(cb);
});



