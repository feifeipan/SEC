var fs = require("fs");

class log{
    constructor(){
        this.file = "log.txt";
    }

    ts(){
        var d = new Date();
        return "["+[d.getFullYear(), d.getMonth(), d.getDate()].join("-") + " " + [d.getHours(), d.getMinutes(), d.getSeconds()].join(":")+"] "
    }

    write(content){
        var _this = this;
        fs.appendFileSync(this.file, this.ts()+content+"\n");
    }

    beforeProcessExit(){
        var _this = this;
        fs.appendFileSync(this.file, this.ts()+"get exit signal\n")
    }
}

module.exports = new log();