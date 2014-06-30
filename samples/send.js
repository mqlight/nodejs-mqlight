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
  service: String,
  topic: String,
  delay: Number
};
var shorthands = {
  s: ['--service'],
  t: ['--topic'],
  d: ['--delay'],
  h: ['--help']
};
var parsed = nopt(types, shorthands, process.argv, 2);

if (parsed.help) {
  console.log('Usage: send.js [options] <msg_1> ... <msg_n>');
  console.log('');
  console.log('Options:');
  console.log('  -h, --help            show this help message and exit');
  console.log('  -s URL, --service=URL service to connect to' +
              ' (default: amqp://localhost)');
  console.log('  -t TOPIC, --topic=TOPIC');
  console.log('                        send messages to topic TOPIC' +
              ' (default: public)');
  console.log('  -d NUM, --delay=NUM   add a NUM seconds time delay between' +
              ' each request');
  console.log('');
  process.exit(0);
}

var topic = parsed.topic ? parsed.topic : 'public';
var service = parsed.service ? parsed.service : 'amqp://localhost';

// create client to connect to broker with
var opts = {
  service: service,
  id: 'send_' + uuid.v4().substring(0, 7)
};
var client = mqlight.createClient(opts);

// get message body data to send
var remain = parsed.argv.remain;
var messages = (remain.length > 0) ? remain : ['Hello World!'];

// insert a delay between sends if requested
var delay = parsed.delay * 1000 || 0;

// once connection is acquired, send messages
client.on('connected', function() {
  console.log('Connected to %s using client-id %s', service, client.id);
  console.log('Publishing to: %s', topic);

  // queue all messages for sending
  var i = 0;
  var sendNextMessage = function() {
    var body = messages[i];
    client.send(topic, body, function(err, topic, data, options) {
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
