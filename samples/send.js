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
  topic: String,
  'message-ttl': Number,
  delay: Number,
  file: String
};
var shorthands = {
  h: ['--help'],
  s: ['--service'],
  t: ['--topic'],
  i: ['--id'],
  d: ['--delay'],
  f: ['--file']
};
var parsed = nopt(types, shorthands, process.argv, 2);

var showUsage = function() {
  var puts = console.log;
  puts('Usage: send.js [options] <msg_1> ... <msg_n>');
  puts('');
  puts('Options:');
  puts('  -h, --help            show this help message and exit');
  puts('  -s URL, --service=URL service to connect to, for example:\n' +
       '                        amqp://user:password@host:5672 or\n' +
       '                        amqps://host:5671 to use SSL/TLS\n' +
       '                        (default: amqp://localhost)');
  puts('  -t TOPIC, --topic=TOPIC');
  puts('                        send messages to topic TOPIC\n' +
       '                        (default: public)');
  puts('  -i ID, --id=ID        the ID to use when connecting to MQ Light\n' +
       '                        (default: send_[0-9a-f]{7})');
  puts('  --message-ttl=NUM     set message time-to-live to NUM seconds');
  puts('  -d NUM, --delay=NUM   add NUM seconds delay between each request');
  puts('  -f FILE, --file=FILE  send FILE as binary data. Cannot be\n' +
       '                        specified at the same time as <msg1>.');
  puts('');
};

if (parsed.help) {
  showUsage();
  process.exit(0);
}

var service = parsed.service ? parsed.service : 'amqp://localhost';
var topic = parsed.topic ? parsed.topic : 'public';
var id = parsed.id ? parsed.id : 'send_' + uuid.v4().substring(0, 7);

// create client to connect to broker with
var opts = {
  service: service,
  id: id
};
var client = mqlight.createClient(opts);

// get message body data to send
var remain = parsed.argv.remain;
var messages = [];

if (parsed.file) {
  if (remain.length > 0) {
    console.error('*** warning: ignoring additionally supplied arguments %s',
                  remain);
    console.error();
  }
  messages.push(fs.readFileSync(parsed.file));
} else if (remain.length > 0) {
  messages = remain;
} else {
  messages.push('Hello World!');
}

// insert a delay between sends if requested
var delay = parsed.delay * 1000 || 0;

// once connection is acquired, send messages
client.on('connected', function() {
  console.log('Connected to %s using client-id %s', client.service, client.id);
  console.log('Publishing to: %s', topic);

  // queue all messages for sending
  var i = 0;
  var sendNextMessage = function() {
    var body = messages[i];
    var options = { qos: mqlight.QOS_AT_LEAST_ONCE };
    if (parsed['message-ttl']) {
      options.ttl = Number(parsed['message-ttl']);
    }
    client.send(topic, body, options, function(err, topic, data, options) {
      if (err) {
        console.error('Problem with send request: %s', err.message);
        process.exit(1);
      }
      if (data) {
        console.log('# sent message:');
        console.log(data);
      }
      // if there are more messages pending, send the next in <delay> seconds
      if (messages.length > ++i) {
        if (delay > 0) {
          setTimeout(sendNextMessage, delay);
        } else {
          setImmediate(sendNextMessage);
        }
      } else {
        client.disconnect();
      }
    });
  };

  sendNextMessage();
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
