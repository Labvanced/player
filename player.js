// copyright by Caspar Goeke and Holger Finger

var Player = function() {
    var self = this;

    //this.expId = location.search.split('id=')[1];
    this.expId = location.search.split("&")[0].replace("?","").split("=")[1];

    this.experiment = null;
    this.sessionNr = 0;
    this.groupNr = 0;

    this.blocks = null;

    this.currentBlock = null;
    this.currentBlockIdx = -1;

    this.currentTask = null;
    this.currentTaskIdx = -1;

    this.currentTrialIdx = null;
    this.currentTrialSelection = null;
    this.randomizedTrials = [];
    this.trialIter = "init"; // or "waitForStart" or 0,1,2,..
    this.currentTrialDiv = null;
    this.currentTrialFrames = null;
    this.currentSequence = null;

    this.currentFrame = null;
    this.currentFrameIdx = -1

    this.webcamLoaded = false;
    this.variablesToReset = [];

    Webcam.on("error", function(err_msg){
        console.log("webcam error: "+err_msg);
        self.finishSessionWithError(err_msg);
    });

    console.log("requesting experiment with id "+this.expId+" from server.");

    var parameters = { expId: this.expId };

    createExpDesignComponents(function() {
        $.get('/startExpPlayer', parameters, function(data){
            if (data.hasOwnProperty('success') && data.success == false) {
                queue.cancel();
                self.finishSessionWithError("This experiment does not exist!");
                return;
            }
            console.log("expection.factorseriment spec loaded from server.");
            self.sessionNr = 0;//data.sessionNr; //TODO: work around for testing: starting always with first session.
            self.groupNr = data.groupNr;
            self.experiment = new Experiment().fromJS(data.expData);
            self.experiment.setPointers();

            var expPrev =  new ExperimentPreview(self.experiment);
            var newContent = jQuery('<div/>');
            newContent.load("/html_views/experimentPreview.html", function () {
                newContent.prependTo('#expPreview');
                ko.applyBindings(expPrev, newContent[0]);
                expPrev.init(950,400);
            });

            console.log("experiment deserialized.");

            self.blocks = self.experiment.exp_data.availableGroups()[self.groupNr].sessions()[self.sessionNr].blocks();
        });
    });

};


Player.prototype.startNextBlock = function() {
    this.currentBlockIdx++;
    if (this.blocks.length <= this.currentBlockIdx){
        console.log("experiment session finished");
        this.finishSession();
    }
    else {
        console.log("starting block "+this.currentBlockIdx);
        this.currentBlock = this.blocks[this.currentBlockIdx];
        this.currentTaskIdx = -1;
        this.startNextTask();
    }
};

Player.prototype.startNextTask = function() {
    var self = this;

    this.currentTaskIdx++;
    this.currentTask = this.currentBlock.subTasks()[this.currentTaskIdx];

    if (this.currentTask){
        // start initialization of trials: Randomization and Preloading:
        this.trialIter = "init";
        console.log("start initialization of trials: Randomization and Preloading");

        if (this.currentTask.webcamEnabled() && !this.webcamLoaded){
            Webcam.attach("#my_camera");
            Webcam.on("load", function() {
                Webcam.off("load");
                console.log("webcam loaded");
                self.webcamLoaded = true;
                setTimeout(function(){
                    self.startNextTask();
                }, 1000);
            });
            return;
        }

        // create array with variables that need to be reset after each trial: (the actual reset is done further below)
        var allFrameDataInTrial = this.currentTask.subSequence().elements();
        this.variablesToReset = [];
        this.variablesToRecord = [];
        var variablesToResetById = {};
        var variablesToRecordById = {};
        for (var i=0; i<allFrameDataInTrial.length; i++){
            var allVariablesInFrame = allFrameDataInTrial[i].localWorkspaceVars();
            for (var j=0; j<allVariablesInFrame.length; j++){
                if (allVariablesInFrame[j].resetAtTrialStart()) {
                    var id = allVariablesInFrame[j].id();
                    if (!variablesToResetById.hasOwnProperty(id)) {
                        variablesToResetById[id] = true;
                        this.variablesToReset.push(allVariablesInFrame[j]);
                    }
                }
                if (allVariablesInFrame[j].recordAtTrialEnd()) {
                    var id = allVariablesInFrame[j].id();
                    if (!variablesToRecordById.hasOwnProperty(id)) {
                        variablesToRecordById[id] = true;
                        this.variablesToRecord.push(allVariablesInFrame[j]);
                    }
                }
            }
        }

        this.randomizedTrials = this.currentTask.getRandomizedTrials();

        console.log("randomization finished... start first trial initialization...");
        this.addTrialViews(0, this.currentTask);

        self.trialIter = "waitForStart";
        self.startRecordingsOfNewTask();

        if (this.currentTask.displayInitialCountdown()) {
            $('#countdownSection').show();
            $('#countdown').text("3");
            setTimeout(function () {
                $('#countdown').text("2");
            }, 1000);
            setTimeout(function () {
                $('#countdown').text("1");
            }, 2000);
            setTimeout(function () {
                $('#countdownSection').hide();
                self.startNextTrial();
            }, 3000);
        }
        else {
            $('#countdownSection').show();
            $('#countdown').text("preloading task");
            setTimeout(function () {
                $('#countdownSection').hide();
                self.startNextTrial();
            }, 500);
        }
    }
    else{
        this.startNextBlock();
    }

};

Player.prototype.startRecordingsOfNewTask = function() {
    var recordData = {
        blockNr: this.currentBlockIdx,
        blockId: this.currentBlock.id(),
        taskNr: this.currentTaskIdx,
        taskId: this.currentTask.id()
    };
    $.post('/recordStartTask', recordData);
};

Player.prototype.recordData = function() {

    // record variables at end of trial:
    var recData = new RecData();

    // still hard coded variables
    this.currentTask.trialTypeIdVar().recValue = ko.observable(this.currentTrialIdx); // condition? needs to be correctly computed
    this.currentTask.trialUniqueIdVar().recValue = ko.observable(this.currentTrialIdx); // trial id
    this.currentTask.trialOrderVar().recValue = ko.observable(this.trialIter); // trial iteration in current session

    recData.addRecording(this.currentTask.trialTypeIdVar());
    recData.addRecording(this.currentTask.trialOrderVar());
    recData.addRecording(this.currentTask.trialUniqueIdVar());

    // new, dynamic verison
    for (var i=0; i<this.variablesToRecord.length; i++){
        recData.addRecording(this.variablesToRecord[i]);
    }

    // server command
    var recordedData = {
        trialNr: this.trialIter,
        recData: recData.toJS()
    };
    $.post('/recordTrial', recordedData);
};


Player.prototype.startNextTrial = function() {
    var self = this;

    if (this.trialIter == "waitForStart") {
        this.trialIter = 0;
    }
    else {
        this.recordData();
        // start next trial:
        this.trialIter++;
    }

    if (this.trialIter >= this.randomizedTrials.length) {
        // trial loop finished:
        console.log("trial loop finished");
        this.trialIter = "init"; // reset to init so that another trial loop in another block will start from the beginning

        if (this.webcamLoaded){
            console.log("removing webcam");
            Webcam.reset();
            this.webcamLoaded = false;
        }

        self.startNextTask();
        return;
    }

    console.log("start trial iteration " + this.trialIter);

    this.currentTrialIdx = this.randomizedTrials[this.trialIter].trialVariation.trialIdx();
    console.log("start randomized trial id " + this.currentTrialIdx);

    // reset variables at start of trial:
    for (var i=0; i<this.variablesToReset.length; i++){
        this.variablesToReset[i].resetValue();
    }


    // factors and add trial types
    this.currentTrialSelection = this.randomizedTrials[this.currentTrialIdx];
    /*for (var fac = 0; fac < this.currentTrialSelection.factors.length; fac++) {
        var factorVar = this.experiment.exp_data.entities.byId[this.currentTrialSelection.factors[fac]];
        var value = factorVar.levels()[this.currentTrialSelection.levels[fac]].name();
        var recData = new RecData(this.currentTrialSelection.factors[fac], value);
        factorVar.value(value);
        this.addRecording(this.currentBlockIdx, this.trialIter, recData.toJS());
    }*/

    // select next element from preload
    if (this.currentTrialDiv) {
        this.currentTrialDiv.remove();
    }
    this.currentTrialFrames = this.nextTrialFrames;
    this.currentTrialDiv = this.nextTrialDiv;

    // go into trial sequence:
    this.currentSequence = this.currentTask.subSequence();
    this.currentSequence.currSelectedElement(null);

    console.log("start timer to measure display time for next trial...");
    var start = new Date().getTime();
    this.currentSequence.selectNextElement();
    this.startNextPageOrFrame();
    console.log("end timer. Display time was " + (new Date().getTime() - start) + " ms");

    // preload next trial:
    if (this.trialIter + 1 < this.randomizedTrials.length) {
        setTimeout(function(){
            self.addTrialViews(self.trialIter + 1, self.currentTask);
        }, 1);
    }


};

Player.prototype.startNextPageOrFrame = function() {
    var currentElement = this.currentSequence.currSelectedElement();
    switch (currentElement.type) {
        case 'FrameData':
            this.currentFrame = this.currentTrialFrames[currentElement.id()];
            this.currentFrame.startFrame();
            break;
        case 'PageData':
            console.log("TODO");
            break;
        case 'EndOfSequence':
            console.log("starting next trial");
            this.startNextTrial();
            break;
        default:
            console.error("type "+ currentElement.type + " is not defined.");
    }
};

Player.prototype.addTrialViews = function (trialIter,trialLoop) {

    this.nextTrialDiv = $(document.createElement('div'));
    this.nextTrialDiv.css({
        "width": "100%",
        "height": "100%"
    });
    $('#experimentTree').append(this.nextTrialDiv);
    var nextTrialSelection = this.randomizedTrials[trialIter];

    this.nextTrialFrames = {};

    var frameDataArr = trialLoop.subSequence().elements();
    for(var frameIdx =0;frameIdx<frameDataArr.length;frameIdx++){

        var frameDiv = $(document.createElement('div'));
        frameDiv.css({
            'display':'none',
            "width": "100%",
            "height": "100%"
        });
        $(this.nextTrialDiv).append(frameDiv);

        var playerFrame = new PlayerFrame(frameDataArr[frameIdx],frameDiv,this);
        playerFrame.trialIter = trialIter;
        playerFrame.frameData.selectTrialType(nextTrialSelection);
        playerFrame.init();
        this.nextTrialFrames[frameDataArr[frameIdx].id()] = playerFrame;
    }

};


Player.prototype.getRandomizedTrialId = function () {
    return this.currentTrialIdx;
};

Player.prototype.getTrialId = function () {
    return this.trialIter;
};

Player.prototype.getBlockId = function () {
    return this.currentBlockIdx;
};


Player.prototype.finishSessionWithError = function(err_msg) {
    console.log("error during experiment...");
    $.post('/errExpSession', {err_msg: err_msg});
    $('#experimentViewPort').hide();
    $('#errEndExpSection').show();
    $('#err_msg').text(err_msg);
    $('#errEndExp').click(function(){
        history.go(-1);
    });
};

Player.prototype.finishSession = function() {
    console.log("finishExpSession...");
    $.post('/finishExpSession', function( data ) {
        console.log("recording session completed.");
        $('#experimentViewPort').hide();
        $('#endExpSection').show();  //TODO this doesnt' work
        $('#endExp').click(function(){
            history.go(-1);
        });
    });
};

Player.prototype.init = function() {
    var self = this;

    document.onmousedown=disableclick;
    function disableclick(event)
    {
        if(event.button==2)
        {
            return false;
        }
    }
};