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

try {
  var mqlight = require('mqlight');
} catch(_) {
  var mqlight = require('../../lib/node_modules/mqlight');
}

try {
  var nopt = require('nopt');
} catch(_) {
  var nopt = require(require.resolve('npm') + '/../../node_modules/nopt');
}

// parse the commandline arguments
var types = { address: String, delay: Number };
var shorthands = { a: ["--address"], d: ["--delay"], h: ["--help"] };
var parsed = nopt(types, shorthands, process.argv, 2);

if (parsed.help) {
  console.log("Usage: send.js [options] <msg_1> ... <msg_n>");
  console.log("");
  console.log("simple message sender");
  console.log("");
  console.log("Options:");
  console.log("  -h, --help            show this help message and exit");
  console.log("  -a ADDRESS, --address=ADDRESS");
  console.log("                        address: amqp://<domain>[/<name>]");
  console.log("                        (default amqp://localhost)");
  console.log("  -d NUM, --delay=NUM   add a NUM seconds time delay between each request");
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

// create client to connect to broker with
var client = mqlight.createClient(hostname, port, "send.js");

// get message body data to send
var remain = parsed.argv.remain;
var data = (remain.length > 0) ? remain : ["Hello World!"];

// insert a delay between sends if requested
var delay = parsed.delay * 1000 || 0;

// once connection is acquired, send messages
client.on('connected', function() {
  console.log("Connected to " + hostname + ":" + port + " using client-id " +
              client.clientId);
  // queue all messages for sending
  var i = 0;
  var sendNextMessage = function() {
    var body = data[i];
    var msg = client.createMessage(address, body);
    if (msg) {
      client.send(msg, function(err, msg) {
        if (msg) {
          console.log("Sent message:");
          console.log(msg);
        }
      });
    }
    // if there are more messages pending, send the next in delay seconds time
    if (data.length > ++i) {
      if (delay > 0) {
        setTimeout(sendNextMessage, delay);
      } else {
        process.nextTick(sendNextMessage);
      }
    }
  };

  sendNextMessage();
});



