// $Id$

/************************************************************
 * The Data Acquisition Backbone Core (DABC)                *
 ************************************************************
 * Copyright (C) 2009 -                                     *
 * GSI Helmholtzzentrum fuer Schwerionenforschung GmbH      *
 * Planckstr. 1, 64291 Darmstadt, Germany                   *
 * Contact:  http://dabc.gsi.de                             *
 ************************************************************
 * This software can be used under the GPL license          *
 * agreements as stated in LICENSE.txt file                 *
 * which is part of the distribution.                       *
 ************************************************************/

#include "gosip/Player.h"

#include "dabc/Publisher.h"

#include <stdio.h>

gosip::Player::Player(const std::string& name, dabc::Command cmd) :
   dabc::ModuleAsync(name, cmd)
{
   fWorkerHierarchy.Create("FESA", true);

   dabc::CommandDefinition cmddef = CreateCmdDef("CmdGosip");
   //cmddef.SetField(dabc::prop_auth, true); // require authentication
   cmddef.AddArg("cmd", "string", true, "-");
   
   dabc::Hierarchy ui = fWorkerHierarchy.CreateHChild("UI");
   ui.SetField(dabc::prop_kind, "DABC.HTML");
   ui.SetField("dabc:UserFilePath", "${DABCSYS}/plugins/gosip/htm/");
   ui.SetField("dabc:UserFileMain", "gosip.htm");

   CreateTimer("update", 1., false);
   
   PublishPars("GOSIP/Test");
}

gosip::Player::~Player()
{
}

void gosip::Player::ProcessTimerEvent(unsigned timer)
{
   //dabc::Hierarchy ui = fWorkerHierarchy.FindChild("UserInterface");
   //DOUT0("Process timer '%s'", ui.GetField("FilePath").AsStr().c_str());
}


int gosip::Player::ExecuteCommand(dabc::Command cmd)
{
   if (cmd.IsName("CmdGosip")) {

      int sfp = cmd.GetInt("sfp", 0);
      int dev = cmd.GetInt("dev", 0);

      std::string prefix = "gosipcmp ";
      if ((sfp<0) || (dev<0)) {
         prefix.append("-- -1 -1 ");
      } else {
         prefix.append(dabc::format("%d %d ", sfp, dev));
      }

      std::vector<std::string> gosipcmd = cmd.GetField("cmd").AsStrVect();

      std::vector<std::string> gosipres;

      DOUT0("****************** CmdGosip ****************");
      for (unsigned n=0;n<gosipcmd.size();n++) {

         std::string currcmd = gosipcmd[n];

         bool isreading = (currcmd.find("-r")==0);
         bool iswriting = (currcmd.find("-w")==0);

         if (!isreading && !iswriting) {
            isreading = true;
            currcmd = std::string("-r ") + currcmd;
         }


         std::string exec = prefix + currcmd + " 2>&1";

         DOUT0("CMD %s", exec.c_str());

         FILE* pipe = popen(exec.c_str(), "r");

         if (!pipe) {
            gosipres.push_back("<err>");
            break;
         }

         char buf[2048];
         memset(buf, 0, sizeof(buf));

         while(!feof(pipe)) {
            int size = (int)fread(buf,1, sizeof(buf)-1, pipe); //cout<<buffer<<" size="<<size<<endl;
            if (size<=0) break;
            buf[size] = 0;
            DOUT0("Get %s", buf);
         }
         pclose(pipe);

         if (iswriting) {

            DOUT0("Writing res:%s len %d", buf, strlen(buf));

            if (strlen(buf) > 2) {
               gosipres.push_back("<err>");
               break;
            }

            gosipres.push_back("<ok>");
            continue;
         }

         if (isreading) {
            long value = 0;
            if (!dabc::str_to_lint(buf,&value)) {
               gosipres.push_back("<err>");
               break;
            }
            DOUT0("Reading ok %ld", value);
            gosipres.push_back(dabc::format("%ld", value));
            continue;
         }
         gosipres.push_back("<undef>");
      }

      while (gosipres.size() < gosipcmd.size()) gosipres.push_back("<skip>");

      cmd.SetField("res", gosipres);

      return dabc::cmd_true;
   }

   return dabc::ModuleAsync::ExecuteCommand(cmd);
}
