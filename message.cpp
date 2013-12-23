const static char sccsid[] = "%Z% %W% %I% %E% %U%";
/*********************************************************************/
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
/* the Apache Qpid Proton C Message API for use by Node.js            */
/**********************************************************************/
/* End of text to be included in SRM                                  */
/**********************************************************************/

#include <stdio.h>
#include <stdlib.h>
#include <ctype.h>
#include <string.h>

#include "message.hpp"

using namespace v8;

#define THROW_EXCEPTION(error) \
    const char *msg = error; \
    Local<Value> e = Exception::TypeError(String::New(msg)); \
    return ThrowException(e);

Persistent<Function> ProtonMessage::constructor;

void ProtonMessage::Init(Handle<Object> target)
{
  HandleScope scope;

  Local<FunctionTemplate> tpl = FunctionTemplate::New(New);
  Persistent<FunctionTemplate> tpp = Persistent<FunctionTemplate>::New(tpl);
  tpp->InstanceTemplate()->SetInternalFieldCount(1);
  Local<String> name = String::NewSymbol("ProtonMessage");
  tpp->SetClassName(name);

  tpp->InstanceTemplate()->SetAccessor(String::New("address"),
      GetAddress, SetAddress);
  tpp->InstanceTemplate()->SetAccessor(String::New("body"),
      GetString, PutString);

  constructor = Persistent<Function>::New(tpp->GetFunction());
  target->Set(name, tpp->GetFunction());
}

ProtonMessage::ProtonMessage() : ObjectWrap()
{
  message = pn_message();
}

ProtonMessage::~ProtonMessage()
{
  if (message)
  {
    pn_message_free(message);
  }
}

Handle<Value> ProtonMessage::New(const Arguments& args)
{
  HandleScope scope;

  if (!args.IsConstructCall())
  {
    THROW_EXCEPTION("Use the new operator to create instances of this object.")
  }

  // create a new instance of this type and wrap it in 'this' v8 Object
  ProtonMessage *msg = new ProtonMessage();
  msg->Wrap(args.This());

  return args.This();
}

Handle<Value> ProtonMessage::GetAddress(Local<String> property,
                                        const AccessorInfo &info)
{
  HandleScope scope;

  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(info.Holder());
  const char *addr = pn_message_get_address(msg->message);

  return scope.Close(String::New(addr));
}

void ProtonMessage::SetAddress(Local<String> property,
                               Local<Value> value,
                               const AccessorInfo &info)
{
  HandleScope scope;

  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(info.Holder());

  String::Utf8Value param(value->ToString());
  std::string address = std::string(*param);

  pn_message_set_address(msg->message, address.c_str());
}

Handle<Value> ProtonMessage::GetString(Local<String> property,
                                       const AccessorInfo &info)
{
  HandleScope scope;

  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(info.Holder());
  pn_data_t *body = pn_message_body(msg->message);

  // XXX: maybe cache this in the C++ object at set time?
  char *buffer = (char *) malloc(512 * sizeof(char));
  size_t buffsize = sizeof(buffer);
  int rc = pn_data_format(body, buffer, &buffsize);
  while (rc == PN_OVERFLOW)
  {
    buffsize = 2*buffsize;
    buffer = (char *) realloc(buffer, buffsize);
    rc = pn_data_format(body, buffer, &buffsize);
  }

#ifdef _DEBUG
    printf("Address: %s\n", pn_message_get_address(msg->message));
    const char *subject = pn_message_get_subject(msg->message);
    printf("Subject: %s\n", subject ? subject : "(no subject)");
    printf("Content: %s\n", buffer);
#endif

  return scope.Close(String::New(buffer, (int)buffsize));
}

void ProtonMessage::PutString(Local<String> property,
                              Local<Value> value,
                              const AccessorInfo &info)
{
  HandleScope scope;

  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(info.Holder());

  String::Utf8Value param(value->ToString());
  std::string msgtext = std::string(*param);

  pn_data_t *body = pn_message_body(msg->message);
  pn_data_put_string(body, pn_bytes_dup(strlen(msgtext.c_str()),
                                        msgtext.c_str()));
}

