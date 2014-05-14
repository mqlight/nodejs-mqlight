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
/* The functions in this file provide the initalisation functions     */
/* used to register the module with Node.js                           */
/**********************************************************************/
/* End of text to be included in SRM                                  */
/**********************************************************************/

#include "proton.hpp"
#include "messenger.hpp"
#include "message.hpp"

using namespace v8;

Persistent<Function> Proton::logEntry;
Persistent<Function> Proton::logExit;
Persistent<Function> Proton::logLog;

#define NO_CLIENT_ID "*"

void Proton::Entry(const char *name, const char *id)
{
  HandleScope scope;
  Local<Value> args[2] = {Local<Value>::New(String::New(name)),
                          Local<Value>::New(String::New(id ? id : NO_CLIENT_ID))};
  Proton::logEntry->Call(Context::GetCurrent()->Global(), 2, args);
  scope.Close(Undefined());
}

void Proton::Exit(const char *name, const char *id, int rc)
{
  if(rc)
  {
    char rcString[16];
    sprintf(rcString, "%d", rc);
    Proton::Exit(name, id, rcString);
  }
  else
  {
    Proton::Exit(name, id, "");
  }
}

void Proton::Exit(const char *name, const char *id, const char *rc)
{
  HandleScope scope;
  Local<Value> args[3] = {Local<Value>::New(String::New(name)),
                          Local<Value>::New(String::New(id ? id : NO_CLIENT_ID)),
                          Local<Value>::New(String::New(rc ? rc : "null"))};
  Proton::logExit->Call(Context::GetCurrent()->Global(), 3, args);
  scope.Close(Undefined());
}

void Proton::Log(const char *lvl, const char *id, const char *prefix, const char *data)
{
  HandleScope scope;
  Local<Value> args[4] = {Local<Value>::New(String::New(lvl)),
                          Local<Value>::New(String::New(id ? id : NO_CLIENT_ID)),
                          Local<Value>::New(String::New(prefix)),
                          Local<Value>::New(String::New(data ? data : ""))};
  Proton::logLog->Call(Context::GetCurrent()->Global(), 4, args);
  scope.Close(Undefined());
}

void Proton::Log(const char *lvl, const char *id, const char *prefix, int data)
{
  char dataString[16];
  sprintf(dataString, "%d", data);
  Proton::Log(lvl, id, prefix, dataString);
}

Handle<Value> CreateMessage(const Arguments& args) {
  HandleScope scope;
  return scope.Close(ProtonMessage::NewInstance(args));
}

Handle<Value> CreateMessenger(const Arguments& args) {
  HandleScope scope;
  return scope.Close(ProtonMessenger::NewInstance(args));
}

void RegisterModule(Handle<Object> exports)
{
  HandleScope scope;

  ProtonMessenger::Init(exports);
  ProtonMessage::Init(exports);
  exports->Set(String::NewSymbol("createMessage"),
               FunctionTemplate::New(CreateMessage)->GetFunction());
  exports->Set(String::NewSymbol("createMessenger"),
               FunctionTemplate::New(CreateMessenger)->GetFunction());

  Local<Value> logVal = Context::GetCurrent()->Global()->Get(String::New("log"));
  Local<Object> logObj = Local<Object>::Cast(logVal);
  Local<Function> entryFnc = Local<Function>::Cast(logObj->Get(String::New("entry")));
  Local<Function> exitFnc = Local<Function>::Cast(logObj->Get(String::New("exit")));
  Local<Function> logFnc = Local<Function>::Cast(logObj->Get(String::New("log")));
  Proton::logEntry = Persistent<Function>::New(Local<Function>::Cast(entryFnc));
  Proton::logExit = Persistent<Function>::New(Local<Function>::Cast(exitFnc));
  Proton::logLog = Persistent<Function>::New(Local<Function>::Cast(logFnc));

  scope.Close(Undefined());
}

NODE_MODULE(proton, RegisterModule);
