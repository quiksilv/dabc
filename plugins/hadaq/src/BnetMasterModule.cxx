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

#include "hadaq/BnetMasterModule.h"

#include "dabc/Publisher.h"
#include "dabc/Iterator.h"

#include "hadaq/HadaqTypeDefs.h"

hadaq::BnetMasterModule::BnetMasterModule(const std::string &name, dabc::Command cmd) :
   dabc::ModuleAsync(name, cmd)
{
   fControl = Cfg("Controller", cmd).AsBool(false);
   fMaxRunSize = Cfg("MaxRunSize", cmd).AsUInt(2000);

   double period = Cfg("period", cmd).AsDouble(fControl ? 0.2 : 1);
   CreateTimer("update", period);

   fSameBuildersCnt = 0;

   fCmdCnt = 1;
   fCmdReplies = 0;
   fCmdQuality = 1.;

   fCalibrRunId = 0;
   fCalibrTm = 0;

   fRefreshCnt = 1;
   fRefreshReplies = 0;

   fCtrlId = 1;
   fNewRunTm.GetNow();
   fCtrlTm.GetNow();
   fCtrlCnt = 0;
   fCtrlError = false;
   fCtrlErrorCnt = 0;
   fCtrlSzLimit = 0; // no need to do something

   // more fine measurement of events rate
   fCurrentLost = fCurrentEvents = fCurrentData = fTotalLost = fTotalEvents = fTotalData = 0;
   fLastRateTm.GetNow();

   fWorkerHierarchy.Create("Bnet");

   fWorkerHierarchy.SetField("_player","DABC.BnetControl");

   dabc::Hierarchy item = fWorkerHierarchy.CreateHChild("Inputs");
   item.SetField(dabc::prop_kind, "Text");
   item.SetField("value", "");
   item.SetField("_hidden", "true");

   item = fWorkerHierarchy.CreateHChild("Builders");
   item.SetField(dabc::prop_kind, "Text");
   item.SetField("value", "");
   item.SetField("_hidden", "true");

   item = fWorkerHierarchy.CreateHChild("LastPrefix");
   item.SetField(dabc::prop_kind, "Text");
   item.SetField("value", "");
   item.SetField("_hidden", "true");

   item = fWorkerHierarchy.CreateHChild("LastCalibr");
   item.SetField(dabc::prop_kind, "Text");
   item.SetField("value", "");
   item.SetField("_hidden", "true");

   item = fWorkerHierarchy.CreateHChild("MasterRunId"); // runid configured by master when starting RUN
   item.SetField(dabc::prop_kind, "Text");
   item.SetField("value", "0");
   item.SetField("_hidden", "true");

   item = fWorkerHierarchy.CreateHChild("RunningCmd"); // currently running cmd
   item.SetField(dabc::prop_kind, "Text");
   item.SetField("value", "");
   item.SetField("_hidden", "true");

   CreatePar("State").SetFld(dabc::prop_kind, "Text").SetValue("Init");
   CreatePar("Quality").SetFld(dabc::prop_kind, "Text").SetValue("0.5");

   CreatePar("RunId").SetFld(dabc::prop_kind, "Text").SetValue("--");
   CreatePar("RunIdStr").SetFld(dabc::prop_kind, "Text").SetValue("--");
   CreatePar("RunPrefix").SetFld(dabc::prop_kind, "Text").SetValue("--");

   CreatePar("DataRate").SetUnits("MB").SetFld(dabc::prop_kind,"rate").SetFld("#record", true);
   CreatePar("EventsRate").SetUnits("Ev").SetFld(dabc::prop_kind,"rate").SetFld("#record", true);
   CreatePar("LostRate").SetUnits("Ev").SetFld(dabc::prop_kind,"rate").SetFld("#record", true);

   CreatePar("TotalEvents").SetValue("0");
   CreatePar("TotalLost").SetValue("0");

   if (fControl) {
      CreateCmdDef("StartRun").AddArg("prefix", "string", true, "run")
                              .AddArg("oninit", "int", false, "0");
      CreateCmdDef("StopRun");
      CreateCmdDef("RefreshRun");
      CreateCmdDef("ResetDAQ");
   }

   // read calibration from file
   PreserveLastCalibr();

   // Publish(fWorkerHierarchy, "$CONTEXT$/BNET");
   PublishPars("$CONTEXT$/BNET");

   DOUT0("BNET MASTER Control %s period %3.1f ", DBOOL(fControl), period);
}

void hadaq::BnetMasterModule::AddItem(std::vector<std::string> &items, std::vector<std::string> &nodes, const std::string &item, const std::string &node)
{
   auto iter1 = items.begin();
   auto iter2 = nodes.begin();
   while (iter1 != items.end()) {
      if (*iter1 > item) {
         items.insert(iter1, item);
         nodes.insert(iter2, node);
         return;
      }
      ++iter1;
      ++iter2;
   }

   items.emplace_back(item);
   nodes.emplace_back(node);
}

void hadaq::BnetMasterModule::PreserveLastCalibr(bool do_write, double quality, unsigned runid, bool set_time)
{
   dabc::Hierarchy item  = fWorkerHierarchy.GetHChild("LastCalibr");
   if (!item) return;

   dabc::DateTime tm;

   FILE* f = fopen("lastcalibr.txt", do_write ? "w" : "r");
   if (!f) {
      EOUT("FAIL to open file lastcalibr.txt for %s", do_write ? "writing" : "reading");
      return;
   }

   if (do_write) {
      if (set_time || (fCalibrTm == 0)) {
         tm.GetNow();
         fCalibrTm = tm.AsJSDate();
      } else {
         tm.SetJSDate(fCalibrTm);
      }
      fprintf(f,"%lu\n", (long unsigned) fCalibrTm);
      fprintf(f,"%f\n", quality);
      fprintf(f,"%u\n", runid);
   } else {
      long unsigned tm_js = 0;
      if (fscanf(f,"%lu", &tm_js) != 1) EOUT("Fail to get time from lastcalibr.txt");
      tm.SetJSDate(tm_js);
      if (fscanf(f,"%lf", &quality) != 1) EOUT("Fail to get quality from lastcalibr.txt");
      if (fscanf(f,"%u", &runid) != 1) EOUT("Fail to get runid from lastcalibr.txt");

      fCalibrRunId = runid;
      fCalibrTm = tm_js;
   }
   fclose(f);

   std::string info = dabc::format("%s quality = %5.2f run = %s", tm.AsString(0,true).c_str(), quality, hadaq::FormatFilename(runid,0).c_str());

   DOUT0("CALIBR INFO %s", info.c_str());

   item.SetField("value", info);
   item.SetField("time", tm.AsJSString());
   item.SetField("quality", quality);
   item.SetField("runid", runid);
}


bool hadaq::BnetMasterModule::ReplyCommand(dabc::Command cmd)
{
   if (cmd.IsName(dabc::CmdGetNamesList::CmdName())) {
      //DOUT0("Get hierarchy");
      dabc::Hierarchy h = dabc::CmdGetNamesList::GetResNamesList(cmd);
      dabc::Iterator iter(h);
      std::vector<std::string> binp, bbuild, nodes_inp, nodes_build;
      while (iter.next()) {
         dabc::Hierarchy item = iter.ref();
         if (item.HasField("_bnet")) {
            std::string kind = item.GetField("_bnet").AsStr(),
                        producer = item.GetField("_producer").AsStr();

            std::size_t pos = producer.find_last_of("/");
            if (pos != std::string::npos) producer.resize(pos);

            if (kind == "sender") AddItem(binp, nodes_inp, item.ItemName(), producer);
            if (kind == "receiver") AddItem(bbuild, nodes_build, item.ItemName(), producer);
            //DOUT0("Get BNET %s", item.ItemName().c_str());
         }
      }

      if ((fLastBuilders.size()>0) && (fLastBuilders == bbuild)) {
         fSameBuildersCnt++;
         if (!fInitRunCmd.null() && (fSameBuildersCnt > cmd.GetInt("oninit"))) {
            DOUT0("DETECTED SAME BUILDERS %d", fSameBuildersCnt);

            fInitRunCmd.SetBool("#verified", true);
            int res = ExecuteCommand(fInitRunCmd);
            if (res != dabc::cmd_postponed)
               fInitRunCmd.Reply(res);
            else
               fInitRunCmd.Release();
         }

      } else {
         fSameBuildersCnt = 0;
      }

      fLastBuilders = bbuild;

      fWorkerHierarchy.GetHChild("Inputs").SetField("value", binp);
      fWorkerHierarchy.GetHChild("Inputs").SetField("nodes", nodes_inp);
      fWorkerHierarchy.GetHChild("Builders").SetField("value", bbuild);
      fWorkerHierarchy.GetHChild("Builders").SetField("nodes", nodes_build);

      if (fCtrlCnt != 0) {
         if (!fCtrlTm.Expired()) return true;
         if (fCtrlCnt > 0) { fCtrlError = true; EOUT("Fail to get %d control records", fCtrlCnt); }
      }

      if (fCtrlError)
         fCtrlErrorCnt++;
      else
         fCtrlErrorCnt = 0;

      fCtrlCnt = 0;
      fCtrlId++;
      fCtrlError = false;
      fCtrlTm.GetNow(3.); // use 3 sec timeout for control requests

      fCtrlStateQuality = 1;
      fCtrlStateName = "";
      fCtrlData = 0.;
      fCtrlEvents = 0.;
      fCtrlLost = 0.;

      fCtrlInpNodesCnt = 0;
      fCtrlInpNodesExpect = 0;
      fCtrlBldNodesCnt = 0;
      fCtrlBldNodesExpect = 0;

      fCtrlRunId = 0;
      fCtrlRunPrefix = "";

      fCurrentLost = fCurrentEvents = fCurrentData = 0;

      dabc::WorkerRef publ = GetPublisher();

      for (unsigned n=0;n<bbuild.size();++n) {
         dabc::CmdGetBinary subcmd(bbuild[n], "hierarchy", "childs");
         subcmd.SetInt("#bnet_ctrl_id", fCtrlId);
         subcmd.SetTimeout(10);
         publ.Submit(Assign(subcmd));
         fCtrlCnt++;
      }

      for (unsigned n=0;n<binp.size();++n) {
         dabc::CmdGetBinary subcmd(binp[n], "hierarchy", "childs");
         subcmd.SetInt("#bnet_ctrl_id", fCtrlId);
         subcmd.SetTimeout(10);
         publ.Submit(Assign(subcmd));
         fCtrlCnt++;
      }

      if (fCtrlCnt == 0) {
         fCtrlStateQuality = 0.;
         fCtrlStateName = "NoNodes";
      } else if (binp.size()==0) {
         fCtrlStateQuality = 0.;
         fCtrlStateName = "NoInputs";
      } else if (bbuild.size() == 0) {
         fCtrlStateQuality = 0.;
         fCtrlStateName = "NoBuilders";
      } else if (fCtrlErrorCnt > 5) {
         fCtrlStateQuality = 0.1;
         fCtrlStateName = "LostControl";
      }

      if (!fCtrlStateName.empty()) {
         SetParValue("State", "NoNodes");
         SetParValue("Quality", fCtrlStateQuality);
      }

      return true;

   } else if (cmd.HasField("#bnet_cnt")) {
      // this commands used to send file requests

      DOUT0("Get %s reply id:%d expecting:%d replies:%d cmd:%s", cmd.GetName(), cmd.GetInt("#bnet_cnt"), fCmdCnt, fCmdReplies, fCurrentFileCmd.GetName());

      if (!fCurrentFileCmd.null() && (cmd.GetInt("#bnet_cnt") == fCmdCnt)) {

         bool stop_calibr = fCurrentFileCmd.IsName("StopRun") && fCurrentFileCmd.GetBool("#calibr_run");

         if (stop_calibr && cmd.HasField("quality"))
            if (cmd.GetDouble("quality") < fCmdQuality)
               fCmdQuality = cmd.GetDouble("quality");

         if (--fCmdReplies <= 0) {

            fCalibrRunId = fCurrentFileCmd.GetUInt("#calibr_runid");

            fCurrentFileCmd.Reply(dabc::cmd_true);

            fWorkerHierarchy.GetHChild("RunningCmd").SetField("value","");

            if (stop_calibr) PreserveLastCalibr(true, fCmdQuality, fCalibrRunId, true);
         }
      }

   } else if (cmd.HasField("#refresh_cnt")) {

      if (!fCurrentRefreshCmd.null() && (cmd.GetInt("#refresh_cnt") == fRefreshCnt)) {
         double q = cmd.GetDouble("quality", 1.),
                q0 = fCurrentRefreshCmd.GetDouble("quality", 1.);
         if (q < q0) {
            q0 = q;
            fCurrentRefreshCmd.SetDouble("quality", q0);
         }

         if (--fRefreshReplies <= 0) {
            fCurrentRefreshCmd.Reply(dabc::cmd_true);
            PreserveLastCalibr(true, q0, fCalibrRunId, false);
         }
      }

      return true;

   } else if (cmd.GetInt("#bnet_ctrl_id") == fCtrlId) {
      // this commands used to send control requests

      fCtrlCnt--;

      if (!cmd.GetResult() || cmd.IsTimedout()) fCtrlError = true;

      dabc::Hierarchy h = dabc::CmdGetNamesList::GetResNamesList(cmd);
      dabc::Iterator iter(h);

      bool is_builder = false;

      while (iter.next()) {
         dabc::Hierarchy item = iter.ref();
         if (!item.HasField("_bnet")) {
            if (is_builder && item.IsName("HadaqData"))
               fCtrlData += item.GetField("value").AsDouble();
            else if (is_builder && item.IsName("HadaqEvents"))
               fCtrlEvents += item.GetField("value").AsDouble();
            else if (is_builder && item.IsName("HadaqLostEvents"))
               fCtrlLost += item.GetField("value").AsDouble();

            continue;
         }
         // normally only that item should be used

         if (item.GetField("_bnet").AsStr() == "receiver") is_builder = true;

         if (is_builder) fCtrlBldNodesCnt++;
                    else fCtrlInpNodesCnt++;

         std::string state = item.GetField("state").AsStr();
         double quality = item.GetField("quality").AsDouble();

         if (fCtrlStateName.empty() || (quality < fCtrlStateQuality)) {
            fCtrlStateQuality = quality;
            fCtrlStateName = state;
         }

         if (is_builder) {
            fCurrentLost += item.GetField("discard_events").AsUInt();
            fCurrentEvents += item.GetField("build_events").AsUInt();
            fCurrentData += item.GetField("build_data").AsUInt();

            if (!fTotalData) DOUT0("FIRST TIME GET DATA %d %lu", fCtrlCnt, item.GetField("build_data").AsUInt());

            // check maximal size of the run
            if (fNewRunTm.Expired() && (fCtrlSzLimit > 0) && (fMaxRunSize > 0) && (item.GetField("runsize").AsUInt() > fMaxRunSize*1e6))
               fCtrlSzLimit = 2;

            // check current runid
            unsigned runid = item.GetField("runid").AsUInt();
            std::string runprefix = item.GetField("runprefix").AsStr();

            if (runid && !runprefix.empty()) {
               if (!fCtrlRunId) {
                  fCtrlRunId = runid;
                  fCtrlRunPrefix = runprefix;
               } else if ((fCtrlRunId != runid) || (fCtrlRunPrefix != runprefix)) {
                  if ((fCtrlStateQuality > 0) && fNewRunTm.Expired()) {
                     fCtrlStateName = "RunMismatch";
                     fCtrlStateQuality = 0;
                  }
               }
            }

            int ninputs = item.GetField("ninputs").AsInt();
            if (fCtrlInpNodesExpect == 0) fCtrlInpNodesExpect = ninputs;

            if ((fCtrlInpNodesExpect != ninputs) && (fCtrlStateQuality > 0)) {
               fCtrlStateName = "InputsMismatch";
               fCtrlStateQuality = 0;
            }

         } else {
            int nbuilders = item.GetField("nbuilders").AsInt();
            if (fCtrlBldNodesExpect==0) fCtrlBldNodesExpect = nbuilders;
            if ((fCtrlBldNodesExpect != nbuilders) && (fCtrlStateQuality > 0)) {
               fCtrlStateName = "BuildersMismatch";
               fCtrlStateQuality = 0;
            }
         }

         // DOUT0("BNET reply from %s state %s sz %u", item.GetField("_bnet").AsStr().c_str(), item.GetField("state").AsStr().c_str(), item.GetField("runsize").AsUInt());
      }

      if (fCtrlCnt == 0) {
         if (fCtrlStateName.empty()) {
            fCtrlStateName = "Ready";
            fCtrlStateQuality = 1.;
         }
         if ((fCtrlInpNodesCnt == 0) && (fCtrlStateQuality > 0)) {
            fCtrlStateName = "NoInputs";
            fCtrlStateQuality = 0;
         }

         if ((fCtrlInpNodesExpect != fCtrlInpNodesCnt) && (fCtrlStateQuality > 0)) {
            fCtrlStateName = "InputsMismatch";
            fCtrlStateQuality = 0;
         }

         if ((fCtrlBldNodesCnt == 0)  && (fCtrlStateQuality > 0)) {
            fCtrlStateName = "NoBuilders";
            fCtrlStateQuality = 0;
         }
         if ((fCtrlBldNodesExpect != fCtrlBldNodesCnt) && (fCtrlStateQuality > 0)) {
            fCtrlStateName = "BuildersMismatch";
            fCtrlStateQuality = 0;
         }

         SetParValue("State", fCtrlStateName);
         SetParValue("Quality", fCtrlStateQuality);
         SetParValue("RunId", fCtrlRunId);
         SetParValue("RunIdStr", fCtrlRunId ? hadaq::FormatFilename(fCtrlRunId,0) : std::string("0"));
         SetParValue("RunPrefix", fCtrlRunPrefix);

         fWorkerHierarchy.GetHChild("LastPrefix").SetField("value", fCtrlRunPrefix);

         DOUT3("BNET control sequence ready state %s overlimit %s", fCtrlStateName.c_str(), DBOOL(fCtrlSzLimit>1));

         bool do_set = (fTotalEvents || fTotalLost) && (fCurrentLost >= fTotalLost) && (fCurrentEvents >= fTotalEvents) && (fCurrentData >= fTotalData);

         if (do_set) {
            double spent = fLastRateTm.SpentTillNow();
            spent = (spent > 1e-3) ? 1./spent : 0.;

            fCtrlLost = (fCurrentLost-fTotalLost)*spent;
            fCtrlEvents = (fCurrentEvents-fTotalEvents)*spent;
            fCtrlData = (fCurrentData-fTotalData)*spent/1024./1024.;

            if ((fCtrlEvents > 1e9) || (fCtrlLost > 1e9) || (fCtrlData > 1e9)) do_set = false;
         }

         fTotalLost = fCurrentLost;
         fTotalEvents = fCurrentEvents;
         fTotalData = fCurrentData;
         fLastRateTm.GetNow();

         if (do_set) {
            Par("DataRate").SetValue(fCtrlData);
            Par("EventsRate").SetValue(fCtrlEvents);
            Par("LostRate").SetValue(fCtrlLost);
         }

         SetParValue("TotalEvents", fTotalEvents);
         SetParValue("TotalLost", fTotalLost);

         if (fControl && (fCtrlSzLimit > 1) && fCurrentFileCmd.null()) {
            fCtrlSzLimit = 0;
            // this is a place, where new run automatically started
            dabc::Command newrun("StartRun");
            newrun.SetTimeout(45);
            Submit(newrun);
         }
      }
   }

   return dabc::Module::ReplyCommand(cmd);
}

void hadaq::BnetMasterModule::BeforeModuleStart()
{
}

void hadaq::BnetMasterModule::ProcessTimerEvent(unsigned timer)
{
   dabc::CmdGetNamesList cmd;

   dabc::WorkerRef publ = GetPublisher();

   publ.Submit(Assign(cmd));

   if (!fCurrentFileCmd.null() && fCurrentFileCmd.IsTimedout()) {
      EOUT("Abort RUN command %s", fCurrentFileCmd.GetName());
      fCurrentFileCmd.Reply(dabc::cmd_false);
      fWorkerHierarchy.GetHChild("RunningCmd").SetField("value","");
   }

   if (!fInitRunCmd.null() && fInitRunCmd.IsTimedout())
      fInitRunCmd.Reply(dabc::cmd_false);
}

int hadaq::BnetMasterModule::ExecuteCommand(dabc::Command cmd)
{
   if (cmd.IsName("StartRun") || cmd.IsName("StopRun")) {

      if (!fCurrentFileCmd.null()) {
         EOUT("Ignore run command - previous %s not completed", fCurrentFileCmd.GetName());
         return dabc::cmd_false;
      }

      bool isstart = cmd.IsName("StartRun");

      // DOUT0("Command %s oninit %s", cmd.GetName(), cmd.GetStr("oninit").c_str());

      if (isstart && (cmd.GetInt("oninit")>0) && !cmd.GetBool("#verified")) {
         DOUT0("Detect START RUN with oninit flag!!!!");

         // this is entry point for StartRun command during initialization
         // we remember it and checks that at least two time same list of input nodes are collected
         if (!fInitRunCmd.null()) fInitRunCmd.Reply(dabc::cmd_false);
         fInitRunCmd = cmd;
         fSameBuildersCnt = 0; // reset counter
         if (!cmd.IsTimeoutSet()) cmd.SetTimeout(30. + cmd.GetInt("oninit")*2.);
         return dabc::cmd_postponed;
      }

      std::vector<std::string> builders = fWorkerHierarchy.GetHChild("Builders").GetField("value").AsStrVect();
      if (builders.size() == 0) return dabc::cmd_true;

      dabc::WorkerRef publ = GetPublisher();
      if (publ.null()) return dabc::cmd_false;

      fCurrentFileCmd = cmd;
      if (isstart) {
         fCtrlSzLimit = 1; // allow to control size limits
         fNewRunTm.GetNow(5); // do not check new run earlier than after 5 seconds
      }
      fCmdCnt++;
      fCmdReplies = 0;
      fCmdQuality = 1.;

      if (!cmd.IsTimeoutSet() || (cmd.TimeTillTimeout() < 60)) {
         DOUT0("INCREASE cmd %s TIMEOUT from %4.1f to 60 sec", cmd.GetName(), cmd.TimeTillTimeout());
         cmd.SetTimeout(60.);
      }

      double main_tmout = cmd.TimeTillTimeout() - 1;

      std::string query, prefix;
      unsigned runid = 0;
      unsigned lastrunid = fWorkerHierarchy.GetHChild("MasterRunId").GetField("value").AsUInt();
      std::string lastprefix = fWorkerHierarchy.GetHChild("LastPrefix").GetField("value").AsStr();
      if (isstart) {
         prefix = cmd.GetStr("prefix");
         if (prefix == "NO_FILE" || prefix == "--" || (prefix.empty() && (lastprefix == "--" || lastprefix.empty())))
            isstart = false;
      }
      if (isstart) {
         runid = cmd.GetUInt("runid");
         if (runid == 0)
            runid = hadaq::CreateRunId();
         query = dabc::format("mode=start&runid=%u", runid);
         if (!prefix.empty()) {
            query.append("&prefix=");
            query.append(prefix);
         }
         DOUT0("Starting new run %s", query.c_str());
      } else {
         query = "mode=stop";
      }

      if (isstart)
         fWorkerHierarchy.GetHChild("RunningCmd").SetField("value", dabc::format("Start %s %u", prefix.c_str(), runid));
      else
         fWorkerHierarchy.GetHChild("RunningCmd").SetField("value", dabc::format("Stop %s %u", lastprefix.c_str(), lastrunid));

      fWorkerHierarchy.GetHChild("MasterRunId").SetField("value", runid);

      if (isstart && !prefix.empty())
         fWorkerHierarchy.GetHChild("LastPrefix").SetField("value", prefix);

      DOUT0("MASTER cmd:%s doing:%s query:%s prefix:%s lastprefix:%s lastrunid:%u cmdcnt:%d", cmd.GetName(), (isstart ? "START" : "STOP"), query.c_str(), prefix.c_str(), lastprefix.c_str(), lastrunid, fCmdCnt);

      for (unsigned n=0; n<builders.size(); ++n) {
         dabc::CmdGetBinary subcmd(builders[n] + "/BnetFileControl", "execute", query);
         subcmd.SetInt("#bnet_cnt", fCmdCnt);
         subcmd.SetTimeout(main_tmout);
         fCmdReplies++;
         publ.Submit(Assign(subcmd));
         DOUT0("Submit bldr cmd %s %s %f", subcmd.GetName(), DBOOL(subcmd.IsTimeoutSet()), subcmd.TimeTillTimeout());
      }

      query = "";
      if (isstart && (prefix == "tc") && lastprefix.empty()) {
         query = dabc::format("mode=start&runid=%u", runid);
      } else if (!isstart && (lastprefix == "tc")) {
         query = dabc::format("mode=stop&runid=%u", lastrunid);
      }

      if (!query.empty()) {
         fCurrentFileCmd.SetBool("#calibr_run", true);
         fCurrentFileCmd.SetUInt("#calibr_runid", lastrunid);

         // trigger calibration start for all TDCs
         std::vector<std::string> inputs = fWorkerHierarchy.GetHChild("Inputs").GetField("value").AsStrVect();

         for (unsigned n=0; n<inputs.size(); ++n) {
            dabc::CmdGetBinary subcmd(inputs[n] + "/BnetCalibrControl", "execute", query);
            subcmd.SetInt("#bnet_cnt", fCmdCnt);
            subcmd.SetTimeout(main_tmout);
            fCmdReplies++;
            publ.Submit(Assign(subcmd));
            DOUT0("Submit input cmd %s %s %f", subcmd.GetName(), DBOOL(subcmd.IsTimeoutSet()), subcmd.TimeTillTimeout());
         }
      }

      return dabc::cmd_postponed;

   } else if (cmd.IsName("RefreshRun")) {

      if (!fCurrentRefreshCmd.null()) {
         EOUT("Ignore run command - previous %s not completed", fCurrentRefreshCmd.GetName());
         return dabc::cmd_false;
      }

      dabc::WorkerRef publ = GetPublisher();
      if (publ.null()) return dabc::cmd_false;

      fCurrentRefreshCmd = cmd;
      fRefreshCnt++;
      fRefreshReplies = 0;

      fCurrentRefreshCmd.SetDouble("quality", 1.0);

      // trigger calibration start for all TDCs
      std::vector<std::string> inputs = fWorkerHierarchy.GetHChild("Inputs").GetField("value").AsStrVect();

      for (unsigned n = 0; n < inputs.size(); ++n) {
         dabc::CmdGetBinary subcmd(inputs[n] + "/BnetCalibrRefresh", "execute", "");
         subcmd.SetInt("#refresh_cnt", fRefreshCnt);
         subcmd.SetTimeout(10.);
         fRefreshReplies++;
         publ.Submit(Assign(subcmd));
      }

      return dabc::cmd_postponed;
   } else if (cmd.IsName("ResetDAQ")) {
      std::vector<std::string> builders = fWorkerHierarchy.GetHChild("Builders").GetField("value").AsStrVect();
      std::vector<std::string> inputs = fWorkerHierarchy.GetHChild("Inputs").GetField("value").AsStrVect();

      dabc::WorkerRef publ = GetPublisher();
      if (publ.null()) return dabc::cmd_false;

      for (unsigned n=0; n<inputs.size(); ++n) {
         dabc::CmdGetBinary subcmd(inputs[n], "cmd.json", "command=DropAllBuffers");
         publ.Submit(subcmd);
      }

      for (unsigned n=0; n<builders.size(); ++n) {
         dabc::CmdGetBinary subcmd(builders[n], "cmd.json", "command=DropAllBuffers");
         publ.Submit(subcmd);
      }

      return dabc::cmd_true;
   }

   return dabc::cmd_true;

}
