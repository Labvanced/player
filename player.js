// copyright by Caspar Goeke and Holger Finger


function is_nwjs(){
    try{
        return (typeof require('nw.gui') !== "undefined");
    } catch (e){
        return false;
    }
}

var playerAjaxPost;
if (is_nwjs()) {
    var win = nw.Window.get();
    var db = win.db;

    var exp_subject_id = null;
    var rec_session_id = null;
    var rec_task_id = null;
    var sessionNr = null;

    // replace server routes with alternatives for offline version:
    playerAjaxPost = function(route, p, callback) {


        if (route=="/startExpPlayer") {
            $.get("exp.json", function(expJSON) {
                callback({
                    expData: JSON.parse(expJSON)
                });
            });
        }


        if (route=="/startFirstPlayerSession") {
            if (callback) {
                callback();
            }
        }


        if (route=="/startFirstPlayerSessionFixGroup") {
            sessionNr = 1;
            var exp_subject_data = {
                exp_id: p.expId,
                subject_code: p.subject_code,
                survey_data: p.survey_data,
                groupNr: p.groupNr
            };
            db.exp_subjects.add(exp_subject_data).then(function(new_id){
                exp_subject_id = new_id;
                var rec_session_data = {
                    exp_subject_id: exp_subject_id,
                    session_nr: sessionNr,
                    start_time: new Date()
                };
                return db.rec_sessions.add(rec_session_data);
            }).then(function(new_id){
                rec_session_id = new_id;
                callback({
                    success: true,
                    groupNr: p.groupNr,
                    sessionNr: sessionNr
                });
            }).catch(function(error) {
                alert ("Ooops: " + error);
            });
        }


        if (route=="/recordStartTask") {
            var rec_task_data = {
                rec_session_id: rec_session_id,
                block_nr: p.blockNr,
                block_id: p.blockId,
                task_nr: p.taskNr,
                task_id: p.taskId,
                start_time: new Date()
            };
            db.rec_task.add(rec_task_data).then (function(new_id){
                rec_task_id = new_id;
                if (callback) {
                    callback({
                        success: true
                    });
                }
            }).catch(function(error) {
                alert ("Ooops: " + error);
            });
        }


        if (route=="/recordTrial") {
            var rec_trial_data = {
                rec_task_id: rec_task_id,
                trial_nr: p.trialNr,
                rec_data: p.recData
            };
            db.rec_trial.put(rec_trial_data).then(function(){
                if (callback) {
                    callback({
                        success: true
                    });
                }
            }).catch(function(error) {
                alert ("Ooops: " + error);
            });
        }


        if (route=="/errExpSession") {

        }


        if (route=="/finishExpSession") {
            // add end time to session:
            var rec_session_changes = {
                end_time: new Date()
            };
            db.rec_sessions.update(rec_session_id, rec_session_changes);

            // update last completed session number:
            var exp_subject_changes = {
                last_completed_session_nr: sessionNr
            };
            db.exp_subjects.update(exp_subject_id, exp_subject_changes);

            // close window:
            win.close();
        }
    };
}
else {
    playerAjaxPost = $.post;
}

var Player = function() {
    var self = this;

    //this.expId = location.search.split('id=')[1];

    function getParameterByName(name) {
        name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
        var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
            results = regex.exec(location.search);
        return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
    }

    this.expId = getParameterByName("id");
    this.guid = getParameterByName("guid");

    this.runOnlyTaskId = getParameterByName("task");
    if (this.runOnlyTaskId == "") {
        this.runOnlyTaskId = false;
    }
    this.runOnlyGroupNr = getParameterByName("group");
    if (this.runOnlyGroupNr == "") {
        this.runOnlyGroupNr = false;
    }
    this.runOnlySessionNr = getParameterByName("session");
    if (this.runOnlySessionNr == "") {
        this.runOnlySessionNr = false;
    }
    this.askSubjData = getParameterByName("ask");
    if (this.askSubjData == "") {
        this.askSubjData = false;
    }
    this.isTestrun = getParameterByName("testrun");
    if (this.isTestrun == "" || this.isTestrun == "0" || this.isTestrun == "false" || this.isTestrun==false) {
        this.isTestrun = false;
    }
    else {
        this.isTestrun = true;
    }
    this.subject_code = getParameterByName("subject_code");
    this.token = getParameterByName("token");

    // if only testing a specific task, then don't record:
    if (this.runOnlyTaskId) {
        this.isTestrun = true;
    }

    // in offline version always ask for subject data:
    if (is_nwjs()) {
        this.askSubjData = true;
        console.log("starting in offline mode.");
    }

    this.experiment = null;
    this.sessionNr = 0;
    this.groupNr = 0;

    this.blocks = null;

    this.currentBlock = null;
    this.currentBlockIdx = -1;

    this.currentTask = null;
    this.currentTaskIdx = -1;

    this.currentTrialId = null;
    this.randomizedTrials = [];
    this.trialIter = "init"; // or "waitForStart" or 0,1,2,..
    this.currentTrialDiv = null;
    this.currentTrialFrames = null;
    this.currentSequence = null;

    this.currentFrame = null;

    this.webcamLoaded = false;
    this.variablesToReset = [];

    this.preloadCounter =0;
    this.contentList = [];

    Webcam.on("error", function(err_msg){
        console.log("webcam error: "+err_msg);
        self.finishSessionWithError(err_msg);
    });

    console.log("requesting experiment with id "+this.expId+" from server with askSubjData="+this.askSubjData+ " subject_code="+this.subject_code);

    var parameters = {
        expId: this.expId,
        isTestrun: this.isTestrun,
        subject_code: this.subject_code,
        token: this.token,
        askSubjData: this.askSubjData
    };

    createExpDesignComponents(function() {
        playerAjaxPost('/startExpPlayer', parameters, function(data){
            if (data.hasOwnProperty('success') && data.success == false) {
                queue.cancel();
                self.finishSessionWithError("This experiment does not exist!");
                return;
            }
            console.log("experiment spec loaded from server.");

            self.experiment = new Experiment().fromJS(data.expData);
            self.experiment.setPointers();
            console.log("experiment deserialized.");

            if (!self.expId) {
                self.expId = self.experiment.exp_id();
            }

            var expPrev =  new ExperimentStartupScreen(self.experiment);
            var newContent = jQuery('<div/>');
            newContent.load("/html_views/ExperimentStartupScreen.html", function () {
                newContent.prependTo('#expPreview');
                ko.applyBindings(expPrev, newContent[0]);
                expPrev.init(950,400);
            });

            self.preloadAllContent();

            if (self.runOnlyTaskId) {
                self.setSubjectGroupNr(1, 1);
                return;
            }

            if (self.isTestrun || self.askSubjData) {
                // player was started by the experimenter, so we ask for subject code, group, session:
                var initialSubjectDialog = new InitialSubjectDialog(self.experiment.exp_data);
                if (self.runOnlyGroupNr) {
                    initialSubjectDialog.selectedSubjectGroup(self.runOnlyGroupNr);
                }
                if (self.runOnlySessionNr) {
                    initialSubjectDialog.selectedSessionNr(self.runOnlySessionNr);
                }
                initialSubjectDialog.subjectCode(self.subject_code);
                initialSubjectDialog.start(function() {
                    self.subject_code = initialSubjectDialog.subjectCode();
                    var groupNr = initialSubjectDialog.selectedGroupNr();
                    var sessionNr = initialSubjectDialog.selectedSessionNr();
                    self.setSubjectGroupNr(groupNr, sessionNr);

                    if (initialSubjectDialog.includeInitialSurvey()) {

                        var initialSurvey = new InitialSurveyDialog(self.experiment.exp_data);
                        initialSurvey.start(function() {
                            if (self.isTestrun) {
                                initialSurvey.closeDialog();
                            }
                            else {
                                playerAjaxPost('/startFirstPlayerSessionFixGroup',
                                    {
                                        expId: self.expId,
                                        subject_code: self.subject_code,
                                        survey_data: initialSurvey.getSurveyData(),
                                        groupNr: groupNr
                                    },
                                    function () {
                                        initialSurvey.closeDialog();
                                    }
                                );
                            }
                        });
                    }
                    else {
                        if (!self.isTestrun) {
                            playerAjaxPost('/startFirstPlayerSessionFixGroup',
                                {
                                    expId: self.expId,
                                    subject_code: self.subject_code,
                                    survey_data: null,
                                    groupNr: groupNr
                                },
                                function (data) {
                                }
                            );
                        }
                    }

                });
                return;
            }

            if (data.groupNr && data.sessionNr) {
                self.setSubjectGroupNr(data.groupNr, data.sessionNr);
                return;
            }

            // if group and session were not already set, start the survey
            var initialSurvey = new InitialSurveyDialog(self.experiment.exp_data);
            function submitSurvey() {
                playerAjaxPost('/startFirstPlayerSession',
                    {
                        expId: self.expId,
                        subject_code: self.subject_code,
                        survey_data: initialSurvey.getSurveyData()
                    },
                    function(data) {
                        initialSurvey.closeDialog();
                        if (data.hasOwnProperty('success') && data.success == false) {
                            queue.cancel();

                            if (data.msg == "no matching subject group") {
                                self.finishSessionWithError("There is no matching subject group defined which matches your criteria.");
                            }
                            else {
                                self.finishSessionWithError("Could not initialize first session of experiment. Error Message: " + data.msg);
                            }
                            return;
                        }
                        self.setSubjectGroupNr(data.groupNr, data.sessionNr);
                    }
                );
            }
            if (!initialSurvey.requiredGender() && !initialSurvey.requiredAge() && !initialSurvey.requiredCountry() && !initialSurvey.requiredLanguage() && !initialSurvey.requiredEmail()) {
                // if nothing is required just skip the survey:
                submitSurvey();
            }
            else {
                initialSurvey.start(function (survey_data) {
                    submitSurvey();
                });
            }

        });
    });

};

Player.prototype.preloadAllContent = function() {
    // parse images, video and audio elements
    var entities = this.experiment.exp_data.entities();
    for (var i = 0; i<entities.length; i++){
        var entity = entities[i];
        if (entity instanceof FrameData){
            for (var k = 0; k<entity.elements().length; k++){
                var entity2 = entity.elements()[k];
                if  (entity2.content() instanceof VideoElement || entity2.content() instanceof ImageElement  || entity2.content() instanceof AudioElement){
                    if  (entity2.content().hasOwnProperty("file_id")){
                        this.preloadCounter +=1;
                        if (entity2.content().file_id() && entity2.content().file_orig_name()) {
                            var src = "/files/" + entity2.content().file_id() + "/" + entity2.content().file_orig_name();
                            this.contentList.push({
                                id: this.preloadCounter.toString(),
                                src: src
                            });
                        }
                    }
                    var arr =  entity2.content().modifier().ndimModifierTrialTypes;
                    if (arr.length>0){
                        this.deepDive(arr);
                    }

                }

            }

        }
    }
    if (this.contentList.length>0){
        queue.loadManifest(this.contentList);
    }
    else{
        onComplete();
    }
};

Player.prototype.deepDive = function(arr){

    if (arr[0].constructor === Array) {
        // recursive call:
        for (var t = 0; t < arr.length; t++) {
            this.deepDive(arr[t]);
        }
    }
    else {
        for (var t = 0; t < arr.length; t++) {
            if  (arr[t].modifiedProp.hasOwnProperty("file_id")){
                this.preloadCounter +=1;
                var src =  "/files/" + arr[t].modifiedProp.file_id() + "/" + arr[t].modifiedProp.file_orig_name();
                this.contentList.push({
                    id: this.preloadCounter.toString(),
                    src: src
                });
            }
        }
    }
};

Player.prototype.setSubjectGroupNr = function(groupNr, sessionNr){
    this.groupNr = groupNr;
    this.sessionNr = sessionNr;

    console.log("groupNr="+groupNr+ " sessionNr="+sessionNr);

    var subj_group = this.experiment.exp_data.availableGroups()[this.groupNr-1];
    if (!subj_group) {
        console.log("player error: there is no subject group defined in the experiment.");
        this.finishSessionWithError("There is no subject group defined in the experiment.");
        return;
    }

    var exp_session = subj_group.sessions()[this.sessionNr-1];
    if (!exp_session) {
        console.log("player error: there is no session defined in the subject group in the experiment.");
        this.finishSessionWithError("there is no session defined in the subject group in the experiment.");
        return;
    }

    this.blocks = exp_session.blocks();
    if (this.blocks.length == 0) {
        console.log("player error: there is no block defined in this experiment session.");
        this.finishSessionWithError("there is no block defined in this experiment session.");
        return;
    }

};

Player.prototype.startExperiment = function() {
    if (this.runOnlyTaskId){
        // run a test task session:
        this.currentTaskIdx = NaN;
        this.currentTask = this.experiment.exp_data.entities.byId[this.runOnlyTaskId];
        this.startRunningTask();
    }
    else {
        // run a real complete experiment session:
        this.startNextBlock();
    }
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
        this.jumpToNextTask();
    }
};

Player.prototype.jumpToNextTask = function() {
    if (this.runOnlyTaskId) {
        this.finishSession();
    }
    else {
        this.currentTaskIdx++;
        this.currentTask = this.currentBlock.subTasks()[this.currentTaskIdx];
        this.startRunningTask();
    }
};

Player.prototype.startRunningTask = function() {
    var self = this;

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
                    self.jumpToNextTask();
                }, 1000);
            });
            return;
        }

        // create array with variables that need to be reset after each trial: (the actual reset is done further below)
        var allFrameDataInTrial = this.currentTask.subSequence().elements();
        this.variablesToReset = [];
        this.variablesToRecord = [];
        this.factorsVars = [];
        var variablesToResetById = {};
        var variablesToRecordById = {};

        for (var i=0; i<allFrameDataInTrial.length; i++){
            var allVariablesInFrame = allFrameDataInTrial[i].localWorkspaceVars();

            for (var j=0; j<allVariablesInFrame.length; j++){
                // if variable was not initialized then do it now:
                if (allVariablesInFrame[j].value()==null) {
                    allVariablesInFrame[j].initValue();
                }
                if (allVariablesInFrame[j].resetAtTrialStart()) {
                    var id = allVariablesInFrame[j].id();
                    if (!variablesToResetById.hasOwnProperty(id)) {
                        variablesToResetById[id] = true;
                        this.variablesToReset.push(allVariablesInFrame[j]);
                    }
                }
                if (allVariablesInFrame[j].isRecorded()) {
                    var id = allVariablesInFrame[j].id();
                    if (!variablesToRecordById.hasOwnProperty(id)) {
                        variablesToRecordById[id] = true;
                        this.variablesToRecord.push(allVariablesInFrame[j]);
                    }
                }
            }
        }

        // add all factor vars to recordings
        var allEntities = this.experiment.exp_data.entities();
        for (var i=0; i<allEntities.length; i++){
            if (allEntities[i].type == "GlobalVar") {
                if(allEntities[i].isFactor() && allEntities[i].levels().length>1){
                    this.factorsVars.push(allEntities[i]);
                    this.variablesToRecord.push(allEntities[i]);
                }
            }
        }

        this.randomizedTrials = this.currentTask.doTrialRandomization();

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
            // $('#countdownSection').show();
            // $('#countdown').text("preloading task");
            setTimeout(function () {
                //  $('#countdownSection').hide();
                self.startNextTrial();
            }, 500);
        }
    }
    else{
        this.startNextBlock();
    }

};

Player.prototype.startRecordingsOfNewTask = function() {
    if (!this.runOnlyTaskId && !this.isTestrun) {
        var recordData = {
            blockNr: this.currentBlockIdx,
            blockId: this.currentBlock.id(),
            taskNr: this.currentTaskIdx,
            taskId: this.currentTask.id()
        };
        playerAjaxPost('/recordStartTask', recordData, function(result) {

        });
    }
};

Player.prototype.recordData = function() {
    if (!this.runOnlyTaskId && !this.isTestrun) {
        // record variables at end of trial:
        var recData = new RecData();


        // new, dynamic verison
        for (var i = 0; i < this.variablesToRecord.length; i++) {
            recData.addRecording(this.variablesToRecord[i]);
        }

        // server command
        var recordedData = {
            trialNr: this.trialIter,
            recData: recData.toJS()
        };
        playerAjaxPost('/recordTrial', recordedData, function(result) {

        });
    }
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
        console.log("task finished");
        this.trialIter = "init"; // reset to init so that another trial loop in another block will start from the beginning

        if (this.webcamLoaded){
            console.log("removing webcam");
            Webcam.reset();
            this.webcamLoaded = false;
        }

        self.jumpToNextTask();
        return;
    }

    console.log("start trial iteration " + this.trialIter);
    var trialSelection = this.randomizedTrials[this.trialIter];

    this.currentTrialId = trialSelection.trialVariation.uniqueId();
    console.log("start randomized trial id " + this.currentTrialId);

    // reset variables at start of trial:
    for (var i=0; i<this.variablesToReset.length; i++){
        this.variablesToReset[i].resetValueToStartValue();
    }

    // set factor values
    for (var i=0; i<this.factorsVars.length; i++){
        // TODO: this.factorsVars is not needed, because we could also just do this directly by reading out the factors that are within the condition:
        var factorValue = trialSelection.condition.getCurrentValueOfFactor(this.factorsVars[i].id());
        this.factorsVars[i].value().value(factorValue);
    }

    // select next element from preload
    if (this.currentTrialDiv) {
        this.currentTrialDiv.remove();
    }
    this.currentTrialFrames = this.nextTrialFrames;
    this.currentTrialDiv = this.nextTrialDiv;

    // go into trial sequence:
    var factorGroupIdx = this.currentTask.factorGroups().indexOf(trialSelection.factorGroup);
    this.currentSequence = this.currentTask.subSequencePerFactorGroup()[factorGroupIdx];
    this.currentSequence.currSelectedElement(null);
    this.currentSequence.selectNextElement();
    this.startNextPageOrFrame();

    // preload next trial:
    if (this.trialIter + 1 < this.randomizedTrials.length) {
        setTimeout(function(){
            self.addTrialViews(self.trialIter + 1, self.currentTask);
        }, 1);
    }


};

Player.prototype.startNextPageOrFrame = function() {
    var currentElement = this.currentSequence.currSelectedElement();
    var frameIdx = this.currentSequence.elements().indexOf(currentElement);
    console.log('starting frame nr: '+frameIdx +' in trial nr: '+this.trialIter);
    switch (currentElement.type) {
        case 'FrameData':
            this.currentFrame = this.currentTrialFrames[currentElement.id()];
            this.currentFrame.startFrame();
            break;
        case 'PageData':
            this.currentFrame = this.currentTrialFrames[currentElement.id()];
            this.currentFrame.startFrame();
            break;
        case 'EndOfSequence':
            console.log("starting next trial");
            this.startNextTrial();
            break;
        default:
            console.error("type "+ currentElement.type + " is not defined.");
    }
};

Player.prototype.addTrialViews = function (trialIter,task) {

    this.nextTrialDiv = $(document.createElement('div'));
    this.nextTrialDiv.css({
        "width": "100%",
        "height": "100%"
    });
    $('#experimentTree').append(this.nextTrialDiv);
    var nextTrialSelection = this.randomizedTrials[trialIter];

    var factorGroupIdx = task.factorGroups().indexOf(nextTrialSelection.factorGroup);
    var frameDataArr = task.subSequencePerFactorGroup()[factorGroupIdx].elements();

    this.nextTrialFrames = {};
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
    return this.currentTrialId;
};

Player.prototype.getTrialId = function () {
    return this.trialIter;
};

Player.prototype.getBlockId = function () {
    return this.currentBlockIdx;
};


Player.prototype.finishSessionWithError = function(err_msg) {
    console.log("error during experiment...");
    playerAjaxPost('/errExpSession', {err_msg: err_msg});
    $('#experimentViewPort').hide();
    $('#sectionPreload').hide();
    $('#errEndExpSection').show();
    $('#err_msg').text(err_msg);
    $('#errEndExp').click(function(){
        history.go(-1);
    });
};

Player.prototype.finishSession = function() {
    console.log("finishExpSession...");
    if (!this.isTestrun) {
        playerAjaxPost('/finishExpSession');
    }
    $('#experimentViewPort').hide();
    $('#endExpSection').show();
    $('#endExp').click(function(){
        window.location = "/page/library";
    });
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    }
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