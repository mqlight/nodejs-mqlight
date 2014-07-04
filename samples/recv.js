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
var fs = require('fs');

// parse the commandline arguments
var types = {
  service: String,
  'topic-pattern': String,
  id: String,
  'destination-ttl': Number,
  'share-name': String,
  file: String
};
var shorthands = {
  h: ['--help'],
  s: ['--service'],
  t: ['--topic-pattern'],
  i: ['--id'],
  n: ['--share-name'],
  f: ['--file']
};
var parsed = nopt(types, shorthands, process.argv, 2);
var remain = parsed.argv.remain;

var showUsage = function() {
  var puts = console.log;
  puts('Usage: recv.js [options]');
  puts('');
  puts('Options:');
  puts('  -h, --help            show this help message and exit');
  puts('  -s URL, --service=URL service to connect to, for example:\n' +
       '                        amqp://user:password@host:5672 or\n' +
       '                        amqps://host:5671 to use SSL/TLS\n' +
       '                        (default: amqp://localhost)');
  puts('  -t TOPICPATTERN, --topic-pattern=TOPICPATTERN\n' +
       '                        subscribe to receive messages matching' +
       ' TOPICPATTERN');
  puts('                        (default: public)');
  puts('  -i ID, --id=ID        the ID to use when connecting to MQ Light\n' +
       '                        (default: recv_[0-9a-f]{7})');
  puts('  --destination-ttl=NUM set destination time-to-live to NUM seconds');
  puts('  -n NAME, --share-name NAME');
  puts('                        optionally, subscribe to a shared' +
       ' destination using\n' +
       '                        NAME as the share name.');
  puts('  -f FILE, --file=FILE  write the payload of the next message' +
       ' received to\n' +
       '                        FILE (overwriting previous file contents)' +
       ' then end.\n' +
       '                        (default is to print messages to stdout)');
  puts('');
};

if (parsed.help) {
  showUsage();
  process.exit(0);
} else if (remain.length > 0) {
  showUsage();
  process.exit(1);
}

var service = parsed.service ? parsed.service : 'amqp://localhost';
var pattern = parsed['topic-pattern'] ? parsed['topic-pattern'] : 'public';
var id = parsed.id ? parsed.id : 'recv_' + uuid.v4().substring(0, 7);
var share = parsed['share-name'] ? parsed['share-name'] : undefined;

// connect client to broker
var opts = {
  service: service,
  id: id
};
var client = mqlight.createClient(opts);

// once connection is acquired, receive messages for the supplied pattern
client.on('connected', function() {
  console.log('Connected to %s using client-id %s', client.service, client.id);
  var options = { qos: mqlight.QOS_AT_LEAST_ONCE, autoConfirm: false };
  if (parsed['destination-ttl']) {
    options.ttl = Number(parsed['destination-ttl']) * 1000;
  }

  // now subscribe to pattern for messages
  client.subscribe(pattern, share, options, function(err, pattern) {
    if (err) {
      console.error('Problem with subscribe request: %s', err.message);
      process.exit(1);
    }
    if (pattern) {
      if (share) {
        console.log('Subscribed to share: %s, pattern: %s', share, pattern);
      } else {
        console.log('Subscribed to pattern: %s', pattern);
      }
    }
  });

  // listen to new message events and process them
  var i = 0;
  client.on('message', function(data, delivery) {
    console.log('# received message (%d)', (++i));
    if (parsed.file) {
      console.log('Writing message data to %s', parsed.file);
      fs.writeFileSync(parsed.file, data);
      delivery.message.confirmDelivery();
      client.disconnect(function() {
        console.error('Exiting.');
        process.exit(0);
      });
    } else {
      console.log(data);
      console.log(delivery);
      delivery.message.confirmDelivery();
    }
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
  console.error('Exiting.');
  process.exit(1);
});

// Make the connection
client.connect(function(err) {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
});
