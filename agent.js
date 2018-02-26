const EventEmitter = require("events");
const os = require("os");
const net = require("net");
const path = require("path");
const socketMessenger = require(path.resolve(__dirname,"./socket_messenger"));
// const cUtil=require(path.resolve(__dirname,'../cutil.js'));
// const circularJSON = require('circular-json');
const fs = require("fs");

// var maxMsgSeq = 2147483647;
// var msgSeq = 0;
// var resetFlag = false;

class Agent extends EventEmitter{
	constructor(options){
		super();
		this.options = options;
		// this.args = process.argv[1];

		// console.log(this.args);

		this.socketPort = this.options["socketPort"];
		this.server = null;
		this.skMessengers = new Map();
		this.appSocket = new Map();

		var t = "ctriputil-agent-" + this.socketPort + ".sock";
		if (os.platform() == 'win32'){
			this.socketPath = '\\\\?\\pipe\\' + t;
		} else {
			this.socketPath = path.resolve(os.tmpdir(), './' + t);
		}


		// this.socketPath = path.resolve(os.tmpdir(), "ctriputil-agent-"+this.socketPort+".sock");

		this.applicationCount = this.options["applicationCount"];

		this.modules = new Map();

		setInterval(()=>{}, 24*60*60*30);
	}

	init(callback){
		// console.log("[agent] start to init agent");
		var server = this.server = net.createServer((socket) => {
	            var skMessenger = new socketMessenger(socket);


	            skMessenger.on("message", (data) => {
	                // console.log("[agent] get socket message data:" + JSON.stringify(data));
	               // console.log("[agent] get socket message data:");
	               // console.log(data["data"]);

	                var action = data.action;
	                switch(action){
	                	case "bind": //app try to bind socket
	                	 	this.skMessengers.set(data["data"]["id"], skMessenger);
	                		this.appSocket.set(data["data"]["id"], socket);
		                    socket.state = "listening";

		                    console.log("[agent] app --> agent : Get socket connect from id#"+data["data"]["id"]);
		                    // console.log("[agent] socket count: " + this.getListeningSocket()["count"]);

		                    if (this.getListeningSocket()["count"] == this.applicationCount) {
		                    	   this.broadcast({
		                    	    	from:"agent",
		                    	    	to: "app",
		                    	    	action:"app-all-ready",
		                    	    	data:{
		                    	    		"status":true
		                    	    	}
		                    	    });
		                        console.log("[agent] agent --> app : All app have connected. The list is " + this.getListeningSocket()["list"]);
		                    }
		                    break;

		           case "execute":
						// console.log("[agent] app --> agent : Execute method" + JSON.stringify(data));
						var d = data["data"];
						var modulePath = d["module"];
						var initOptions = d["initOptions"];
						var mi;

						// console.log("[agent] modules path", modulePath);
						// console.log("[agent] this.modules", this.modules.get(modulePath));
						if(typeof this.modules.get(modulePath) == "undefined"){
							// console.log("[agent] modulePath : ", modulePath);
							var m = require(path.resolve(__dirname, modulePath));
							var mi = new m();
							this.modules.set(modulePath, mi);
						}

						mi = this.modules.get(modulePath);

						// /** update message id**/
						// /** 单独的逻辑处理（后续考虑要做一个hook）**/
						// if(/cat\_worker\.js$/.test(modulePath)){
						// 	data["data"]["executeContent"] = this.updateCatMessageId(d["executeContent"]);
						// }

						mi.emit("message", data);
					
						break;
	                }
	            });

	            socket.on("close", () => {
	                console.log("[agent] socket closed.")
	            });
	        }).listen(this.socketPath, (err) => {
	            if (err) {
	                console.log("[agent] Init master listen error", err);
	                process.exit(1);
	                return false;
	            }
	            callback && callback();
	        });
	}

	getListeningSocket() {
		var workers = this.appSocket;
		const keys = [];
		for (const id of workers.keys()) {
		    if (workers.get(id).state === 'listening') {
		        keys.push(id);
		    }
		}
		return {
			"count":keys.length,
			"list":keys
		};
	}

	broadcast(data){
		var messengers = this.skMessengers;
		for(const id of messengers.keys()){
			messengers.get(id).send(data);
		}
	}

	/**data
	method: "addToQueue", 
	params: [data]
	**/
	// updateCatMessageId(data){
	// 	var content = data["params"][0];
	// 	data["params"][0] = circularId(content);
	// 	return data;
	// }


	exit(){
		// fs.appendFileSync("temp.txt", "[agent] get exit signal to execute exit function\n");
		var modules = this.modules;
		for(const modulePath of modules.keys()){
			var mi = modules.get(modulePath);
			// fs.appendFileSync("temp.txt", "[agent] modulePath is " +modulePath+ "\n");
		           mi.emit("message", {
		           	from:"agent",
		           	to:"app",
		           	action:"execute",
		           	data:{
		   			"executeContent":{
		   				"method":"beforeProcessExit"
		   			}
		           	}
		           });
		}
	}

}

// function circularId(data){
// 	var data = circularJSON.parse(data);
// 	var __messageId = data["__messageId"];
// 	var __hourSeq = data["__hourSeq"];
// 	var __hourStr = data["__hourStr"];

// 	if (__hourSeq!=__hourStr && resetFlag != __hourSeq){
// 		msgSeq=0;
// 		resetFlag = __hourSeq;
// 	}

// 	var arr = __messageId.split("-");
// 	var msg = arr.pop().split("$");

// 	// fs.appendFileSync("temp.txt", (new Date() + "")+"[agent] cat message id is #" + msgSeq + "\n");

// 	if(msg.length == 2){
// 		arr.push(cUtil.fillZero(msg[0] + msgSeq,10));
// 	}

// 	msgSeq++;
// 	if (msgSeq>=maxMsgSeq){
// 		msgSeq = 0;
// 	}

// 	var newData =  updateMsgId(data, arr.join("-"));
	
// 	return circularJSON.stringify(newData);
// }

// function updateMsgId(data, msgId){
// 	data.__messageId = msgId;

// 	var __children = data.__children;
// 	if(__children && __children.length >0){
// 		for(var i=0,l=__children.length; i<l; i++){
// 			data.__children[i] = updateMsgId(__children[i], msgId);
// 		}
// 	}

// 	return data;
// }

module.exports = Agent