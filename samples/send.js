/* %Z% %W% %I% %E% %U% */
/*
 * <copyright
 * notice="lm-source-program"
 * pids="5725-P60"
 * years="2013,2014"
 * crc="3568777996" >
 * Licensed Materials - Property of IBM
 *
 * 5725-P60
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
  help: Boolean,
  service: String,
  'trust-certificate': String,
  topic: String,
  id: String,
  'message-ttl': Number,
  delay: Number,
  repeat: Number,
  sequence: Boolean,
  file: String
};
var shorthands = {
  h: ['--help'],
  s: ['--service'],
  c: ['--trust-certificate'],
  t: ['--topic'],
  i: ['--id'],
  d: ['--delay'],
  r: ['--repeat'],
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
  puts('  -c FILE, --trust-certificate=FILE\n' +
       '                        use the certificate contained in FILE (in\n' +
       '                        PEM or DER format) to validate the\n' +
       '                        identify of the server. The connection must\n' +
       '                        be secured with SSL/TLS (e.g. the service\n' +
       "                        URL must start 'amqps://')");
  puts('  -t TOPIC, --topic=TOPIC');
  puts('                        send messages to topic TOPIC\n' +
       '                        (default: public)');
  puts('  -i ID, --id=ID        the ID to use when connecting to MQ Light\n' +
       '                        (default: send_[0-9a-f]{7})');
  puts('  --message-ttl=NUM     set message time-to-live to NUM seconds');
  puts('  -d NUM, --delay=NUM   add NUM seconds delay between each request');
  puts('  -r NUM, --repeat=NUM  send messages NUM times, default is 1, if\n' +
       '                        NUM <= 0 then repeat forever');
  puts('   --sequence           prefix a sequence number to the message\n' +
       '                        payload (ignored for binary messages)');
  puts('  -f FILE, --file=FILE  send FILE as binary data. Cannot be\n' +
       '                        specified at the same time as <msg1>');
  puts('');
};

if (parsed.help) {
  showUsage();
  process.exit(0);
}

Object.getOwnPropertyNames(parsed).forEach(function(key) {
  if (key !== 'argv' && !types.hasOwnProperty(key)) {
    console.error('Error: Unsupported commandline option "%s"', key);
    console.error();
    showUsage();
    process.exit(1);
  }
});

var service = parsed.service ? parsed.service : 'amqp://localhost';
var topic = parsed.topic ? parsed.topic : 'public';
var id = parsed.id ? parsed.id : 'send_' + uuid.v4().substring(0, 7);
var repeat = parsed.repeat !== undefined ? Number(parsed.repeat) : 1;

// create client to connect to server with:
var opts = {
  service: service,
  id: id
};
if (parsed['trust-certificate']) {
  /** the trust-certificate to use for a TLS/SSL connection */
  opts.sslTrustCertificate = parsed['trust-certificate'];
  if (parsed.service) {
    if (service.indexOf('amqps', 0) !== 0) {
      console.error('*** error ***');
      console.error("The service URL must start 'amqps://' when using a " +
                    'trust certificate.');
      console.error('Exiting.');
      process.exit(1);
    }
  } else {
    /** if none specified, change the default service to be amqps:// */
    opts.service = 'amqps://localhost';
  }
}
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
client.on('started', function() {
  console.log('Connected to %s using client-id %s', client.service, client.id);
  console.log('Sending to: %s', topic);

  // send the next message, inserting a delay if requested
  var sendNextMessage = function() {
    if (delay > 0) {
      setTimeout(sendMessage, delay);
    } else {
      setImmediate(sendMessage);
    }
  };

  // queue all messages for sending
  var i = 0;
  var sequenceNum = 0;
  var sendMessage = function() {
    var msgNum = i++;

    // check if the messages should be repeated again
    if (messages.length == i) {
      if (repeat != 1) i = 0;
      if (repeat > 1) --repeat;
    }

    // keep going until all messages have been sent
    if (messages.length > msgNum) {
      var body = messages[msgNum];
      var options = { qos: mqlight.QOS_AT_LEAST_ONCE };
      var callback = function(err, topic, data, options) {
        if (err) {
          console.error('Problem with send request: %s', err.message);
          process.exit(1);
        }
        if (data) {
          console.log(data);
        }
      };

      if (parsed['message-ttl'] !== undefined) {
        options.ttl = Number(parsed['message-ttl']) * 1000;
      }
      if (parsed.sequence && !parsed.file) {
        body = (++sequenceNum) + ': ' + body;
      }

      if (client.send(topic, body, options, callback)) {
        // Send the next message now
        sendNextMessage();
      } else {
        // There's a backlog of messages to send, so wait until the backlog is
        // cleared before sending any more
        client.once('drain', sendNextMessage);
      }
    } else {
      // No more messages to send, so disconnect
      client.stop();
    }
  };

  sendMessage();
});

client.on('error', function(error) {
  console.error('*** error ***');
  if (error) {
    if (error.message) console.error('message: %s', error.toString());
    else if (error.stack) console.error(error.stack);
  }
  console.error('Exiting.');
  process.exit(1);
});

