'use strict';
var amqp = require('amqp10'),
    linkCache = require('..'),
    AMQPClient = amqp.Client,
    config = require('./config'),
    expect = require('chai').expect;

var test = {};
describe('purging', function() {
  before(function() { amqp.use(linkCache({ ttl: 10 })); });
  beforeEach(function() {
    if (!!test.client) delete test.client;
    test.client = new AMQPClient();
  });

  afterEach(function() {
    return test.client.disconnect()
      .then(function() { delete test.client; });
  });

  it('should purge links after a given interval', function() {
    var sender;
    return test.client.connect(config.address)
      .then(function() { return test.client.createSender('amq.topic'); })
      .then(function(s) { sender = s; })
      .delay(50)
      .then(function() {
        var state = sender.linkSM.getMachineState();
        expect(state).to.be.oneOf(['DETACHED', 'DETACHING']);
        sender = null;
      });
  });

  it('should purge links after a given interval (2)', function() {
    var sender1, sender2;
    return test.client.connect(config.address)
      .then(function() { return test.client.createSender('amq.fanout'); })
      .tap(function(sender) { sender1 = sender; })
      .delay(100)
      .then(function() { return test.client.createSender('amq.fanout'); })
      .tap(function(sender) { sender2 = sender; })
      .then(function() { expect(sender1).to.not.eql(sender2); });
  });
});
