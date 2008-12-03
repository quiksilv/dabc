#ifndef BNET_TestWorkerApplication
#define BNET_TestWorkerApplication

#include "bnet/WorkerApplication.h"

namespace bnet {

   class TestWorkerApplication : public WorkerApplication {
      public:
         TestWorkerApplication(const char* name);

         virtual dabc::Module* CreateModule(const char* classname, const char* modulename, dabc::Command* cmd);

         virtual bool CreateReadout(const char* portname, int portnumber);

         virtual dabc::Module* CreateCombiner(const char* name);
         virtual dabc::Module* CreateBuilder(const char* name);
         virtual dabc::Module* CreateFilter(const char* name);

         bool CreateStorage(const char* portname);

      protected:
         virtual void DiscoverNodeConfig(dabc::Command* cmd);

      private:
         bool fABBActive;

   };
}

#endif
