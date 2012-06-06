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

#ifndef HADAQ_Factory
#define HADAQ_Factory

#ifndef DABC_Factory
#include "dabc/Factory.h"
#endif

namespace hadaq {



   class Factory : public dabc::Factory {
      public:
         Factory(const char* name) : dabc::Factory(name) {}

         virtual dabc::Transport* CreateTransport(dabc::Reference port, const char* typ, dabc::Command cmd);

         virtual dabc::DataInput* CreateDataInput(const char* typ);

         virtual dabc::DataOutput* CreateDataOutput(const char* typ);

         virtual dabc::Module* CreateModule(const char* classname, const char* modulename, dabc::Command cmd);

      protected:

   };

}

#endif
