const static char sccsid[] = "%Z% %W% %I% %E% %U%";
/**********************************************************************/
/*   <copyright                                                       */
/*   notice="oco-source"                                              */
/*   pids="5725-P60"                                                  */
/*   years="2013,2014"                                                */
/*   crc="2536674324" >                                               */
/*   IBM Confidential                                                 */
/*                                                                    */
/*   OCO Source Materials                                             */
/*                                                                    */
/*   5725-P60                                                         */
/*                                                                    */
/*   (C) Copyright IBM Corp. 2013, 2014                               */
/*                                                                    */
/*   The source code for the program is not published                 */
/*   or otherwise divested of its trade secrets,                      */
/*   irrespective of what has been deposited with the                 */
/*   U.S. Copyright Office.                                           */
/*   </copyright>                                                     */
/*                                                                    */
/**********************************************************************/
/* Following text will be included in the Service Reference Manual.   */
/* Ensure that the content is correct and up-to-date.                 */
/* All updates must be made in mixed case.                            */
/*                                                                    */
/* The functions in this file provide the wrapper functions around    */
/* the Apache Qpid Proton C Messenger API for use by Node.js          */
/**********************************************************************/
/* End of text to be included in SRM                                  */
/**********************************************************************/

#include <stdio.h>
#include <stdlib.h>
#include <ctype.h>
#include <string.h>
#include <limits>
#include <vector>
#include <iostream>
#include <fstream>
#include <string>

#ifdef _WIN32
typedef __int32 int32_t;
typedef unsigned __int32 uint32_t;
#else
#include <stdint.h>
#endif

#include "proton.hpp"
#include "messenger.hpp"
#include "message.hpp"

using namespace v8;

/* throw an exception of a particular named type at the default log lvl */
#define THROW_NAMED_EXCEPTION(name, msg, fnc, id)                             \
  Proton::Throw((fnc), (id), msg);                                            \
  ThrowException(Proton::NewNamedError(name, msg));                           \
  return scope.Close(Undefined());

/* throw an exception of a particular named type at a specific log lvl */
#define THROW_NAMED_EXCEPTION_LEVEL(name, msg, lvl, fnc, id)                  \
  Proton::Throw((lvl), (fnc), (id), msg);                                     \
  ThrowException(Proton::NewNamedError(name, msg));                           \
  return scope.Close(Undefined());

/* throw an exception of a particular type at the default log lvl */
#define THROW_EXCEPTION_TYPE(type, msg, fnc, id)                              \
  Proton::Throw((fnc), (id), msg);                                            \
  ThrowException(type(String::New((msg) == NULL ? "unknown error" : (msg)))); \
  return scope.Close(Undefined());

/* throw an exception of the default type (TypeError) at the default log lvl */
#define THROW_EXCEPTION(msg, fnc, id) \
  THROW_EXCEPTION_TYPE(Exception::TypeError, msg, fnc, id)

/* throw an exception of a particular type at a specific log lvl */
#define THROW_EXCEPTION_LEVEL_TYPE(type, msg, lvl, fnc, id)                   \
  Proton::Throw((lvl), (fnc), (id), msg);                                     \
  ThrowException(type(String::New((msg) == NULL ? "unknown error" : (msg)))); \
  return scope.Close(Undefined());

/* throw an exception of the default type (TypeError) at a specific log lvl */
#define THROW_EXCEPTION_LEVEL(msg, lvl, fnc, id) \
  THROW_EXCEPTION_LEVEL_TYPE(Exception::TypeError, msg, lvl, fnc, id)

/* parse an error message from messenger and map it to an error type */
/* FIXME: replace this string matching with a proper scheme (Story 85536) */
const char* GetErrorName(const char* text)
{
  if (strstr(text, "sasl ") || strstr(text, "SSL ")) {
    return "SecurityError";
  }

  if (strstr(text, "_Takeover")) {
    return "ReplacedError";
  }

  if (strstr(text, "_InvalidSourceTimeout")) {
    return "NotPermittedError";
  }

  return "NetworkError";
}

Persistent<FunctionTemplate> ProtonMessenger::constructor;

void ProtonMessenger::Init(Handle<Object> target)
{
  HandleScope scope;

  Local<FunctionTemplate> tpl = FunctionTemplate::New(New);
  constructor = Persistent<FunctionTemplate>::New(tpl);
  constructor->InstanceTemplate()->SetInternalFieldCount(1);
  Local<String> name = String::NewSymbol("ProtonMessenger");
  constructor->SetClassName(name);

  NODE_SET_PROTOTYPE_METHOD(constructor, "accept", Accept);
  NODE_SET_PROTOTYPE_METHOD(constructor, "put", Put);
  NODE_SET_PROTOTYPE_METHOD(constructor, "send", Send);
  NODE_SET_PROTOTYPE_METHOD(constructor, "stop", Stop);
  NODE_SET_PROTOTYPE_METHOD(constructor, "connect", Connect);
  NODE_SET_PROTOTYPE_METHOD(constructor, "subscribe", Subscribe);
  NODE_SET_PROTOTYPE_METHOD(constructor, "subscribed", Subscribed);
  NODE_SET_PROTOTYPE_METHOD(constructor, "unsubscribe", Unsubscribe);
  NODE_SET_PROTOTYPE_METHOD(constructor, "unsubscribed", Unsubscribed);
  NODE_SET_PROTOTYPE_METHOD(constructor, "receive", Receive);
  NODE_SET_PROTOTYPE_METHOD(constructor, "status", Status);
  NODE_SET_PROTOTYPE_METHOD(constructor, "statusError", StatusError);
  NODE_SET_PROTOTYPE_METHOD(constructor, "settle", Settle);
  NODE_SET_PROTOTYPE_METHOD(constructor, "settled", Settled);
  NODE_SET_PROTOTYPE_METHOD(
      constructor, "getRemoteIdleTimeout", GetRemoteIdleTimeout);
  NODE_SET_PROTOTYPE_METHOD(constructor, "flow", Flow);
  NODE_SET_PROTOTYPE_METHOD(constructor, "pendingOutbound", PendingOutbound);
  NODE_SET_PROTOTYPE_METHOD(constructor, "push", Push);
  NODE_SET_PROTOTYPE_METHOD(constructor, "pop", Pop);
  NODE_SET_PROTOTYPE_METHOD(constructor, "started", Started);
  NODE_SET_PROTOTYPE_METHOD(constructor, "closed", Closed);
  NODE_SET_PROTOTYPE_METHOD(constructor, "heartbeat", Heartbeat);

  tpl->InstanceTemplate()->SetAccessor(String::New("stopped"), Stopped);

  target->Set(name, constructor->GetFunction());
}

void ProtonMessenger::Tracer(pn_transport_t* transport, const char* message)
{
  pn_connection_t* connection = pn_transport_connection(transport);
  if (connection) {
    const char* id = pn_connection_get_container(connection);
    Proton::Log("detail", id, "|", message);
  } else {
    Proton::Log("detail", NULL, "|", message);
  }
}

ProtonMessenger::ProtonMessenger(std::string name,
                                 std::string username,
                                 std::string password)
    : ObjectWrap(),
      name(name),
      username(username),
      password(password),
      messenger(NULL)
{
  Proton::Entry("ProtonMessenger::constructor", NULL);
  Proton::Log("parms", NULL, "name:", name.c_str());
  Proton::Log("parms", NULL, "username:", username.c_str());
  Proton::Log(
      "parms", NULL, "password:", (password.length() > 0) ? "********" : "");

  Proton::Exit("ProtonMessenger::constructor", NULL, 0);
}

ProtonMessenger::~ProtonMessenger()
{
  Proton::Entry("ProtonMessenger::destructor", NULL);

  if (messenger) {
    const char* name = pn_messenger_name(messenger);
    Proton::Entry("pn_messenger_free", name);
    pn_messenger_free(messenger);
    Proton::Exit("pn_messenger_free", name, 0);
  }

  Proton::Exit("ProtonMessenger::destructor", NULL, 0);
}

Handle<Value> ProtonMessenger::NewInstance(const Arguments& args)
{
  HandleScope scope;

  Proton::Entry("ProtonMessenger::NewInstance", NULL);

  const unsigned argc = args.Length();
  Handle<Value>* argv = new Handle<Value>[argc];
  for (uint32_t i = 0; i < argc; i++) {
    argv[i] = args[i];
  }
  Local<Object> instance = constructor->GetFunction()->NewInstance(argc, argv);
  delete [] argv;

  Proton::Exit("ProtonMessenger::NewInstance", NULL, 0);
  return scope.Close(instance);
}

Handle<Value> ProtonMessenger::New(const Arguments& args)
{
  HandleScope scope;

  Proton::Entry("ProtonMessenger::New", NULL);

  if (!args.IsConstructCall()) {
    THROW_EXCEPTION("Use the new operator to create instances of this object.",
                    "ProtonMessenger::New",
                    NULL)
  }

  std::string name;
  std::string username;
  std::string password;
  if (args.Length() < 1) {
    name = "";
  } else {
    // parse the 'name' parameter out of the args
    String::Utf8Value param(args[0]->ToString());
    name = std::string(*param);

    // look for the username and password parameters
    if (!args[1]->IsUndefined()) {
      String::Utf8Value userparam(args[1]->ToString());
      username = std::string(*userparam);

      if (!args[2]->IsUndefined()) {
        String::Utf8Value passwordparam(args[2]->ToString());
        password = std::string(*passwordparam);
      }
    }
  }

  Proton::Log("parms", NULL, "name:", name.c_str());
  Proton::Log("parms", NULL, "username:", username.c_str());
  Proton::Log(
      "parms", NULL, "password:", (password.length() > 0) ? "********" : "");

  // create a new instance of this type and wrap it in 'this' v8 Object
  ProtonMessenger* obj = new ProtonMessenger(name, username, password);

  obj->Wrap(args.This());

  Proton::Exit("ProtonMessenger::New", NULL, 0);
  return args.This();
}

Handle<Value> ProtonMessenger::Put(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  ProtonMessage* msg;
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Put", name);

  // throw exception if not enough args
  if (args.Length() < 2 || args[0].IsEmpty() || args[1].IsEmpty()) {
    THROW_EXCEPTION("Missing required message or qos argument.",
                    "ProtonMessenger::Put",
                    name);
  }

  msg = ObjectWrap::Unwrap<ProtonMessage>(args[0]->ToObject());
  Local<Integer> integer = args[1]->ToInteger();
  int qos = (int)integer->Value();
  Proton::Log("parms", name, "qos:", qos);

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION(
        "NetworkError", "Not connected", "ProtonMessenger::Put", name)
  }

  if (qos != 0 && qos != 1) {
    THROW_EXCEPTION_TYPE(Exception::RangeError,
                         "qos argument is invalid must evaluate to 0 or 1",
                         "ProtonMessenger::Put",
                         name);
  }

  /*
   * XXX: for now, we're using the simplified messenger api, but long term we
   * may need to use the underlying engine directly here, or modify proton
   */
  Proton::Entry("pn_messenger_put", name);
  pn_messenger_put(obj->messenger, msg->message);
  int error = pn_messenger_errno(obj->messenger);
  Proton::Exit("pn_messenger_put", name, error);
  if (error) {
    const char* text = pn_error_text(pn_messenger_error(obj->messenger));
    const char* err = GetErrorName(text);
    THROW_NAMED_EXCEPTION(err, text, "ProtonMessenger::Put", name)
  }

  pn_tracker_t tracker = pn_messenger_outgoing_tracker(obj->messenger);
  msg->tracker = tracker;

  if (qos == 0) {
    error = pn_messenger_settle(obj->messenger, tracker, 0);
    if (error) {
      const char* text = pn_error_text(pn_messenger_error(obj->messenger));
      const char* err = GetErrorName(text);
      THROW_NAMED_EXCEPTION(err, text, "ProtonMessenger::Put", name)
    }
  }

  Proton::Exit("ProtonMessenger::Put", name, true);
  return scope.Close(Boolean::New(true));
}

Handle<Value> ProtonMessenger::Send(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Send", name);

  // throw TypeError if not enough args
  if (args.Length() < 1 || args[0].IsEmpty()) {
    THROW_EXCEPTION("Missing stream argument.",
                    "ProtonMessenger::Send", name);
  }

  // throw Error if not connected
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION(
        "NetworkError", "Not connected", "ProtonMessenger::Send", name)
  }

  Proton::Entry("pn_messenger_send", name);
  pn_messenger_send(obj->messenger, -1);
  int error = pn_messenger_errno(obj->messenger);
  Proton::Exit("pn_messenger_send", name, error);
  if (error) {
    const char* text = pn_error_text(pn_messenger_error(obj->messenger));
    const char* err = GetErrorName(text);
    THROW_NAMED_EXCEPTION(err, text, "ProtonMessenger::Send", name)
  }

  ProtonMessenger::Write(obj, args[0], false);

  Proton::Exit("ProtonMessenger::Send", name, true);
  return scope.Close(Boolean::New(true));
}

Handle<Value> ProtonMessenger::Connect(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();
  Proton::Entry("ProtonMessenger::Connect", name);

  // throw TypeError if not enough args
  if (args.Length() < 1) {
    THROW_EXCEPTION(
        "Missing required address argument.", "ProtonMessenger::Connect", name);
  }

  // First argument is expected to contain a url.parse object
  Local<Object> url = args[0]->ToObject();
  String::Utf8Value urlHref(url->Get(String::NewSymbol("href")));
  std::string address = std::string(*urlHref);
  Local<RegExp> regex = RegExp::New(String::New(":[^\\/:]+@"), RegExp::kNone);
  Handle<Function> replace = Handle<Function>::Cast(
      String::New(address.c_str())->ToObject()->Get(String::New("replace")));
  Handle<Value> argv[] = {regex, String::New(":********@")};
  String::Utf8Value traceUrlHref(
      replace->Call(String::New(address.c_str())->ToObject(), 2, argv));
  std::string traceAddress = std::string(*traceUrlHref);
  Proton::Log("parms", name, "address:", traceAddress.c_str());

  // If the proton messenger already exists and has been stopped then free it
  // so that we can recreate a new instance.  This situation can arise if the
  // messenger link is closed by the remote end instead of a call to
  // ProtonMessenger::Stop
  if (obj->messenger) {
    Proton::Entry("pn_messenger_stopped", name);
    bool stopped = pn_messenger_stopped(obj->messenger);
    Proton::Exit("pn_messenger_stopped", name, stopped);
    if (stopped) {
      obj->connection = NULL;
      Proton::Entry("pn_messenger_free", name);
      pn_messenger_free(obj->messenger);
      Proton::Exit("pn_messenger_free", name, 0);
      obj->messenger = NULL;
    }
  }

  // throw Error if already connected
  if (obj->messenger) {
    THROW_NAMED_EXCEPTION(
        "NetworkError", "Already connected", "ProtonMessenger::Connect", name)
  }

  // Create the messenger object and update the name in case messenger has
  // changed it
  Proton::Entry("pn_messenger", name);
  obj->messenger = pn_messenger(name);
  obj->name = pn_messenger_name(obj->messenger);
  Proton::Exit("pn_messenger", name, 0);

  pn_messenger_set_tracer(obj->messenger, ProtonMessenger::Tracer);
  pn_messenger_set_blocking(obj->messenger, false);
  pn_messenger_set_outgoing_window(obj->messenger,
                                   std::numeric_limits<int>::max());
  pn_messenger_set_incoming_window(obj->messenger,
                                   std::numeric_limits<int>::max());

  /*
   * Set the route and enable PN_FLAGS_CHECK_ROUTES so that messenger
   * confirms that it can connect at startup.
   */
  int error;
  String::Utf8Value urlProtocol(url->Get(String::NewSymbol("protocol")));
  std::string protocol = std::string(*urlProtocol);
  String::Utf8Value urlHost(url->Get(String::NewSymbol("host")));
  std::string hostandport = std::string(*urlHost);
  std::string pattern = protocol + "//" + hostandport + "/*";
  std::string validationAddress  = address + "/$1";
  std::string traceValidationAddress = traceAddress + "/$1";
  Proton::Entry("pn_messenger_route", name);
  Proton::Log("parms", name, "pattern:", pattern.c_str());
  Proton::Log("parms", name, "substitution:", traceValidationAddress.c_str());
  error = pn_messenger_route(
      obj->messenger, pattern.c_str(), validationAddress.c_str());
  Proton::Exit("pn_messenger_route", name, error);
  if (error) {
    pn_messenger_free(obj->messenger);
    obj->messenger = NULL;
    // throw TypeError if unable to set route
    THROW_EXCEPTION(
        "Failed to set messenger route", "ProtonMessenger::Connect", name);
  }

  // Indicate that the route should be validated
  if (pn_messenger_set_flags(obj->messenger, PN_FLAGS_CHECK_ROUTES)) {
    pn_messenger_free(obj->messenger);
    obj->messenger = NULL;
    // throw TypeError if unable to set flags
    THROW_EXCEPTION("Invalid set flags call", "ProtonMessenger::Connect", name);
  }

  // Indicate that an external socket is in use
  if (pn_messenger_set_external_socket(obj->messenger)) {
    pn_messenger_free(obj->messenger);
    obj->messenger = NULL;
    // throw TypeError if unable to set external socket
    THROW_EXCEPTION("Failed to set external socket",
                    "ProtonMessenger::Connect", name);
  }

  // Start the messenger. This will fail if the route is invalid
  Proton::Entry("pn_messenger_start", name);
  error = pn_messenger_start(obj->messenger);
  Proton::Exit("pn_messenger_start", name, error);
  if (error) {
    const char* text = pn_error_text(pn_messenger_error(obj->messenger));
    const char* err = GetErrorName(text);
    // clone to std::string before free'ing messenger
    std::string msg = text;
    pn_messenger_free(obj->messenger);
    obj->messenger = NULL;
    THROW_NAMED_EXCEPTION(err, msg.c_str(), "ProtonMessenger::Connect", name)
  }

  // Get a pointer to the proton connection by resolving the route
  char *pn_name = NULL;
  Proton::Entry("pn_messenger_resolve", name);
  obj->connection = pn_messenger_resolve(obj->messenger, pattern.c_str(), &pn_name);
  Proton::Exit("pn_messenger_resolve", name, obj->connection ? 1 : 0);
  if (!obj->connection) {
    pn_messenger_free(obj->messenger);
    obj->messenger = NULL;
    THROW_NAMED_EXCEPTION("NetworkError", "Unable to resolve connection",
                          "ProtonMessenger::Connect", name)
  }

  Proton::Exit("ProtonMessenger::Connect", name, 0);
  return scope.Close(Undefined());
}

Handle<Value> ProtonMessenger::Stop(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Stop", name);

  // throw TypeError if not enough args
  if (args.Length() < 1 || args[0].IsEmpty()) {
    THROW_EXCEPTION("Missing stream argument.",
                    "ProtonMessenger::Stop", name);
  }

  // If already stopped then simply return true
  if (!obj->messenger) {
    Proton::Exit("ProtonMessenger::Stop", name, true);
    return scope.Close(Boolean::New(true));
  }

  Proton::Entry("pn_messenger_stop", name);
  int err = pn_messenger_stop(obj->messenger);
  Proton::Exit("pn_messenger_stop", name, err);

  ProtonMessenger::Write(obj, args[0], false);

  Proton::Entry("pn_messenger_stopped", name);
  bool stopped = pn_messenger_stopped(obj->messenger);
  Proton::Exit("pn_messenger_stopped", name, stopped);

  if (stopped) {
    obj->connection = NULL;
    Proton::Entry("pn_messenger_free", name);
    pn_messenger_free(obj->messenger);
    Proton::Exit("pn_messenger_free", name, 0);
    obj->messenger = NULL;
  }

  Proton::Exit("ProtonMessenger::Stop", name, stopped);
  return scope.Close(Boolean::New(stopped));
}

Handle<Value> ProtonMessenger::Stopped(Local<String> property,
                                       const AccessorInfo& info)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(info.Holder());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Stopped", name);

  bool stopped;
  if (obj->messenger) {
    Proton::Entry("pn_messenger_stopped", name);
    stopped = pn_messenger_stopped(obj->messenger);
    Proton::Exit("pn_messenger_stopped", name, stopped);
  } else {
    stopped = true;
  }

  Proton::Exit("ProtonMessenger::Stopped", name, stopped);
  return scope.Close(Boolean::New(stopped));
}

Handle<Value> ProtonMessenger::Subscribe(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Subscribe", name);

  // throw TypeError if not enough args
  if (args.Length() < 4 || args[0].IsEmpty() || args[1].IsEmpty() ||
      args[2].IsEmpty(), args[3].IsEmpty()) {
    THROW_EXCEPTION("Missing required argument",
                    "ProtonMessenger::Subscribe",
                    name);
  }

  String::Utf8Value param(args[0]->ToString());
  std::string address = std::string(*param);
  int qos = (int)args[1]->ToInteger()->Value();
  int ttl = (int)args[2]->ToInteger()->Value();
  Proton::Log("parms", name, "address:", address.c_str());
  Proton::Log("parms", name, "qos:", qos);
  Proton::Log("parms", name, "ttl:", ttl);

  // throw Error if not connected
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION(
        "NetworkError", "Not connected", "ProtonMessenger::Subscribe", name);
  }

  // find link based on address - there shouldn't be one.
  pn_link_t* link =
      pn_messenger_get_link(obj->messenger, address.c_str(), false);

  if (link) {
    // throw Error if find an active matching Link
    THROW_NAMED_EXCEPTION(
        "SubscribedError", "client is already subscribed to this address",
        "ProtonMessenger::Subscribe", name);
  }

  /* Set the required QoS, by setting the sender settler mode to settled (QoS =
   * AMO) or unsettled (QoS = ALO).
   * Note that our API client implementation will always specify a value of
   * first - meaning "The Receiver will spontaneously settle all incoming
   * transfers" - this equates to a maximum QoS of "at least once delivery".
   */
  if (qos == 0) {
    pn_messenger_set_snd_settle_mode(obj->messenger, PN_SND_SETTLED);
    pn_messenger_set_rcv_settle_mode(obj->messenger, PN_RCV_FIRST);
  } else if (qos == 1) {
    pn_messenger_set_snd_settle_mode(obj->messenger, PN_SND_UNSETTLED);
    pn_messenger_set_rcv_settle_mode(obj->messenger, PN_RCV_FIRST);
  } else {
    // throw RangeError if bad qos arg
    THROW_EXCEPTION_TYPE(Exception::RangeError,
                         "qos argument is invalid must evaluate to 0 or 1",
                         "ProtonMessenger::Subscribe",
                         name);
  }

  Proton::Entry("pn_messenger_subscribe_ttl", name);
  pn_messenger_subscribe_ttl(obj->messenger, address.c_str(), ttl);
  Proton::Exit("pn_messenger_subscribe_ttl", name, 0);

  Proton::Entry("pn_messenger_recv", name);
  pn_messenger_recv(obj->messenger, -2);
  int error = pn_messenger_errno(obj->messenger);
  Proton::Exit("pn_messenger_recv", name, error);
  if (error) {
    const char* text = pn_error_text(pn_messenger_error(obj->messenger));
    const char* err = GetErrorName(text);
    THROW_NAMED_EXCEPTION(err, text, "ProtonMessenger::Subscribe", name)
  }

  ProtonMessenger::Write(obj, args[3], false);

  Proton::Exit("ProtonMessenger::Subscribe", name, true);
  return scope.Close(Boolean::New(true));
}

Handle<Value> ProtonMessenger::Subscribed(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Subscribed", name);

  // throw TypeError if not enough args
  if (args.Length() < 1 || args[0].IsEmpty()) {
    THROW_EXCEPTION("Missing required argument",
                    "ProtonMessenger::Subscribed",
                    name);
  }

  String::Utf8Value param(args[0]->ToString());
  std::string address = std::string(*param);
  Proton::Log("parms", name, "address:", address.c_str());

  // throw Error if not connected
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION(
        "NetworkError", "Not connected", "ProtonMessenger::Subscribed", name);
  }

  Proton::Entry("pn_messenger_get_link", name);
  pn_link_t* link =
      pn_messenger_get_link(obj->messenger, address.c_str(), false);
  int error = pn_messenger_errno(obj->messenger);
  Proton::Exit("pn_messenger_get_link", name, error);
  if (error) {
    const char* text = pn_error_text(pn_messenger_error(obj->messenger));
    const char* err = GetErrorName(text);
    THROW_NAMED_EXCEPTION(err, text, "ProtonMessenger::Subscribed", name)
  }

  if (!link) {
    // throw Error if unable to find a matching Link
    THROW_EXCEPTION_TYPE(Exception::Error,
                         ("unable to locate link for " + address).c_str(),
                         "ProtonMessenger::Subscribed",
                         name)
  }

  bool subscribed;
  if (!(pn_link_state(link) & PN_REMOTE_ACTIVE)) {
    subscribed = false;
  } else {
    subscribed = true;
  }

  Proton::Exit("ProtonMessenger::Subscribed", name, subscribed);
  return scope.Close(Boolean::New(subscribed));
}

Handle<Value> ProtonMessenger::Unsubscribe(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Unsubscribe", name);

  // throw TypeError if not enough args
  if (args.Length() < 3 || args[0].IsEmpty() || args[1].IsEmpty() ||
      args[2].IsEmpty()) {
    THROW_EXCEPTION("Missing required argument",
                    "ProtonMessenger::Unsubscribe",
                    name);
  }

  String::Utf8Value param(args[0]->ToString());
  std::string address = std::string(*param);
  Proton::Log("parms", name, "address:", address.c_str());
  int ttl = -1;
  if (args.Length() > 1 && !args[1]->IsUndefined()) {
    ttl = (int)args[1]->ToInteger()->Value();
    Proton::Log("parms", name, "ttl:", ttl);
  } else {
    Proton::Log("parms", name, "ttl:", "undefined");
  }

  // throw Error if not connected
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION(
        "NetworkError", "Not connected", "ProtonMessenger::Unsubscribe", name);
  }

  // find link based on address
  pn_link_t* link =
      pn_messenger_get_link(obj->messenger, address.c_str(), false);

  if (!link) {
    // find link based on address, in any state.
    if(pn_messenger_get_stated_link(obj->messenger, address.c_str(), false, 0)) {
      // throw UnsubscribedError if able to find an inactive matching Link
      THROW_NAMED_EXCEPTION(
          "UnsubscribedError", "client is not subscribed to this address",
          "ProtonMessenger::Unsubscribe", name);
    } else {
      // throw Error if unable to find an active matching Link
      THROW_EXCEPTION_TYPE(Exception::Error,
                           ("unable to locate link for " + address).c_str(),
                           "ProtonMessenger::Unsubscribe",
                           name)
    }
  }

  if (ttl == 0) {
    Proton::Entry("pn_terminus_set_expiry_policy", name);
    pn_terminus_set_expiry_policy(pn_link_target(link), PN_EXPIRE_WITH_LINK);
    pn_terminus_set_expiry_policy(pn_link_source(link), PN_EXPIRE_WITH_LINK);
    Proton::Exit("pn_terminus_set_expiry_policy", name, 0);
    Proton::Entry("pn_terminus_set_timeout", name);
    Proton::Log("parms", name, "ttl:", ttl);
    pn_terminus_set_timeout(pn_link_target(link), ttl);
    pn_terminus_set_timeout(pn_link_source(link), ttl);
    Proton::Exit("pn_terminus_set_timeout", name, 0);
  }
  // check if we are detaching with @closed=true
  bool closing = true;
  pn_expiry_policy_t expiry_policy =
      pn_terminus_get_expiry_policy(pn_link_target(link));
  pn_seconds_t timeout = pn_terminus_get_timeout(pn_link_target(link));
  if (expiry_policy == PN_EXPIRE_NEVER || timeout > 0) {
    closing = false;
  }
  Proton::Log("data", name, "closing:", closing);

  // close or detach the link, as appropriate
  if (closing) {
    Proton::Entry("pn_link_close", name);
    pn_link_close(link);
    Proton::Exit("pn_link_close", name, 0);
  } else {
    Proton::Entry("pn_link_detach", name);
    pn_link_detach(link);
    Proton::Exit("pn_link_detach", name, 0);
  }

  ProtonMessenger::Write(obj, args[2], false);

  Proton::Exit("ProtonMessenger::Unsubscribe", name, true);
  return scope.Close(Boolean::New(true));
}

Handle<Value> ProtonMessenger::Unsubscribed(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Unsubscribed", name);

  // throw TypeError if not enough args
  if (args.Length() < 1 || args[0].IsEmpty()) {
    THROW_EXCEPTION("Missing required argument",
                    "ProtonMessenger::Unsubscribed",
                    name);
  }

  String::Utf8Value param(args[0]->ToString());
  std::string address = std::string(*param);
  Proton::Log("parms", name, "address:", address.c_str());

  // throw Error if not connected
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION(
        "NetworkError", "Not connected", "ProtonMessenger::Unsubscribed", name);
  }

  // find link based on address, in any state.
  pn_link_t* link =
      pn_messenger_get_stated_link(obj->messenger, address.c_str(), false, 0);

  if (!link) {
    // throw Error if unable to find a matching Link
    THROW_EXCEPTION_TYPE(Exception::Error,
                         ("unable to locate link for " + address).c_str(),
                         "ProtonMessenger::Unsubscribed",
                         name)
  }

  // check if we are detaching with @closed=true
  bool closing = true;
  pn_expiry_policy_t expiry_policy =
      pn_terminus_get_expiry_policy(pn_link_target(link));
  pn_seconds_t timeout = pn_terminus_get_timeout(pn_link_target(link));
  if (expiry_policy == PN_EXPIRE_NEVER || timeout > 0) {
    closing = false;
  }
  Proton::Log("data", name, "closing:", closing);

  // check if the remote end has acknowledged the close or detach
  bool unsubscribed;
  if (closing) {
    if (!(pn_link_state(link) & PN_REMOTE_CLOSED)) {
      unsubscribed = false;
    } else {
      unsubscribed = true;
    }
  } else {
    if (!pn_link_remote_detached(link)) {
      unsubscribed = false;
    } else {
      unsubscribed = true;
      pn_messenger_reclaim_link(obj->messenger, link);
      pn_link_free(link);
    }
  }

  Proton::Exit("ProtonMessenger::Unsubscribed", name, unsubscribed);
  return scope.Close(Boolean::New(unsubscribed));
}

/* XXX: this may need to be wrapped in a uv_async queued operation? */
Handle<Value> ProtonMessenger::Receive(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("entry_often", "ProtonMessenger::Receive", name);

  // throw TypeError if not enough args
  if (args.Length() < 1 || args[0].IsEmpty()) {
    THROW_EXCEPTION("Missing stream argument.",
                    "ProtonMessenger::Receive", name);
  }

  // throw Error if not connected
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION_LEVEL("NetworkError",
                                "Not connected",
                                "exit_often",
                                "ProtonMessenger::Receive",
                                name);
  }

  Proton::Entry("entry_often", "pn_messenger_recv", name);
  pn_messenger_recv(obj->messenger, -2);
  int error = pn_messenger_errno(obj->messenger);
  Proton::Exit("exit_often", "pn_messenger_recv", name, error);
  if (error) {
    const char* text = pn_error_text(pn_messenger_error(obj->messenger));
    const char* err = GetErrorName(text);
    THROW_NAMED_EXCEPTION_LEVEL(
        err, text, "exit_often", "ProtonMessenger::Receive", name);
  }

  std::vector<Local<Object> > vector;
  while (pn_messenger_incoming(obj->messenger)) {
    Local<Value> argv[1] = {args[0]};
    Local<Object> msgObj =
        ProtonMessage::constructor->GetFunction()->NewInstance(0, argv);
    ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(msgObj);

    Proton::Entry("pn_messenger_get", name);
    pn_messenger_get(obj->messenger, msg->message);
    error = pn_messenger_errno(obj->messenger);
    Proton::Exit("pn_messenger_get", name, error);
    if (msg->message == NULL)
      continue;
    if (error) {
      const char* text = pn_error_text(pn_messenger_error(obj->messenger));
      const char* err = GetErrorName(text);
      THROW_NAMED_EXCEPTION_LEVEL(
          err, text, "exit_often", "ProtonMessenger::Receive", name);
    }

    pn_tracker_t tracker = pn_messenger_incoming_tracker(obj->messenger);
    msg->tracker = tracker;
    pn_link_t* link = pn_messenger_tracker_link(obj->messenger, tracker);
    if (link) {
      if (pn_link_state(link) & PN_LOCAL_CLOSED) {
        Proton::Log("data_often",
                    name,
                    "Link closed, so ignoring received message for address:",
                    pn_message_get_address(msg->message));
      } else {
        const char* tmpAddr =
            pn_terminus_get_address(pn_link_remote_source(link));
        msg->linkAddr = (char*)malloc(strlen(tmpAddr) + 1);
        strcpy(msg->linkAddr, tmpAddr);
        vector.push_back(msgObj);
      }
    } else {
      Proton::Log(
          "data_often",
          name,
          "No link associated with received message tracker for address:",
          pn_message_get_address(msg->message));
      vector.push_back(msgObj);
    }
  }

  Local<Array> messages = Array::New((int)vector.size());
  for (unsigned int i = 0; i < vector.size(); i++) {
    messages->Set(Number::New(i), vector[i]);
  }

  ProtonMessenger::Write(obj, args[0], false);

  Proton::Exit("exit_often", "ProtonMessenger::Receive", name, 0);
  return scope.Close(messages);
}

Handle<Value> ProtonMessenger::Status(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Status", name);

  // throw exception if not enough args
  if (args.Length() < 1 || args[0].IsEmpty() || args[0]->IsNull() ||
      args[0]->IsUndefined()) {
    THROW_EXCEPTION(
        "Missing required message argument.", "ProtonMessenger::Status", name);
  }

  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args[0]->ToObject());

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION(
        "NetworkError", "Not connected", "ProtonMessenger::Status", name);
  }

  int status = pn_messenger_status(obj->messenger, msg->tracker);

  Proton::Exit("ProtonMessenger::Status", name, status);
  return scope.Close(Number::New(status));
}

Handle<Value> ProtonMessenger::Accept(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Accept", name);

  // throw exception if not enough args
  if (args.Length() < 1 || args[0].IsEmpty() || args[0]->IsNull() ||
      args[0]->IsUndefined()) {
    THROW_EXCEPTION(
        "Missing required message argument.", "ProtonMessenger::Accept", name);
  }

  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args[0]->ToObject());

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION(
        "NetworkError", "Not connected", "ProtonMessenger::Accept", name);
  }

  int status = pn_messenger_accept(obj->messenger, msg->tracker, 0);
  if (pn_messenger_errno(obj->messenger)) {
    const char* text = pn_error_text(pn_messenger_error(obj->messenger));
    const char* err = GetErrorName(text);
    THROW_NAMED_EXCEPTION(err, text, "ProtonMessenger::Accept", name);
  } else if (status != 0) {
    THROW_NAMED_EXCEPTION(
        "NetworkError", "Failed to accept", "ProtonMessenger::Accept", name);
  }

  Proton::Exit("ProtonMessenger::Accept", name, true);
  return scope.Close(Boolean::New(true));
}

Handle<Value> ProtonMessenger::Settle(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Settle", name);

  // throw exception if not enough args
  if (args.Length() < 2 || args[0].IsEmpty() || args[0]->IsNull() ||
      args[0]->IsUndefined() || args[1].IsEmpty()) {
    THROW_EXCEPTION(
        "Missing required message argument.", "ProtonMessenger::Settle", name);
  }

  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args[0]->ToObject());

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION(
        "NetworkError", "Not connected", "ProtonMessenger::Settle", name);
  }

  // throw exception if the message is invalid
  if (!msg) {
    THROW_EXCEPTION("Message invalid", "ProtonMessenger::Settle", name);
  }

  int status = pn_messenger_settle(obj->messenger, msg->tracker, 0);
  if (pn_messenger_errno(obj->messenger)) {
    const char* text = pn_error_text(pn_messenger_error(obj->messenger));
    const char* err = GetErrorName(text);
    THROW_NAMED_EXCEPTION(err, text, "ProtonMessenger::Settle", name);
  } else if (status != 0) {
    THROW_NAMED_EXCEPTION(
        "NetworkError", "Failed to settle", "ProtonMessenger::Settle", name);
  }

  ProtonMessenger::Write(obj, args[1], false);

  Proton::Exit("ProtonMessenger::Settle", name, true);
  return scope.Close(Boolean::New(true));
}

Handle<Value> ProtonMessenger::Settled(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Settled", name);

  // throw exception if not enough args
  if (args.Length() < 1 || args[0].IsEmpty() || args[0]->IsNull() ||
      args[0]->IsUndefined()) {
    THROW_EXCEPTION(
        "Missing required message argument.", "ProtonMessenger::Settled", name);
  }

  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args[0]->ToObject());

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION(
        "NetworkError", "Not connected", "ProtonMessenger::Settled", name);
  }

  pn_delivery_t* d = pn_messenger_delivery(obj->messenger, msg->tracker);

  // For incoming messages, if we haven't already settled it, block for a while
  // until we *think* the settlement disposition has been communicated over the
  // network. We detect that by querying pn_transport_quiesced which should
  // return true once all pending output has been written to the wire.
  bool settled = true;
  if (d != NULL && pn_link_is_receiver(pn_delivery_link(d))) {
    pn_session_t* session = pn_link_session(pn_delivery_link(d));
    if (session) {
      pn_connection_t* connection = pn_session_connection(session);
      if (connection) {
        pn_transport_t* transport = pn_connection_transport(connection);
        if (transport) {
          if (!pn_transport_quiesced(transport)) {
            settled = false;
          }
        }
      }
    }
  }

  Proton::Exit("ProtonMessenger::Settled", name, settled);
  return scope.Close(Boolean::New(settled));
}

Handle<Value> ProtonMessenger::GetRemoteIdleTimeout(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::GetRemoteIdleTimeout", name);

  // throw exception if not enough args
  if (args.Length() < 1 || args[0].IsEmpty() || args[0]->IsNull() ||
      args[0]->IsUndefined()) {
    THROW_EXCEPTION("Missing required address argument.",
                    "ProtonMessenger::GetRemoteIdleTimeout",
                    name);
  }

  String::Utf8Value param(args[0]->ToString());
  std::string address = std::string(*param);
  Proton::Log("parms", name, "address:", address.c_str());

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION("NetworkError",
                          "Not connected",
                          "ProtonMessenger::GetRemoteIdleTimeout",
                          name);
  }

  const int remoteIdleTimeout =
      pn_messenger_get_remote_idle_timeout(obj->messenger, address.c_str());

  Proton::Exit(
      "ProtonMessenger::GetRemoteIdleTimeout", name, remoteIdleTimeout);
  return scope.Close(Number::New(remoteIdleTimeout));
}

Handle<Value> ProtonMessenger::Flow(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Flow", name);

  // throw exception if not enough args
  if (args.Length() < 3 || args[0].IsEmpty() || args[0]->IsNull() ||
      args[0]->IsUndefined() || args[1].IsEmpty() || args[2].IsEmpty()) {
    THROW_EXCEPTION(
        "Missing required argument", "ProtonMessenger::Flow", name);
  }

  String::Utf8Value param(args[0]->ToString());
  std::string address = std::string(*param);
  Proton::Log("parms", name, "address:", address.c_str());

  long creditLong = (long) args[1]->ToInteger()->Value();
  if (creditLong > 4294967295) creditLong = 4294967295;
  unsigned int credit = (unsigned int)creditLong;
  Proton::Log("parms", name, "credit:", (int)credit);

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION("NetworkError",
                          "Not connected",
                          "ProtonMessenger::Flow",
                          name);
  }

  // Find link based on address, and flow link credit.
  pn_link_t *link =
    pn_messenger_get_link(obj->messenger, address.c_str(), false);
  if (link) {
    pn_link_flow(link, credit);

    ProtonMessenger::Write(obj, args[2], false);
  } else {
    Proton::Log("parms", name, "link:", "null");
  }

  Proton::Exit("ProtonMessenger::Flow", name, 0);
  return scope.Close(Undefined());
}

Handle<Value> ProtonMessenger::StatusError(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::StatusError", name);

  // throw exception if not enough args
  if (args.Length() < 1 || args[0].IsEmpty() || args[0]->IsNull() ||
      args[0]->IsUndefined()) {
    THROW_EXCEPTION("Missing required message argument.",
                    "ProtonMessenger::StatusError",
                    name);
  }

  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args[0]->ToObject());

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION("NetworkError",
                          "Not connected",
                          "ProtonMessenger::StatusError",
                          name);
  }

  pn_delivery_t *delivery = pn_messenger_delivery(obj->messenger, msg->tracker);
  pn_disposition_t *disposition = NULL;
  pn_condition_t *condition = NULL;
  const char *description = "";
  if (delivery != NULL) {
    disposition = pn_delivery_remote(delivery);
  }
  if (disposition != NULL) {
    condition = pn_disposition_condition(disposition);
  }
  if (condition != NULL) {
    description = pn_condition_get_description(condition);
  }

  Proton::Exit("ProtonMessenger::StatusError", name, description);
  return scope.Close(String::New(description));
}

Handle<Value> ProtonMessenger::PendingOutbound(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::PendingOutbound", name);

  // throw exception if not enough args
  if (args.Length() < 1 || args[0].IsEmpty() || args[0]->IsNull() ||
      args[0]->IsUndefined() || args[1].IsEmpty()) {
    THROW_EXCEPTION(
        "Missing required argument", "ProtonMessenger::PendingOutbound", name);
  }

  String::Utf8Value param(args[0]->ToString());
  std::string address = std::string(*param);
  Proton::Log("parms", name, "address:", address.c_str());

  bool result = false;
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION("NetworkError",
                          "Not connected",
                          "ProtonMessenger::PendingOutbound",
                          name);
  }

  ssize_t pending =
    pn_messenger_pending_outbound(obj->messenger, address.c_str());
  if (pending < 0) {
    THROW_NAMED_EXCEPTION("NetworkError",
                          "Not connected",
                          "ProtonMessenger::PendingOutbound",
                          name);
  } else if (pending > 0) {
    result = true;
  }

  Proton::Exit("ProtonMessenger::PendingOutbound", name, result);
  return scope.Close(Boolean::New(result));
}

Handle<Value> ProtonMessenger::Push(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();
  int n;
  Proton::Entry("ProtonMessenger::Push", name);

  // throw TypeError if not enough args
  if (args.Length() < 2 || args[0].IsEmpty() || args[1].IsEmpty()) {
    THROW_EXCEPTION(
        "Missing chunk.", "ProtonMessenger::Push", name);
  }

  // Pushing data requires a messenger connection
  ssize_t length = (ssize_t)args[0]->ToInteger()->Value();
  if (obj->messenger && obj->connection) {
    Local<Object> buffer = args[1]->ToObject();

    Proton::Entry("pn_connection_push", name);
    n = pn_connection_push(obj->connection, (char *)node::Buffer::Data(buffer), length);
    Proton::Exit("pn_connection_push", name, n);
  } else {
    // This connection has already been closed, so this data can never be
    // pushed in, so just return saying it has so the data will be
    // discarded.
    Proton::Log("data", name, "connection already closed:", "discarding data");
    n = length;
  }

  Proton::Exit("ProtonMessenger::Push", name, n);
  return scope.Close(Number::New(n));
}

Handle<Value> ProtonMessenger::Write(ProtonMessenger* obj,
                                     Local<Value> value, bool force)
{
  HandleScope scope;
  const char* name = obj->name.c_str();
  Proton::Entry("entry_often", "ProtonMessenger::Write", name);

  // Checking for pending data requires a messenger connection
  int n;
  if (obj->messenger && obj->connection) {
    // value is expected to contain a Writable Stream object
    if (value->IsObject()) {
      Local<Object> stream = value->ToObject();
      Local<Function> streamWrite = Local<Function>::Cast(
        stream->Get(String::New("write")));

      pn_transport_t *transport = pn_connection_transport(obj->connection);
      if (transport) {
        n = (int)pn_transport_pending(transport);
        // Force a pop, causing a heartbeat to be generated, if necessary
        if (force) {
          Proton::Log("data_often", name, "forcing messenger tick", "");
          Proton::Entry("pn_connection_pop", name);
          bool closed = pn_connection_pop(obj->connection, 0);
          Proton::Exit("pn_connection_pop", name, 0);
          if (closed) {
            Proton::Log("data_often", name, "connection is closed", "");
            obj->connection = NULL;
          }
        }

        if (obj->connection && (n > 0)) {
          // write n bytes to stream
          Local<Object> global = Context::GetCurrent()->Global();
          Local<Function> constructor =
              Local<Function>::Cast(global->Get(String::New("Buffer")));
          Local<Value> args[1] = {v8::Integer::New(n)};
          Local<Value> buffer = constructor->NewInstance(1, args);
          memcpy(node::Buffer::Data(buffer),
                 pn_transport_head(transport), n);
          Local<Value> writeArgs[1] = {buffer};
          Local<Value> drained = streamWrite->Call(stream, 1, writeArgs);
          Proton::Log("data_often", name, "stream drained:",
                      drained->ToBoolean()->Value());

          Proton::Entry("pn_connection_pop", name);
          bool closed = pn_connection_pop(obj->connection, n);
          Proton::Exit("pn_connection_pop", name, n);
          if (closed) {
            Proton::Log("data_often", name, "connection is closed", "");
            obj->connection = NULL;
          }
        } else {
          n = 0;
        }
      } else {
        n = -1;
      }
    } else {
      String::Utf8Value param(value->ToDetailString());
      std::string detail = std::string(*param);
      Proton::Log("data_often", name, "Invalid stream object:", detail.c_str());
      n = -1;
    }
  } else {
    n = -1;
  }

  Proton::Exit("exit_often", "ProtonMessenger::Write", name, n);
  return scope.Close(Number::New(n));
}

Handle<Value> ProtonMessenger::Pop(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();
  Proton::Entry("ProtonMessenger::Pop", name);

  // throw TypeError if not enough args
  if (args.Length() < 2 || args[0].IsEmpty() || args[1].IsEmpty()) {
    THROW_EXCEPTION("Missing stream or force argument.",
                    "ProtonMessenger::Pop", name);
  }

  bool force = args[1]->ToBoolean()->Value();
  Handle<Value> value = ProtonMessenger::Write(obj, args[0], force);
  int n = (int)value->ToNumber()->Value();

  Proton::Exit("ProtonMessenger::Pop", name, n);
  return scope.Close(value);
}

Handle<Value> ProtonMessenger::Started(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();
  Proton::Entry("ProtonMessenger::Started", name);

  bool started;
  if (obj->messenger) {
    Proton::Entry("pn_messenger_started", name);
    started = pn_messenger_started(obj->messenger);
    Proton::Exit("pn_messenger_started", name, started);

    int error = pn_messenger_errno(obj->messenger);
    if (error) {
      const char* text = pn_error_text(pn_messenger_error(obj->messenger));
      const char* err = GetErrorName(text);
      THROW_NAMED_EXCEPTION(err, text, "ProtonMessenger::Started", name)
    }
  } else {
    started = false;
  }

  Proton::Exit("ProtonMessenger::Started", name, started);
  return scope.Close(Boolean::New(started));
}

Handle<Value> ProtonMessenger::Closed(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();
  Proton::Entry("ProtonMessenger::Closed", name);

  if (obj->messenger && obj->connection) {
    Proton::Entry("pn_connection_was_closed", name);
    pn_connection_was_closed(obj->messenger, obj->connection);
    Proton::Exit("pn_connection_was_closed", name, 0);

    int error = pn_messenger_errno(obj->messenger);
    if (error) {
      const char* text = pn_error_text(pn_messenger_error(obj->messenger));
      const char* err = GetErrorName(text);
      THROW_NAMED_EXCEPTION(err, text, "ProtonMessenger::Closed", name)
    }
  }

  Proton::Exit("ProtonMessenger::Closed", name, 0);
  return scope.Close(Undefined());
}

Handle<Value> ProtonMessenger::Heartbeat(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();
  Proton::Entry("ProtonMessenger::Heartbeat", name);

  // throw TypeError if not enough args
  if (args.Length() < 1 || args[0].IsEmpty()) {
    THROW_EXCEPTION("Missing stream argument.",
                    "ProtonMessenger::Heartbeat", name);
  }

  ProtonMessenger::Write(obj, args[0], true);

  Proton::Exit("ProtonMessenger::Heartbeat", name, 0);
  return scope.Close(Undefined());
}
