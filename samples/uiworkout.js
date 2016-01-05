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
 * (C) Copyright IBM Corp. 2014
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
var uuid = require('node-uuid');
var nopt = require('nopt');

// The URL to use when connecting to the MQ Light server
var serviceURL = 'amqp://localhost';

// The number of clients that will connect to any given shared destination
var clientsPerSharedDestination = 2;

// The topics to subscribe to for shared destinations
var sharedTopics = ['shared1', 'shared/shared2'];

// The topics to subscribe to for private destinations
var privateTopics = [
  'private1',
  'private/private2',
  'private/private3',
  'private4'
];

// All topics.  An entry is picked at random each time a message is sent
var allTopics = sharedTopics.concat(privateTopics);

// A count of all messages sent by the application
var messageCount = 0;

// Text used to compose message bodies.  A random number of words are picked.
var loremIpsum = 'Lorem ipsum dolor sit amet, consectetur adipisicing elit, ' +
                 'sed do eiusmod tempor incididunt ut labore et dolore ' +
                 'magna aliqua. Ut enim ad minim veniam, quis nostrud ' +
                 'exercitation ullamco laboris nisi ut aliquip ex ea ' +
                 'commodo consequat. Duis aute irure dolor in reprehenderit ' +
                 'in voluptate velit esse cillum dolore eu fugiat nulla ' +
                 'pariatur. Excepteur sint occaecat cupidatat non proident, ' +
                 'sunt in culpa qui officia deserunt mollit anim id est ' +
                 'laborum.';

// parse the command-line arguments
var types = {
  help: Boolean,
  service: String,
  'keystore': String,
  'keystore-passphrase': String,
  'client-certificate': String,
  'client-key': String,
  'client-key-passphrase': String,
  'trust-certificate': String,
  'verify-name': String
};
var shorthands = {
  h: ['--help'],
  s: ['--service'],
  k: ['--keystore'],
  p: ['--keystore-passphrase'],
  c: ['--trust-certificate']
};
var parsed = nopt(types, shorthands, process.argv, 2);

var showUsage = function() {
  var puts = console.log;
  puts('Usage: uiworkout.js [options]');
  puts('');
  puts('Options:');
  puts('  -h, --help            show this help message and exit');
  puts('  -s URL, --service=URL service to connect to, for example:\n' +
       '                        amqp://user:password@host:5672 or\n' +
       '                        amqps://host:5671 to use SSL/TLS\n' +
       '                        (default: amqp://localhost)');
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
       '                         use PASSPHRASE to access the keystore');
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
  puts('  --verify-name=TRUE|FALSE\n' +
       '                         specify whether or not to additionally check' +
       ' the\n' +
       "                         server's common name in the specified trust" +
       ' certificate\n' +
       "                         matches the actual server's DNS name\n" +
       '                         (default: TRUE)');
  puts('');
};

if (parsed.help) {
  showUsage();
  process.exit(0);
} else if (parsed.argv.remain.length > 0) {
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

// Build an array of word ending offsets for loremIpsum
var loremIpsumWords = [];
for (var i = 0;;) {
  i = loremIpsum.indexOf(' ', i);
  if (i == -1) {
    loremIpsumWords.push(loremIpsum.length);
    break;
  } else {
    loremIpsumWords.push(i);
    i += 1;
  }
}

// Create clients that subscribe to a shared topic, and send messages
// randomly to any of the topics.
for (var i = sharedTopics.length - 1; i >= 0; i--) {
  for (var j = 0; j < clientsPerSharedDestination; j++) {
    startClient(sharedTopics[i], ('share' + (i + 1)));
  }
}

// Create clients that subscribe to private topics, and send messages
// randomly to any of the topics.
for (var i = privateTopics.length - 1; i >= 0; i--) {
  startClient(privateTopics[i]);
}

// Checks to see if the application is running in IBM Bluemix. If it is, tries
// to retrieve connection details from the environent and populates the
// options object passed as an argument.
function bluemixServiceLookup(options, verbose) {
  var result = false;
  if (process.env.VCAP_SERVICES) {
    if (verbose) console.log('VCAP_SERVICES variable present in environment');
    var services = JSON.parse(process.env.VCAP_SERVICES);
    if (services.mqlight) {
      options.user = services.mqlight[0].credentials.username;
      options.password = services.mqlight[0].credentials.password;
      options.service = services.mqlight[0].credentials.connectionLookupURI;
      if (verbose) {
        console.log('Username:  ' + options.user);
        console.log('Password:  ' + options.user);
        console.log('LookupURI: ' + options.service);
      }
    } else {
      throw new Error('Running in IBM Bluemix but not bound to an instance ' +
                      "of the 'mqlight' service.");
    }
    result = true;
  } else if (verbose) {
    console.log('VCAP_SERVICES variable not present in environment');
  }
  return result;
}

// Creates a client.  The client will subscribe to 'topic'.  If the
// 'share' argument is undefined the destination will be private to the
// client.  If the 'share' argument is not undefined, it will be used
// as the share name for subscribing to a shared destination.
// The client is also used to periodically publish a message to a
// randomly chosen topic.
function startClient(topic, share) {
  var opts = {id: 'CLIENT_' + uuid.v4().substring(0, 7)};
  if (parsed.service) {
    opts.service = parsed.service;
  } else if (!bluemixServiceLookup(opts, false)) {
    opts.service = 'amqp://localhost';
  }

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
  if (parsed['verify-name']) {
    var value = (parsed['verify-name']).toLowerCase();
    if (value === 'true') {
      /**
       * Indicate to additionally check the MQ Light server's
       * common name in the certificate matches the actual server's DNS name.
       */
      opts.sslVerifyName = true;
    } else if (value === 'false') {
      /**
       * Indicate not to additionally check the MQ Light server's
       * common name in the certificate matches the actual server's DNS name.
       */
      opts.sslVerifyName = false;
    } else {
      console.error('*** error ***');
      console.error('The verify-name option must be specified with a value of' +
                    ' TRUE or FALSE');
      console.error('Exiting.');
      process.exit(1);
    }
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

  var client = mqlight.createClient(opts, function(err) {
    if (err) {
      console.error('Problem with connect: ', err.message);
      process.exit(1);
    }
  });

  client.on('started', function() {
    console.log('Connected to ' + client.service + ' using id ' + client.id);
    client.subscribe(topic, share, function(err, topicPattern, share) {
      if (err) {
        console.error('Problem with subscribe request: ', err.message);
        process.exit(1);
      }
      console.log("Receiving messages from topic pattern '" + topicPattern +
                  (share ? "' and share '" + share + "'" : "'"));
    });

    // Loop sending messages to randomly picked topics.  Delay for a small
    // (random) amount of time, each time around.
    var sendMessages = function() {
      var delay = Math.random() * 20000;
      var sendTopic = allTopics[Math.floor(Math.random() * allTopics.length)];
      var sendCallback = function(err, msg) {
        if (err) {
          console.error('Problem with send request: ' + err.message);
          process.exit(0);
        } else {
          if (messageCount === 0) {
            console.log('Sending messages');
          }
          ++messageCount;
          if (messageCount % 10 === 0) {
            console.log('Sent ' + messageCount + ' messages');
          }
        }
      };

      setTimeout(function() {
        var start = Math.floor(Math.random() * (loremIpsumWords.length - 15));
        var end = start + 5 + Math.floor(Math.random() * 10);
        var message =
            loremIpsum.substring(loremIpsumWords[start], loremIpsumWords[end]);
        client.send(sendTopic, message, sendCallback);
        sendMessages();
      },delay);
    };
    sendMessages();
  });

}
