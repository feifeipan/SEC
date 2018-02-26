const EventEmitter = require("events");

var spliter = new Buffer('\r\n');

class socketMessenger extends EventEmitter {
    constructor(socket) {
        super();
        this.socket = socket;
        this.buffer = new Buffer(0);
        this.init();

    }

    init() {
        this.socket.on("data", (buff) => {
            //app -> agent
            this.buffer = Buffer.concat([this.buffer, buff]);
            var idx = -1;
            while ((idx = this.buffer.indexOf(spliter)) != -1) {
                var msgBuff = this.buffer.slice(0, idx);
                this.buffer = this.buffer.slice(idx + spliter.length);
                var msg = null;
                try {
                    msg = JSON.parse(msgBuff.toString());
                } catch (e) {
                    console.log("[main] socket on data parse error", e);
                };

                // console.log("[main] socket message data:" + JSON.stringify(msg));

                if (msg) {
                    this.emit("message", msg);
                }
            }
        });
    }

    send(data) {
    	this.socket.write(Buffer.from(JSON.stringify(data)));
	this.socket.write(spliter);
    }

}

module.exports = socketMessenger;
