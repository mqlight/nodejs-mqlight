#ifndef MESSAGE_HPP
#define MESSAGE_HPP
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
/* the Apache Qpid Proton C Message API for use by Node.js            */
/**********************************************************************/
/* End of text to be included in SRM                                  */
/**********************************************************************/

#include <string>

#include <node.h>
#include <nan.h>
#include <node_buffer.h>

#include <proton/message.h>
#include <proton/messenger.h>

class ProtonMessage : public node::ObjectWrap
{
 public:
  static Nan::Persistent<v8::FunctionTemplate> constructor;
  static void Init(v8::Handle<v8::Object> target);
  static NAN_METHOD(NewInstance);
  ProtonMessage();
  ProtonMessage(const ProtonMessage& that);
  ProtonMessage& operator=(const ProtonMessage& that);
  ~ProtonMessage();

  pn_message_t* message;
  pn_tracker_t tracker;
  char* linkAddr;
  char name[24];

 protected:
  static NAN_METHOD(New);
  static NAN_METHOD(Destroy);
  static NAN_GETTER(GetAddress);
  static NAN_SETTER(SetAddress);
  static NAN_GETTER(GetBody);
  static NAN_SETTER(PutBody);
  static NAN_GETTER(GetContentType);
  static NAN_SETTER(SetContentType);
  static NAN_GETTER(GetLinkAddress);
  static NAN_GETTER(GetDeliveryAnnotations);
  static NAN_GETTER(GetMessageProperties);
  static NAN_SETTER(SetMessageProperties);
  static NAN_GETTER(GetTimeToLive);
  static NAN_SETTER(SetTimeToLive);
};

#endif /* MESSAGE_HPP */
