/**
 * This dialog gathers all potential participants for a specific experiment. In a next stept they'll be matched.
 * @param expData
 * @constructor
 */
var JointExpLobby = function(expData) {
    var self = this;

    this.expData = ko.observable(expData);
    this.currentNrOfParticipants = ko.observable(0);
    this.nrOfParticipantsRequired = expData.numPartOfJointExp;
    this.readyToStart = ko.observable(false);

    this.readyToStart.subscribe(function(newVal) {
        console.log("readyToStart="+newVal);
    });

    this.readyToStartCheckbox = ko.pureComputed({
        read: this.readyToStart,
        write: function (value) {
            self.readyToStart(value);
            self.emitReadiness(value);
        },
        owner: this
    });

    this.gotMatchedFromServer = ko.observable(false);
    this.nrOfParticipantsReady = ko.observable(0);
    this.waiting = ko.observable(true);

    this.totalPings = 10;
    this.pingTestInProgress = ko.observable(false);
    this.pingTestCounter = ko.observable(0);
    this.pingTestProgressPercent = ko.observable(0);
    this.pingTestFailed = ko.observable(false);

    this.reconnectCountdown = 120;
    this.reconnectCountdownHandle = null;

    this.socket = null;

    /**
    this.nrOfParticipantsMissing = ko.computed(function(){
        return this.nrOfParticipantsRequired() - this.currentNrOfParticipants();
    }, this);*/

    // TODO: check for race conditions ?
    this.ok = ko.computed(function(){
        return this.readyToStart();
    }, this);
};

/**
 * Create listeners in case enough players are in the lobby.
 */
JointExpLobby.prototype.initSocketAndListeners = function() {

    var self = this;

    console.log("experiment is joint experiment.");
    console.log("number of required participants (total): " + self.expData().numPartOfJointExp());


    // create new io connection to jointExpServer
    var socketio_host_url = document.location.hostname+":8070"; // 'http://localhost:8070';
    if (window.location.protocol === "https:") {
        socketio_host_url = document.location.host;
    }

    this.socket = io.connect(socketio_host_url, {
        path: '/jointexperiment'
    });

    console.log('exp id: ' + player.experiment.exp_id());


    var pingStats = {
        sum: 0,
        num: 0,
        max: 0,
        min: Infinity
    };

    function run_ping_test() {
        var startTime = new Date();
        self.socket.emit('pingTest', null, function () {
            var endTime = new Date();
            var timeDiff = endTime - startTime; //in ms
            console.log("new ping "+timeDiff);
            pingStats.sum += timeDiff;
            pingStats.num += 1;
            self.pingTestCounter(pingStats.num);

            if (pingStats.min > timeDiff) {
                pingStats.min = timeDiff;
            }

            if (pingStats.max < timeDiff) {
                pingStats.max = timeDiff;
            }

            self.pingTestProgressPercent(Math.round(100 * pingStats.num / self.totalPings));

            if (self.pingTestFailed()) {
                return;
            }

            if (pingStats.num >= self.totalPings) {
                pingStats.avg = pingStats.sum / pingStats.num;
                self.socket.emit('submitPingResult', pingStats, function () {
                    self.pingTestInProgress(false);
                    if (pingStats.avg < self.expData().studySettings.multiUserMaxAvgPingAllowed() && pingStats.max < self.expData().studySettings.multiUserMaxPingAllowed()) {
                        join_lobby();
                    }
                    else {
                        player.finishSessionWithError("The experiment failed, because of a bad internet connection (bad ping). Please use a faster internet connection to participate in this study.")
                    }
                });
            }
            else {
                setTimeout(function() {
                    run_ping_test()
                }, 3000);
            }
        });
    }

    function join_lobby() {
        console.log('lobby connection established...');
        self.socket.emit('join room', {
            expSessionNr: player.expSessionNr,
            exp_id: player.experiment.exp_id(),
            numPartOfJointExp: player.experiment.exp_data.numPartOfJointExp(),
            multiUserAllowReconnect: player.experiment.exp_data.studySettings.multiUserAllowReconnect(),
            multiUserReconnectTimeout: player.experiment.exp_data.studySettings.multiUserReconnectTimeout(),
            multiUserPauseAfter: player.experiment.exp_data.studySettings.multiUserPauseAfter()
        });
    }

    this.socket.on('connect',function(){
        console.log("socket connected...");

        if (self.pingTestFailed()) {
            console.log("previous ping test failed... therefore exit and do nothing..");
            return;
        }

        if (self.gotMatchedFromServer()) {
            // experiment was already running...
            console.log("try to continue running experiment");
            self.socket.emit('reconnectExpSessionNr', player.expSessionNr, function(success) {
                if (success) {
                    console.log("success reconnect to running experiment. waiting for continue signal from server...");
                }
                else {
                    player.finishSessionWithError("The experiment was terminated because your connection to the server was lost for too long... Please check your internet connection.")
                }
            });
        }
        else {
            // this is an initial connection:
            if (self.expData().studySettings.multiUserCheckPing()) {
                self.pingTestInProgress(true);
                run_ping_test();
            }
            else {
                self.pingTestProgressPercent(100);
                join_lobby();
            }
        }

    });

    this.socket.on('error', function(error) {
        console.log("socket error...");
        report_error_to_server("jointExp socket.io error "+error.msg, "", "", "", error);
    });

    function pauseExpDueToLostConnectivity() {
        player.pauseExperiment("The experiment was paused because you lost the connection to the experiment server. Please check your internet connection and wait until the connection is reestablished. Time Left: <span id='timeLeftForReconnect'></span>");
        self.updateReconnectCountdown(self.expData().studySettings.multiUserReconnectTimeout(), function () {
            player.finishSessionWithError("Failed to reconnect to the experiment. Please check your internet connection.");
        });
    }

    this.socket.on('disconnect', function (reason){
        console.log( "socket.io disconnected...");
        if (self.pingTestInProgress()) {
            console.log( "ping test failed because the socket disconnected.");
            self.pingTestFailed(true);
            player.finishSessionWithError("Your internet connection or your browser does not support a stable websocket connection. Therefore the experiment failed. Please use a more stable internet connection or more modern browser to participate in this study.")
        }
        else if (self.gotMatchedFromServer()) {
            console.log("disconnected during running experiment session... pause player until reconnect...");
            pauseExpDueToLostConnectivity();
        }
    });

    this.socket.on('reconnect', function () {
        console.log('you have been reconnected');
    });

    this.socket.on('room name', function(roomName){
        self.lobbyRoomName = roomName;
        console.log('this room name: ' + roomName);
    });

    this.socket.on('update nr of players', function(nrOfParticipants){
        self.currentNrOfParticipants(nrOfParticipants);

    });

    this.socket.on('matched', function(data) {
        self.gotMatchedFromServer(true);
        console.log('got matched with other participants...');

        // assign role id
        player.experiment.exp_data.varRoleId().value().value(data.role_id);
        console.log('role_id assigned: ' + data.role_id + '...');
    });

    this.socket.on('receive distributed variable', function(data){
        checkContinue();

        //Extract (set pointers) variable from data...
        var variable = player.experiment.exp_data.entities.byId[data.variable.id];
        var operandValue = data.operandValue;

        // Update local variables...
        var oldValue = variable.value().value();
        variable.value().value(operandValue);

        // debug
        console.log("updated value of (distributed) variable '" + variable.name() + "' from '" + oldValue + "' to '" + operandValue + "' ...");

        // letting the server know that the variable is successfully delivered and changed.
        self.socket.emit("received distribution response",
            {
                variable:
                    {
                        name: variable.name(),
                        id: variable.id()
                    }
            });
    });

    this.socket.on('start next frame', function(){
        checkContinue();
        $("#waitForSyncDiv").remove();
        console.log("joint exp received command: start next frame")
        player.startNextPageOrFrameOriginal();
    });

    this.socket.on('show wait message', function(){
        checkContinue();
        console.log('waiting for other participants (wait for trial order or next frame synchronized)');
        var waitForSyncDiv = $("<div/>");
        waitForSyncDiv.text("Waiting for other participants...");
        waitForSyncDiv.attr("id", "waitForSyncDiv");
        waitForSyncDiv.css("font-style", "italic").css("font-weight", "bold").css("text-align", "center").css("padding-top", "200px");
        $("#experimentTree").prepend(waitForSyncDiv);
    });

    this.socket.on('receive trial order from server', function(trialOrderData){
        checkContinue();
        $("#waitForSyncDiv").remove();

        console.log('sync trial order...');
        player.randomizedTrials = [];

        for(var i=0; i<trialOrderData.length; i++){

            // create relevant randomizedTrials entry for further enrichment.
            var randomizedTrialsEntry = {
                type: 'trialVariation',
                trialVariation: player.currentTask.factorGroups()[trialOrderData[i].posFactorGroup].conditionsLinear()[trialOrderData[i].posCondition].trials()[trialOrderData[i].posTrialVariation],
            };

            // enrichment.
            player.currentTask.completeSelectionSpec(randomizedTrialsEntry);

            // add to randomizedTrials.
            player.randomizedTrials.push(randomizedTrialsEntry);
        }

        // continue with initialization process.
        player.startFirstTrialInitialization();
    });

    var last_pong = Date.now();
    setInterval(function() {
        if (!self.pausedDueToNoConnectivity) {
            var time_since_pong = Date.now() - last_pong;
            if (time_since_pong > 1000 * self.expData().studySettings.multiUserPauseAfter()) {
                console.log("no pong received since " + time_since_pong + " ms.")
                self.pausedDueToNoConnectivity = true;
                pauseExpDueToLostConnectivity();
            }
        }
    }, 1000);

    function checkContinue() {
        if (self.pausedDueToNoConnectivity) {
            console.log("connectivity reestablished..");
            self.pausedDueToNoConnectivity = false;
            self.cancelReconnectCountdown();
            player.continueExperiment();
        }
    }

    this.socket.on('pong', function(){
        last_pong = Date.now();
        checkContinue();
    });

    this.socket.on('stop waiting', function(){
        self.waiting(false);
    });

    this.socket.on('start waiting', function(){
        self.readyToStart(false);
        self.waiting(true);
    });

    this.socket.on('distribution allowed', function(){
        checkContinue();
        console.log('distribution allowed from server...');
        //TODO create an action to respond to allowance (in order to e. g. play a sound)
    });

    this.socket.on('distribution declined', function(){
        checkContinue();
        console.log('distribution declined from server...');
        //TODO create an action to respond to declination (in order to e. g. play a sound)
    });

    this.socket.on('pause', function(){
        checkContinue();
        console.log('Lost connection to other participants. Pause until all are in again...');
        player.pauseExperiment("The experiment was paused because another participant lost the connection to the experiment server. Please wait until the connection is reestablished. Time Left: <span id='timeLeftForReconnect'></span>");
        self.updateReconnectCountdown(self.expData().studySettings.multiUserReconnectTimeout(), function() {
            // do nothing here, because this is handled by the abort signal sent from the server...
        })
    });

    this.socket.on('continue', function(){
        last_pong = Date.now();
        checkContinue();
        console.log('All participants are in again... Continue...');
        self.cancelReconnectCountdown();
        player.continueExperiment();
    });

    this.socket.on('abort', function(){
        checkContinue();
        console.log('Lost connection to other participants.');
        if (player.experiment.exp_data.studySettings.multiUserOnLeaveAction()=="Finish Study With Error"){
            player.finishSessionWithError("Connection lost to another participant. Experiment aborted!");
        }
        else if (player.experiment.exp_data.studySettings.multiUserOnLeaveAction()=="Finish Study Correctly"){
            player.finishSession("Connection lost to another participant. You finished the study correctly.");
        }

    });
};

/**
 * Lets the server know about the readiness status.
 */
JointExpLobby.prototype.emitReadiness = function(readyToStart){

    console.log('letting server know readiness status: '+readyToStart);
    this.socket.emit('update readiness', readyToStart);
    return true; // necessary for checkbox!
};

JointExpLobby.prototype.updateReconnectCountdown = function(secToWait, onFinished){

    if (this.reconnectCountdownHandle) {
        // updater is already running
        return;
    }
    var self = this;
    this.reconnectCountdown = secToWait;

    function update() {
        self.reconnectCountdown -= 1;
        $("#timeLeftForReconnect").text(""+self.reconnectCountdown);
        if (self.reconnectCountdown == 0) {
            clearInterval(self.reconnectCountdownHandle);
            self.reconnectCountdownHandle = null;
            onFinished();
        }
    }

    this.reconnectCountdownHandle = setInterval(update, 1000);
    update();

};

JointExpLobby.prototype.cancelReconnectCountdown = function(){
    if (this.reconnectCountdownHandle) {
        clearInterval(this.reconnectCountdownHandle);
        this.reconnectCountdownHandle = null;
    }
};

JointExpLobby.prototype.distributeVariable = function(variable, operandValueToSend, playersToDistributeToArray, blockVarUntilDone){
    this.socket.emit('distribute variable',
        {
            variable:  {name: variable.name(), id: variable.id()},
            operandValue: operandValueToSend,
            playersToDistributeTo: playersToDistributeToArray,
            blockVarUntilDone: blockVarUntilDone
        }
    );
};

JointExpLobby.prototype.syncNextFrame = function(frame_nr, trial_nr){
    this.socket.emit("sync next frame", {
        frame_nr: frame_nr,
        trial_nr: trial_nr
    });
};

JointExpLobby.prototype.submitTrialOrder = function(trialOrderData, currentTaskIdx){
    this.socket.emit('submit trial order', {
        trialOrderData: trialOrderData,
        taskIdx: currentTaskIdx
    });
};

JointExpLobby.prototype.experimentFinished = function(){
    this.socket.emit('experiment finished');
};
