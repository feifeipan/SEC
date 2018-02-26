const EventEmitter = require("events");
var log = require("./log_server.js");

class LogWorker extends EventEmitter{
	constructor(){
		super();

		this.log = null;

		this.on("message", (data)=>{
			//do something when get a message call
			/**let me show you the demo code **/
			try{	
				var _this = this;
				if(data["action"] == "execute"){

					var d = data["data"];

					if(!this.log){
						this.log = log;
					}

					var executeContent = d["executeContent"];
					var method = executeContent["method"];
					var params = executeContent["params"];
					_this.log[method].apply(_this.log, params);
				}
			}catch(e){
				console.log("[Log Core] execute method-" +method+ " error ", e.message);
			}
			/******************************/
			
		});
	}
}

module.exports = LogWorker;