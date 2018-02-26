const EventEmitter = require("events");
const os = require("os");
const net = require("net");
const path = require("path");
const cluster = require("cluster");
const fs = require("fs");
const child_process = require("child_process");

const socketMessenger = require("./socket_messenger");

const L = require('console-file-log');
const logger = L({"append":true});

// var appConfig=require(path.resolve(__dirname,'../appConfig.js'));

class AgentClient extends EventEmitter {
    constructor(options) {
        super();

        // this.options = {
        //     configdir: appConfig["ConfigDir"]
        // };

        console.log("====options===", JSON.stringify(this.options));


        var insVar = process.env.instance_var || 'NODE_APP_INSTANCE';
        this.usePm2 = process.env.hasOwnProperty(insVar);
        this.name = process.env.name || 'Unknown';
        this.buffer = new Buffer(0);

        this.isCluster = cluster.isWorker;
        this.id = parseInt(process.env[insVar], 10) || 0; //pm2的id
        this.isMaster = this.id == 0;
        this.isWorker = !this.isMaster;

        this.isMasterProcess = !this.isCluster || this.isCluster && this.isMaster;

        /**get pm2 cluster process count**/
        this.applicationCount = 1;
        if (this.usePm2 && this.isMasterProcess) {
            if (process.env.hasOwnProperty('instances')) {
                this.applicationCount = parseInt(process.env.instances, 10);
                if (!this.applicationCount) {
                    this._getInstancesCount();
                }
            } else {
                this._getInstancesCount();
            }
        }

        this.randomPort = 0;
        this.randomPortServer = null;
        this.socketPath;
        this.masterSocket = null;

        this.vMaster = null; //选取一个特殊的process作为master
        this.vApplication = null; //其余作为app
        this.vAgent = null; //代理，仅负责收发数据
        this.appSocket = new Map();

        this.agentWorkerId = 0;
        this.isApplicationStarted = false; //是否此app已经启动
        this.isAllAppWorkerStarted = false; //所有的app是否都已启动
        this.isAgentStarted = false; //agent是否已经启动

        this.skMessenger = null;

        this.agentPath = path.resolve(__dirname, "agent_worker.js");
        this.pm2Instance = path.resolve(__dirname, "pm2Instance.js");

        this.tryCount = 0;
        this.Q = [];

        // this.initialized = false;
        this.init();

        this.closed = false;
        this.platformIsWin = os.platform == "win32" ? true : false;


        //处理退出事件  参考自egg-cluster
        // https://nodejs.org/api/process.html#process_signal_events
        // kill(2) Ctrl-C
        process.once('SIGINT', this.onSignal.bind(this, 'SIGINT'));
        // kill(3) Ctrl-\
        process.once('SIGQUIT', this.onSignal.bind(this, 'SIGQUIT'));
        // kill(15) default
        process.once('SIGTERM', this.onSignal.bind(this, 'SIGTERM'));

        process.once('exit', this.onExit.bind(this));

    }

    init() {

        // if(!this.initialized){
        this.initSocketPort(() => {
            var t = "ctriputil-agent-" + this.randomPort + ".sock";
            if (os.platform() == 'win32') {
                this.socketPath = '\\\\?\\pipe\\' + t;
            } else {
                this.socketPath = path.resolve(os.tmpdir(), './' + t);
            }

            // this.socketPath = path.resolve(os.tmpdir(), );

            if (this.isMasterProcess) {
                //初始化agent
                console.log("[main] Master start to init agent process");

                if (os.platform() != "win32" && fs.existsSync(this.socketPath)) {
                    console.log("[main] Socketpath exsits, try to delete.", this.randomPort);
                    fs.unlinkSync(this.socketPath);
                }
                this.initAgentProcess();
            } else {
                console.log("[main] App#" + this.id + " start to connect agent");
                this.initAppConnection();
            }
        });

        this.initialized = true;
    }

    // }

    _getInstancesCount() {
        console.log('[main] Get fork instance count');
        var procOut = '';
        try {
            procOut = child_process.spawnSync(process.execPath, [this.pm2Instance, this.name], {
                maxBuffer: 5 * 1024 * 1024
            }).stdout.toString().trim();

            console.log("[main] procOut ", procOut);
        } catch (e) {

        }

        var json = null;
        try {
            json = JSON.parse(procOut);
        } catch (e) {
            console.log("[main] Json error " + e);
        };

        if (json) {
            if (json.code) {
                throw new Error(json.message);
            } else {
                this.applicationCount = json.data.length;
            }
        } else {
            console.log('[main] Invalid PM2 Instances');
            throw new Error('[main] Invalid PM2 Instances');
        }
    }

    initSocketPort(callback) {
        var server = this.randomPortServer = net.createServer().listen(0, (err) => {
            if (err) {
                console.log("[main] Init socket port error", err);
                process.exit(1);
                return;
            }

            var randomPort = this.randomPort = this.randomPortServer.address().port;

            callback && callback();
        });
    }

    initAgentProcess() {
        // process.env["configdir"] = this.options.configdir;

        var vAgent = this.vAgent = child_process.fork(this.agentPath, [this.randomPort, this.applicationCount], {
            detached:true,
            cwd: process.cwd(),
            env: process.env,
            shell: true,
            // stdio: ['pipe', 'pipe', 'pipe', 'ipc']
            stdio: "ignore"
        });

        //get message to start master process
        vAgent.on("message", (data) => {
            console.log(data);
            console.log("[main] agent --> app#" + this.id + " get message " + JSON.stringify(data));

            if (data["status"]) {
                this.isAgentStarted = true;
                this.initAppConnection();
            } else {
                console.log("[main] Fork agent process failed(message):" + err);
                process.exit(1);
            }
        });

        vAgent.on("error", (err) => {
            console.log("[main] Fork agent process failed" + err);
        });

        vAgent.on("exit", (code, signal) => {
            console.log("[main] Fork agent process exit " + signal);
        });

        vAgent.on("close", (code) => {
            console.log("[main] Fork agent process close with code " + code);
        });


        // vAgent.stdout.on('data', (data) => {
        //     console.log(`stdout: ${data}`);
        // });
        //
        // vAgent.stderr.on('data', (data) => {
        //     console.log(`stderr: ${data}`);
        // });
    }

    retryAppConnection() {
        if (this.tryCount >= 3) { //如果重试了三次之后，仍然失败，则默认为agent已经挂掉，需要重新创建agent
            this.tryCount = 0;
            this.init();
            return false;
        }

        this.tryCount += 1;

        setTimeout(() => {
            console.log("[main] appid #" + this.id + " try connect agent socket again @" + this.tryCount + " times");
            this.initAppConnection();
        }, 500);
    }

    initAppConnection() {

        if (!fs.existsSync(this.socketPath)) {
            this.retryAppConnection();
            return false;
        }

        // this.socketPath = "/temp/ddddd.sock";
        var vApplication = this.vApplication = net.createConnection(this.socketPath, (err) => {
            if (err) {
                console.log("[main] Init app connect failed " + err);
                this.retryAppConnection();
            } else {
                this.isApplicationStarted = true;
                this.tryCount = 0;


                this.skMessenger = new socketMessenger(vApplication);

                this.skMessenger.send({
                    from: "app",
                    to: "agent",
                    action: "bind",
                    data: {
                        "id": this.id,
                        "message": ""
                    }
                });

                //一旦socket连接成功，则检查Q里是否有数据
                this.Q.forEach((item, index) => {
                    this.skMessenger.send(item);
                });

                this.Q = [];


                //application on message
                this.skMessenger.on("message", (data) => {
                    var action = data.action;
                    switch (action) {
                        case "app-all-ready":
                            this.isAllAppWorkerStarted = true;
                            console.log("[main] agent --> app#" + this.id + " get message **all connected to agent**");
                            break;
                        default:
                            console.log("[main] agent --> app#" + this.id + " get message  " + JSON.stringify(data));
                            break;
                    }

                });
            }
        });


        vApplication.on("error", (err) => {
            console.log("[main] Application #" + this.id + " connection error " + err);
        });

        vApplication.on("exit", (code, signal) => {
            console.log("[main] Application #" + this.id + " connection exit " + signal);
        });

        vApplication.on("close", (had_error) => {
            console.log("[main] Application #" + this.id + " connection close with error:" + had_error);
            if (!had_error) {
                console.log("application exit");
            } else {
                this.retryAppConnection();
            }

        });
    }

    send(module, initOptions, executeContent) {
        if (this.Q.length >= 10) {
            console.log("[agent.client] Q has too may data, please check it out.")
        }

        var item = {
            from: "app",
            to: "agent",
            action: "execute",
            data: {
                module,
                initOptions,
                executeContent
            },
            pid: this.id
        };

        if (!this.isApplicationStarted) {
            this.Q.push(item);
        } else {
            this.skMessenger.send(item);
        }

    }

    onSignal(signal) {
        if (this.closed) return;

        console.info('[master] receive signal %s, closing', signal);
        this.close();
    }

    onExit(code) {
        // istanbul can't cover here
        // https://github.com/gotwarlost/istanbul/issues/567
        const level = code === 0 ? 'info' : 'error';
        console[level]('[master] exit with code:%s', code);
        this.close();
    }

    close() {
        this.closed = true;

        this.killAgentWorker();
        // sleep 100ms to make sure SIGTERM send to the child processes
        console.log('[master] send kill SIGTERM to app workers and agent worker, will exit with code:0 after 100ms');
        setTimeout(() => {
            console.log('[master] close done, exiting with code:0');
            process.exit(100);
        }, 10000)
    }

    killAgentWorker() {
        if (this.vAgent) {
            if (this.platformIsWin) {

                var pid = this.vAgentPid;
                var f = os.arch() == "x64" ? "kill64.exe" : "kill.exe";

                var killCmd = path.resolve(__dirname, "windows-signal/" + f);
                console.log("==killCmd==", killCmd);

                //only 2 signals(SIGINT and SIGBREAK) are supported on windows platform
                if (signal != "SIGINT") {
                    signal = "SIGBREAK";
                }
                // killCmd+' -SIGBREAK '+pid
                var bat = child_process.spawnSync(killCmd, ['-' + signal, pid]);

            } else {
                console.log('[master] kill agent worker with signal SIGTERM');
                this.vAgent.removeAllListeners();
                this.vAgent.kill('SIGTERM');
                if (os.platform() != "win32" && fs.existsSync(this.socketPath)) {
                    console.log("[main] delete socketpath in killAgentWorker.", this.randomPort);
                    fs.unlinkSync(this.socketPath);
                }
            }
        }
    }
}

module.exports = new AgentClient();
