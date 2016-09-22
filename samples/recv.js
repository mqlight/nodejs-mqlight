/* %Z% %W% %I% %E% %U% */
/*
 * <copyright
 * notice="lm-source-program"
 * pids="5725-P60"
 * years="2013,2016"
 * crc="3568777996" >
 * Licensed Materials - Property of IBM
 *
 * 5725-P60
 *
 * (C) Copyright IBM Corp. 2013, 2016
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
var uuid = require('uuid');
var fs = require('fs');

// parse the commandline arguments
var types = {
  help: Boolean,
  service: String,
  'keystore': String,
  'keystore-passphrase': String,
  'client-certificate': String,
  'client-key': String,
  'client-key-passphrase': String,
  'trust-certificate': String,
  'verify-name': Boolean,
  'topic-pattern': String,
  id: String,
  'destination-ttl': Number,
  'share-name': String,
  file: String,
  delay: Number,
  'verbose': Boolean
};
var shorthands = {
  h: ['--help'],
  s: ['--service'],
  k: ['--keystore'],
  p: ['--keystore-passphrase'],
  c: ['--trust-certificate'],
  t: ['--topic-pattern'],
  i: ['--id'],
  n: ['--share-name'],
  f: ['--file'],
  d: ['--delay']
};
var parsed = nopt(types, shorthands, process.argv, 2);
var remain = parsed.argv.remain;

var showUsage = function() {
  var puts = console.log;

  puts('Usage: recv.js [options]');
  puts('');
  puts('Options:');
  puts('  -h, --help             show this help message and exit');
  puts('  -s URL, --service=URL  service to connect to, for example:\n' +
       '                         amqp://user:password@host:5672 or\n' +
       '                         amqps://host:5671 to use SSL/TLS\n' +
       '                         (default: amqp://localhost)');
  puts('  -k FILE, --keystore=FILE\n' +
       '                         use key store contained in FILE (in PKCS#12' +
       ' format) to\n' +
       '                         supply the client certificate, private key' +
       ' and trust\n' +
       '                         certificates.\n' +
       '                         The Connection must be secured with SSL/TLS' +
       ' (e.g. the\n' +
       "                         service URL must start with 'amqps://').\n" +
       '                         Option is mutually exclusive with the' +
       ' client-key,\n' +
       '                         client-certificate and trust-certifcate' +
       ' options');
  puts('  -p PASSPHRASE, --keystore-passphrase=PASSPHRASE\n' +
       '                         use PASSPHRASE to access the key store');
  puts('  --client-certificate=FILE\n' +
       '                         use the certificate contained in FILE (in' +
       ' PEM format) to\n' +
       '                         supply the identity of the client. The' +
       ' connection must\n' +
       '                         be secured with SSL/TLS');
  puts('  --client-key=FILE      use the private key contained in FILE (in' +
       ' PEM format)\n' +
       '                         for encrypting the specified client' +
       ' certificate');
  puts('  --client-key-passphrase=PASSPHRASE\n' +
       '                         use PASSPHRASE to access the client private' +
       ' key');
  puts('  -c FILE, --trust-certificate=FILE\n' +
       '                         use the certificate contained in FILE (in' +
       ' PEM format) to\n' +
       '                         validate the identity of the server. The' +
       ' connection must\n' +
       '                         be secured with SSL/TLS');
  puts('  --no-verify-name       specify to not additionally check the' +
       " server's common\n" +
       '                         name in the specified trust certificate' +
       ' matches the\n' +
       "                         actual server's DNS name");
  puts('  -t TOPICPATTERN, --topic-pattern=TOPICPATTERN\n' +
       '                         subscribe to receive messages matching' +
       ' TOPICPATTERN');
  puts('                         (default: public)');
  puts('  -i ID, --id=ID         the ID to use when connecting to MQ Light\n' +
       '                         (default: recv_[0-9a-f]{7})');
  puts('  --destination-ttl=NUM  set destination time-to-live to NUM seconds');
  puts('  -n NAME, --share-name NAME');
  puts('                         optionally, subscribe to a shared' +
       ' destination using\n' +
       '                         NAME as the share name.');
  puts('  -f FILE, --file=FILE   write the payload of the next message' +
       ' received to\n' +
       '                         FILE (overwriting previous file contents)' +
       ' then end.\n' +
       '                         (default is to print messages to stdout)');
  puts('  -d NUM, --delay=NUM    delay for NUM seconds each time a message' +
       ' is received.');
  puts('  --verbose              print additional information about each' +
       ' message\n' +
       '                         received.');
  puts('');
};

if (parsed.help) {
  showUsage();
  process.exit(0);
} else if (remain.length > 0) {
  showUsage();
  process.exit(1);
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
var pattern = parsed['topic-pattern'] ? parsed['topic-pattern'] : 'public';
var id = parsed.id ? parsed.id : 'recv_' + uuid.v4().substring(0, 7);
var share = parsed['share-name'] ? parsed['share-name'] : undefined;

// connect client to server
var opts = {
  service: service,
  id: id
};
var checkService = false;
if (parsed['keystore']) {
  /** the keystore to use for a TLS/SSL connection */
  opts.sslKeystore = parsed['keystore'];
  checkService = true;
}
if (parsed['keystore-passphrase']) {
  /** the keystore-passphrase to use for a TLS/SSL connection */
  opts.sslKeystorePassphrase = parsed['keystore-passphrase'];
  checkService = true;
}
if (parsed['client-certificate']) {
  /** the client-certificate to use for a TLS/SSL connection */
  opts.sslClientCertificate = parsed['client-certificate'];
  checkService = true;
}
if (parsed['client-key']) {
  /** the client-key to use for a TLS/SSL connection */
  opts.sslClientKey = parsed['client-key'];
  checkService = true;
}
if (parsed['client-key-passphrase']) {
  /** the client-key-passphrase to use for a TLS/SSL connection */
  opts.sslClientKeyPassphrase = parsed['client-key-passphrase'];
  checkService = true;
}
if (parsed['trust-certificate']) {
  /** the trust-certificate to use for a TLS/SSL connection */
  opts.sslTrustCertificate = parsed['trust-certificate'];
  checkService = true;
}
if (parsed['verify-name'] === false) {
  /**
   * Indicate not to additionally check the MQ Light server's
   * common name in the certificate matches the actual server's DNS name.
   */
  opts.sslVerifyName = false;
  checkService = true;
}

if (checkService) {
  if (parsed.service) {
    if (service.indexOf('amqps', 0) !== 0) {
      console.error('*** error ***');
      console.error("The service URL must start with 'amqps://' when using " +
                    'SSL/TLS options.');
      console.error('Exiting.');
      process.exit(1);
    }
  } else {
    /** if none specified, change the default service to be amqps:// */
    opts.service = 'amqps://localhost';
  }
}
var client = mqlight.createClient(opts);

// create an event listener to handle any messages that arrive for us
// and an event listener to handle any malformed messages
var i = 0;
var delayMs = 0;
client.on('message', function(data, delivery) {
  ++i;
  if (parsed.verbose) console.log('# received message (%d)', i);
  if (parsed.file) {
    console.log('Writing message data to %s', parsed.file);
    fs.writeFileSync(parsed.file, data);
    delivery.message.confirmDelivery();
    client.stop(function() {
      console.error('Exiting.');
      process.exit(0);
    });
  } else {
    console.log(data);
    if (parsed.verbose) console.log(delivery);
    if (delayMs > 0) {
      setTimeout(delivery.message.confirmDelivery, delayMs);
    } else {
      delivery.message.confirmDelivery();
    }
  }
});
client.on('malformed', function(data, delivery) {
  console.error('*** received malformed message (%d)', (++i));
  if (data) {
    console.error(data);
  }
  console.error(delivery);
});

// once started, receive messages for the supplied pattern
client.on('started', function() {
  console.log('Connected to %s using client-id %s', client.service, client.id);
  var options = { qos: mqlight.QOS_AT_LEAST_ONCE, autoConfirm: false };
  if (parsed['destination-ttl'] !== undefined) {
    options.ttl = Number(parsed['destination-ttl']) * 1000;
  }
  if (parsed.delay !== undefined) {
    delayMs = Number(parsed.delay) * 1000;
    if (delayMs > 0) options.credit = 1;
  }

  // now subscribe to pattern for messages
  client.subscribe(pattern, share, options, function(err, pattern) {
    if (err) {
      console.error('Problem with subscribe request: %s', err.toString());
      setImmediate(function() {
        process.exit(1);
      });
    } else {
      if (pattern) {
        if (share) {
          console.log('Subscribed to share: %s, pattern: %s', share, pattern);
        } else {
          console.log('Subscribed to pattern: %s', pattern);
        }
      }
    }
  });
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
