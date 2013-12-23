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

#include "messenger.hpp"
#include "message.hpp"

using namespace v8;

void RegisterModule(Handle<Object> target)
{
  ProtonMessenger::Init(target);
  ProtonMessage::Init(target);
}

NODE_MODULE(proton, RegisterModule);
