#ifndef MESSAGE_HPP
#define MESSAGE_HPP
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
/* the Apache Qpid Proton C Message API for use by Node.js            */
/**********************************************************************/
/* End of text to be included in SRM                                  */
/**********************************************************************/

#include <string>

#include <node.h>
#include <node_buffer.h>

#include <proton/message.h>
#include <proton/messenger.h>

class ProtonMessage : public node::ObjectWrap
{
 public:
  static v8::Persistent<v8::FunctionTemplate> constructor;
  static void Init(v8::Handle<v8::Object> target);
  static v8::Handle<v8::Value> NewInstance(const v8::Arguments& args);
  ProtonMessage();
  ~ProtonMessage();

  pn_message_t* message;
  pn_tracker_t tracker;
  const char* linkAddr;
  char name[24];

 protected:
  static v8::Handle<v8::Value> New(const v8::Arguments& args);
  static v8::Handle<v8::Value> Destroy(const v8::Arguments& args);
  static v8::Handle<v8::Value> GetAddress(v8::Local<v8::String> property,
                                          const v8::AccessorInfo& args);
  static void SetAddress(v8::Local<v8::String> property,
                         v8::Local<v8::Value> value,
                         const v8::AccessorInfo& args);
  static v8::Handle<v8::Value> GetBody(v8::Local<v8::String> property,
                                       const v8::AccessorInfo& args);
  static void PutBody(v8::Local<v8::String> property,
                      v8::Local<v8::Value> value,
                      const v8::AccessorInfo& args);
  static v8::Handle<v8::Value> GetContentType(v8::Local<v8::String> property,
                                              const v8::AccessorInfo& args);
  static void SetContentType(v8::Local<v8::String> property,
                             v8::Local<v8::Value> value,
                             const v8::AccessorInfo& args);
  static v8::Handle<v8::Value> GetLinkAddress(v8::Local<v8::String> property,
                                              const v8::AccessorInfo& args);
  static v8::Handle<v8::Value> GetDeliveryAnnotations(
      v8::Local<v8::String> property,
      const v8::AccessorInfo& info);
  static v8::Handle<v8::Value> GetTimeToLive(v8::Local<v8::String> property,
                                             const v8::AccessorInfo& args);
  static void SetTimeToLive(v8::Local<v8::String> property,
                            v8::Local<v8::Value> value,
                            const v8::AccessorInfo& args);
};

#endif /* MESSAGE_HPP */
