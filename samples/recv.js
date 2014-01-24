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
var types = {};
var shorthands = { h: ["--help"] };
var parsed = nopt(types, shorthands, process.argv, 2);
var remain = parsed.argv.remain;

if (parsed.help || remain.length != 1) {
  console.log("Usage: recv.js [options] <address>");
  console.log("                        address: //<domain>[/<name>]");
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
var broker = remain[0] || "amqp://0.0.0.0";
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
var client = mqlight.createClient(hostname, port, "recv.js");

// catch Ctrl-C and cleanly shutdown
process.on('SIGINT', function() {
  if (client) client.close();
  process.exit(0);
});

client.on('connected', function() {
  console.log("Connected to " + hostname + ":" + port + " using client-id " + client.clientId);

  // subscribe callback
  var cb = function(err, address) {
    if (address) {
      console.log("Subscribing to " + address);
    }
  };

  // now subscribe to topic for publications
  var destination = client.createDestination(address, 5000, cb);

  // listen to new message events and process them
  destination.on('message', function(msg) {
    console.log('# received message');
    console.log(msg);
  });

  // listen for the closed destination event and shutdown
  destination.on('closed', function() {
    console.log('destination closed');
    if (client) client.close();
    process.exit(0);
  });
});

