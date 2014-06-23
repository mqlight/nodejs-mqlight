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
/* jslint node: true */
/* jshint -W083,-W097 */
'use strict';

var mqlight = require('mqlight');
var nopt = require('nopt');
var uuid = require('node-uuid');

// parse the commandline arguments
var types = {
  'share-name': String,
  service: String,
  'topic-pattern': String
};
var shorthands = {
  h: ['--help'],
  n: ['--share-name'],
  s: ['--service'],
  t: ['--topic-pattern']
};
var parsed = nopt(types, shorthands, process.argv, 2);
var remain = parsed.argv.remain;

if (parsed.help || remain.length > 0) {
  console.log('Usage: recv.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  -h, --help            show this help message and exit');
  console.log('  -s URL, --service=URL service to connect to' +
              ' (default: amqp://localhost)');
  console.log('  -t TOPICPATTERN, --topic-pattern=TOPICPATTERN');
  console.log('                        subscribe to receive messages matching' +
              ' TOPICPATTERN');
  console.log('                        (default: public)');
  console.log('  -n NAME, --share-name NAME');
  console.log('                        optionally, subscribe to a shared' +
              ' destination using');
  console.log('                        NAME as the share name.');
  console.log('');

  if (parsed.help) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

var service = parsed.service ? parsed.service : 'amqp://localhost';
var topic = parsed['topic-pattern'] ? parsed['topic-pattern'] : 'public';

// connect client to broker
var opts = {
  service: service,
  id: 'recv_' + uuid.v4().substring(0, 7)
};
var client = mqlight.createClient(opts);

// once connection is acquired, receive messages from the required topic
client.on('connected', function() {
  console.log('Connected to %s using client-id %s', service, client.getId());

  // now subscribe to topic for publications
  client.subscribe(topic, parsed['share-name'], function(err, pattern) {
    if (err) {
      console.error('Problem with subscribe request: %s', err.message);
      process.exit(1);
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
  client.on('malformed', function(data, delivery) {
    console.error('*** received malformed message (%d)', (++i));
    console.error(data);
    console.error(delivery);
  });
});

client.on('error', function(error) {
  console.error('*** error ***');
  if (error) {
    if (error.message) console.error('message: %s', error.message);
    else if (error.stack) console.error(error.stack);
  }
  console.error('exiting.');
  process.exit(1);
});

// Make the connection
client.connect(function(err) {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
});
