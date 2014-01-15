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

//var mqlight = require('../../lib/node_modules/mqlight');
var mqlight = require('/tmp/mqlight/lib/node_modules/mqlight');
var nopt = require('nopt');

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
  console.log("                        address: //<domain>[/<name>] (default amqp://0.0.0.0)");
  process.exit(0);
}

// extract appropriate values from arguments
var broker = parsed.address || "amqp://0.0.0.0";
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
var client = new mqlight(hostname, port);

// catch Ctrl-C and cleanly shutdown
process.on('SIGINT', function() {
  if (client) client.close();
  process.exit(0);
});

// get message body data to send
var remain = parsed.argv.remain;
var data = (remain.length > 0) ? remain : ["Hello World!"];

// publish message(s)
var cb = function(err, msg) {
  if (msg) {
    console.log("Send called with message:");
    console.log(msg);
  }
};
for (var i = 0; i < data.length; i++) {
  var body = data[i];
  var msg = client.createMessage(address, body);
  if (msg) client.send(msg, cb);
}

// whilst the client still has pending messages, keep calling send
var checkFinished = function() {
  console.log("hasOutgoing: " + client.messenger.hasOutgoing);
  if (client.messenger.hasOutgoing) {
    client.send();
    setTimeout(checkFinished, 2500);
  } else {
    client.send();
    console.log("Messages delivered");
  }
};
process.nextTick(checkFinished);

