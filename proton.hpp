#ifndef PROTON_HPP
#define PROTON_HPP
/**********************************************************************/
/*   <copyright                                                       */
/*   notice="oco-source"                                              */
/*   pids="5725-P60"                                                  */
/*   years="2014"                                                     */
/*   crc="2536674324" >                                               */
/*   IBM Confidential                                                 */
/*                                                                    */
/*   OCO Source Materials                                             */
/*                                                                    */
/*   5725-P60                                                         */
/*                                                                    */
/*   (C) Copyright IBM Corp. 2014                                     */
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

#include <string>

#include <node.h>

class Proton
{
 public:
  static v8::Persistent<v8::Function> loggerEntry;
  static v8::Persistent<v8::Function> loggerExit;
  static v8::Persistent<v8::Function> loggerLog;
  static v8::Persistent<v8::Function> loggerBody;
  static v8::Persistent<v8::Function> loggerFFDC;
  static v8::Persistent<v8::Function> loggerThrow;
  static void Entry(const char* name, const char* id);
  static void Entry(const char* lvl, const char* name, const char* id);
  static void Exit(const char* name, const char* id, int rc);
  static void Exit(const char* name, const char* id, bool rc);
  static void Exit(const char* name, const char* id, const char* rc);
  static void Exit(const char* lvl, const char* name, const char* id, int rc);
  static void Exit(const char* lvl,
                   const char* name,
                   const char* id,
                   const char* rc);
  static void EntryTracer(const char* name, const char* message);
  static void ExitTracer(const char* name, const char* message);
  static void Log(const char* lvl,
                  const char* id,
                  const char* prefix,
                  const char* data);
  static void Log(const char* lvl,
                  const char* id,
                  const char* prefix,
                  int data);
  static void LogBody(const char* id, const char* data);
  static void LogBody(const char* id, v8::Handle<v8::Value> data);
  static void FFDC(const char* fnc, int probeId, const char* data);
  static void Throw(const char* name, const char* id, const char* err);
  static void Throw(const char* lvl,
                    const char* name,
                    const char* id,
                    const char* err);
  static v8::Handle<v8::Object> NewNamedError(const char* name,
                                              const char* msg);
};

#endif /* PROTON_HPP */
