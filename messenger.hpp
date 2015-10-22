#ifndef MESSENGER_HPP
#define MESSENGER_HPP
/**********************************************************************/
/*   <copyright                                                       */
/*   notice="oco-source"                                              */
/*   pids="5725-P60"                                                  */
/*   years="2013,2015"                                                */
/*   crc="2536674324" >                                               */
/*   IBM Confidential                                                 */
/*                                                                    */
/*   OCO Source Materials                                             */
/*                                                                    */
/*   5725-P60                                                         */
/*                                                                    */
/*   (C) Copyright IBM Corp. 2013, 2015                               */
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

#include <string>

#include <node.h>
#include <nan.h>

#include <proton/message.h>
#include <proton/messenger.h>

#include <proton/condition.h>
#include <proton/connection.h>
#include <proton/delivery.h>
#include <proton/link.h>
#include <proton/session.h>
#include <proton/terminus.h>
#include <proton/transport.h>
#include <proton/sasl.h>

class ProtonMessenger : public node::ObjectWrap
{
 public:
  static Nan::Persistent<v8::FunctionTemplate> constructor;
  static void Init(v8::Handle<v8::Object> target);
  static NAN_METHOD(NewInstance);
  ProtonMessenger(std::string name, std::string username, std::string password);
  ~ProtonMessenger();

 protected:
  static NAN_METHOD(New);
  static NAN_METHOD(Put);
  static NAN_METHOD(Send);
  static NAN_METHOD(Sending);
  static NAN_METHOD(Stop);
  static NAN_GETTER(Stopped);
  static NAN_METHOD(Connect);
  static NAN_METHOD(Connected);
  static NAN_METHOD(Subscribe);
  static NAN_METHOD(Subscribed);
  static NAN_METHOD(Unsubscribe);
  static NAN_METHOD(Unsubscribed);
  static NAN_METHOD(Receive);
  static NAN_METHOD(Status);
  static NAN_METHOD(StatusError);
  static NAN_METHOD(Accept);
  static NAN_METHOD(Settle);
  static NAN_METHOD(Settled);
  static NAN_METHOD(GetRemoteIdleTimeout);
  static NAN_METHOD(Flow);
  static NAN_METHOD(PendingOutbound);
  static NAN_METHOD(Push);
  static NAN_METHOD(Pop);
  static NAN_METHOD(Started);
  static NAN_METHOD(Closed);
  static NAN_METHOD(Heartbeat);
  static NAN_METHOD(SASL);

  static int Write(ProtonMessenger* obj,
                   v8::Local<v8::Value> value,
                   bool force);
  static void Tracer(pn_transport_t* transport, const char* message);

  /**
   * Name for the messenger. Initially this will be set to the value passed to
   * the constructor.
   * When the proton messenger is constructed this may be modified to the name
   * passed back from the pn_messenger_name function. In general it will not
   * change.
   */
  std::string name;

  /**
   * Username, non-blank implies SASL authentication required.
   */
  std::string username;

  /**
   * Password for a specified username, when SASL authentication required.
   */
  std::string password;

  /**
   * Points to the underlying proton messenger. This will be set when Connect is
   * called and unset when stop is called.
   */
  pn_messenger_t* messenger;

  /**
   * Points to the underlying proton connection. This will be set
   * when Connect is called and unset when Stop is called.
   */
  pn_connection_t* connection;
};

#endif /* MESSENGER_HPP */
