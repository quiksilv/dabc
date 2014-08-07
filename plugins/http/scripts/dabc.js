DABC = {};

DABC.version = "2.6.7";

DABC.mgr = 0;

DABC.dabc_tree = 0;   // variable to display hierarchy

DABC.tree_limit = 200; // maximum number of elements drawn in the beginning

DABC.load_root_js = 0; // 0 - not started, 1 - doing load, 2 - completed

/*
if (!Object.create) {
   Object.create = (function(){
       function F(){}

       return function(o){
           if (arguments.length != 1) {
               throw new Error('Object.create implementation only accepts one parameter.');
           }
           F.prototype = o
           return new F()
       }
   })()
}
*/

DABC.ntou4 = function(b, o) {
   // convert (read) four bytes of buffer b into a uint32_t
   var n  = (b.charCodeAt(o)   & 0xff);
       n += (b.charCodeAt(o+1) & 0xff) << 8;
       n += (b.charCodeAt(o+2) & 0xff) << 16;
       n += (b.charCodeAt(o+3) & 0xff) << 24;
   return n;
}

DABC.AssertRootPrerequisites = function() {
   if (DABC.load_root_js == 0) {
      DABC.load_root_js = 1;
      loadScript('jsrootiosys/scripts/jquery.mousewheel.js', function() {
      loadScript('jsrootiosys/scripts/rawinflate.js', function() {
      loadScript('jsrootiosys/scripts/three.min.js', function() {
      loadScript('jsrootiosys/fonts/helvetiker_regular.typeface.js', function() {
      loadScript('jsrootiosys/scripts/JSRootIOEvolution.js', function() {
         DABC.load_root_js = 2;
      }) }) }) }) });
   }
   
   return (DABC.load_root_js == 2);
};


// ============= start of DrawElement ================================= 

DABC.DrawElement = function() {
   this.itemname = "";               // full item name in hierarchy
   this.version = new Number(-1);    // check which version of element is drawn
   this.frameid = "";                // frame id of HTML element (ion most cases <div>), where object drawn 
   return this;
}

//method called when item is activated (clicked)
//each item can react by itself
DABC.DrawElement.prototype.ClickItem = function() { return; }

// method regularly called by the manager
// it is responsibility of item perform any action
DABC.DrawElement.prototype.RegularCheck = function() { return; }


DABC.DrawElement.prototype.CreateFrames = function(topid,cnt) {
   this.frameid = "dabc_dummy_" + cnt;

   var entryInfo = 
      "<div id='" +this.frameid + "'>" + 
      "<h2> CreateFrames for item " + this.itemname + " not implemented </h2>"+
      "</div>"; 
   $(topid).append(entryInfo);
}

DABC.DrawElement.prototype.IsDrawn = function() {
   if (!this.frameid) return false;
   if (!document.getElementById(this.frameid)) return false;
   return true;
}

DABC.DrawElement.prototype.Clear = function() {
   // one should remove here all running requests
   // delete objects
   // remove GUI
   
   if (this.frameid.length > 0) {
      var elem = document.getElementById(this.frameid);
      if (elem!=null) elem.parentNode.removeChild(elem);
   }
   
   this.itemname = "";
   this.frameid = 0; 
   this.version = -1;
   this.frameid = "";
}


DABC.DrawElement.prototype.FullItemName = function() {
   // method should return absolute path of the item
   if ((this.itemname.length > 0) && (this.itemname[0] == '/')) return this.itemname;
   
   var curpath = document.location.pathname;
   // if (curpath.length == 0) curpath = document.location.pathname;
   
   return curpath + this.itemname; 
}

// ========= start of CommandDrawElement

DABC.CommandDrawElement = function() {
   DABC.DrawElement.call(this);
   this.req = null;
   this.jsonnode = null; // here is xml description of command, which should be first requested
   return this;
}

DABC.CommandDrawElement.prototype = Object.create( DABC.DrawElement.prototype );

DABC.CommandDrawElement.prototype.CreateFrames = function(topid,cnt) {
   this.frameid = "dabc_command_" + cnt;

   var entryInfo = "<div id='" + this.frameid + "'/>";
   
   $(topid).empty();
   $(topid).append(entryInfo);
   
   this.ShowCommand();
}

DABC.CommandDrawElement.prototype.NumArgs = function() {
   if (this.jsonnode==null) return 0;
   return this.jsonnode["numargs"];
}

DABC.CommandDrawElement.prototype.ArgName = function(n) {
   if (n>=this.NumArgs()) return "";
   return this.jsonnode["arg"+n];
}

DABC.CommandDrawElement.prototype.ArgKind = function(n) {
   if (n>=this.NumArgs()) return "";
   return this.jsonnode["arg"+n+"_kind"];
}

DABC.CommandDrawElement.prototype.ArgDflt = function(n) {
   if (n>=this.NumArgs()) return "";
   return this.jsonnode["arg"+n+"_dflt"];
}

DABC.CommandDrawElement.prototype.ArgMin = function(n) {
   if (n>=this.NumArgs()) return null;
   return this.jsonnode["arg"+n+"_min"];
}

DABC.CommandDrawElement.prototype.ArgMax = function(n) {
   if (n>=this.NumArgs()) return null;
   return this.jsonnode["arg"+n+"_max"];
}

DABC.CommandDrawElement.prototype.ShowCommand = function() {
   
   var frame = $("#" + this.frameid);
   
   frame.empty();
   
   frame.append("<h3>" + this.FullItemName() + "</h3>");

   if (this.jsonnode==null) {
      frame.append("request command definition...<br>");
      return;
   } 
   
   var entryInfo = "<input type='button' title='Execute' value='Execute' onclick=\"DABC.mgr.ExecuteCommand('" + this.itemname + "')\"/><br>";

   for (var cnt=0;cnt<this.NumArgs();cnt++) {
      var argname = this.ArgName(cnt);
      var argkind = this.ArgKind(cnt);
      var argdflt = this.ArgDflt(cnt);
      
      var argid = this.frameid + "_arg" + cnt; 
      var argwidth = (argkind=="int") ? "80px" : "170px";
      
      entryInfo += "Arg: " + argname + " "; 
      entryInfo += "<input id='" + argid + "' style='width:" + argwidth + "' value='"+argdflt+"' argname = '" + argname + "'/>";    
      entryInfo += "<br>";
   }
   
   entryInfo += "<div id='" +this.frameid + "_res'/>";
   
   frame.append(entryInfo);

   for (var cnt=0;cnt<this.NumArgs();cnt++) {
      var argid = this.frameid + "_arg" + cnt;
      var argkind = this.ArgKind(cnt);
      var argmin = this.ArgMin(cnt);
      var argmax = this.ArgMax(cnt);

      if ((argkind=="int") && (argmin!=null) && (argmax!=null))
         $("#"+argid).spinner({ min:argmin, max:argmax});
   }
}


DABC.CommandDrawElement.prototype.Clear = function() {
   
   DABC.DrawElement.prototype.Clear.call(this);
   
   if (this.req) this.req.abort(); 
   this.req = null;          
}

DABC.CommandDrawElement.prototype.ClickItem = function() {
}

DABC.CommandDrawElement.prototype.RegularCheck = function() {
}

DABC.CommandDrawElement.prototype.RequestCommand = function() {
   if (this.req) return;

   var url = this.itemname + "get.json";

   this.req = DABC.mgr.NewHttpRequest(url, "text", this);

   this.req.send(null);
}

DABC.CommandDrawElement.prototype.InvokeCommand = function() {
   if (this.req) return;
   
   var resdiv = $("#" + this.frameid + "_res");
   if (resdiv) {
      resdiv.empty();
      resdiv.append("<h5>Send command to server</h5>");
   }
   
   var url = this.itemname + "execute";

   for (var cnt=0;cnt<this.NumArgs();cnt++) {
      var argid = this.frameid + "_arg" + cnt;
      var argkind = this.ArgKind(cnt);
      var argmin = this.ArgMin(cnt);
      var argmax = this.ArgMax(cnt);

      var arginp = $("#"+argid);

      if (cnt==0) url+="?"; else url+="&";

      url += arginp.attr("argname");
      url += "=";
      if ((argkind=="int") && (argmin!=null) && (argmax!=null))
         url += arginp.spinner("value");
      else
         url += new String(arginp.val());
   }
   
   this.req = DABC.mgr.NewHttpRequest(url, "text", this);

   this.req.send(null);
}

DABC.CommandDrawElement.prototype.RequestCallback = function(arg) {
   // in any case, request pointer will be reseted
   // delete this.req;
   this.req = null;
   
   if (arg==null) {
      console.log("no response from server");
      return;
   }
   
   if (this.jsonnode==null) {
      this.jsonnode = JSON.parse(arg);
      this.ShowCommand();
      return;
   }
   
   var reply = JSON.parse(arg);
   if (typeof reply != 'object') {
      console.log("non-object in json response from server");
      return;
   }
   
   var resdiv = $("#" + this.frameid + "_res");
   if (resdiv) {
      resdiv.empty();
      resdiv.append("<h5>Get reply res=" + reply['_Result_'] + "</h5>");
   }
}


//========== start of HistoryDrawElement

DABC.HistoryDrawElement = function(_clname) {
   DABC.DrawElement.call(this);

   this.clname = _clname;
   this.req = null;           // request to get raw data
   this.jsonnode = null;      // json object with current values 
   this.history = null;       // array with previous history entries
   this.hlimit = 0;           // maximum number of history entries
   this.force = true;
   this.request_name = "get.json";

   return this;
}

DABC.HistoryDrawElement.prototype = Object.create( DABC.DrawElement.prototype );

DABC.HistoryDrawElement.prototype.EnableHistory = function(hlimit) {
   this.hlimit = hlimit;
}

DABC.HistoryDrawElement.prototype.isHistory = function() {
   return this.hlimit > 0;
}

DABC.HistoryDrawElement.prototype.Clear = function() {
   
   DABC.DrawElement.prototype.Clear.call(this);
   
   this.jsonnode = null;      // json object with current values 
   this.history = null;      // array with previous history
   this.hlimit = 100;         // maximum number of history entries  
   if (this.req) this.req.abort(); 
   this.req = null;          // this is current request
   this.force = true;
}

DABC.HistoryDrawElement.prototype.CreateFrames = function(topid, id) {
}

DABC.HistoryDrawElement.prototype.ClickItem = function() {
   if (this.req != null) return; 

   if (!this.IsDrawn()) 
      this.CreateFrames(DABC.mgr.NextCell(), DABC.mgr.cnt++);
   this.force = true;
   
   this.RegularCheck();
}

DABC.HistoryDrawElement.prototype.RegularCheck = function() {

   // no need to do something when req not completed
   if (this.req!=null) return;
 
   // do update when monitoring enabled
   if ((this.version >= 0) && !this.force) {
      var chkbox = document.getElementById("monitoring");
      if (!chkbox || !chkbox.checked) return;
   }
        
   var url = this.itemname + this.request_name + "?compact=3";

   if (this.version>0) url += "&version=" + this.version; 
   if (this.hlimit>0) url += "&history=" + this.hlimit;
   this.req = DABC.mgr.NewHttpRequest(url, "text", this);

   this.req.send(null);

   this.force = false;
}

DABC.HistoryDrawElement.prototype.ExtractField = function(name, kind, node) {
   
   if (!node) node = this.jsonnode;    
   if (!node) return;

   var val = node[name];
   if (!val) return;
   
   if (kind=="number") return Number(val); 
   if (kind=="time") {
      //return Number(val);
      var d  = new Date(val);
      return d.getTime() / 1000.;
   }
   
   return val;
}

DABC.HistoryDrawElement.prototype.ExtractSeries = function(name, kind) {

   // xml node must have attribute, which will be extracted
   var val = this.ExtractField(name, kind, this.jsonnode);
   if (val==null) return;
   
   var arr = new Array();
   arr.push(val);
   
   if (this.history) 
      for (var n=this.history.length-1;n>=0;n--) {
         var newval = this.ExtractField(name, kind, this.history[n]);
         if (newval!=null) val = newval;
         arr.push(val);
      }

   arr.reverse();
   return arr;
}


DABC.HistoryDrawElement.prototype.RequestCallback = function(arg) {
   // in any case, request pointer will be reseted
   // delete this.req;
   this.req = null;
   
   if (arg==null) {
      console.log("no xml response from server");
      return;
   }
   
   var top = JSON.parse(arg);

//   console.log("Get request callback " + top.getAttribute("dabc:version") + "  or " + top.getAttribute("version"));
   
   var new_version = Number(top["dabc:version"]);
   
   var modified = (this.version != new_version);

   this.version = new_version;

   // this is xml node with all fields
   this.jsonnode = top;

   if (this.jsonnode == null) {
      console.log("Did not found node with item attributes");
      return;
   }
   
   // this is array with history entries 
   var arr = this.jsonnode["history"];
   
   if ((arr!=null) && (this.hlimit>0)) {
  
      // gap indicates that we could not get full history relative to provided version number
      var gap = this.jsonnode["history_gap"];
      
      // join both arrays with history entries
      if ((this.history == null) || (arr.length >= this.hlimit) || gap) {
         this.history = arr;
      } else
      if (arr.length>0) {
         modified = true;
         var total = this.history.length + arr.length; 
         if (total > this.hlimit) 
            this.history.splice(0, total - this.hlimit);

         this.history = this.history.concat(arr);
      }

      // console.log("History length = " + this.history.length);
   }
   
   if (modified) this.DrawHistoryElement();
}


DABC.HistoryDrawElement.prototype.DrawHistoryElement = function()
{
   // should be implemented in derived class
   alert("HistoryDrawElement.DrawHistoryElement not implemented for item " + this.itemname);
}

// ======== end of DrawElement ======================

// ======== start of GaugeDrawElement ======================

DABC.GaugeDrawElement = function() {
   DABC.HistoryDrawElement.call(this, "gauge");
   this.gauge = 0;
}

// TODO: check how it works in different older browsers
DABC.GaugeDrawElement.prototype = Object.create( DABC.HistoryDrawElement.prototype );

DABC.GaugeDrawElement.prototype.CreateFrames = function(topid, id) {

   this.frameid = "dabc_gauge_" + id;
   this.min = 0;
   this.max = 10;
   this.gauge = null;
   
//   var entryInfo = "<div id='"+this.frameid+ "' class='200x160px'> </div> \n";
   var entryInfo = "<div id='"+this.frameid+ "'/>";
   $(topid).append(entryInfo);
}

DABC.GaugeDrawElement.prototype.DrawHistoryElement = function() {
   
   var val = this.ExtractField("value", "number");
   var min = this.ExtractField("min", "number");
   var max = this.ExtractField("max", "number");
   
   if (max!=null) this.max = max; 
   if (min!=null) this.min = min; 

   if (val > this.max) {
      if (this.gauge!=null) {
         this.gauge = null;
         $("#" + this.frameid).empty();
      }
      this.max = 1;
      var cnt = 0;
      while (val > this.max) 
         this.max *= (((cnt++ % 3) == 1) ? 2.5 : 2);
   }
   
   if (this.gauge==null) {
      this.gauge = new JustGage({
         id: this.frameid, 
         value: val,
         min: this.min,
         max: this.max,
         title: this.FullItemName()
      });
   } else {
      this.gauge.refresh(val);
   }
}

// ======== end of GaugeDrawElement ======================

//======== start of ImageDrawElement ======================

DABC.ImageDrawElement = function() {
   DABC.DrawElement.call(this);
}

// TODO: check how it works in different older browsers
DABC.ImageDrawElement.prototype = Object.create( DABC.DrawElement.prototype );

DABC.ImageDrawElement.prototype.CreateFrames = function(topid, id) {

   this.frameid = "dabc_image_" + id;
   
   var width = $(topid).width();
   
   var url = this.itemname + "root.png.gz?w=400&h=300&opt=col";
//   var entryInfo = "<div id='"+this.frameid+ "' class='200x160px'> </div> \n";
   var entryInfo = 
      "<div id='"+this.frameid+ "'>" +
      "<img src='" + url + "' alt='some text' width='" + width + "'>" + 
      "</div>";
   $(topid).append(entryInfo);
}


// ======== end of ImageDrawElement ======================


//======== start of LogDrawElement ======================

DABC.LogDrawElement = function() {
   DABC.HistoryDrawElement.call(this,"log");
}

DABC.LogDrawElement.prototype = Object.create( DABC.HistoryDrawElement.prototype );

DABC.LogDrawElement.prototype.CreateFrames = function(topid, id) {
   this.frameid = "dabc_log_" + id;
   var entryInfo;
   if (this.isHistory()) {
      // var w = $(topid).width();
      var h = $(topid).height();
      var maxhstyle = "";
      if (h>10) maxhstyle = "; max-height:" + h + "px"; 
      entryInfo = "<div id='" + this.frameid + "' style='overflow:auto; font-family:monospace" + maxhstyle + "'/>";
   } else {
      entryInfo = "<div id='"+this.frameid+ "'/>";
   }
   $(topid).append(entryInfo);
}

DABC.LogDrawElement.prototype.DrawHistoryElement = function() {
   var element = $("#" + this.frameid);
   element.empty();

   if (this.isHistory()) {
      var txt = this.ExtractSeries("value","string");
      for (var i in txt)
         element.append("<PRE>"+txt[i]+"</PRE>");
   } else {
      var val = this.ExtractField("value");
      element.append(this.FullItemName() + "<br>");
      element.append("<h5>"+val +"</h5>");
   }
}

// ========= start of GenericDrawElement ===========================


DABC.GenericDrawElement = function() {
   DABC.HistoryDrawElement.call(this,"generic");
   this.recheck = false;   // indicate that we want to redraw 
}

DABC.GenericDrawElement.prototype = Object.create( DABC.HistoryDrawElement.prototype );

DABC.GenericDrawElement.prototype.CreateFrames = function(topid, id) {
   this.frameid = "dabc_generic_" + id;
   var entryInfo;
//   if (this.isHistory()) {
//      var w = $(topid).width();
//      var h = $(topid).height();
//      entryInfo = "<div id='" + this.frameid + "' style='overflow:auto; font-family:monospace; max-height:" + h + "px'/>";
//   } else {
      entryInfo = "<div id='"+this.frameid+ "'/>";
//   }
   $(topid).append(entryInfo);
}

DABC.GenericDrawElement.prototype.DrawHistoryElement = function() {
   if (this.recheck) {
      console.log("here one need to draw element with real style " + this.FullItemName());
      this.recheck = false;
      
      if (this.jsonnode["dabc:kind"]) {
         var itemname = this.itemname;
         var jsonnode = this.jsonnode;
         DABC.mgr.ClearWindow();
         DABC.mgr.DisplayItem(itemname, jsonnode);
         return;
      }
   }
   
   var element = $("#" + this.frameid);
   element.empty();
   element.append(this.FullItemName() + "<br>");
   
   var ks = Object.keys(this.jsonnode);
   for (i = 0; i < ks.length; i++) {
      k = ks[i];
      element.append("<h5><PRE>" + ks[i] + " = " + this.jsonnode[ks[i]] + "</PRE></h5>");
   }

//   if (this.isHistory()) {
//      var txt = this.ExtractSeries("value","string");
//      for (var i=0;i<txt.length;i++)
//         element.append("<PRE>"+txt[i]+"</PRE>");
//   } else {
//      var val = this.ExtractField("value");
//      element.append(this.itemname + "<br>");
//      element.append("<h5>"+val +"</h5>");
//   }
}


//======== start of HierarchyDrawElement =============================

DABC.HierarchyDrawElement = function() {
   DABC.DrawElement.call(this);
   this.jsondoc = null;      // description is json form
   this.ready = false;
   this.req = 0;             // this is current request
   this.main = null;         // pointer on main hierarchy element
   this.maxnodeid = 0;       // maximum id of last element
}

// TODO: check how it works in different older browsers
DABC.HierarchyDrawElement.prototype = Object.create( DABC.DrawElement.prototype );

DABC.HierarchyDrawElement.prototype.CreateFrames = function(topid, id) {
   this.frameid = topid;
}

DABC.HierarchyDrawElement.prototype.RegularCheck = function() {
   if (this.ready || this.req) return;
   
   var url = "h.json?compact=3";
   
   // if it is sub-item, include its name when request hierarchy
   if (this.main)
      url = this.itemname + url;
   
   this.req = DABC.mgr.NewHttpRequest(url, "text", this);

   this.req.send(null);
}

DABC.HierarchyDrawElement.prototype.createNode = function(nodeid, parentid, node, fullname, lvl, maxlvl) 
{
   if (lvl == null) lvl = 0;
   if (maxlvl == null) maxlvl = -1;
   
   var kind = node["dabc:kind"];
   var view = node["dabc:view"];
   
   // this name will be specified when item name can be used as XML node name
   var dabcitemname = node["dabc:itemname"];
   
   var html = "";

   var nodename = node._name;
   if (dabcitemname != null) nodename = dabcitemname;
   
   var nodefullname  = "";
   
   if (parentid>=0) 
      nodefullname = fullname + nodename + "/";
   
   var nodeimg = "";
   var node2img = "";
   
   var scan_inside = true, can_open = false;
   
   var can_display = DABC.mgr.CanDisplay(node);
   var can_expand = node["dabc:more"] != null;
   
   if (kind) {
      if (view == "png") { nodeimg = 'httpsys/img/dabcicon.png'; can_display = true; } else
      if (kind == "ROOT.Session") nodeimg = source_dir+'img/globe.gif'; else
      if (kind == "DABC.HTML") { nodeimg = source_dir+'img/globe.gif'; can_open = true; } else
      if (kind == "DABC.Application") nodeimg = 'httpsys/img/dabcicon.png'; else
      if (kind == "DABC.Command") { nodeimg = 'httpsys/img/dabcicon.png'; scan_inside = false; } else
      if (kind == "GO4.Analysis") nodeimg = 'go4sys/icons/go4logo2_small.png'; else
      if (kind.match(/\bROOT.TH1/)) { nodeimg = source_dir+'img/histo.png'; scan_inside = false; can_display = true; } else
      if (kind.match(/\bROOT.TH2/)) { nodeimg = source_dir+'img/histo2d.png'; scan_inside = false; can_display = true; } else  
      if (kind.match(/\bROOT.TH3/)) { nodeimg = source_dir+'img/histo3d.png'; scan_inside = false; can_display = true; } else
      if (kind == "ROOT.TCanvas") { nodeimg = source_dir+'img/canvas.png'; can_display = true; } else
      if (kind == "ROOT.TProfile") { nodeimg = source_dir+'img/profile.png'; can_display = true; } else
      if (kind.match(/\bROOT.TGraph/)) { nodeimg = source_dir+'img/graph.png'; can_display = true; } else
      if (kind == "ROOT.TTree") nodeimg = source_dir+'img/tree.png'; else
      if (kind == "ROOT.TFolder") { nodeimg = source_dir+'img/folder.gif'; node2img = source_dir+'img/folderopen.gif'; }  else
      if (kind == "ROOT.TNtuple") nodeimg = source_dir+'img/tree_t.png';   else
      if (kind == "ROOT.TBranch") nodeimg = source_dir+'img/branch.png';   else
      if (kind.match(/\bROOT.TLeaf/)) nodeimg = source_dir+'img/leaf.png'; else
      if ((kind == "ROOT.TList") && (node.nodeName == "StreamerInfo")) { nodeimg = source_dir+'img/question.gif'; can_display = true; }
   }

   if (!node._childs || !scan_inside) {
      if (can_expand) {   
         html = "javascript: DABC.mgr.expand('"+nodefullname+"'," + nodeid +");";
         if (nodeimg.length == 0) {
            nodeimg = source_dir+'img/folder.gif'; 
            node2img = source_dir+'img/folderopen.gif';
         }
      } else
      if (can_display) {
         html = "javascript: DABC.mgr.display('"+nodefullname+"');";
      } else
      if (can_open) 
         html = nodefullname;
   } else 
   if ((maxlvl >= 0) && (lvl >= maxlvl)) {
      html = "javascript: DABC.mgr.expand('"+nodefullname+"',-" + nodeid +");";
      if (nodeimg.length == 0) {
         nodeimg = source_dir+'img/folder.gif'; 
         node2img = source_dir+'img/folderopen.gif';
      }
      scan_inside = false;
   } else {
      html = nodefullname;
      if (html == "") html = ".."; 
   }
   
   if (node2img == "") node2img = nodeimg;
   
   // console.log("add nodeid " + nodeid + ":" + parentid + "  name = " + nodename );
   DABC.dabc_tree.add(nodeid, parentid, nodename, html, nodename, "", nodeimg, node2img);
   
   var thisid = nodeid;

   // allow context menu only for objects which can be displayed
   if (can_display || (nodeid==0))
      DABC.dabc_tree.aNodes[nodeid]['ctxt'] = "return DABC.mgr.contextmenu(this, event, '" + nodefullname+"',-" + nodeid +");"; 

   nodeid++;
   
   if (scan_inside) 
      for (var i in node._childs)
         nodeid = this.createNode(nodeid, thisid, node._childs[i], nodefullname, lvl+1, maxlvl);
   
   return nodeid;
}

DABC.HierarchyDrawElement.prototype.FindNode = function(fullname, top, replace) {

   // console.log("Searchig " + fullname);
   
   if (fullname.length==0) return top;
   
   if (!top) top = this.jsondoc;
   var pos = fullname.indexOf("/");
   if (pos<0) return;
   
   var localname = fullname.substr(0, pos);  

   // console.log("local " + localname + " pos = " + pos + "  ");

   for (var i in top._childs) 
      if (top._childs[i]._name == localname) {
         if (pos+1 == fullname.length) {
            if (replace!=null) top._childs[i] = replace;
            return top._childs[i]; 
         }
         
         return this.FindNode(fullname.substr(pos+1), top._childs[i], replace);
      }
}

DABC.HierarchyDrawElement.prototype.CountElements = function(node, lvl, arr)
{
   if (!node) return -1;
   
   if ((lvl==0) && (arr==null)) arr = new Array;
   
   while (arr.length <= lvl) arr.push(0);
   
   if (node._childs)
      for (var i in node._childs) {
         arr[lvl]++;
         this.CountElements(node._childs[i], lvl+1, arr);
      }

   // for first level count how deep browser can create items
   if (lvl==0) {
      var sum = 0;
      for (var cnt in arr) {
         sum += arr[cnt];
         // console.log(" cnt = " + cnt + " arr = " + arr[cnt] + " sum = " + sum);
         if (sum > DABC.tree_limit) return cnt;   
      }
   }
   
   return -1;
}


DABC.HierarchyDrawElement.prototype.RequestCallback = function(arg) {
   this.req = 0;

   if (arg==null) { this.ready = false; return; }

   this.jsondoc = JSON.parse(arg);
   if (!this.jsondoc) {
      console.log(" Fail to parse JSON reply");
      return;
   }
   
   var top = this.jsondoc;
   if (!top) return;
   
   this.ready = true;
   
   if (this.main == null) {
   
      DABC.dabc_tree = new dTree('DABC.dabc_tree');
      DABC.dabc_tree.config.useCookies = false;
      
      var maxlvl = this.CountElements(top, 0);
      
      // console.log("Total number of elements = " + sum + " level limit = " + maxlvl);
   
      this.maxnodeid = this.createNode(0, -1, top, "", 0, maxlvl);

      var content = "<p><a href='javascript: DABC.dabc_tree.openAll();'>open all</a> | <a href='javascript: DABC.dabc_tree.closeAll();'>close all</a> | <a href='javascript: DABC.mgr.ReloadTree();'>reload</a> | <a href='javascript: DABC.mgr.ClearWindow();'>clear</a> </p>";
      content += DABC.dabc_tree;
      $("#" + this.frameid).html(content);
   } else {
      // find and replace at the same time
      var mainjsonnode = this.main.FindNode(this.itemname, null, top);
      if (!mainjsonnode) {
         alert("Not found json node for item " + this.itemname);
         DABC.mgr.RemoveItem(this);
         return;
      } 
      
      if (mainjsonnode._childs != null) {

         for (var i in mainjsonnode._childs)
            this.main.maxnodeid = this.createNode(this.main.maxnodeid, this.maxnodeid, mainjsonnode._childs[i], this.itemname);

         var content = "<p><a href='javascript: DABC.dabc_tree.openAll();'>open all</a> | <a href='javascript: DABC.dabc_tree.closeAll();'>close all</a> | <a href='javascript: DABC.mgr.ReloadTree();'>reload</a> | <a href='javascript: DABC.mgr.ClearWindow();'>clear</a> </p>";
         content += DABC.dabc_tree;
         $("#" + this.main.frameid).html(content);

         // open node which was filled 
         DABC.dabc_tree.o(this.maxnodeid);
      }
      
      DABC.mgr.RemoveItem(this);
   }
}

DABC.HierarchyDrawElement.prototype.CompleteNode = function(itemname, node, nodeid)
{
   var maxlvl = this.CountElements(node, 0);
   // here maxlevel calculation differ while we are using not the dummy top-node 
   if (maxlvl>0) maxlvl--;

   for (var i in node._childs)
     this.maxnodeid = this.createNode(this.maxnodeid, nodeid, node._childs[i], itemname, 0, maxlvl);
   
   DABC.dabc_tree.aNodes[nodeid].url = itemname;
   
   var content = "<p><a href='javascript: DABC.dabc_tree.openAll();'>open all</a> | <a href='javascript: DABC.dabc_tree.closeAll();'>close all</a> | <a href='javascript: DABC.mgr.ReloadTree();'>reload</a> | <a href='javascript: DABC.mgr.ClearWindow();'>clear</a> </p>";
   
   content += DABC.dabc_tree;
   $("#" + this.frameid).html(content);
   DABC.dabc_tree.o(nodeid);
}



DABC.HierarchyDrawElement.prototype.Clear = function() {
   
   DABC.DrawElement.prototype.Clear.call(this);
   
   this.xmldoc = null;
   this.ready = false;
   if (this.req != null) this.req.abort();
   this.req = null;
}


// ======== end of HierarchyDrawElement ======================


// ================ start of FesaDrawElement

DABC.FesaDrawElement = function(_clname) {
   DABC.DrawElement.call(this);
   this.clname = _clname;     // FESA class name
   this.data = null;          // raw data
   this.root_obj = null;      // root object, required for draw
   this.root_painter = null;  // root object, required for draw
   this.req = null;           // request to get raw data
}

DABC.FesaDrawElement.prototype = Object.create( DABC.DrawElement.prototype );

DABC.FesaDrawElement.prototype.Clear = function() {
   
   DABC.DrawElement.prototype.Clear.call(this);

   this.clname = "";         // ROOT class name
   this.root_obj = null;     // object itself, for streamer info is file instance
   this.root_painter = null;
   this.data = null;          // raw data
   if (this.req) this.req.abort(); 
   this.req = null;          // this is current request
   this.force = true;
}

DABC.FesaDrawElement.prototype.CreateFrames = function(topid, id) {
   this.frameid = "dabcobj" + id;
   
   var entryInfo = "<div id='" + this.frameid + "'/>";
   $(topid).append(entryInfo);
   
   var render_to = "#" + this.frameid;
   var element = $(render_to);
      
   var fillcolor = 'white';
   var factor = 0.66666;
      
   d3.select(render_to).style("background-color", fillcolor);
   d3.select(render_to).style("width", "100%");

   var w = element.width(), h = w * factor; 

   this.vis = d3.select(render_to)
                   .append("svg")
                   .attr("width", w)
                   .attr("height", h)
                   .style("background-color", fillcolor);
      
   this.vis.append("svg:title").text(this.FullItemName());
}

DABC.FesaDrawElement.prototype.ClickItem = function() {
   if (this.req != null) return; 

   if (!this.IsDrawn()) 
      this.CreateFrames(DABC.mgr.NextCell(), DABC.mgr.cnt++);
   this.force = true;
   
   this.RegularCheck();
}

DABC.FesaDrawElement.prototype.RegularCheck = function() {

//   if (!DABC.AssertRootPrerequisites()) return;
   
   // no need to do something when req not completed
   if (this.req!=null) return;
 
   // do update when monitoring enabled
   if ((this.version >= 0) && !this.force) {
      var chkbox = document.getElementById("monitoring");
      if (!chkbox || !chkbox.checked) return;
   }
        
   var url = this.itemname + "dabc.bin";
   
   if (this.version>0) url += "?version=" + this.version;

   this.req = DABC.mgr.NewHttpRequest(url, "bin", this);

   this.req.send(null);

   this.force = false;
}


DABC.FesaDrawElement.prototype.RequestCallback = function(arg) {
   // in any case, request pointer will be reseted
   // delete this.req;
   
   var bversion = new Number(0);
   if (this.req != 0) {
      var str = this.req.getResponseHeader("BVersion");
      if (str != null) {
         bversion = new Number(str);
         console.log("FESA data version is " + bversion);
      }
      
   }
   
   this.req = null;
   
   // console.log("Get response from server " + arg.length);
   
   if (this.version == bversion) {
      console.log("Same version of beam profile " + bversion);
      return;
   }
   
   if (arg == null) {
      alert("no data for beamprofile when expected");
      return;
   } 

   this.data = arg;
   this.version = bversion;

   console.log("FESA data length is " + this.data.length);
   
   this.vis.select("title").text(this.FullItemName() + 
         "\nversion = " + this.version + ", size = " + this.data.length);

   if (!this.ReconstructObject()) return;
   
   if (this.root_painter != null) {
      this.root_painter.RedrawFrame();
   } else {
      this.root_painter = JSROOTPainter.drawObjectInFrame(this.vis, this.root_obj);
      
      if (this.root_painter == -1) this.root_painter = null;
   }
}


DABC.FesaDrawElement.prototype.ReconstructObject = function()
{
   if (this.clname != "2D") return false;
   
   if (this.root_obj == null) {
      this.root_obj = JSROOTCore.CreateTH2(16, 16);
      this.root_obj['fName']  = "BeamProfile";
      this.root_obj['fTitle'] = "Beam profile from FESA";
      this.root_obj['fOption'] = "col";
//      console.log("Create histogram");
   }
   
   if ((this.data==null) || (this.data.length != 16*16*4)) {
      alert("no proper data for beam profile");
      return false;
   }
   
   var o = 0;
   for (var iy=0;iy<16;iy++)
      for (var ix=0;ix<16;ix++) {
         var value = DABC.ntou4(this.data, o); o+=4;
         var bin = this.root_obj.getBin(ix+1, iy+1);
         this.root_obj.setBinContent(bin, value);
//         if (iy==5) console.log("Set content " + value);
      }
   
   return true;
}


//========== start of RateHistoryDrawElement

DABC.RateHistoryDrawElement = function() {
   DABC.HistoryDrawElement.call(this, "rate");
   this.root_painter = null;  // root painter, required for draw
   this.EnableHistory(100);
}

DABC.RateHistoryDrawElement.prototype = Object.create( DABC.HistoryDrawElement.prototype );

DABC.RateHistoryDrawElement.prototype.Clear = function() {
   
   DABC.HistoryDrawElement.prototype.Clear.call(this);
   this.root_painter = null;  // root painter, required for draw
}

DABC.RateHistoryDrawElement.prototype.CreateFrames = function(topid, id) {

//   DABC.AssertRootPrerequisites();
   
   this.frameid = "dabcobj" + id;
   
   var entryInfo = "<div id='" + this.frameid + "'/>";
   $(topid).append(entryInfo);
   
   var render_to = "#" + this.frameid;
   var element = $(render_to);
      
   var fillcolor = 'white';
   var factor = 0.66666;
      
   d3.select(render_to).style("background-color", fillcolor);
   d3.select(render_to).style("width", "100%");

   var w = element.width(), h = w * factor; 

   this.vis = d3.select(render_to)
                   .append("svg")
                   .attr("width", w)
                   .attr("height", h)
                   .style("background-color", fillcolor);
      
   this.vis.append("svg:title").text(this.itemname);
}


DABC.RateHistoryDrawElement.prototype.DrawHistoryElement = function() {

//   if (!DABC.AssertRootPrerequisites()) return;
   
   this.vis.select("title").text(this.itemname + 
         "\nversion = " + this.version + ", history = " + (this.history ? this.history.length : 0));
   
   //console.log("Extract series");
   
   var x = this.ExtractSeries("time", "time");
   var y = this.ExtractSeries("value", "number");
   
   if (x.length==1) {
      console.log("duplicate single point at time " + x[0]);
      x.push(x[0]+1);
      y.push(y[0]);
   } 
   

   // here we should create TGraph object

   var gr = JSROOTCore.CreateTGraph();
   
   gr['fX'] = x;
   gr['fY'] = y;
   gr['fNpoints'] = x.length;
   
   JSROOTCore.AdjustTGraphRanges(gr);

   gr['fHistogram']['fTitle'] = this.FullItemName();
   if (gr['fHistogram']['fYaxis']['fXmin']>0)
      gr['fHistogram']['fYaxis']['fXmin'] = 0;
   else
      gr['fHistogram']['fYaxis']['fXmin'] *= 1.2;

   gr['fHistogram']['fYaxis']['fXmax'] *= 1.2;
   
   gr['fHistogram']['fXaxis']['fTimeDisplay'] = true;
   gr['fHistogram']['fXaxis']['fTimeFormat'] = "";
   // gStyle['TimeOffset'] = 0; // DABC uses UTC time, starting from 1/1/1970
   gr['fHistogram']['fXaxis']['fTimeFormat'] = "%H:%M:%S%F0"; // %FJanuary 1, 1970 00:00:00
   
   if (this.root_painter && this.root_painter.UpdateObject(gr)) {
      this.root_painter.RedrawFrame();
   } else {
      this.root_painter = JSROOTPainter.drawObjectInFrame(this.vis, gr, "L");
      
      if (this.root_painter == -1) this.root_painter = null;
   }
}

// ======== start of RootDrawElement ======================

DABC.RootDrawElement = function(_clname, _json) {
   DABC.DrawElement.call(this);

   this.clname = _clname;    // ROOT class name
   this.json = _json;        // indocates JSON usage
   this.obj = null;          // object itself, for streamer info is file instance
   this.sinfo = null;        // used to refer to the streamer info record
   this.req = null;          // this is current request
   this.first_draw = true;   // one should enable flag only when all ROOT scripts are loaded
   this.painter = null;      // pointer on painter, can be used for update
   
   this.raw_data = null;    // raw data kept in the item when object cannot be reconstructed immediately
   this.raw_data_version = 0;   // verison of object in the raw data, will be copied into object when completely reconstructed
   this.raw_data_size = 0;      // size of raw data, can be displayed
   this.need_master_version = 0; // this is version, required for the master item (streamer info)
   
   this.StateEnum = {
         stInit        : 0,
         stWaitRequest : 1,
         stWaitSinfo   : 2,
         stReady       : 3,
         stFailure     : 4
   };
   
   this.state = this.StateEnum.stInit;   
}

DABC.RootDrawElement.prototype = Object.create( DABC.DrawElement.prototype );

DABC.RootDrawElement.prototype.Clear = function() {
   
   DABC.DrawElement.prototype.Clear.call(this);

   this.clname = "";         // ROOT class name
   this.obj = null;          // object itself, for streamer info is file instance
   this.sinfo = null;        // used to refer to the streamer info record
   if (this.req) this.req.abort(); 
   this.req = null;          // this is current request
   this.first_draw = true;   // one should enable flag only when all ROOT scripts are loaded
   this.painter = null;      // pointer on painter, can be used for update
}

DABC.RootDrawElement.prototype.IsObjectDraw = function()
{
   // returns true when normal ROOT drawing should be used
   // when false, streamer info drawing is applied
   if (this.json) return this.itemname.indexOf("StreamerInfo")<0;
   return this.sinfo!=null; 
}

DABC.RootDrawElement.prototype.CreateFrames = function(topid, id) {
   this.frameid = "dabcobj" + id;
   
   this.first_draw = true;
   
   var entryInfo = ""; 
   if (this.IsObjectDraw()) {
      entryInfo += "<div id='" + this.frameid + "'/>";
   } else {
      entryInfo += "<h5><a> Streamer Infos </a>&nbsp; </h5>";
      entryInfo += "<div style='overflow:auto'><h6>Streamer Infos</h6><span id='" + this.frameid +"' class='dtree'></span></div>";
   }
   //entryInfo+="</div>";
   $(topid).append(entryInfo);
   
   if (this.IsObjectDraw()) {
      var render_to = "#" + this.frameid;
      var element = $(render_to);
      
      var fillcolor = 'white';
      var factor = 0.66666;
      
      d3.select(render_to).style("background-color", fillcolor);
      d3.select(render_to).style("width", "100%");

      var w = element.width(), h = w * factor; 

      this.vis = d3.select(render_to)
                   .append("svg")
                   .attr("width", w)
                   .attr("height", h)
                   .style("background-color", fillcolor);
      
      this.vis.append("svg:title").text(this.itemname);
      
//      console.log("create visual pane of width " + w + "  height " + h)
   }
   
//   $(topid).data('any', 10);
//   console.log("something = " + $(topid).data('any'));
   
}

DABC.RootDrawElement.prototype.ClickItem = function() {
   if (this.state != this.StateEnum.stReady) return; 

   // TODO: TCanvas update do not work in JSRootIO
   if (this.clname == "TCanvas") return;

   if (!this.IsDrawn()) 
      this.CreateFrames(DABC.mgr.NextCell(), DABC.mgr.cnt++);
      
   this.state = this.StateEnum.stInit;
   this.RegularCheck();
}

// force item to get newest version of the object
DABC.RootDrawElement.prototype.Update = function() {
   if (this.state != this.StateEnum.stReady) return;
   this.state = this.StateEnum.stInit;
   this.RegularCheck();
}

DABC.RootDrawElement.prototype.HasVersion = function(ver) {
   return this.obj && (this.version >= ver);
}

// if frame created and exists
DABC.RootDrawElement.prototype.DrawObject = function(newobj) {
   
   if (newobj != null) {
      if (this.painter && this.painter.UpdateObject(newobj)) {
         // if painter accepted object update, we need later just redraw frame
         newobj = null;
      } else { 
         this.obj = newobj;
         this.painter = null;
      }
   }
   
   if (this.obj == null) return;

   if (this.IsObjectDraw()) {
   
      if (this.vis!=null)
        this.vis.select("title").text(this.FullItemName() + 
                                      "\nversion = " + this.version + ", size = " + this.raw_data_size);
      
      if (this.painter != null) {
         this.painter.RedrawFrame();
      } else {
//         if (gStyle) gStyle.AutoStat = true;
//                else console.log("no gStyle");

         this.painter = JSROOTPainter.drawObjectInFrame(this.vis, this.obj);
         
         if (this.painter == -1) this.painter = null;

         // if (this.painter)  console.log("painter is created");
      }
   } else 
   if (this.json) {
      
      // we create sinfo similar to the file itself
      var sinfo = {};
      for (var i=0;i<this.obj.arr.length;i++) {
         sinfo[this.obj.arr[i].fName] = this.obj.arr[i];
      }

      // when doing binary exchanhe, object is gFile 
      JSROOTPainter.displayStreamerInfos(sinfo, "#" + this.frameid);
   } else {
      // when doing binary exchanhe, object is gFile 
      JSROOTPainter.displayStreamerInfos(this.obj.fStreamerInfos, "#" + this.frameid);
   
   }
   
   this.first_draw = false;
}

DABC.RootDrawElement.prototype.ReconstructRootObject = function() {
   
   //console.log("Call reconstruct " + this.itemname);
   
   if (!this.raw_data) {
      this.state = this.StateEnum.stInit;
      return;
   }


   var obj = {};
   
   obj['_typename'] = 'JSROOTIO.' + this.clname;
   var buf = new JSROOTIO.TBuffer(this.raw_data, 0, this.sinfo.obj);
   buf.MapObject(obj, 1);

   buf.ClassStreamer(obj, this.clname);
   
   if (this.painter && this.painter.UpdateObject(obj)) {
      // if painter accepted object update, we need later just redraw frame
      obj = null;
   } else { 
      this.obj = obj;
      this.painter = null;
   }
   
   this.state = this.StateEnum.stReady;
   this.version = this.raw_data_version;
   
   this.raw_data = null;
   this.raw_data_version = 0;
   
   this.DrawObject();
}

DABC.RootDrawElement.prototype.RequestCallback = function(arg) {
   
   var mversion = null, bversion = null;
   
   if (this.req!=null) {
      mversion = this.req.getResponseHeader("MVersion");
      if (mversion!=null) mversion = new Number(mversion);
      bversion = this.req.getResponseHeader("BVersion");
      if (bversion!=null) bversion = new Number(bversion);
   }

   if (mversion == null) mversion = new Number(0);
   if (bversion == null) bversion = new Number(0);

   // in any case, request pointer will be reseted
   this.req = null;
   
   // console.log("Call back " + this.itemname);
   
   if (this.state != this.StateEnum.stWaitRequest) {
      alert("item not in wait request state");
      this.state = this.StateEnum.stInit;
      return;
   }

   // if we got same version, do nothing - we are happy!!!
   if ((bversion > 0) && (this.version == bversion)) {
      this.state = this.StateEnum.stReady;
      console.log(" Get same version " + bversion + " of object " + this.itemname);
      if (this.first_draw) this.DrawObject();
      return;
   } 
   
   if (this.json) {
      var obj = JSROOTCore.JSONR_unref(JSON.parse(arg));

      this.version = bversion;
      
      this.raw_data = null;
      this.raw_data_version = bversion;
      this.raw_data_size = arg.length;
      
      if (obj && ('_typename' in obj)) {
         // console.log("Get JSON object of " + obj['_typename']);
         
         this.state = this.StateEnum.stReady;
         this.DrawObject(obj);
      } else {
         console.log("Fail to process root.json");
         this.state = this.StateEnum.stInit;
         this.obj = null;
      }
      return;
   }
   
   // console.log(" RootDrawElement get callback " + this.itemname + " sz " + arg.length + "  this.version = " + this.version + "  newversion = " + hdr.version);

   if (!this.sinfo) {
      
      delete this.obj; 
      
      // we are doing sreamer infos
      var file = new JSROOTIO.RootFile;
      var buf = new JSROOTIO.TBuffer(arg, 0, file);
      file.ExtractStreamerInfos(buf);
      
      this.obj = file;
      
      this.version = bversion;
      this.state = this.StateEnum.stReady;
      this.raw_data = null;
      // this indicates that object was clicked and want to be drawn
      this.DrawObject();
         

      if (!this.obj) alert("Cannot reconstruct streamer infos!!!");

      // with streamer info one could try to update complex fields
      DABC.mgr.UpdateComplexFields();

      return;
   } 

   this.raw_data_version = bversion;
   this.raw_data = arg;
   this.raw_data_size = arg.length;
   this.need_master_version = mversion;
   
   if (this.sinfo && !this.sinfo.HasVersion(this.need_master_version)) {
      // console.log(" Streamer info is required of vers " + this.need_master_version);
      this.state = this.StateEnum.stWaitSinfo;
      this.sinfo.Update();
      return;
   }
   
   this.ReconstructRootObject();
}

DABC.RootDrawElement.prototype.RegularCheck = function() {

//   if (!DABC.AssertRootPrerequisites()) return;
   
   // ignore all callbacks for object from ROOT files
   if ('rootfile' in this) return;
   
   switch (this.state) {
     case this.StateEnum.stInit: break;
     case this.StateEnum.stWaitRequest: return;
     case this.StateEnum.stWaitSinfo: { 
        // console.log(" item " + this.itemname+ " requires streamer info ver " + this.need_master_version  +  "  available is = " + this.sinfo.version);

        if (this.sinfo.HasVersion(this.need_master_version)) {
           this.ReconstructRootObject();
        } else {
           // console.log(" version is not ok");
        }
        return;
     }
     case this.StateEnum.stReady: {
        // if item ready, verify that we want to send request again
        if (!this.IsDrawn()) return;
        var chkbox = document.getElementById("monitoring");
        if (!chkbox || !chkbox.checked) return;
        
        // TODO: TCanvas update do not work in JSRootIO
        if (this.clname == "TCanvas") return;
        
        break;
     }
     case this.StateEnum.stFailure: return; // do nothing when failure
     default: return;
   }
   
   // console.log(" checking request for " + this.itemname + (this.sinfo.ready ? " true" : " false"));

   
   var url = this.itemname;
   
   if (this.json) {
      url += "root.json.gz?compact=3";
      if (this.version>0) url += "&version=" + this.version;
   } else {
      url += "root.bin.gz";
      if (this.version>0) url += "?version=" + this.version;
   }

   this.req = DABC.mgr.NewHttpRequest(url, "bin", this);

//   console.log(" Send request " + url);

   this.req.send(null);
   
   this.state = this.StateEnum.stWaitRequest;
}


// ======== end of RootDrawElement ======================



// ============= start of DABC.Manager =============== 

DABC.Manager = function(with_tree) {
   this.cnt = new Number(0);      // counter to create new element 
   this.arr = new Array();        // array of DrawElement
   this.with_tree = with_tree;
   
   if (this.with_tree) {
      DABC.dabc_tree = new dTree('DABC.dabc_tree');
      DABC.dabc_tree.config.useCookies = false;
      this.CreateTable(2,2);
   }

   // we could use ROOT drawing from beginning
   gStyle.OptimizeDraw = true;
   
   return this;
}

DABC.Manager.prototype.CreateTable = function(divx, divy)
{
   var tablecontents = "";
   var cnt = 0;
   
   var precx = Math.floor(100/divx);
   var precy = Math.floor(100/divy);
   
   tablecontents = "<table width='100%' height='100%'>";
   for (var i = 0; i < divy; i ++)
   {
      tablecontents += "<tr height='"+precy+"%'>";
      for (var j = 0; j < divx; j ++) {
         tablecontents += "<td id='draw_place_"+ cnt + "' width='" + precx 
                       + "%' height='"+precy+"%'>" + i + "," + j + "</td>";
         cnt++;
      }
      tablecontents += "</tr>";
   }
   tablecontents += "</table>";
   $("#dabc_draw").empty();
   document.getElementById("dabc_draw").innerHTML = tablecontents;

   this.table_counter = 0;
   this.table_number = divx*divy;
}

DABC.Manager.prototype.NextCell = function()
{
   var id = "#dabc_draw";
   if (this.with_tree) {
      var id = "#draw_place_" + this.table_counter;
      this.table_counter++;
      if (this.table_counter>=this.table_number) this.table_counter = 0;
   }
   $(id).empty();
   return id;
}


DABC.Manager.prototype.FindItem = function(itemname) {
   for (var i in this.arr) {
      if (this.arr[i].itemname == itemname) return this.arr[i];
   }
}

DABC.Manager.prototype.RemoveItem = function(item) {
   var indx = this.arr.indexOf(item);
   if (indx < 0) return;
   this.arr.splice(indx, 1);
   delete item;
}

DABC.Manager.prototype.empty = function() {
   return this.arr.length == 0;
}

// this is used for text request 
DABC.Manager.prototype.NewRequest = function() {
   var req;
   // For Safari, Firefox, and other non-MS browsers
   if (window.XMLHttpRequest) {
      try {
         req = new XMLHttpRequest();
      } catch (e) {
         req = false;
      }
   } else if (window.ActiveXObject) {
      // For Internet Explorer on Windows
      try {
         req = new ActiveXObject("Msxml2.XMLHTTP");
      } catch (e) {
         try {
            req = new ActiveXObject("Microsoft.XMLHTTP");
         } catch (e) {
            req = false;
         }
      }
   }

   return req;
}


DABC.Manager.prototype.NewHttpRequest = function(url, kind, item) {
   
//   var xhrcallback = function(res) {
//      item.RequestCallback(res);
//   }
   
   return JSROOTCore.NewHttpRequest(url, kind, function(res) { item.RequestCallback(res); }); 
}


DABC.Manager.prototype.UpdateComplexFields = function() {
   if (this.empty()) return;

   for (var i in this.arr) 
     this.arr[i].RegularCheck();
}

DABC.Manager.prototype.UpdateAll = function() {
   this.UpdateComplexFields();
}


DABC.Manager.prototype.CanDisplay = function(node)
{
   if (!node) return false;

   var kind = node["dabc:kind"];
   var view = node["dabc:view"];
   if (!kind) return false;

   if (view == "png") return true;
   if (kind == "DABC.Command") return true;
   if (kind == "rate") return true;
   if (kind == "log") return true;
   if (kind.indexOf("FESA.") == 0) return true;
   // if (kind.indexOf("ROOT.") == 0) return true;
   
   return false;
}


DABC.Manager.prototype.DisplayItem = function(itemname, node)
{
   if (!node) node = this.FindNode(itemname);
   if (!node) {
      console.log("cannot find node for item " + itemname);
      return;
   } 
   
   var kind = node["dabc:kind"];
   var history = node["dabc:history"];
   var view = node["dabc:view"];
   if (!kind) kind = "";

   var elem;
   
   if ('_file' in node) {
      elem = new DABC.RootDrawElement(kind.substr(5), true);
      elem.sinfo = null; // no streamer info required
      
      elem.itemname = itemname;
      elem.CreateFrames(this.NextCell(), this.cnt++);
      elem['rootfile'] = node._file;
      
      this.arr.push(elem);
      
      node._file.ReadObject(node._keyname, node._keycycle, -1, function(obj) {
         elem.DrawObject(obj);
      });

      return;
   }
   
   if (view == "png") {
      elem = new DABC.ImageDrawElement();
      elem.itemname = itemname;
      elem.CreateFrames(this.NextCell(), this.cnt++);
      this.arr.push(elem);
      return;
   }
   
   if (kind == "DABC.Command") {
      elem = new DABC.CommandDrawElement();
      elem.itemname = itemname;
      elem.CreateFrames(this.NextCell(), this.cnt++);
      elem.RequestCommand();
      this.arr.push(elem);
      return;
   }

   // ratemeter
   if (kind == "rate") { 
      if ((history == null) || !document.getElementById("show_history").checked) {
         elem = new DABC.GaugeDrawElement();
         elem.itemname = itemname;
         elem.CreateFrames(this.NextCell(), this.cnt++);
         this.arr.push(elem);
         return;
      } else {
         elem = new DABC.RateHistoryDrawElement();
         elem.itemname = itemname;
         elem.CreateFrames(this.NextCell(), this.cnt++);
         this.arr.push(elem);
         return;
      }
   }
   
   if (kind == "log") {
      elem = new DABC.LogDrawElement();
      elem.itemname = itemname;

      if ((history != null) && document.getElementById("show_history").checked) 
         elem.EnableHistory(100);
      
      elem.CreateFrames(this.NextCell(), this.cnt++);
      this.arr.push(elem);
      return;
   }
   
   if (kind.indexOf("FESA.") == 0) {
      elem = new DABC.FesaDrawElement(kind.substr(5));
      elem.itemname = itemname;
      elem.CreateFrames(this.NextCell(), this.cnt++);
      this.arr.push(elem);
      elem.RegularCheck();
      return;
   }

   if (kind.indexOf("ROOT.") == 0) {
      // procesing of ROOT classes
      
      var sinfo = null;
      var use_json = true;
      
      if (!use_json) {
      
         var sinfoname = this.FindMasterName(itemname, node);
         sinfo = this.FindItem(sinfoname);
      
         if (sinfoname && !sinfo) {
            sinfo = new DABC.RootDrawElement(kind.substr(5), use_json);
            sinfo.itemname = sinfoname;
            this.arr.push(sinfo);
            // mark sinfo item as ready - it will not be requested until is not really required
            sinfo.state = sinfo.StateEnum.stReady;
         }
      }

      elem = new DABC.RootDrawElement(kind.substr(5), use_json);
      elem.sinfo = sinfo;
      
      elem.itemname = itemname;
      elem.CreateFrames(this.NextCell(), this.cnt++);
      this.arr.push(elem);

      elem.RegularCheck();
      return;
   }
   
   // create generic draw element, which just shows all attributes 
   elem = new DABC.GenericDrawElement();
   elem.itemname = itemname;
   elem.CreateFrames(this.NextCell(), this.cnt++);
   this.arr.push(elem);
   return elem;
}

DABC.Manager.prototype.display = function(itemname) {
   
   var node = this.FindNode(itemname);
   if (!node) {
      console.log(" cannot find node " + itemname);
      return;
   }

   var elem = this.FindItem(itemname);

   if (elem) {
      elem.ClickItem();
      return;
   }
   
   this.DisplayItem(itemname, node);
}

DABC.Manager.prototype.contextmenu = function(element, event, itemname, nodeid) {

   var xMousePosition = event.clientX + window.pageXOffset;
   var yMousePosition = event.clientY + window.pageYOffset;

   // console.log("Menu for " + itemname + " pos = " + xMousePosition + "," + yMousePosition);
   
   var x = document.getElementById('ctxmenu1');
   if(x) x.parentNode.removeChild(x);
  
   var d = document.createElement('div');
   d.setAttribute('class', 'ctxmenu');
   d.setAttribute('id', 'ctxmenu1');
   element.parentNode.appendChild(d);
   d.style.left = xMousePosition + "px";
   d.style.top = yMousePosition + "px";
   d.onmouseover = function(e) { this.style.cursor = 'pointer'; }
   d.onclick = function(e) { element.parentNode.removeChild(d);  }
   
   document.body.onclick = function(e) { 
      var x = document.getElementById('ctxmenu1');
      if(x) x.parentNode.removeChild(x);
   }

   if (nodeid==0) {
      var p = document.createElement('p');
      d.appendChild(p);
      p.onclick = function() { DABC.mgr.openRootFile("/httpsys/hsimple.root", nodeid); };
      p.setAttribute('class', 'ctxline');
      p.innerHTML = "Open ROOT file";
   } else {
      var p = document.createElement('p');
      d.appendChild(p);
      p.onclick = function() { DABC.mgr.display(itemname); };
      p.setAttribute('class', 'ctxline');
      p.innerHTML = "Draw";
   }
  
   var p2 = document.createElement('p');
   d.appendChild(p2);
   p2.onclick = function() {  
      // var x = document.getElementById('ctxmenu1');
      // if(x) x.parentNode.removeChild(x);
   }; 
   p2.setAttribute('class', 'ctxline');
   p2.innerHTML = "Close";
   
   return false;
}

DABC.Manager.prototype.expand = function(itemname, nodeid) {
   
   var node = this.FindNode(itemname);
   if (!node) {
      console.log(" cannot find node " + itemname);
      return;
   }

   var elem = this.FindItem(itemname);

   if (elem) {
      elem.ClickItem();
      return;
   }
   
   this.ExpandHiearchy(itemname, node, nodeid);
}


DABC.Manager.prototype.ExecuteCommand = function(itemname)
{
   var elem = this.FindItem(itemname);
   if (elem) elem.InvokeCommand();
}


DABC.Manager.prototype.DisplayGeneric = function(itemname, recheck)
{
   var elem = new DABC.GenericDrawElement();
   elem.itemname = itemname;
   elem.CreateFrames(this.NextCell(), this.cnt++);
   if (recheck) elem.recheck = true;
   this.arr.push(elem);
}


DABC.Manager.prototype.DisplayHiearchy = function(holder) {
   var elem = this.FindItem("ObjectsTree");
   
   if (elem) return;

   // console.log(" start2");

   elem = new DABC.HierarchyDrawElement();
   
   elem.itemname = "ObjectsTree";

   elem.CreateFrames(holder, this.cnt++);
   
   this.arr.push(elem);
   
   elem.RegularCheck();
}

DABC.Manager.prototype.ExpandHiearchy = function(itemname, node, nodeid)
{
   if (!node) return;

   var main = this.FindItem("ObjectsTree");
   if (!main) return;
   
   if ('_file' in node) {
      if ((node["dabc:kind"] == 'ROOT.TTree') || (node["dabc:kind"] == 'ROOT.TNtuple')) {
         
         node._file.ReadObject(node._keyname, node._keycycle, -1, function(obj) {
            // here should be display of tree
            
            node._childs = [];
            
            for (var i in obj['fBranches'].arr) {
               var branch = obj['fBranches'].arr[i]; 
               var nb_leaves = branch['fLeaves'].arr.length;
               
               // display branch with only leaf as leaf
               if (nb_leaves == 1 && branch['fLeaves'].arr[0]['fName'] == branch['fName']) {
                  nb_leaves = 0; 
               }
               
               // console.log("name = " + branch['fName'] + " numleavs = " + nb_leaves);
               
               var item = {
                  _name : branch['fName'],  
                  "dabc:kind" : nb_leaves > 0 ? "ROOT.TLeafF" : "ROOT.TBranch",
                   _file : node._file,
                   _tree : obj
               }
               
               node._childs.push(item);
               
               if (nb_leaves > 0) {
                  item._childs = [];
                  for (var j=0; j<nb_leaves; ++j) {
                     var subitem = {
                           _name : branch['fLeaves'].arr[j]['fName'],  
                           "dabc:kind" : "ROOT.TLeafF",
                            _file : node._file,
                            _tree : obj
                        }
                     item._childs.push(subitem);
                  }
               }
               
               if (branch['fBranches'].arr.length > 0) {
                  console.log("Display subbranches as well")
               }

               main.maxnodeid = main.createNode(main.maxnodeid, nodeid, item, itemname);
               
            }
            
            var content = "<p><a href='javascript: DABC.dabc_tree.openAll();'>open all</a> | <a href='javascript: DABC.dabc_tree.closeAll();'>close all</a> | <a href='javascript: DABC.mgr.ReloadTree();'>reload</a> | <a href='javascript: DABC.mgr.ClearWindow();'>clear</a> </p>";
            content += DABC.dabc_tree;
            $("#" + main.frameid).html(content);

         });
      }
      
      return;
   }

   if (nodeid>0) {
      elem = new DABC.HierarchyDrawElement();
   
      elem.itemname = itemname;
      elem.main = main;
      elem.maxnodeid = nodeid;
   
      this.arr.push(elem);
      elem.RegularCheck();
   } else {
      main.CompleteNode(itemname, node, -nodeid);
   }
}


DABC.Manager.prototype.ReloadTree = function() 
{
   var elem = this.FindItem("ObjectsTree");
   if (!elem) return;
   
   elem.ready = false;
   elem.RegularCheck();
}

DABC.Manager.prototype.ClearWindow = function()
{
   $("#dialog").empty();
   
   var elem = null;
   
   if (this.with_tree) {
      elem = this.FindItem("ObjectsTree");
   }

   for (var i=0;i<this.arr.length;i++) {
      if (this.arr[i] == elem) continue;
      this.arr[i].Clear();
   }
   
   this.arr.splice(0, this.arr.length);

   if (!this.with_tree) return;
   
   var num = $("#grid_spinner").spinner( "value" );

   this.arr.push(elem);
   
   this.CreateTable(num,num);
   
   // elem.ready = false;
   // elem.RegularCheck();
}


DABC.Manager.prototype.FindNode = function(itemname) {
   var elem = this.FindItem("ObjectsTree");
   
   return elem ? elem.FindNode(itemname) : null;
}


DABC.Manager.prototype.ReloadSingleElement = function()
{
   if (this.arr.length == 0) return;

   var itemname = this.arr[this.arr.length-1].itemname;
   
   this.ClearWindow();
   
   this.DisplayGeneric(itemname, true);
}


/** \brief Method finds element in structure, which must be loaded before item itself can be loaded
 *   In case of ROOT objects it is StreamerInfo */

DABC.Manager.prototype.FindMasterName = function(itemname, itemnode) {
   if (!itemnode) return;
   
   var master = itemnode.getAttribute("dabc:master");
   if (!master) return;
   
   var lvl = 1; // we need to exclude item name anyway
   while (master.indexOf("../")==0) {
      master = master.substr(3);
      lvl++;
   }
   
   var newname = itemname;
   var currpath = document.location.pathname;

   while (lvl>0) {
      
      var separ = newname.lastIndexOf("/", newname.length - 2);
      
      if ((separ<0)  && (currpath.length>0)) {
         // if itemname too short, try to apply global path
         if ((currpath[currpath.length-1] != '/') && (newname[0] != '/'))
            newname = currpath + "/" + newname;
         else
            newname = currpath + newname;
         currpath = "";
         // console.log("newname = " + newname + " master = " + master); 
         continue;
      }

      if ((newname.length == 0) || (newname == "/")) {
         console.log("Cannot correctly found master for node " + itemname);
         return;
      }
      
      if (separ<0)
         newname = "";
      else
         newname = newname.substr(0, separ+1);
      
      lvl--;
   }
   
   return newname + master + "/";
}


DABC.Manager.prototype.openRootFile = function(filename, nodeid)
{
   if (!DABC.AssertRootPrerequisites()) { 
      console.log("ROOT scripts not yet loaded");
      return;
   }
   var main = this.FindItem("ObjectsTree");
   if (!main) { 
      console.log("not found objects tree"); 
      return; 
   }
   
   function callback(file) {
      console.log("keys length = " + file.fKeys.length);
      
      var folder = { _name : "LocalFiles", _childs : [] };
      
      main.jsondoc._childs.push(folder);
      
      var subfolder = { _name : file.fFileName, "dabc:kind" : "ROOT.TFile", _childs : [] };
      
      folder._childs.push(subfolder);
      
      for (var i in file.fKeys) {
         var key = file.fKeys[i];
         var item = { 
            _name : key['name'] + ";" + key['cycle'],  
            "dabc:kind" : "ROOT." + key['className'],
            _file : file,
            _keyname : key['name'],
            _keycycle : key['cycle']
         };
         
         if ((key['className'] == 'TTree' || key['className'] == 'TNtuple')) {
            item["dabc:more"] = true;
         }
         
         subfolder._childs.push(item);
      }

      main.maxnodeid = main.createNode(main.maxnodeid, 0, folder, "");

      var content = "<p><a href='javascript: DABC.dabc_tree.openAll();'>open all</a> | <a href='javascript: DABC.dabc_tree.closeAll();'>close all</a> | <a href='javascript: DABC.mgr.ReloadTree();'>reload</a> | <a href='javascript: DABC.mgr.ClearWindow();'>clear</a> </p>";
      content += DABC.dabc_tree;
      $("#" + main.frameid).html(content);
      
      // open node which was filled 
      // DABC.dabc_tree.o(0);
      
   }
   
   console.log("loading file " + filename + "  nodeid = " + nodeid);
   
   new JSROOTIO.RootFile(filename, callback);

}


// ============= end of DABC.Manager =============== 
