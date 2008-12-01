/* Generated by Together */

#include "dimc/DimcRegistry.h"
#include "dimc/DimcServer.h"
#include "dimc/DimcManager.h"
#include "dimc/DimcCommands.h"

#include "dabc/Parameter.h"
#include "dabc/CommandDefinition.h"
#include "dabc/logging.h"

#include <iostream>
#include <vector>

const std::string dimc::Registry::gServerPrefix="DABC/";

dimc::Registry::Registry(dimc::Manager* owner)
   : fMainMutex(true), fParseMutex(true), fManager(owner),  fDimServer(0), fDimPrefixReady(false)
{
   fDimServer=dimc::Server::Instance();
   fDimServer->SetOwner(this);
   // the DIM initializations:
   fDimServices.clear();
   fDimCommands.clear();
   fModuleCommandNames.clear();
   fParamInfos.clear();
}

dimc::Registry::~Registry()
{

  RemoveDIMServiceAll();
  RemoveDIMCommandsAll();
  fDimServer->Delete();
}






std::string dimc::Registry::BuildDIMName(const std::string& localname)
{
 std::string& prefix=GetDIMPrefix();
 std::string dimname=prefix+localname;
 return dimname;

}

std::string dimc::Registry::ReduceDIMName(const std::string& dimname)
{
 std::string rname=dimname;
   //std::cout <<"ReduceDIMName for "<<rname<< std::endl;

 std::string& prefix=GetDIMPrefix();
   //std::cout <<"   ReduceDIMName uses prefix "<<prefix<< std::endl;

 std::string::size_type start=rname.find(prefix);
 std::string::size_type end=start+prefix.length();
 //std::cout <<"   ReduceDIMName: start="<<start<<", end="<<end << std::endl;
 if(start!=std::string::npos) // only replace dim prefix if it was found
   {
      rname.replace(start, end,"");
   }
  //std::cout <<"ReduceDIMName returns "<<rname<< std::endl;
 return rname;
}

std::string& dimc::Registry::GetDIMPrefix()
{
if(!fDimPrefixReady)
{
   fDimPrefix=CreateDIMPrefix();
   fDimPrefixReady=true;
}
return fDimPrefix;
}

std::string dimc::Registry::CreateDIMPrefix(const char* nodename)
{
std::string contextname=GetDIMServerName(nodename);
std::string appname="Node";//TODO: get reasonable application name here? or drop this completely?
//if(fManager->IsMainManager()) appname="Controller";
std::string result=contextname+"/"+appname+"/";
return result;
}


std::string dimc::Registry::GetDIMServerName(const char* contextname)
{
 std::string servname;
 if(contextname==0) // use own context
    servname=fManager->GetName();
 else
    servname=contextname;

  std::string prefix=gServerPrefix;//"DABC/"
  std::string retval=prefix+servname;
 std::cout <<"GetDIMServerName returns "<<retval << std::endl;
 return retval;
}





std::string dimc::Registry::CreateFullParameterName(const std::string& modulename, const std::string& varname)
{
dabc::LockGuard g(&fParseMutex);
if(modulename=="") return varname;
std::string registername="";
const char* rname=dimc::nameParser::createFullParameterName(modulename.c_str(),varname.c_str());
if(rname) registername=rname; // cannot init std::string from null char* ptr
// TODO: exception if parsing fails
return registername;

}


void dimc::Registry::ParseFullParameterName(const std::string& fullname, std::string& modname, std::string& varname)
{
dabc::LockGuard g(&fParseMutex);
char* mod=0;
char* var=0;
nameParser::parseFullParameterName(fullname.c_str(), &mod, &var);
if(mod)
   modname=mod;
else
   modname=""; // need this to avoid std::string exception
if(var)
   varname=var;
else
   varname="";
// TODO: exception if parsing fails
}

std::string dimc::Registry::CreateCommandDescriptorName(const std::string& commandname)
{
dabc::LockGuard g(&fParseMutex);
std::string descrname="";
const char* dname=nameParser::createCommandDescriptorName(commandname.c_str());
if(dname) descrname=dname; // cannot init std::string from null char* ptr
// TODO: exception if parsing fails
return descrname;
}


void dimc::Registry::RegisterParameter(dabc::Parameter* par, bool allowdimchange)
{
   if(par==0) return;
   std::string recname="";
   dabc::Basic* holder=par->GetHolder();
   if(holder)
      {
         if(holder==fManager)
            {
               //std::cout <<"hhhhh ParameterEvent: manager is holder. no prefix"<< std::endl;
            }
         else
            {
               recname=holder->GetName();
            }
      }
   //   std::cout <<"got holder name:"<<recname <<": for parameter "<<par->GetName()<< std::endl;
     ////// optional/debug: test type of holder. may use this for more precise naming later?
     //   dabc::Application* apl= dynamic_cast<dabc::Application*>(holder);
     //   dabc::GenericDevice* dev= dynamic_cast<dabc::GenericDevice*>(holder);;
     //   dabc::Module* module=dynamic_cast<dabc::Module*>(holder);
     //   if(apl)  std::cout <<" -holder is Application."<<std::endl;
     //   if(dev)  std::cout <<" -holder is GenericDevice."<<std::endl;
     //   if(module)  std::cout <<" -holder is Module."<<std::endl;
   ////////////////////////////////

   std::string registername=CreateFullParameterName(recname.c_str(),par->GetName());
   std::string dimname=BuildDIMName(registername);
   if(FindDIMService(dimname)!=0)
      {
         std::cout <<"AddParameter: service "<<dimname<<" already exisiting!" << std::endl;
         return; // TODO: error handling, exceptions!
      }
   dimc::ServiceEntry* nentry= new dimc::ServiceEntry(par,dimname);
   AddService(nentry,allowdimchange,false);
}

void dimc::Registry::AddService(dimc::ServiceEntry* nentry, bool allowdimchange, bool iscommanddescriptor)
{

   if(allowdimchange)
      nentry->SetVisibility(DABC_VIS_MONITOR | DABC_VIS_CHANGABLE);
   else
      nentry->SetVisibility(DABC_VIS_MONITOR);
   if(iscommanddescriptor)
      {
         nentry->SetType(dimc::nameParser::COMMANDDESC);
         nentry->SetVisibility(0);
      }
   // put to our own service list:
   { // begin lock
      dabc::LockGuard g(&fMainMutex);
      fDimServices.push_back(nentry);
   } // end lock
}


void dimc::Registry::ParameterUpdated(dabc::Parameter* par)
{
   dimc::ServiceEntry* service=FindDIMService(par);
   if(service) service->Update();

}

void dimc::Registry::UnregisterParameter(dabc::Parameter* par)
{
   if(par==0) return;
   dimc::ServiceEntry* remservice=0;
{ // begin lockguard
   dabc::LockGuard g(&fMainMutex);
   std::vector<dimc::ServiceEntry*>::iterator iter;
   for(iter=fDimServices.begin(); iter!=fDimServices.end(); ++iter)
      {
         dimc::ServiceEntry* service=*iter;
         try
            {
                 if(par==service->Parameter())
                  {
                     fDimServices.erase(iter);
                     remservice=service;
                     break;
                  }
            }
         catch(std::exception &e)
         {
            EOUT(("dimc::Registry failed to remove DIM service for parameter %s with standard exception: %s ",par->GetName(), e.what()));
            continue;
         }
         catch(...)
         {
            EOUT(("dimc::Registry failed to remove DIM service for parameter %s with unknown exception!\n",par->GetName()));
            continue;
         }
      }// for
} // end lockguard
delete remservice; // delete outside lock to avoid conflict with dim
//std::cout <<"   deleted service "<< (int*) remservice << std::endl;

}


dimc::ServiceEntry* dimc::Registry::FindDIMService(std::string name)
{
dimc::ServiceEntry* ret=0;
dabc::LockGuard g(&fMainMutex);
//std::cout <<"fffffffff FindDIMService is looking for -"<<name<<"-" << std::endl;

std::vector<dimc::ServiceEntry*>::iterator iter;
for(iter=fDimServices.begin(); iter!=fDimServices.end(); ++iter)
	{
		dimc::ServiceEntry* service=*iter;
		try
			{
              std::string sname=service->Name();
              std::string reducedname=ReduceDIMName(sname);
              //std::cout <<"reducedname is -"<<reducedname <<"-"<< std::endl;

              if(name==sname || name==reducedname)
               {
                  //std::cout <<"FindDIMService:checked for dim name "<<name <<", service name is "<<sname << std::endl;
                  ret=service;
                  break;
               }
         }
      catch(std::exception &e)
			{
			   EOUT(("dimc::Registry failed to find DIM service %s with standard exception: %s ",name.c_str(),e.what()));
				continue;
			}
      catch(...)
			{
			   EOUT(("dimc::Registry failed to find  DIM service %s with unknown exception!\n",name.c_str()));
				continue;
			}
	}// for
//std::cout <<"fffffffff FindDIMService returns "<<ret << std::endl;

return ret;

}

dimc::ServiceEntry* dimc::Registry::FindDIMService(dabc::Parameter* par)
{
if(par==0) return 0;
dimc::ServiceEntry* ret=0;
dabc::LockGuard g(&fMainMutex);
//std::cout <<"fffffffff FindDIMService is looking for -"<<name<<"-" << std::endl;

std::vector<dimc::ServiceEntry*>::iterator iter;
for(iter=fDimServices.begin(); iter!=fDimServices.end(); ++iter)
   {
      dimc::ServiceEntry* service=*iter;
      try
         {
              if(par==service->Parameter())
               {
                  ret=service;
                  break;
               }
         }
      catch(std::exception &e)
         {
            EOUT(("dimc::Registry failed to find DIM service %s with standard exception: %s ",par->GetName(),e.what()));
            continue;
         }
      catch(...)
         {
            EOUT(("dimc::Registry failed to find  DIM service %s with unknown exception!\n",par->GetName()));
            continue;
         }
   }// for
//std::cout <<"fffffffff FindDIMService returns "<<ret << std::endl;
return ret;

}


void dimc::Registry::DefineDIMCommand(const std::string &name)
{
   std::string dimname=BuildDIMName(name);
   DimCommand* ncom= new DimCommand(dimname.c_str(), "C", fDimServer);
dabc::LockGuard g(&fMainMutex); // only protect our own list, do not lock dim
   fDimCommands.push_back(ncom);
   //std::cout <<"added dim command " <<dimname << std::endl;
}



void dimc::Registry::StartDIMServer(const std::string& dnsnode, unsigned int dnsport)
{
 std::string servname=GetDIMServerName();
 fDimServer->Start(servname,dnsnode,dnsport);
 if(dnsport!=0)
   {
      DOUT0(("dimc::Registry starting DIM server of name %s for dns %s:%d",servname.c_str(),dnsnode.c_str(),dnsport));
   }
 else
   {
      DOUT0(("dimc::Registry starting DIM server of name %s for DIM_DNS_NODE  %s:%d",servname.c_str(),DimServer::getDnsNode(),DimServer::getDnsPort()));
   }

}

void dimc::Registry::StopDIMServer()
{
   fDimServer->Stop();
   DOUT0(("DIM server was stopped."));
}

void dimc::Registry::UpdateDIMService(const std::string& name, bool logoutput, dimc::nameParser::recordstat recstat)
{
std::cout <<"uuuuuuuuuuuu UpdateDIMService for "<<name << std::endl;
dimc::ServiceEntry* service=FindDIMService(name);
if(service)
   {
      //std::cout <<" - Updating dim service "<< name << std::endl;
      service->SetStatus(recstat);
      dimc::nameParser::visiblemask vis=service->GetVisibility();
      if(logoutput)
         {
            service->SetVisibility(vis | DABC_VIS_LOGGABLE);
            service->Update();
         }
      else
         {
            service->SetVisibility(vis & (~DABC_VIS_LOGGABLE));
            service->Update();
         }
   }
}


void dimc::Registry::UpdateDIMServiceAll()
{
// dabc::LockGuard g(&fMainMutex); // no guard during dim update
// may explicitely take and give mutex instad
std::vector<dimc::ServiceEntry*>::const_iterator iter;
for(iter=fDimServices.begin(); iter!=fDimServices.end(); ++iter)
	{
		dimc::ServiceEntry* service=*iter;
		try
			{
            //std::string sname=service->Name();
            //std::cout <<"Updating dim service "<< sname << std::endl;
            service->Update();
          }
      catch(std::exception &e)
			{
				EOUT(("dimc::Registry failed to update DIM service with standard exception: %s \n",e.what()));
				continue;
			}
      catch(...)
			{
				EOUT(("dimc::Registry failed to update DIM service with unknown exception!\n"));
				continue;
			}
	}// for
}

void dimc::Registry::SetDIMVariable(std::string parameter)
{
//dabc::LockGuard g(&fMainMutex);
std::cout <<"SetDIMVariable with -"<< parameter<<"-" << std::endl;

std::string::size_type eqpos=parameter.find("=");
if(eqpos==std::string::npos) // no equals sign in parameter!
{
   EOUT(("Wrong parameter format (%s) to set DIM variable!",parameter.c_str()));
   return;
}
std::string name(parameter,0,eqpos);
std::string nval(parameter, eqpos+1, std::string::npos);
dimc::ServiceEntry* service=FindDIMService(name);
if(service)
   {
      //std::cout <<"Setting dim service "<< name << std::endl;
      DOUT0(("Setting dim service %s to %s",name.c_str(),nval.c_str()));
      service->SetValue(nval);
   }
}

void dimc::Registry::RemoveDIMService(const std::string& name)
{
dimc::ServiceEntry* remservice=0;
{ // begin lockguard
   dabc::LockGuard g(&fMainMutex);
   std::vector<dimc::ServiceEntry*>::iterator iter;
   for(iter=fDimServices.begin(); iter!=fDimServices.end(); ++iter)
      {
         dimc::ServiceEntry* service=*iter;
         try
            {
                 std::string sname=service->Name();
                 std::string reducedname=ReduceDIMName(sname);
                 if(name==sname || name==reducedname)
                  {
                     //std::cout <<"Removing dim service "<< sname <<", pointer="<<(int*) service << std::endl;
                     fDimServices.erase(iter);
                     remservice=service;
                     break;
                  }
            }
         catch(std::exception &e)
            {
               EOUT(("dimc::Registry failed to remove DIM service %s with standard exception: %s ",name.c_str(), e.what()));
               continue;
            }
         catch(...)
            {
               EOUT(("dimc::Registry failed to remove DIM service %s with unknown exception!\n",name.c_str()));
               continue;
            }
      }// for
} // end lockguard
delete remservice; // delete outside lock to avoid conflict with dim
//std::cout <<"   deleted service "<< (int*) remservice << std::endl;

}






void dimc::Registry::RemoveDIMServiceAll()
{
std::vector<dimc::ServiceEntry*> removeservices;
  { // begin lock
   dabc::LockGuard g(&fMainMutex);
      removeservices=fDimServices; // backup list of service pointers
      fDimServices.clear(); // now "official" list is cleared
   } // end lock
// actual deletion of dim services outside our lock:
std::vector<dimc::ServiceEntry*>::const_iterator iter;
for(iter=removeservices.begin(); iter!=removeservices.end(); ++iter)
	{
		dimc::ServiceEntry* service=*iter;
		try
			{
            //std::string sname=service->getName();
            //std::cout <<"Removing dim service "<< sname << std::endl;
            delete service;
            //*iter=0;
         }
      catch(std::exception &e)
			{
				EOUT(("dimc::Registry failed to remove DIM service with standard exception: %s \n",e.what()));
				continue;
			}
      catch(...)
			{
				EOUT(("dimc::Registry failed to remove DIM service with unknown exception!\n"));
				continue;
			}
	}// for
}

void dimc::Registry::RemoveDIMCommand(const std::string& name)
{
DimCommand* remcom=0;
{  // begin lock
   dabc::LockGuard g(&fMainMutex);
   std::vector<DimCommand*>::iterator iter;
   for(iter=fDimCommands.begin(); iter!=fDimCommands.end(); ++iter)
      {
         DimCommand* com=*iter;
         try
            {
               std::string sname=com->getName();
               std::string reducedname=ReduceDIMName(sname);
               if(name==sname || name==reducedname)
                  {
                     //std::cout <<"Removing dim command "<< sname << std::endl;
                     fDimCommands.erase(iter);
                     remcom=com;
                     break;
                  }
            }
         catch(std::exception &e)
            {
               EOUT(("dimc::Registry failed to remove DIM service with standard exception: %s ",e.what()));
               continue;
            }
         catch(...)
            {
               EOUT(("dimc::Registry failed to remove DIM service with unknown exception!\n"));
               continue;
            }
      }// for
} // end lock
delete remcom; // delete dim command outside main lock
}





void dimc::Registry::RemoveDIMCommandsAll()
{
   std::vector<DimCommand*> removecommands;
   { // begin lock
   dabc::LockGuard g(&fMainMutex);
      removecommands=fDimCommands; // backup list of command pointers
      fDimCommands.clear(); // now "official" list is cleared
   } // end lock
   // delete dim commands in backuped list outside lock:
   std::vector<DimCommand*>::const_iterator iter;
   for(iter=removecommands.begin(); iter!=removecommands.end(); ++iter)
      {
         DimCommand* com=*iter;
         try
            {
               std::string sname=com->getName();
               //std::cout <<"Removing dim command"<< sname << std::endl;
               delete com;
            }
         catch(std::exception &e)
            {
               EOUT(("dabc::Application failed to remove DIM service with standard exception: %s \n",e.what()));
               continue;
            }
         catch(...)
            {
               EOUT(("dabc::Application failed to remove DIM service with unknown exception!\n"));
               continue;
            }
      }// for
}


void dimc::Registry::HandleDIMCommand(DimCommand* com)
{
// debug:
//std::cout <<"dabc::Registry DIM command handler:"<< std::endl;
//std::cout <<"Got command "<< com->getName() << std::endl;
//std::cout <<"\t string:"<<com->getString()<< std::endl;
//std::cout <<"\t int:"<<com->getInt()<< std::endl;
//std::cout <<"\t float:"<<com->getFloat()<< std::endl;
//std::cout <<"\t double:"<<com->getDouble()<< std::endl;



// check for one of our registered commands:
bool found=false;
{
dabc::LockGuard g(&fMainMutex);
   std::vector<DimCommand*>::const_iterator iter;
   for(iter=fDimCommands.begin(); iter!=fDimCommands.end(); ++iter)
      {
         DimCommand* regcom=*iter;
         try
            {
               if(com==regcom)
                  {
                     found=true;
                     break;
                  }

            }
         catch(std::exception &e)
            {
               EOUT(("dimc::Registry failed to HandleDIMCommand with standard exception: %s ",e.what()));
               continue;
            }
         catch(...)
            {
               EOUT(("dimc::Registry failed to HandleDIMCommand with unknown exception!\n"));
               continue;
            }
      }// for
} // end lockguard
// invoke command outside mainmutex to avoid deadlock
if(found) OnDIMCommand(com);
// application subclasses may implement specific handler
}


void dimc::Registry::OnDIMCommand(DimCommand* com)
{
std::string cname=com->getName();
std::cout <<"found command "<< cname << std::endl;
std::string rname=ReduceDIMName(cname);
std::string par=com->getString();
SubmitLocalDIMCommand(rname,par); // decouple execution from dim thread!
}




void dimc::Registry::SendDIMCommand(const std::string& target, const std::string& comname, const std::string& par)

{
try{

   //std::string fullcommand=CreateDIMPrefix(target)+comname;
   std::string fullcommand=target+comname; // dim prefix was already added to targetname in Manager::GetNodeName()

   std::string password="x1gSFfpv0JvDA"; // get this from environment later!
   std::string parameter=password+" "+par; // blank in between!

   //std::cout <<"SendDIMCommand with cmd="<<fullcommand<<", par="<<parameter << std::endl;


   int ret=DimClient::sendCommand (fullcommand.c_str(), (char*) parameter.c_str());
   if(ret!=1)
            EOUT(("dimc::Registry::SendDIMCommand failed with return code %d",ret));
//   // note that DIM return code is unreliable when we send from within command callback!
   }
catch(std::exception& e)
   {
      EOUT(("dimc::Registry::SendDIMCommand failed with exception:%s",e.what()));
   }
catch(...)
    {
      EOUT(("dimc::Registry::SendDIMCommand failed: %s in (%s:%s): unexpected exception!"));
    }



}


void dimc::Registry::SubmitLocalDIMCommand(const std::string& com, const std::string& par)
{
   // strip password here:
      if(par.length()<13)
         {
            std::cout<<" - ERROR: parameter too short:"<<par.length() << std::endl;
            return ;
         }
      std::string password=par.substr(0,13);
      // add password check here:
      std::string parameter=" - no parameter -";
      if(par.length()>14)
         parameter=par.substr(14);
      std::cout <<"      password:"<<password <<", parameter:"<<parameter<<"," << std::endl;




   if(FindModuleCommand(com))
      {
         // submit exported module command directly:
         std::cout <<"Execute Registered ModuleCommand "<< com <<", string="<<parameter <<":"<< std::endl;
         std::string modname;
         std::string varname;
         ParseFullParameterName(com,modname, varname);
         dabc::Command* dabccom= new dabc::Command(varname.c_str());
         std::cout <<" -  commandname is "<<varname << std::endl;
         std::cout <<" -  modulename is "<<modname << std::endl;
         // TODO: fill xml par string to dabccom (special ctor later)
         dabc::CommandClient dummyclient;
         fManager->SubmitLocal(dummyclient, dabccom, modname.c_str());
      }
   else
      {


         // wrap other dim commands to be executed in manager thread:
         dimc::Command* command= new dimc::Command(com.c_str(),parameter.c_str());
         if(command->IsName(_DIMC_COMMAND_SETPAR_))
               command->SetCommandName(_DIMC_COMMAND_SETDIMPAR_); // avoid confusion with default core SetParameter command
         fManager->Submit(command);
      }


}






void dimc::Registry::OnExitDIMClient(const char* name)
{
   DOUT0(("dimc::Registry client exit handler for client %s",name));
   // here we may react on special clients...
}

void dimc::Registry::OnExitDIMServer(int code)
{
   DOUT0(("dimc::Registry server exit handler, code=%d",code));

////if(code==42) // disabled check for the moment. TODO: access control!
//   {
SubmitLocalDIMCommand(_DIMC_COMMAND_SHUTDOWN_,"x1gSFfpv0JvDA");
//    std::cout <<"dimc::Registry DIM server exit handler pushed shutdown command" << std::endl;
//}
}


void dimc::Registry::OnErrorDIMServer(int severity, int code, char *msg)
{
switch(severity)
   {
   case DIM_INFO:
      DOUT0(("DIM: %s (code=%d) \n",msg,code));
      break;
   case DIM_WARNING:
      DOUT0(("DIM: %s (code=%d) \n",msg,code));
      break;
   case DIM_ERROR:
   case DIM_FATAL:
      EOUT(("DIM: %s (code=%d) \n",msg,code));
      break;
   default:
      EOUT(("DIM: %s (code=%d) \n",msg,code));
      break;
   }// switch
}




void dimc::Registry::RegisterModuleCommand(std::string name, dabc::CommandDefinition* def)
{
 {  // begin lockguard
    dabc::LockGuard g(&fMainMutex);
    std::string comname=name;
    if(FindModuleCommand(name))
      {
         std::cout <<"Can not register module command "<<name<<", already exists!" << std::endl;
         return; // better use of exceptions etc. later

      }

    fModuleCommandNames.push_back(comname);
 } // end lockguard before dim part
 DefineDIMCommand(name);
 std::string descrname=nameParser::createCommandDescriptorName(name.c_str());
 std::string descriptor=def->GetXml();
 AddCommandDescriptor(descrname, descriptor);
}

void dimc::Registry::UnRegisterModuleCommand(std::string name)
{
bool found=false;
try
   {
   dabc::LockGuard g(&fMainMutex);
   std::vector<std::string>::iterator iter=find(fModuleCommandNames.begin(),fModuleCommandNames.end(),name);
   if(iter!=fModuleCommandNames.end())
      {
          fModuleCommandNames.erase(iter);
          found=true; // defer unregistering to outside of lock block
      }
   else
      {
         EOUT(("dimc::Registry Can not Unregister module command %s,  not existing ",name.c_str()));
      }
   } // end try

catch(std::exception &e)
   {
      EOUT(("dimc::Registry failed to UnRegisterModuleCommand with standard exception: %s ",e.what()));

   }
catch(...)
   {
      EOUT(("dimc::Registry failed to UnRegisterModuleCommand with unknown exception!\n"));
   }

if(found)
   {
      RemoveDIMCommand(name);
      std::string descname=dimc::nameParser::createCommandDescriptorName(name.c_str());
      RemoveDIMService(descname);
   }


}


bool  dimc::Registry::FindModuleCommand(std::string name)
{
bool rev=false;
dabc::LockGuard g(&fMainMutex);
std::vector<std::string>::iterator iter=find(fModuleCommandNames.begin(),fModuleCommandNames.end(),name);
if(iter!=fModuleCommandNames.end()) rev=true;
return rev;
}






void dimc::Registry::AddCommandDescriptor(std::string name, std::string descr)
{
 std::string text(descr);
 std::string dimname=BuildDIMName(name);
 if(FindDIMService(name)!=0)
    {
       EOUT(("AddCommandDescriptorRecord: service %s already exisiting! ",name.c_str()));
       return; // TODO: error handling, exceptions!
    }
 dimc::ServiceEntry* nentry= new dimc::ServiceEntry(text,dimname);
 AddService(nentry,false, true);
}






bool  dimc::Registry::SubscribeParameter(dabc::Parameter* par, const std::string& fulldimname)
{
// TODO: messages as StatusMessages or loginfo output
if(par==0) return false;
try
   {
   //std::cout <<"try to subscribe parameter"<<fulldimname << std::endl;
   if(UnsubscribeParameter(par))
   {
      EOUT(("!!!!!!!! Warning: a parameter of same address %lx was already subscribed (removed it).",(int*) par));
   }
   // check type of parameter to specify correct callback here?
   // or use one ctor that does it all internally? Maybe problem with ctor inheritance then.
   dimc::ParameterInfo* subscription=0;
   dabc::DoubleParameter* pdouble=dynamic_cast<dabc::DoubleParameter*>(par);
   dabc::StrParameter* pstring  =dynamic_cast<dabc::StrParameter*>(par);
   dabc::IntParameter* pint  =dynamic_cast<dabc::IntParameter*>(par);
   dabc::StatusParameter* pstat  =dynamic_cast<dabc::StatusParameter*>(par);
   dabc::RateParameter* prate  =dynamic_cast<dabc::RateParameter*>(par);
   dabc::HistogramParameter* phis  =dynamic_cast<dabc::HistogramParameter*>(par);

   if(pdouble)
      {
         double defval=-1;
         defval=pdouble->GetDouble();
         subscription=new dimc::ParameterInfo(par, fulldimname.c_str(), defval);
      }
   else if (pstring)
      {
         std::string defval="- not connected -";
         pstring->GetValue(defval);
         subscription=new dimc::ParameterInfo(par, fulldimname.c_str(), (char*) defval.c_str());
      }
   else if (pint)
      {
         int defval=-1;
         defval=pint->GetInt();
         subscription=new dimc::ParameterInfo(par, fulldimname.c_str(), defval);
      }
   else if (pstat)
      subscription=new dimc::ParameterInfo(par, fulldimname.c_str(), (void*) "not", 3 );
   else if (prate)
      subscription=new dimc::ParameterInfo(par, fulldimname.c_str(), (void*) "not", 3 );
   else if (phis)
      subscription=new dimc::ParameterInfo(par, fulldimname.c_str(), (void*) "not", 3 );
   else
      EOUT(("!!!!!!!!! Never come here: unknown parameter type in SubscribeParameter for %s",par->GetName()));
   if(subscription)
      {
         dabc::LockGuard g(&fMainMutex);  // only protect our own list
         fParamInfos.push_back(subscription);
         //std::cout <<"Registry::SubscribeParameter has subscribed for "<<fulldimname << std::endl;
         return true;
      }
   return false;




}// try

catch(std::exception& e)
   {
      EOUT(("SubscribeParameter std exception %s for name:%s",e.what(),fulldimname.c_str()));
      return false;
   }
catch(...)
   {
      EOUT(("SubscribeParameter Unexpected exception for name:%s", fulldimname.c_str()));
      return false;
   }






}

bool dimc::Registry::UnsubscribeParameter(dabc::Parameter* par)
{
if(par==0) return false;
bool result=false;
dimc::ParameterInfo* delinfo=0;
{ // begin lockguard
dabc::LockGuard g(&fMainMutex);
   std::vector<dimc::ParameterInfo*>::iterator iter;
   for(iter=fParamInfos.begin(); iter!=fParamInfos.end(); ++iter)
      {
         dimc::ParameterInfo* pinfo=*iter;
         try
            {
               if(pinfo->HasParameter(par))
                  {
                     //std::cout <<"Unsubscribe parameter "<< par->GetName()<<", pointer="<<par << std::endl;
                     fParamInfos.erase(iter);
                     result=true;
                     delinfo=pinfo; // delete after lockguard because of possible conflicts with dim mutex
                     break;
                  }
            }
         catch(std::exception &e)
            {
               EOUT(("dimc::Registry failed to UnsubscribeParameter  %s with standard exception: %s ",par->GetName(), e.what()));
               continue;
            }
         catch(...)
            {
               EOUT(("dimc::Registry failed to UnsubscribeParameter %s with unknown exception!\n",par->GetName()));
               continue;
            }
      }// for
} // end lockguard
delete delinfo;
return result;

}



