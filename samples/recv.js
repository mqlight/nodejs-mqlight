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
} catch(_) {
  var nopt = require(require.resolve('npm') + '/../../node_modules/nopt');
}

// parse the commandline arguments
var types = {};
var shorthands = { h: ["--help"] };
var parsed = nopt(types, shorthands, process.argv, 2);
var remain = parsed.argv.remain;

if (parsed.help || remain.length > 1) {
  console.log("Usage: recv.js [options] <address>");
  console.log("                          address: amqp://<domain>[/<name>]");
  console.log("                          (default amqp://localhost/public)");
  console.log("");
  console.log("simple message receiver");
  console.log("");
  console.log("Options:");
  console.log("  -h, --help            show this help message and exit");
  if (parsed.help) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// extract appropriate values from arguments
var broker = remain[0] || "amqp://localhost/public";
var hostname = broker.replace("amqp://", '');
var topic = '';
if (hostname.indexOf('/') > -1) {
  topic = hostname.substring(hostname.indexOf('/')+1);
  hostname = hostname.substring(0, hostname.indexOf('/'));
}
var port = 5672;
if (hostname.indexOf(':') > -1) {
  var split = hostname.split(':');
  hostname = split[0];
  port = split[1];
}

// connect client to broker
var opts = { host: hostname, port: port, clientId: "recv.js"};
var client = mqlight.createClient(opts);

client.on('connected', function() {
  console.log("Connected to " + hostname + ":" + port + " using client-id " +
    client.clientId);

  // now subscribe to topic for publications
  var destination = client.createDestination(topic, function(err, address) {
    if (err) {
      console.error('Problem with createDestination request: ' + err.message);
      process.exit(0);
    }
    if (address) {
      console.log("Subscribing to " + address);
    }
  });

  // listen to new message events and process them
  var i = 0;
  destination.on('message', function(msg) {
    console.log('# received message (' + (++i) + ')');
    console.log(msg);
  });
});

