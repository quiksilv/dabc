/********************************************************************
 * The Data Acquisition Backbone Core (DABC)
 ********************************************************************
 * Copyright (C) 2009- 
 * GSI Helmholtzzentrum fuer Schwerionenforschung GmbH 
 * Planckstr. 1
 * 64291 Darmstadt
 * Germany
 * Contact:  http://dabc.gsi.de
 ********************************************************************
 * This software can be used under the GPL license agreements as stated
 * in LICENSE.txt file which is part of the distribution.
 ********************************************************************/
#include "dabc/Folder.h"

#include "string.h"

#include "dabc/logging.h"
#include "dabc/threads.h"
#include "dabc/ConfigBase.h"


dabc::Folder::Folder(Basic* parent, const char* name, bool owner) :
   Basic(parent, name),
   fChilds(),
   fOwner(owner)
{
}

dabc::Folder::~Folder()
{
   DOUT5((" dabc::Folder::~Folder %s", GetName()));

   if (IsOwner()) DeleteChilds();
             else RemoveChilds();

   DOUT5((" dabc::Folder::~Folder %s done", GetName()));
}

void dabc::Folder::AddChild(Basic* child)
{
   if (child==0) return;

   LockGuard guard(GetMutex());

   if (!fChilds.has_ptr(child)) {
      fChilds.push_back(child);
      child->_SetParent(GetMutex(), this);
   }
}

void dabc::Folder::RemoveChild(Basic* child)
{
   if (child==0) return;

   LockGuard guard(GetMutex());

   if (fChilds.has_ptr(child)) {
      child->_SetParent(0,0);
      fChilds.remove(child);
   }
}

void dabc::Folder::RemoveChilds()
{
   LockGuard guard(GetMutex());

   while (fChilds.size() > 0) {
      Basic* child = static_cast<Basic*> (fChilds.at(fChilds.size()-1));
      if (child) child->_SetParent(0,0);
      fChilds.remove_at(fChilds.size()-1);
   }
}


void dabc::Folder::DeleteChilds(int appid, const char* classname)
{
   Basic* child = 0;

   unsigned cnt = 0;

   do {

      child = 0;

      {
         LockGuard guard(GetMutex());

         do {
            if (cnt>=fChilds.size()) return;
            child = (Basic*) fChilds.at(cnt);

            if (child==0)
               fChilds.remove_at(cnt);
            else
            if ((appid>=0) && (child->GetAppId()!=appid)) {
               cnt++;
               child = 0;
            } else
            if ((classname!=0) && strcmp(classname, child->ClassName())!=0) {
               cnt++;
               child = 0;

            }
         } while (child == 0);
      }

      if (child) DOUT5(("Delete child %p %s", child, child->GetName()));
      delete child;

   } while (child!=0);
}

void dabc::Folder::_SetParent(Mutex* mtx, Basic* parent)
{
   dabc::Basic::_SetParent(mtx, parent);

   for (unsigned n=0; n<fChilds.size(); n++) {
      Basic* child = (Basic*) fChilds.at(n);
      child->_SetParent(mtx, this);
   }
}

unsigned dabc::Folder::NumChilds() const
{
   LockGuard guard(GetMutex());

   return fChilds.size();
}


dabc::Basic* dabc::Folder::GetChild(unsigned n) const
{
   LockGuard guard(GetMutex());

   return n<fChilds.size() ? static_cast<Basic*> (fChilds.at(n)) : 0;
}


bool dabc::Folder::IsChild(dabc::Basic* obj) const
{
   if (obj==0) return false;

   LockGuard guard(GetMutex());

   return fChilds.has_ptr(obj);
}

dabc::Basic* dabc::Folder::FindChild(const char* name) const
{
   LockGuard guard(GetMutex());

   return _FindChild(name);
}

dabc::Basic* dabc::Folder::_FindChild(const char* name) const
{
   // child name can include slashes for searching in subfolders

   if ((name==0) || (strlen(name)==0)) return 0;

   // if name=="/", this return as result
   while (*name=='/') name++;
   if (strlen(name)==0) return (dabc::Basic*) this;

   const char* slash = strchr(name, '/');

   if (slash==0) {
      for(unsigned n=0;n<fChilds.size();n++) {
         Basic* child = (Basic*) fChilds.at(n);
         if (child->IsName(name)) return child;
      }
   } else {
      int len = slash-name;
      for(unsigned n=0;n<fChilds.size();n++) {
         Folder* folder = dynamic_cast<Folder*> ((Basic*)fChilds.at(n));
         if ((folder!=0) &&
             (strncmp(name, folder->GetName(), len)==0))
            return folder->_FindChild(slash);
      }
   }

   return 0;
}

dabc::Folder* dabc::Folder::GetFolder(const char* name, bool force, bool isowner)
{
   LockGuard guard(GetMutex());

   if ((name==0) || (strlen(name)==0)) return this;

   Basic* child = _FindChild(name);
   Folder* folder = dynamic_cast<Folder*>(child);

   if ((child!=0) && (folder==0)) {
      EOUT(("Object with name %s cannot be a folder", name));
      return 0;
   }

   if ((folder!=0) || !force) return folder;

   const char* slash = strchr(name, '/');

   // here we need recursive mutex, while in constructor new lock will be required
   if (slash==0) return new Folder(this, name, isowner);

   int len = slash-name;
   if (len==0)
       folder = this;
   else
   for(unsigned n=0;n<fChilds.size();n++) {
      folder = dynamic_cast<Folder*> ((Basic*)fChilds.at(n));
      if ((folder!=0) && (strncmp(name, folder->GetName(), len)==0)) break;
      folder = 0;
   }

   if (folder==0) {
      std::string fname(name, len);
      folder = new Folder(this, fname.c_str(), true);
   }

   return folder->GetFolder(slash+1, force, isowner);
}

bool dabc::Folder::Store(ConfigIO &cfg)
{
   if (NumChilds()==0) return true;

   if (UseMasterClassName()) {
      cfg.CreateItem(MasterClassName());
      cfg.CreateAttr(xmlNameAttr, GetName());
   } else {
      cfg.CreateItem(GetName());
   }

   if ((MasterClassName()!=0) && (ClassName()!=0) &&
       (strcmp(ClassName(), MasterClassName())!=0))
          cfg.CreateAttr(xmlClassAttr, ClassName());

   StoreChilds(cfg);

   cfg.PopItem();

   return true;
}

void dabc::Folder::StoreChilds(ConfigIO &cfg)
{
   for (unsigned n=0; n<NumChilds(); n++) {
      Basic* child = GetChild(n);
      if (child!=0) child->Store(cfg);
   }
}


bool dabc::Folder::Find(ConfigIO &cfg)
{
   if (GetParent()==0) return false;

   const char* searchname = GetName();
   if (UseMasterClassName()) searchname = MasterClassName();

   if (!cfg.FindItem(searchname)) return false;

   if (UseMasterClassName())
      if (!cfg.CheckAttr(xmlNameAttr, GetName())) return false;

   if ((MasterClassName()!=0) && (ClassName()!=0) &&
       (strcmp(ClassName(), MasterClassName())!=0))
          if (!cfg.CheckAttr(xmlClassAttr, ClassName())) return false;

   return true;
}

std::string dabc::Folder::GetPathName(const char* path)
{
   const char* slash = strrchr(path, '/');
   if (slash==0) return std::string("");

   return std::string(path, slash - path);
}

const char* dabc::Folder::GetObjectName(const char* path)
{
   const char* slash = strrchr(path, '/');
   return (slash==0) ? path : slash + 1;
}

