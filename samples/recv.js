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
var nopt = require('nopt');
var uuid = require('node-uuid');

// parse the commandline arguments
var types = {
  share: String
};
var shorthands = {
  h: ['--help'],
  s: ['--share']
};
var parsed = nopt(types, shorthands, process.argv, 2);
var remain = parsed.argv.remain;

if (parsed.help || remain.length > 1) {
  console.log('Usage: recv.js [options] <address>');
  console.log('                          address: amqp://<domain>/<name>');
  console.log('                          (default amqp://localhost/public)');
  console.log('');
  console.log('Options:');
  console.log('  -h, --help            show this help message and exit');
  console.log('  -s, --share           specify an optional share name to ' +
              'create or join a');
  console.log('                        shared subscription for the given ' +
              'topic');
  console.log('');
  if (parsed.help) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// defaults
var hostname = 'localhost';
var port = 5672;
var topic = 'public';

// extract override values from cmdline arguments (if given)
if (remain[0]) {
  var addr = remain[0];
  if (addr.indexOf('amqp://') === 0) {
    hostname = addr.replace('amqp://', '');
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

var service = 'amqp://' + hostname + ':' + port;

// connect client to broker
var opts = {
  service: service,
  id: 'recv_' + uuid.v4().substring(0, 7)
};
var client = mqlight.createClient(opts);

// Make the connection
client.connect(function(err) {
  if (err) {
    console.log(err);
  }
});

// once connection is acquired, receive messages from the required topic
client.on('connected', function() {
  console.log('Connected to %s using client-id %s', service, client.getId());

  // now subscribe to topic for publications
  client.subscribe(topic, parsed.share, function(err, pattern) {
    if (err) {
      console.error('Problem with subscribe request: ' + err.message);
      process.exit(0);
    }
    if (pattern) {
      console.log('Subscribed to: %s', pattern);
    }
  });

  // listen to new message events and process them
  var i = 0;
  client.on('message', function(data, delivery) {
    console.log('# received message (%d)', (++i));
    console.log(data);
    console.log(delivery);
  });
});
