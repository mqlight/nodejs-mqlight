const static char sccsid[] = "%Z% %W% %I% %E% %U%";
/**********************************************************************/
/*   <copyright                                                       */
/*   notice="oco-source"                                              */
/*   pids="5755-P60"                                                  */
/*   years="2013"                                                     */
/*   crc="2536674324" >                                               */
/*   IBM Confidential                                                 */
/*                                                                    */
/*   OCO Source Materials                                             */
/*                                                                    */
/*   5755-P60                                                         */
/*                                                                    */
/*   (C) Copyright IBM Corp. 2013                                     */
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
const char* GetErrorName(const char* text)
{
  return (strstr(text, "sasl ") || strstr(text, "SSL "))
             ? "SecurityError"
             : (strstr(text, "_Takeover")) ? "ReplacedError" : "NetworkError";
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
  NODE_SET_PROTOTYPE_METHOD(constructor, "unsubscribe", Unsubscribe);
  NODE_SET_PROTOTYPE_METHOD(constructor, "receive", Receive);
  NODE_SET_PROTOTYPE_METHOD(constructor, "status", Status);
  NODE_SET_PROTOTYPE_METHOD(constructor, "statusError", StatusError);
  NODE_SET_PROTOTYPE_METHOD(constructor, "settle", Settle);
  NODE_SET_PROTOTYPE_METHOD(
      constructor, "getRemoteIdleTimeout", GetRemoteIdleTimeout);
  NODE_SET_PROTOTYPE_METHOD(constructor, "work", Work);
  NODE_SET_PROTOTYPE_METHOD(constructor, "flow", Flow);

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

  /* Set the required QoS, by setting the sender settler mode to settled (QoS =
   * AMO) or unsettled (QoS = ALO).
   * Note that the receiver settler mode is always set to first, as the MQ Light
   * listener will negotiate down any receiver settler mode to first.
   */
  if (qos == 0) {
    pn_messenger_set_snd_settle_mode(obj->messenger, PN_SND_SETTLED);
    pn_messenger_set_rcv_settle_mode(obj->messenger, PN_RCV_FIRST);
  } else if (qos == 1) {
    pn_messenger_set_snd_settle_mode(obj->messenger, PN_SND_UNSETTLED);
    pn_messenger_set_rcv_settle_mode(obj->messenger, PN_RCV_FIRST);
  } else {
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

  Proton::Exit("ProtonMessenger::Put", name, true);
  return scope.Close(Boolean::New(true));
}

Handle<Value> ProtonMessenger::Send(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Send", name);

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

  Proton::Entry("pn_messenger_work", name);
  pn_messenger_work(obj->messenger, 50);
  error = pn_messenger_errno(obj->messenger);
  Proton::Exit("pn_messenger_work", name, error);
  if (error) {
    const char* text = pn_error_text(pn_messenger_error(obj->messenger));
    const char* err = GetErrorName(text);
    THROW_NAMED_EXCEPTION(err, text, "ProtonMessenger::Send", name)
  }

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

  // Check for a SSL trust certificate parameter being specified
  std::string sslTrustCertificate;
  if (!(args.Length() < 2 || args[1].IsEmpty() || args[1]->IsNull() ||
        args[1]->IsUndefined())) {
    String::Utf8Value param1(args[1]->ToString());
    sslTrustCertificate = std::string(*param1);
    // Check that the trust certificate exists, if not then set the last error
    // text and return
    // (note that we don't throw an exception as this an expected/user error)
    std::ifstream sslTrustCertificateFile(sslTrustCertificate.c_str());
    if (!sslTrustCertificateFile.good()) {
      std::string msg = "The file specified for sslTrustCertificate '" +
                        sslTrustCertificate +
                        "' does not exist or is not accessible";
      THROW_NAMED_EXCEPTION(
          "SecurityError", msg.c_str(), "ProtonMessenger::Connect", name);
    }
  } else {
    sslTrustCertificate = "";
  }
  if (sslTrustCertificate.length() > 0) {
    Proton::Log(
        "parms", name, "sslTrustCertificate:", sslTrustCertificate.c_str());
  }

  // Check for a SSL verify name parameter being specified
  pn_ssl_verify_mode_t sslMode = PN_SSL_VERIFY_NULL;
  if (!(args.Length() < 3 || args[2].IsEmpty() || args[2]->IsNull() ||
        args[2]->IsUndefined())) {
    Local<Value> param2 = args[2];
    bool sslVerifyName = param2->BooleanValue();
    Proton::Log("parms", name, "sslVerifyName:", sslVerifyName);
    if (sslVerifyName) {
      sslMode = PN_SSL_VERIFY_PEER_NAME;
    } else {
      sslMode = PN_SSL_VERIFY_PEER;
    }
  }

  // If the proton messenger already exists and has been stopped then free it
  // so that we can recreate a new instance.  This situation can arise if the
  // messenger link is closed by the remote end instead of a call to
  // ProtonMessenger::Stop
  if (obj->messenger) {
    Proton::Entry("pn_messenger_stopped", name);
    bool stopped = pn_messenger_stopped(obj->messenger);
    Proton::Exit("pn_messenger_stopped", name, stopped);
    if (stopped) {
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

  // Set the messenger SSL trust certificate when required
  if (sslTrustCertificate.length() > 0) {
    Proton::Entry("pn_messenger_set_trusted_certificates", name);
    int error = pn_messenger_set_trusted_certificates(
        obj->messenger, sslTrustCertificate.c_str());
    Proton::Exit("pn_messenger_set_trusted_certificates", name, error);
    if (error) {
      pn_messenger_free(obj->messenger);
      obj->messenger = NULL;
      // throw SecurityError if unable to set certificates
      THROW_NAMED_EXCEPTION("SecurityError",
                            "Failed to set trusted certificates",
                            "ProtonMessenger::Connect",
                            name);
    }
  }
  if (sslMode != PN_SSL_VERIFY_NULL) {
    Proton::Entry("pn_messenger_set_ssl_peer_authentication_mode", name);
    int error =
        pn_messenger_set_ssl_peer_authentication_mode(obj->messenger, sslMode);
    Proton::Exit("pn_messenger_set_ssl_peer_authentication_mode", name, error);
    if (error) {
      pn_messenger_free(obj->messenger);
      obj->messenger = NULL;
      // throw TypeError if unable to set certificates
      THROW_NAMED_EXCEPTION("SecurityError",
                            "Failed to set SSL peer authentication mode",
                            "ProtonMessenger::Connect",
                            name);
    }
  }

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

  // Start the messenger. This will fail if the route is invalid
  Proton::Entry("pn_messenger_start", name);
  error = pn_messenger_start(obj->messenger);
  Proton::Exit("pn_messenger_start", name, error);
  if (error) {
    const char* text = pn_error_text(pn_messenger_error(obj->messenger));
    const char* err = GetErrorName(text);
    // clonse to std::string before free'ing messenger
    std::string msg = text;
    pn_messenger_free(obj->messenger);
    obj->messenger = NULL;
    THROW_NAMED_EXCEPTION(err, msg.c_str(), "ProtonMessenger::Connect", name)
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

  // If already stopped then simply return true
  if (!obj->messenger) {
    Proton::Exit("ProtonMessenger::Stop", name, true);
    return scope.Close(Boolean::New(true));
  }

  Proton::Entry("pn_messenger_stop", name);
  int err = pn_messenger_stop(obj->messenger);
  Proton::Exit("pn_messenger_stop", name, err);

  Proton::Entry("pn_messenger_stopped", name);
  bool stopped = pn_messenger_stopped(obj->messenger);
  Proton::Exit("pn_messenger_stopped", name, stopped);

  if (stopped) {
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
      args[2].IsEmpty() || args[3].IsEmpty()) {
    THROW_EXCEPTION("Missing required argument",
                    "ProtonMessenger::Subscribe",
                    name);
  }

  String::Utf8Value param(args[0]->ToString());
  std::string address = std::string(*param);
  int qos = (int)args[1]->ToInteger()->Value();
  int ttl = (int)args[2]->ToInteger()->Value();
  long creditLong = (long) args[3]->ToInteger()->Value();
  if (creditLong > 4294967295) creditLong = 4294967295;
  unsigned int credit = (unsigned int) creditLong;
  Proton::Log("parms", name, "address:", address.c_str());
  Proton::Log("parms", name, "qos:", qos);
  Proton::Log("parms", name, "ttl:", ttl);
  Proton::Log("parms", name, "credit:", credit);

  // throw Error if not connected
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION(
        "NetworkError", "Not connected", "ProtonMessenger::Subscribe", name);
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

  pn_link_t* link =
      pn_messenger_get_link(obj->messenger, address.c_str(), false);

  if (!link) {
    // throw Error if unable to find a matching Link
    THROW_EXCEPTION_TYPE(Exception::Error,
                         ("unable to locate link for " + address).c_str(),
                         "ProtonMessenger::Subscribe",
                         name)
  }

  // XXX: this is less than ideal, but as a temporary fix we will block
  //      until we've received the @attach response back from the server
  //      and the link is marked as active. Ideally we should be passing
  //      callbacks around between JS and C++, so will fix better later
  while (!(pn_link_state(link) & PN_REMOTE_ACTIVE)) {
    Proton::Entry("pn_messenger_work", name);
    pn_messenger_work(obj->messenger, 50);
    error = pn_messenger_errno(obj->messenger);
    Proton::Exit("pn_messenger_work", name, error);
    if (error) {
      const char* text = pn_error_text(pn_messenger_error(obj->messenger));
      const char* err = GetErrorName(text);
      THROW_NAMED_EXCEPTION(err, text, "ProtonMessenger::Subscribe", name)
    }
  }

  if (credit > 0) {
    pn_link_flow(link, credit);
  }

  Proton::Exit("ProtonMessenger::Subscribe", name, true);
  return scope.Close(Boolean::New(true));
}

Handle<Value> ProtonMessenger::Unsubscribe(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Unsubscribe", name);

  // throw TypeError if not enough args
  if (args.Length() < 1 || args[0].IsEmpty()) {
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
    // throw Error if unable to find a matching Link
    THROW_EXCEPTION_TYPE(Exception::Error,
                         ("unable to locate link for " + address).c_str(),
                         "ProtonMessenger::Unsubscribe",
                         name)
  }

  if (ttl == 0) {
    Proton::Entry("pn_terminus_set_expiry_policy", name);
    pn_terminus_set_expiry_policy(pn_link_target(link), PN_LINK_CLOSE);
    pn_terminus_set_expiry_policy(pn_link_source(link), PN_LINK_CLOSE);
    Proton::Exit("pn_terminus_set_expiry_policy", name, 0);
    Proton::Entry("pn_terminus_set_timeout", name);
    Proton::Log("parms", name, "ttl:", ttl);
    pn_terminus_set_timeout(pn_link_target(link), ttl);
    pn_terminus_set_timeout(pn_link_source(link), ttl);
    Proton::Exit("pn_terminus_set_timeout", name, 0);
  }
  Proton::Entry("pn_link_close", name);
  pn_link_close(link);
  Proton::Exit("pn_link_close", name, 0);

  Proton::Entry("pn_messenger_work", name);
  pn_messenger_work(obj->messenger, 50);
  int error = pn_messenger_errno(obj->messenger);
  Proton::Exit("pn_messenger_work", name, error);
  if (error) {
    const char* text = pn_error_text(pn_messenger_error(obj->messenger));
    const char* err = GetErrorName(text);
    THROW_NAMED_EXCEPTION(err, text, "ProtonMessenger::Unsubscribe", name);
  }
  Proton::Exit("ProtonMessenger::Unsubscribe", name, true);
  return scope.Close(Boolean::New(true));
}

/* XXX: this may need to be wrapped in a uv_async queued operation? */
Handle<Value> ProtonMessenger::Receive(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("entry_often", "ProtonMessenger::Receive", name);

  // throw TypeError if not enough args
  if (args.Length() < 1) {
    THROW_EXCEPTION_LEVEL("Missing required expiry time argument.",
                          "exit_often",
                          "ProtonMessenger::Receive",
                          name);
  }

  Local<Integer> integer = args[0]->ToInteger();
  int timeout = (int)integer->Value();

  Proton::Log("data_often", name, "timeout:", timeout);

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

  Proton::Entry("entry_often", "pn_messenger_work", name);
  pn_messenger_work(obj->messenger, timeout);
  error = pn_messenger_errno(obj->messenger);
  Proton::Exit("exit_often", "pn_messenger_work", name, error);
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

    vector.push_back(msgObj);
    pn_tracker_t tracker = pn_messenger_incoming_tracker(obj->messenger);
    msg->tracker = tracker;
    pn_link_t* link = pn_messenger_tracker_link(obj->messenger, tracker);
    if (link) {
      msg->linkAddr = pn_terminus_get_address(pn_link_remote_target(link));
    }
  }

  Local<Array> messages = Array::New((int)vector.size());
  for (unsigned int i = 0; i < vector.size(); i++) {
    messages->Set(Number::New(i), vector[i]);
    // messages->Set(Number::New(i), vector[i].handle_);
  }

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
  if (args.Length() < 1 || args[0].IsEmpty() || args[0]->IsNull() ||
      args[0]->IsUndefined()) {
    THROW_EXCEPTION(
        "Missing required message argument.", "ProtonMessenger::Settle", name);
  }

  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args[0]->ToObject());

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION(
        "NetworkError", "Not connected", "ProtonMessenger::Settle", name);
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

  Proton::Exit("ProtonMessenger::Settle", name, true);
  return scope.Close(Boolean::New(true));
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

Handle<Value> ProtonMessenger::Work(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Work", name);

  // throw exception if not enough args
  if (args.Length() < 1 || args[0].IsEmpty() || args[0]->IsNull() ||
      args[0]->IsUndefined()) {
    THROW_EXCEPTION(
        "Missing required timeout argument.", "ProtonMessenger::Work", name);
  }

  Local<Integer> integer = args[0]->ToInteger();
  int timeout = (int)integer->Value();
  Proton::Log("parms", name, "timeout:", timeout);

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_NAMED_EXCEPTION("NetworkError",
                          "Not connected",
                          "ProtonMessenger::Work",
                          name);
  }

  int status = pn_messenger_work(obj->messenger, timeout);

  Proton::Exit("ProtonMessenger::Work", name, status);
  return scope.Close(Number::New(status));
}

Handle<Value> ProtonMessenger::Flow(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger* obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char* name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Flow", name);

  // throw exception if not enough args
  if (args.Length() < 2 || args[0].IsEmpty() || args[0]->IsNull() ||
      args[0]->IsUndefined() || args[1].IsEmpty()) {
    THROW_EXCEPTION(
        "Missing required argument", "ProtonMessenger::Flow", name);
  }

  String::Utf8Value param(args[0]->ToString());
  std::string address = std::string(*param);
  Proton::Log("parms", name, "address:", address.c_str());
  long creditLong = (long) args[1]->ToInteger()->Value();
  if (creditLong > 4294967295) creditLong = 4294967295;
  unsigned int credit = (unsigned int)creditLong;

  Proton::Log("parms", name, "address:", address.c_str());
  Proton::Log("parms", name, "credit:", credit);

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
