const EventEmitter = require("events");
const os = require("os");
const net = require("net");
const path = require("path");
const Agent = require("./agent");
var fs = require("fs");
var graceful = require("./graceful");
const L = require('console-file-log');
const logger = L({"append":true});
// require(path.resolve(__dirname, '../thrift/patch.js'));

var agent_worker = new Agent({
	socketPort: process.argv[2],
	applicationCount: process.argv[3]
});


agent_worker.init((err)=>{
	var status = true;
	if(err){
		// console.log("[agent_worker] init failed" + err);
		status = false;
	}
	process.send && process.send({status, err});

});


graceful({
	killTimeout:180000,
	callback: function(){
		logger.info("graceful callback");
		 agent_worker.exit({
                    	    	from:"agent",
                    	    	to: "app",
                    	    	action:"app-all-ready",
                    	    	data:{
                    	    		"status":true
                    	    	}
                    	});
	}
});
