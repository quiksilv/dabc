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

#ifndef HADAQ_BnetMasterModule
#define HADAQ_BnetMasterModule

#ifndef DABC_ModuleAsync
#include "dabc/ModuleAsync.h"
#endif

#include <vector>
#include <string>


namespace hadaq {

   /** \brief Master monitor for BNet components
    *
    * Provides statistic for clients
    */

   class BnetMasterModule : public dabc::ModuleAsync {
      protected:

         bool          fControl;  ///< when true, master actively controls BNET nodes and switches to new RUNs
         unsigned      fMaxRunSize; ///< maximal run size in MB
         dabc::Command fCurrentFileCmd; ///< currently running cmd to switch files
         int           fCmdCnt;     ///< just counter to avoid mismatch
         int           fCmdReplies; ///< number of replies for current command
         double        fCmdQuality;  ///< current command quality, used when creating calibration
         unsigned      fCalibrRunId;  ///< last calibration runid
         long unsigned fCalibrTm;     ///< last calibr time in seconds since 1970

         dabc::Command fCurrentRefreshCmd; ///< currently running cmd to refresh nodes qualities
         int           fRefreshCnt{0};   ///< currently running refresh command
         int           fRefreshReplies{0}; ///< number of replies for current command

         int           fCtrlId;     ///< counter for control requests
         dabc::TimeStamp fCtrlTm;   ///< time when last control count was send
         dabc::TimeStamp fNewRunTm;   ///< time when last control count was send
         int           fCtrlCnt;    ///< how many control replies are awaited
         bool          fCtrlError;  ///< if there are error during current communication loop
         int           fCtrlErrorCnt; ///< number of consequent control errors
         double        fCtrlStateQuality;  ///< <0.3 error, <0.7 warning, more is ok
         std::string   fCtrlStateName; ///< current name
         int           fCtrlInpNodesCnt; ///< count of recognized input nodes
         int           fCtrlInpNodesExpect; ///< count of expected input nodes
         int           fCtrlBldNodesCnt; ///< count of recognized builder nodes
         int           fCtrlBldNodesExpect; ///< count of expected builder nodes
         int           fCtrlSzLimit; ///< 0 - do nothing, 1 - start checking (after start run), 2 - exced
         double        fCtrlData;    ///< accumulated data rate
         double        fCtrlEvents;   ///< accumulated events rate
         double        fCtrlLost;     ///< accumulated lost rate
         uint64_t      fCurrentLost;   ///< current value
         uint64_t      fCurrentEvents; ///< current value
         uint64_t      fCurrentData; ///< current value
         uint64_t      fTotalLost;    ///< last value
         uint64_t      fTotalEvents;  ///< last value
         uint64_t      fTotalData;  ///< last value
         dabc::TimeStamp fLastRateTm;   ///< last time ratemeter was updated
         unsigned      fCtrlRunId;    ///< received run id from builders
         std::string   fCtrlRunPrefix; ///< received run prefix from builders
         std::vector<std::string> fLastBuilders; ///< last list of builder nodes
         int           fSameBuildersCnt; ///< how many time same number of inputs was detected
         dabc::Command fInitRunCmd;   ///< command used to start run at very beginning, uses delay technique

         virtual bool ReplyCommand(dabc::Command cmd);

         void AddItem(std::vector<std::string> &items, std::vector<std::string> &nodes, const std::string &item, const std::string &node);

         void PreserveLastCalibr(bool do_write = false, double quality = 1., unsigned runid = 0, bool set_time = false);

      public:

         BnetMasterModule(const std::string &name, dabc::Command cmd = nullptr);

         virtual void BeforeModuleStart();

         virtual void ProcessTimerEvent(unsigned timer);

         virtual int ExecuteCommand(dabc::Command cmd);

   };
}


#endif
