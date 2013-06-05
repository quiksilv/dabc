#include "verbs/Factory.h"

#include "dabc/Manager.h"

#include "verbs/BnetRunnable.h"
#include "verbs/Device.h"
#include "verbs/Thread.h"

dabc::FactoryPlugin verbsfactory(new verbs::Factory("verbs"));

dabc::Reference verbs::Factory::CreateObject(const std::string& classname, const std::string& objname, dabc::Command cmd)
{
   if (classname == "verbs::BnetRunnable")
      return new verbs::BnetRunnable(objname);

   return 0;
}

dabc::Device* verbs::Factory::CreateDevice(const std::string& classname,
                                           const std::string& devname,
                                           dabc::Command cmd)
{
   if (classname == verbs::typeDevice) {
      DOUT1("Creating verbs device");
      return new verbs::Device(devname);
   }

   return 0;
}

dabc::Reference verbs::Factory::CreateThread(dabc::Reference parent, const std::string& classname, const std::string& thrdname, const std::string& thrddev, dabc::Command cmd)
{
   if (classname != verbs::typeThread) return dabc::Reference();

   if (thrddev.empty()) {
      EOUT("Device name not specified to create verbs thread");
      return dabc::Reference();
   }

   verbs::DeviceRef dev = dabc::mgr.FindDevice(thrddev);

   if (dev.null()) {
      EOUT("Did not found verbs device with name %s", thrddev.c_str());
      return dabc::Reference();
   }

   verbs::Thread* thrd = new verbs::Thread(parent, thrdname, cmd, dev()->IbContext());

   return dabc::Reference(thrd);
}


/** \page verbs_plugin VERBS plugin for DABC (libDabcVerbs.so)
 *
 *  \subpage verbs_plugin_doc
 *
 *  \ingroup dabc_plugins
 *
 */


/** \page verbs_plugin_doc Short description of VERBS plugin
 *
 * This should be description of VERBS plugin for DABC.
 *
 */
