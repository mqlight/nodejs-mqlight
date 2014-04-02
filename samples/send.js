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

var mqlight = require('mqlight');

try {
  var nopt = require('nopt');
} catch (_) {
  var nopt = require(require.resolve('npm') + '/../../node_modules/nopt');
}

// parse the commandline arguments
var types = {
  address : String,
  delay : Number
};
var shorthands = {
  a : [ "--address" ],
  d : [ "--delay" ],
  h : [ "--help" ]
};
var parsed = nopt(types, shorthands, process.argv, 2);

if (parsed.help) {
  console.log("Usage: send.js [options] <msg_1> ... <msg_n>");
  console.log("");
  console.log("Options:");
  console.log("  -h, --help            show this help message and exit");
  console.log("  -a ADDRESS, --address=ADDRESS");
  console.log("                        address: amqp://<domain>/<name>");
  console.log("                        (default amqp://localhost/public)");
  console.log("  -d NUM, --delay=NUM   add a NUM seconds time delay between each request");
  console.log("");
  process.exit(0);
}

// defaults
var hostname = 'localhost';
var port = 5672;
var topic = 'public';

// extract override values from cmdline arguments (if given)
if (parsed.address) {
  var addr = parsed.address;
  if (addr.indexOf('amqp://') === 0) {
    hostname = addr.replace("amqp://", '');
  } else {
    hostname = addr;
  }

  if (hostname.indexOf('/') > -1) {
    topic = hostname.substring(hostname.indexOf('/') + 1);
    hostname = hostname.substring(0, hostname.indexOf('/'));
  } else {
    topic = addr;
  }
  if (hostname.indexOf(':') > -1) {
    var split = hostname.split(':');
    hostname = split[0];
    port = split[1];
  }
}

console.log("topic is: " + topic);

var service = "amqp://" + hostname + ":" + port;

// create client to connect to broker with
var opts = {
  service : service,
  id : "send.js"
};
var client = mqlight.createClient(opts);

// get message body data to send
var remain = parsed.argv.remain;
var data = (remain.length > 0) ? remain : [ "Hello World!" ];

// insert a delay between sends if requested
var delay = parsed.delay * 1000 || 0;

// Make the connection
client.connect(function(err) {
  if (err) {
    console.log(err);
  }
});

// once connection is acquired, send messages
client.on('connected', function() {
  console.log("Connected to service:" + service + " using client-id " + client.getId());

  // queue all messages for sending
  var i = 0;
  var sendNextMessage = function() {
    var body = data[i];
    client.send(topic, body, function(err, msg) {
      if (err) {
        console.error('Problem with send request: ' + err.message);
        process.exit(0);
      }
      if (msg) {
        console.log("# sent message:");
        console.log(msg);
      }
    });
    // if there are more messages pending, send the next in <delay> seconds time
    if (data.length > ++i) {
      if (delay > 0) {
        setTimeout(sendNextMessage, delay);
      } else {
        setImmediate(sendNextMessage);
      }
    } else {
      // wait a short time before exiting
      setTimeout(process.exit, 1500, 0);
    }
  };

  sendNextMessage();
});
