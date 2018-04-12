/**
 * This dialog gathers all potential participants for a specific experiment. In a next stept they'll be matched.
 * @param expData
 * @constructor
 */
var JointExpLobby = function(expData) {
    this.expData = ko.observable(expData);
    this.currentNrOfParticipants = ko.observable(0);
    this.nrOfParticipantsRequired = expData.numPartOfJointExp;
    this.readyToStart = ko.observable(false);
    this.gotMatchedFromServer = ko.observable(false);
    this.nrOfParticipantsReady = ko.observable(0);
    this.waiting = ko.observable(true);

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
    console.log("proceed to lobby...");



    // create new io connection to jointExpServer
    var socketio_host_url = 'http://localhost:8070';
    if (window.location.protocol === "https:") {
        socketio_host_url = document.location.host;
    }

    player.socket = io.connect(socketio_host_url, {
        path: '/jointexperiment'
    });

    console.log('exp id: ' + player.experiment.exp_id());

    player.socket.on('connect',function(){
        console.log('lobby connection established...');
        player.socket.emit('join room', {
            exp_id: player.experiment.exp_id(),
            numPartOfJointExp: player.experiment.exp_data.numPartOfJointExp()
        });
    });

    player.socket.on('room name', function(roomName){
        self.lobbyRoomName = roomName;
        console.log('this room name: ' + roomName);
    });

    player.socket.on('update nr of players', function(nrOfParticipants){
        self.currentNrOfParticipants(nrOfParticipants);

    });

    player.socket.on('matched', function(data) {
        self.gotMatchedFromServer(true);
        console.log('got matched with other participants...');

        // assign role id
        player.experiment.exp_data.varRoleId().value().value(data.role_id);
        console.log('role_id assigned: ' + data.role_id + '...');
    });

    player.socket.on('receive distributed variable', function(data){

        //Extract (set pointers) variable from data...
        var variable = player.experiment.exp_data.entities.byId[data.variable.id];
        var operandValue = data.operandValue;

        // Update local variables...
        var oldValue = variable.value().value();
        variable.value().value(operandValue);

        // debug
        console.log("updated value of (distributed) variable '" + variable.name() + "' from '" + oldValue + "' to '" + operandValue + "' ...");

        // letting the server know that the variable is successfully delivered and changed.
        player.socket.emit("received distribution response",
            {
                variable:
                    {
                        name: variable.name(),
                        id: variable.id()
                    }
            });
    });

    player.socket.on('start next frame', function(){
        $("#waitForSyncDiv").remove();
        player.startNextPageOrFrameOriginal();
    });

    player.socket.on('show wait message', function(){
        console.log('waiting for other participants (wait for trial order or next frame synchronized)');
        var waitForSyncDiv = $("<div/>");
        waitForSyncDiv.text("Waiting for other participants...");
        waitForSyncDiv.attr("id", "waitForSyncDiv");
        waitForSyncDiv.css("font-style", "italic").css("font-weight", "bold").css("text-align", "center").css("padding-top", "200px");
        $("#experimentTree").prepend(waitForSyncDiv);
    });

    player.socket.on('receive trial order from server', function(trialOrderData){
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
            player.randomizedTrials = [];
            player.randomizedTrials.push(randomizedTrialsEntry);
        }

        player.startFirstTrialInitialization();
    });
    
    player.socket.on('stop waiting', function(){
        self.waiting(false);
    });

    player.socket.on('start waiting', function(){
        self.readyToStart(false);
        self.waiting(true);
    });

    player.socket.on('distribution allowed', function(){
        console.log('distribution allowed from server...');
        //TODO create an action to respond to allowance (in order to e. g. play a sound)
    });

    player.socket.on('distribution declined', function(){
        console.log('distribution declined from server...');
        //TODO create an action to respond to declination (in order to e. g. play a sound)
    });

    player.socket.on('abort', function(){
        console.log('Lost connection to other participants.');
        player.finishSessionWithError("Connection lost to another participant. Experiment aborted!");
    });
};

/**
 * Lets the server know about the readiness status.
 */
JointExpLobby.prototype.emitReadiness = function(){

    console.log('letting server know readiness status...');
    player.socket.emit('update readiness');
    return true; // necessary for checkbox!
};
