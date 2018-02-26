var sec = require("../agent.client.js");
var path = require("path");

console.log("this is a demo");

var i =0;
setInterval(()=>{
    ++i;
    sec.send(
        path.resolve(__dirname, "log_worker.js"),
        {},            
        {
            method:"write",
            params:["send log for @" + i + " times"]    
        }
    );
}, 2000);

/** test crash case */
setTimeout(()=>{
    a.b = "c";
},8000);

