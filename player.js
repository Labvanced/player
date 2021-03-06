// copyright by Caspar Goeke and Holger Finger


function is_nwjs() {
    try {
        return (typeof require('nw.gui') !== "undefined");
    } catch (e) {
        return false;
    }
}


var playerAjaxPost;
if (is_nwjs()) {
    var win = nw.Window.get();
    var fs = require('fs');
    var path = require('path');
    var db = win.db;

    function prnFunc(theData, refreshListCb, playerFinishedCb) {
        db = theData;
        win.refreshList = refreshListCb;
        win.playerFinished = playerFinishedCb;
    }

    var exp_subject_id = null;
    var rec_session_id = null;
    var rec_task_id = null;
    var sessionNr = null;
    var groupNr = null;

    function mkdirIfNotExist(check_path) {
        fs.existsSync(check_path) || fs.mkdirSync(check_path);
    }

    function sec_file_guid() {
        var crypt = require('crypto');
        var buf = crypt.randomBytes(10);
        return buf.toString('base64').replace(/\+/g, '-') // Convert '+' to '-'
            .replace(/\//g, '_') // Convert '/' to '_'
            .replace(/=+$/, ''); // Remove ending '='
    }

    function writeFileNwjs(dataToSave, filename, callback) {
        var file_guid = sec_file_guid();
        var offlineExpFolder = path.join(nw.App.dataPath, "studies", "exp_" + player.expId);
        mkdirIfNotExist(path.join(offlineExpFolder, "recordings"));
        var filePath = path.join(offlineExpFolder, "recordings", "" + exp_subject_id, file_guid, filename);
        mkdirIfNotExist(path.join(offlineExpFolder, "recordings"));
        mkdirIfNotExist(path.join(offlineExpFolder, "recordings", "" + exp_subject_id));
        mkdirIfNotExist(path.join(offlineExpFolder, "recordings", "" + exp_subject_id, file_guid));

        console.log("writing nwjs recording file for rec_session_id = " + rec_session_id);

        fs.writeFile(filePath, new Buffer(dataToSave), function (err) {
            if (err) {
                console.info("There was an error attempting to save your data.");
                console.warn(err.message);
                return;
            } else if (callback) {
                var rec_file_data = {
                    exp_subject_id: exp_subject_id,
                    rec_session_id: rec_session_id,
                    file_guid: file_guid,
                    filename: filename
                };
                db.rec_files.add(rec_file_data).then(function (rec_file_id) {
                    callback(file_guid);
                }).catch(function (error) {
                    alert("Ooops: " + error);
                });
            }
        });
    };


    // replace server routes with alternatives for offline version:
    playerAjaxPost = function (route, p, callback, timeout) {

        if (route == "/startExpPlayer") {

            var jsonPath = path.join(nw.App.dataPath, "studies", "exp_" + p.expId, "exp.json");
            fs.readFile(jsonPath, function (err, rawdata) {
                callback({
                    success: true,
                    expData: JSON.parse(rawdata),
                    country: null
                });
            });
        }

        if (route == "/startFirstPlayerSession") {
            sessionNr = player.sessionNr;
            groupNr = player.groupNr;
            var exp_subject_data = {
                exp_id: p.expId,
                subject_code: p.subject_code,
                survey_data: p.survey_data,
                group_nr: groupNr,
                last_completed_session_nr: p.last_completed_session_nr,
                add_time: pgFormatDate(new Date())
            };
            db.exp_subjects.add(exp_subject_data).then(function (new_id) {
                exp_subject_id = new_id;
                var rec_session_data = {
                    exp_subject_id: exp_subject_id,
                    session_nr: sessionNr,
                    start_time: null
                };
                return db.rec_sessions.add(rec_session_data);
            }).then(function (new_id) {
                rec_session_id = new_id;
                console.log("rec_session_id = " + rec_session_id);

                // update list of recordings:
                win.refreshList();
                if (callback) {
                    callback({
                        groupNr: groupNr,
                        sessionNr: sessionNr,
                        success: true
                    });
                }
            }).catch(function (error) {
                alert("Ooops: " + error);
            });
        }

        if (route == "/setPlayerSessionStartedTime") {
            // set start time of session:
            var rec_session_changes = {
                start_time: p.start_time
            };
            db.rec_sessions.update(rec_session_id, rec_session_changes);
            callback({
                subjCounterGlobal: 1,
                subjCounterPerGroup: 1,
                success: true
            });
        }

        if (route == "/recordStartTask") {
            var rec_task_data = {
                rec_session_id: rec_session_id,
                block_nr: p.blockNr,
                block_id: p.blockId,
                task_nr: p.taskNr,
                task_id: p.taskId,
                start_time: p.start_time
            };
            db.rec_task.add(rec_task_data).then(function (new_id) {
                rec_task_id = new_id;
                if (callback) {
                    callback({
                        success: true,
                        recTaskId: rec_task_id
                    });
                }
            }).catch(function (error) {
                alert("Ooops: " + error);
            });
        }

        if (route == "/recordTrial") {
            var rec_trial_data = {
                rec_task_id: p.recTaskId,
                trial_nr: p.trialNr,
                rec_data: p.recData
            };

            // TODO check whether entry for the current trial already exists. If it does replace instead of insert the variables.
            db.rec_trial.put(rec_trial_data).then(function () {
                if (callback) {
                    callback({
                        success: true
                    });
                }
            }).catch(function (error) {
                alert("Ooops: " + error);
            });
        }

        if (route == "/errExpSession") {
            if (callback) {
                callback({
                    success: true
                });
            }
        }

        if (route == "/addMetaInfo") {
            // add var data to session:
            var rec_session_changes = {
                var_data: p.var_data
            };
            db.rec_sessions.update(rec_session_id, rec_session_changes);
            if (callback) {
                callback({
                    success: true
                });
            }
        }

        if (route == "/finishExpSession") {
            // add end time to session:
            var rec_session_changes = {
                end_time: p.end_time,
                var_data: p.var_data
            };
            db.rec_sessions.update(rec_session_id, rec_session_changes);

            // update last completed session number:
            var exp_subject_changes = {
                last_completed_session_nr: sessionNr
            };

            db.exp_subjects.update(exp_subject_id, exp_subject_changes);

            if (callback) {
                callback({
                    success: true
                });
            }

            // update list of recordings:
            win.refreshList();
            win.playerFinished(rec_session_id)

            // close window:
            win.close();
        }
    };
}
else {

    // all player routes must return a result with a boolean success field!

    playerAjaxPost = function (route, p, callback, timeout) {
        if (timeout === undefined) {
            timeout = 5 * 60 * 1000; // 5 minutes is default timeout
        }

        var serverResponseIdx = player.serverResponseTimes.length;

        player.serverResponseTimes.push({
            route: route,
            latency: -1,
            startTime: (new Date()).getTime(),
            finishTime: null
        });

        $.ajax({
            type: "POST",
            url: route,
            data: p,
            timeout: timeout,
            error: function (jqXHR, textStatus, errorThrown) {
                callback({
                    success: false,
                    errorThrown: errorThrown,
                    msg: textStatus,
                    status: jqXHR.status
                });
                console.error("error in ajax post...", status, errorThrown);
            },
            success: function (data, textStatus, jqXHR) {
                if (player.recordServerResponseTimes) {
                    var finishTime = (new Date()).getTime();
                    player.serverResponseTimes[serverResponseIdx].finishTime = finishTime;
                    player.serverResponseTimes[serverResponseIdx].latency = finishTime - player.serverResponseTimes[serverResponseIdx].startTime;
                }
                callback(data);
            }
        });
    };

}

var playerAjaxPostExternal = function (route, p, callback, timeout) {
    if (timeout === undefined) {
        timeout = 5 * 60 * 1000; // 5 minutes is default timeout
    }

    var ip = player.experiment.publishing_data.connectToIPExternalDataStorage();
    var port = player.experiment.publishing_data.connectToPortExternalDataStorage();
    var namespace = player.experiment.publishing_data.connectToNameSpaceExternalDataStorage();

    $.ajax({
        type: "POST",
        url: ip + ":" + port + namespace + route,
        data: p,
        timeout: timeout,
        error: function (jqXHR, textStatus, errorThrown) {
            if (callback) {
                callback({
                    success: false,
                    errorThrown: errorThrown,
                    msg: textStatus,
                    status: jqXHR.status
                });
            }

            console.error("error in ajax post...", status, errorThrown);
        },
        success: function (data, textStatus, jqXHR) {
            if (callback) {
                callback(data);
            }

        }
    });
};


var Player = function () {

    var self = this;

    this.externalWebsocket = null;

    function getParameterByName(name) {
        name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
        var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
            results = regex.exec(location.search);
        return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
    }

    // determine whether this is a crowdsourcingSession
    this.crowdsourcingCode = ko.observable('');
    this.crowdsourcinSubjId = "";
    this.isPlayerCalledWithType = ko.observable(false);
    this.crowdsourcingType = ko.observable("code");
    var isCrowdsourcingSession = ko.observable(getParameterByName("crowdsourcing"));
    var csType = getParameterByName("type");
    this.askForWorkerId = ko.observable(false);


    if (csType || isCrowdsourcingSession == "true") {
        this.crowdsourcingCode(guid());
        this.isPlayerCalledWithType(true);
        if (csType == "link") {
            this.crowdsourcingType("link");
            this.crowdsourcinSubjId = getParameterByName("PROLIFIC_PID"); // this is supplied by profilic 
            this.askForWorkerId(true);

        }
        else if (csType == "code") {
            this.crowdsourcingType("code");
            this.crowdsourcinSubjId = getParameterByName("crowdworker_id"); // this is supplied by mTurk
            this.askForWorkerId(true);

        }
        else if (csType == "csv") {
            this.crowdsourcingType("csv");
            this.crowdsourcinSubjId = getParameterByName("user_id"); // this is supplied by clickworker
            this.askForWorkerId(true);
        }
        else if (csType == "sona") {
            this.crowdsourcingType("sona");
        }
    }

    // readout userName
    this.registeredUserSession = false;
    this.username = getParameterByName("username");
    if (this.username) {
        this.registeredUserSession = true;
    }



    this.showLinkOnEndPage = ko.observable(false);
    this.linkToStartNextSession = ko.observable(null);

    this.playerPreloader = new PlayerPreloader(this);
    this.playerFileUploader = new PlayerFileUploader(this);

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
    if (this.isTestrun == "" || this.isTestrun == "0" || this.isTestrun == "false" || this.isTestrun == false) {
        this.isTestrun = false;
    }
    else {
        this.isTestrun = true;
    }
    this.subject_code = getParameterByName("subject_code");

    this.token = getParameterByName("token");
    this.prevSessionData = null;

    this.recordServerResponseTimes = false; // only enable this for debugging purposes!
    this.serverResponseTimes = [];

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
    this.retryCounter = 0;

    // the following three variables will be set by function setSubjectGroupNr():
    this.subj_group = null;
    this.exp_session = null;
    this.blocks = null;

    this.currentBlock = null;
    this.currentBlockIdx = -1;

    this.currentTask = null;
    this.currentTaskIdx = -1;

    this.currentTrialId = null;
    this.randomizedTrials = [];
    this.trialIter = "init"; // or "waitForStart" or 0,1,2,..
    this.trialIndex = null;
    this.currentTrialDiv = null;
    this.currentTrialFrames = null;
    this.currentSequence = null;
    this.nextSequence = null;
    this.currentFrame = null;
    this.nextTrialIndexPreloaded = "NOTLOADED";

    this.trialJumpInProgress = false; // to synchronize (and block) calls to startNextTrial and startSpecificTrial
    this.trialJumpDelayedCb = null; // holds callback for the next trial jump (if there is any jump while the previous jump was not finished yet)

    this.pressedShortcut = ko.observable(false);

    this.eyetracking = null;
    this.variablesToReset = [];
    this.PixelDensityPerMM = null; // in pixel per mm
    this.distanceTScreenInCM = ko.observable(60);  // default is 60 cm distance

    this.sessionStartTime = pgFormatDate(new Date());

    this.preloaderCompleted = ko.observable(false);
    this.jointExpLobby = null;

    this.sessionEnded = false;
    this.endExpSectionCustomText = ko.observable("");
    this.currentNumberParticipants = ko.observable(null);
    this.timeControlArray = [];

    this.eyetrackerLoaded = false;
    this.expSessionNr = null;

    this.groupNrAssignedByServer = null;
    this.sessionNrAssignedByServer = null;

    this.subjCounterGlobal = null;
    this.subjCounterPerGroup = null;

    this.selectedEmail = null;

    this.recordTrialQueue = [];
    this.recordTrialQueueIsUploading = false;

    this.microphone_stream = null;
    this.video_stream = null;
    this.audioContext = null;

    this.exp_license = null;

    this.eyetrackingValidationAccuracy = null;
    this.eyetrackingCalibrationAccuracy = null;

    this.screenOrientationCurrent = ko.observable(null);
    this.screenOrientationRequired = ko.observable(null);

    this.pausedDueToFullscreen = ko.observable(false);
    this.pausedDueToOrientation = ko.observable(false);
    this.pausedDueToNoConnectionToJointExpServer = ko.observable(false);
    this.pausedDueToAnotherParticipant = ko.observable(false);
    this.screenCalibInitVal = null;

    this.isPaused = ko.computed(function () {
        return self.pausedDueToAnotherParticipant() ||
            self.pausedDueToFullscreen() ||
            self.pausedDueToOrientation() ||
            self.pausedDueToNoConnectionToJointExpServer();
    });

    this.wasPaused = this.isPaused();
    this.isPaused.subscribe(function (isPausedNew) {
        if (!self.wasPaused && isPausedNew) {
            if (self.currentFrame) {
                self.currentFrame.pauseFrame();
            }
            console.log("show pause screen");
            $("#pauseScreen").show();
        }
        else if (self.wasPaused && !isPausedNew) {
            if (self.currentFrame) {
                self.currentFrame.continueFrame();
            }
            console.log("hide pause screen");
            $("#pauseScreen").hide();
        }
        self.wasPaused = isPausedNew;
    });

    //console.log("requesting experiment with id "+this.expId+" from server with askSubjData="+this.askSubjData+ " subject_code="+this.subject_code);

    var parameters = {
        expId: this.expId,
        isTestrun: this.isTestrun,
        subject_code: this.subject_code,
        token: this.token,
        askSubjData: this.askSubjData
    };

    createExpDesignComponents(function () {

        if (parameters.expId == "" && !is_nwjs()) {
            self.finishSessionWithError("Error: No Experiment specified.");
        }
        else {
            self.startExpPlayer(parameters);
        }
    });

};

Player.prototype.startExpPlayer = function (parameters) {
    var self = this;
    playerAjaxPost('/startExpPlayer', parameters, function (data) {

        $("#loadingExpData").hide();

        if (data.success == false) {
            if (data.msg === "timeout") {
                self.finishSessionWithError("Dear participant, we are very sorry but your computer and/or internet connection are not compatible with the experiment's technical requirements. We apologize for any inconvenience. (ERROR 955)");
                //self.finishSessionWithError("Error receiving experiment. Please check your internet connection.");
            }
            else {
                self.finishSessionWithError("Error: " + data.msg);
            }
            return;
        }
        self.startExpPlayerResult(data);
    }, 5 * 60 * 1000);
};

Player.prototype.startExpPlayerResult = function (data) {

    var self = this;

    if (data.hasOwnProperty('success') && data.success == false) {
        self.playerPreloader.cancel();
        self.finishSessionWithError("Error: " + data.msg);
        return;
    }

    if (data.hasOwnProperty('password_required') && data.password_required == true) {
        var publishing_data = new PublishingData();
        publishing_data.fromJS(data.publishing_data);
        var pwRequest = new PasswordRequest(publishing_data);
        var newContent = jQuery('<div/>');
        newContent.load("/html_views/PasswordRequest.html", function () {
            newContent.prependTo('#passwordRequest');
            ko.applyBindings(pwRequest, newContent[0]);
            pwRequest.init(function (password) {
                $('#passwordRequest').remove();
                var parameters = {
                    expId: self.expId,
                    isTestrun: self.isTestrun,
                    subject_code: self.subject_code,
                    token: self.token,
                    password: password,
                    askSubjData: self.askSubjData
                };
                self.startExpPlayer(parameters);
            });
        });
        return;
    }

    console.log("experiment spec loaded from server.");
    if (data.hasOwnProperty('crowdsourcingCodeCsv')) {
        if (self.isPlayerCalledWithType() && self.crowdsourcingType() == "csv") {
            self.crowdsourcingCode(data.crowdsourcingCodeCsv);
        }
    }

    if (data.exp_license) {
        self.exp_license = data.exp_license;
    }
    if (data.groupNr) {
        self.groupNrAssignedByServer = data.groupNr;
    }
    if (data.sessionNr) {
        self.sessionNrAssignedByServer = data.sessionNr;
    }
    if (data.token) {
        self.token = data.token;
    }
    if (data.prevSessionData) {
        self.prevSessionData = data.prevSessionData;
    }
    if (data.country) {
        self.country = data.country;
    }

    self.experiment = new Experiment().fromJS(data.expData);
    self.experiment.setPointers();
    console.log("experiment deserialized.");
    this.currentNumberParticipants(self.experiment.exp_data.numPartOfJointExp());

    self.expSessionNr = data.expSessionNr;
    console.log('expSessionNr: ' + self.expSessionNr);

    // fast forward by strg+q
    if (self.experiment.exp_data.studySettings.allowSTRGQ()) {
        function KeyPress(e) {
            var evtobj = window.event ? event : e;
            if (evtobj.keyCode == 81 && evtobj.ctrlKey && !evtobj.altKey) {
                self.pressedShortcut(true);
                if (self.currentFrame) {
                    self.currentFrame.finishFrame();
                    self.recordData();
                    self.jumpToNextTask();
                }
            }
            if (evtobj.keyCode == 88 && evtobj.ctrlKey && !evtobj.altKey) {
                self.pressedShortcut(true);
                if (self.currentFrame) {
                    self.currentFrame.finishFrame();
                    self.recordData();
                    self.startNextTrial(self.trialIndex + 1)
                }
            }
        }
        document.onkeydown = KeyPress;
    }


    ko.applyBindings(self, $("#pauseScreen")[0]);
    ko.applyBindings(self, $("#eyetracking-v2")[0]);
    ko.applyBindings(self, $("#calibrateScreen")[0]);
    ko.applyBindings(self, $("#endExpSection")[0]);
    ko.applyBindings(self, $("#errEndExpSection")[0]);
    ko.applyBindings(self, $("#countdownSection")[0]);


    self.experiment.exp_data.initVars();

    // record browser and system specs
    //self.detectBrowserAndSystemSpecs();

    // init default language:
    self.experiment.exp_data.updateLanguage();

    if (!self.expId) {
        self.expId = self.experiment.exp_id();
    }

    var expPrev = new ExperimentStartupScreen(self.experiment);
    var newContent = jQuery('<div/>');
    newContent.load("/html_views/ExperimentStartupScreen.html", function () {
        newContent.prependTo('#expPreview');
        ko.applyBindings(expPrev, newContent[0]);
        expPrev.init();
    });

};


Player.prototype.desiredDelayInMs = 100;
Player.prototype.timeMeasureControl = function () {

    var self = this;
    var distanceBetweenMeasures = 5000;
    var timerHandle = null;

    function measureTime() {
        var oldTime = new Date().getTime();
        setTimeout(function () {
            var newTime = new Date().getTime();
            var timeDifference = newTime - oldTime;
            self.timeControlArray.push(timeDifference);
            if (self.sessionEnded && timerHandle) {
                clearTimeout(timerHandle);
            }
        }, Player.prototype.desiredDelayInMs)
    }

    timerHandle = setInterval(measureTime, distanceBetweenMeasures);
    measureTime();

};


Player.prototype.getAllFramesOrPagesInSession = function () {
    var allFramesOrPages = [];
    var expSessionSpec = this.experiment.exp_data.availableGroups()[this.groupNr - 1].sessions()[this.sessionNr - 1];
    if (!expSessionSpec) {
        this.finishSessionWithError("experiment session sessionNr=" + this.sessionNr + " is not defined in subject group groupNr=" + this.groupNr);
        return;
    }
    var blocks = expSessionSpec.blocks();
    for (var i = 0; i < blocks.length; i++) {
        var subTasks = blocks[i].subTasks();
        for (var j = 0; j < subTasks.length; j++) {
            var subSequences = subTasks[j].subSequencePerFactorGroup();
            for (var l = 0; l < subSequences.length; l++) {
                var elements = subSequences[l].elements();
                for (var m = 0; m < elements.length; m++) {
                    var entity = elements[m];
                    if (entity instanceof FrameData) {
                        allFramesOrPages.push(entity);
                    }
                    if (entity instanceof PageData) {
                        allFramesOrPages.push(entity);
                    }
                }
            }
        }
    }
    return allFramesOrPages;
};

Player.prototype.getNwjsImgPath = function (file_id, file_orig_name) {
    return path.join(nw.App.dataPath, "studies", "exp_" + this.expId, "files", "" + file_id, file_orig_name);
}

Player.prototype.preloadAllContent = function () {

    var self = this;
    var contentList = [];
    var contentListById = {};

    function addToContents(file_id, file_orig_name) {
        if (file_id) {
            var src = "/player/files/" + self.expSessionNr + "/" + file_id + "/" + file_orig_name;
            if (is_nwjs()) {
                src = self.getNwjsImgPath(file_id, file_orig_name);
            }
            var fileSpec = {
                id: file_id,
                src: src,
                timeout: 80000
            };
            if (!contentListById.hasOwnProperty(fileSpec.id)) {
                contentList.push(fileSpec);
                contentListById[fileSpec.id] = fileSpec;
            }
        }
    }

    function deepDive(arr) {
        var t;
        if (arr.length > 0 && arr[0].constructor === Array) {
            // recursive call:
            for (t = 0; t < arr.length; t++) {
                deepDive(arr[t]);
            }
        }
        else {
            for (t = 0; t < arr.length; t++) {
                if (arr[t].modifiedProp.hasOwnProperty("file_id")) {
                    addToContents(arr[t].modifiedProp.file_id(), arr[t].modifiedProp.file_orig_name());
                }
            }
        }
    }

    // preload file in file variables
    var contentElements = this.experiment.exp_data.entities();
    $.each(contentElements, function (idx, elem) {
        if (elem instanceof GlobalVar) {
            if (elem.dataType() == "file") {
                if (elem.dataFormat() == "scalar") {
                    var fileValue = elem.getValue();
                    addToContents(fileValue.id(), fileValue.name());
                }
                else if (elem.dataFormat() == "array") {
                    var fileValues = elem.value().getValues();
                    $.each(fileValues, function (idx2, subFile) {
                        addToContents(subFile.id, subFile.name);
                    });
                }

            }
            if (elem.dataFormat() == "dataframe") {
                var variables = elem.value().value();
                $.each(variables, function (idx3, variable) {
                    if (variable.dataType() == "file") {
                        var fileValues = variable.value().getValues();
                        $.each(fileValues, function (idx2, subFile) {
                            addToContents(subFile.id, subFile.name);
                        });
                    }

                });
            }
        }
    });

    // parse images, video and audio elements in current session:
    var allFramesOrPages = this.getAllFramesOrPagesInSession();
    $.each(allFramesOrPages, function (frameIdx, entity) {

        var contentElements = entity.elements();
        for (var k = 0; k < contentElements.length; k++) {
            var contentElem = contentElements[k];
            if (contentElem.content() instanceof VideoElement ||
                contentElem.content() instanceof ImageElement ||
                contentElem.content() instanceof AudioElement) {
                if (contentElem.content().hasOwnProperty("file_id")) {
                    if (contentElem.content().file_id() && contentElem.content().file_orig_name()) {
                        addToContents(contentElem.content().file_id(), contentElem.content().file_orig_name());
                    }
                }
                var arr = contentElem.content().modifier().ndimModifierTrialTypes;
                if (arr.length > 0) {
                    deepDive(arr);
                }
            }
        }

        // now also add the fileIds in the actions:
        var actionsArr = [];
        $.each(entity.events(), function (idx, event) {
            event.getAllActions(actionsArr);
        });
        $.each(actionsArr, function (idx, action) {
            if (action instanceof ActionLoadFileIds) {
                $.each(action.files(), function (fileIdx, fileSpec) {
                    addToContents(fileSpec.id, fileSpec.name_original);
                });
            }
        });
    });

    if (this.experiment.exp_data.studySettings.disablePreloadingResources() || contentList.length == 0) {
        this.preloaderCompleted(true);
    }
    else {
        this.playerPreloader.start(contentList);
    }
};

Player.prototype.setSubjectGroupNr = function (groupNr, sessionNr) {
    this.groupNr = groupNr;
    this.sessionNr = sessionNr;

    console.log("groupNr=" + groupNr + " sessionNr=" + sessionNr);

    this.subj_group = this.experiment.exp_data.availableGroups()[this.groupNr - 1];
    if (!this.subj_group) {
        console.log(this.experiment.exp_data.staticStrings().errors.playerErrorNoSubjGroup);
        this.finishSessionWithError(this.experiment.exp_data.staticStrings().errors.playerErrorNoSubjGroup);
        return;
    }

    this.exp_session = this.subj_group.sessions()[this.sessionNr - 1];
    if (!this.exp_session) {
        console.log(this.experiment.exp_data.staticStrings().errors.playerErrorNoSession);
        this.finishSessionWithError(this.experiment.exp_data.staticStrings().errors.playerErrorNoSession);
        return;
    }


    if (this.exp_session.blocks().length == 0) {
        console.log(this.experiment.exp_data.staticStrings().errors.playerErrorNoBlock);
        this.finishSessionWithError(this.experiment.exp_data.staticStrings().errors.playerErrorNoBlock);
        return;
    }

    // randomize Block Order
    var self = this;
    var separator_positions = this.exp_session.blocks().map(function (block, index) {
        if (block.isSeparator() === true) {
            return index
        } else {
            return -1
        }
    }).filter(function (idx) {
        return idx != -1
    });

    if (separator_positions.length > 0) {
        separator_positions.splice(0, 0, -1)
        var new_order = [];
        separator_positions.forEach(function (sep_position, index) {
            var next_pos = separator_positions[index + 1]
            if (!(next_pos >= 0)) {
                next_pos = self.exp_session.blocks().length
            }
            var perm = [];
            for (var i = sep_position + 1; i < next_pos; i++) {
                perm.push(i);
            }
            ExpTrialLoop.prototype.reshuffle(perm);
            perm.forEach(function (newPos) {
                new_order.push(newPos)
            })

        })

        var newArr = [];
        for (var i = 0; i < new_order.length; i++) {
            newArr.push(this.exp_session.blocks()[new_order[i]])
        }
        this.exp_session.blocks(newArr);
    }
    else if (this.exp_session.blockRandomization() == "permutation") {
        var n = this.exp_session.blocks().length;
        if (n > 0) {
            var perm = [];
            for (var i = 0; i < n; i++) {
                perm.push(i);
            }
            ExpTrialLoop.prototype.reshuffle(perm);

            var newArr = [];
            for (var i = 0; i < n; i++) {
                newArr.push(this.exp_session.blocks()[perm[i]])
            }
            this.exp_session.blocks(newArr);
        }
    }
    this.blocks = this.exp_session.blocks();

    // randomize Task Order
    this.blocks.forEach(function (block) {
        var separator_positions = block.subTasks().map(function (task, index) {
            if (task.isSeparator() === true) {
                return index
            } else {
                return -1
            }
        }).filter(function (idx) {
            return idx != -1
        });

        if (separator_positions.length > 0) {
            separator_positions.splice(0, 0, -1)
            var new_order = [];
            var n = block.subTasks().length
            separator_positions.forEach(function (sep_position, index) {
                var next_pos = separator_positions[index + 1]
                if (!(next_pos >= 0)) {
                    next_pos = n;
                }
                var perm = [];
                for (var i = sep_position + 1; i < next_pos; i++) {
                    perm.push(i);
                }
                ExpTrialLoop.prototype.reshuffle(perm);
                perm.forEach(function (newPos) {
                    new_order.push(newPos)
                })

            })

            var newArr = [];
            for (var i = 0; i < new_order.length; i++) {
                newArr.push(block.subTasks()[new_order[i]])
            }
            block.subTasks(newArr);
        }

        else if (block.taskRandomization() == "permutation") {
            var n = block.subTasks().length;
            if (n > 0) {
                var perm = [];
                for (var i = 0; i < n; i++) {
                    perm.push(i);
                }
                ExpTrialLoop.prototype.reshuffle(perm);

                var newArr = [];
                for (var i = 0; i < n; i++) {
                    newArr.push(block.subTasks()[perm[i]])
                }
                block.subTasks(newArr);
            }
        }
    });


    // initialize variables that are session specific:
    this.experiment.exp_data.varSubjectCode().value().value(this.subject_code);
    this.experiment.exp_data.varSubjectNr().value().value(0); // TODO
    this.experiment.exp_data.varGroupName().value().value(this.subj_group.name());
    this.experiment.exp_data.varSessionTimeStamp().value().value(this.sessionStartTime);
    this.experiment.exp_data.varSessionTimeStampEnd().value().value(null); // this variable makes no sense to use? can only be set at the end...
    this.experiment.exp_data.varSessionName().value().value(this.exp_session.name());
    this.experiment.exp_data.varSessionNr().value().value(this.sessionNr);

};

Player.prototype.runCalibration = function (callback) {
    var self = this;

    var picWidthHeightRatio = 85.60 / 53.98;
    var displayDiagInPx = Math.sqrt(screen.width * screen.width + screen.height * screen.height);

    var convertInchToMM = 0.0393700787402;


    // init value

    var creditWidthInPixel = 500;
    self.PixelDensityPerMM = creditWidthInPixel / 85.60;
    self.experiment.exp_data.varPixelDensityPerMM().setValue(self.PixelDensityPerMM);
    // set number input:
    var displayDiagInMM = displayDiagInPx / self.PixelDensityPerMM;
    var displayDiagInInch = displayDiagInMM * convertInchToMM;
    this.screenCalibInitVal = displayDiagInInch;
    $("#calibrationInput").val(displayDiagInInch);


    $("#creditCard").resizable({
        aspectRatio: picWidthHeightRatio,
        handles: { 'e': '.ui-resizable-e' },
        resize: function (event, ui) {
            var creditWidthInPixel = ui.size.width;
            self.PixelDensityPerMM = creditWidthInPixel / 85.60;
            self.experiment.exp_data.varPixelDensityPerMM().setValue(self.PixelDensityPerMM);
            // set number input:
            var displayDiagInMM = displayDiagInPx / self.PixelDensityPerMM;
            var displayDiagInInch = displayDiagInMM * convertInchToMM;
            $("#calibrationInput").val(displayDiagInInch);

            console.log("creditWidthInPixel=" + creditWidthInPixel + " PixelDensityPerMM=" + self.PixelDensityPerMM);
        }
    });

    function numberInputChanged() {
        var displayDiagInInch = $("#calibrationInput").val() || self.screenCalibInitVal;
        var displayDiagInMM = displayDiagInInch / convertInchToMM; // converting inch to mm
        self.PixelDensityPerMM = displayDiagInPx / displayDiagInMM;
        self.experiment.exp_data.varPixelDensityPerMM().setValue(self.PixelDensityPerMM);
        // set size of image:
        var creditWidthInPixel = self.PixelDensityPerMM * 85.60;
        $("#creditCard").width(creditWidthInPixel);
        $("#creditCard").height(creditWidthInPixel / picWidthHeightRatio);

        console.log("displayDiagInPx=" + displayDiagInPx + " displayDiagInMM=" + displayDiagInMM + " PixelDensityPerMM=" + self.PixelDensityPerMM);
    }
    $("#calibrationInput").on('change keyup mouseup', numberInputChanged);

    // initialize size of picture:
    numberInputChanged();

    $('#confirmCalib').click(function () {
        $("#calibrationInput").off('change keyup mouseup', numberInputChanged);
        $('#calibrateScreen').hide();
        callback();
    });
    $('#calibrateScreen').show();
};


Player.prototype.setupPlayerDesign = function () {

    $('#experimentViewPort').css({
        "background-color": this.experiment.exp_data.studySettings.bgColor()
    });
};


Player.prototype.startExperiment = function () {
    // this.startExperimentContinue();
};

Player.prototype.startExperimentContinue = function () {

    this.timeMeasureControl();

    this.setupPlayerDesign();
    this.experiment.exp_data.varDisplayWidthX().value().value(window.innerWidth);
    this.experiment.exp_data.varDisplayWidthY().value().value(window.innerHeight);
    this.experiment.exp_data.varScreenTotalWidthX().value().value(screen.width);
    this.experiment.exp_data.varScreenTotalWidthY().value().value(screen.height);
    this.experiment.exp_data.varExpVersion().value().value(this.experiment.version());

    var self = this;


    if (this.runOnlyTaskId) {
        // run a test task session:
        this.currentTaskIdx = NaN;

        this.subjCounterGlobal = 1;
        this.subjCounterPerGroup = 1;
        this.experiment.exp_data.varSubjectNr().value().setValue(1);
        this.experiment.exp_data.varSubjectNrPerSubjGroup().value().setValue(1);


        this.currentTask = this.experiment.exp_data.entities.byId[this.runOnlyTaskId];
        if (this.currentTask.zoomMode() === "visualDegree" || this.currentTask.zoomMode() === "millimeter") {
            // first run calibration:
            this.runCalibration(function () {
                self.startRunningTask();
            });
        }
        else {
            this.startRunningTask();
        }
    }
    else {
        // run a real complete experiment session:
        var needsCalibration = false;
        for (var blockIdx = 0; blockIdx < this.blocks.length; blockIdx++) {
            var subTasks = this.blocks[blockIdx].subTasks();
            for (var taskIdx = 0; taskIdx < subTasks.length; taskIdx++) {
                var task = subTasks[taskIdx];
                if (task.zoomMode() === "visualDegree" || task.zoomMode() === "millimeter") {
                    needsCalibration = true;
                }
            }
        }

        function startRunning() {
            if (needsCalibration) {
                // first run calibration:
                self.runCalibration(function () {
                    self.startNextBlock();
                });
            }
            else {
                self.startNextBlock();
            }
        }
        if (!self.isTestrun) {

            if (this.experiment.publishing_data.sendRecordedDataToExternalServer()) {
                if (this.exp_license === 'lab') {
                    playerAjaxPostExternal(
                        '/setPlayerSessionStartedTime',
                        {
                            start_time: this.sessionStartTime,
                            expSessionNr: this.expSessionNr,
                            expId: self.expId,
                            sessionNr: this.seesionNr,
                            groupNr: this.groupNr,
                            token: this.token
                        },
                        null
                    );

                    var var_data = self.getSessionVarData();
                    playerAjaxPostExternal(
                        '/addMetaInfo',
                        {
                            expSessionNr: self.expSessionNr,
                            var_data: var_data,
                            expId: self.expId
                        },
                        null

                    );

                } else {
                    console.error("external data storage is only supported for lab license holders");
                }
            }

            playerAjaxPost(
                '/setPlayerSessionStartedTime',
                {
                    start_time: this.sessionStartTime,
                    expSessionNr: this.expSessionNr
                },
                function (data) {
                    if (data.success == false) {
                        if (data.msg === "timeout") {
                            self.finishSessionWithError("Dear participant, we are very sorry but your computer and/or internet connection are not compatible with the experiment's technical requirements. We apologize for any inconvenience. (ERROR 956)");
                            //self.finishSessionWithError("Our server is overloaded at the moment (error setting start time). Please come back later.");
                        }
                        else {
                            self.finishSessionWithError("Error: " + data.msg);
                        }
                        return;
                    }
                    console.log('recorded session start time');

                    self.subjCounterGlobal = data.subjCounterGlobal;
                    self.subjCounterPerGroup = data.subjCounterPerGroup;
                    self.experiment.exp_data.varSubjectNr().value().setValue(data.subjCounterGlobal);
                    self.experiment.exp_data.varSubjectNrPerSubjGroup().value().setValue(data.subjCounterPerGroup);

                    // add routes to save meta data
                    var var_data = self.getSessionVarData();
                    playerAjaxPost(
                        '/addMetaInfo',
                        {
                            expSessionNr: self.expSessionNr,
                            var_data: var_data,
                            expId: self.expId
                        },
                        function (data) {
                            if (data.success == false) {
                                self.finishSessionWithError("Error: " + data.msg);
                                return
                            }
                            console.log('recorded meta info');
                            startRunning();
                        }

                    );

                },
                20 * 1000
            );

        }
        else {
            self.subjCounterGlobal = 1;
            self.subjCounterPerGroup = 1;
            self.experiment.exp_data.varSubjectNr().value().setValue(1);
            self.experiment.exp_data.varSubjectNrPerSubjGroup().value().setValue(1);

            startRunning();
        }
    }
};

Player.prototype.startNextBlock = function () {
    this.currentBlockIdx++;
    if (this.blocks.length <= this.currentBlockIdx) {
        console.log("experiment session finished");
        this.finishSession(true);
    }
    else {
        console.log("starting block " + this.currentBlockIdx);
        this.currentBlock = this.blocks[this.currentBlockIdx];
        this.currentTaskIdx = -1;
        this.jumpToNextTask();
    }
};

Player.prototype.jumpToNextTask = function () {
    if (this.runOnlyTaskId) {
        this.finishSession(true);
    }
    else {
        // TODO: clean up of preloaded trials of old task.
        this.cleanUpCurrentTask();

        this.currentTaskIdx++;
        this.currentTask = this.currentBlock.subTasks()[this.currentTaskIdx];
        this.startRunningTask();
    }
};

Player.prototype.setSpecificBlockAndTask = function (blockIndex, taskIndex) {
    this.currentBlockIdx = blockIndex;
    if (this.blocks.length <= this.currentBlockIdx) {
        console.log("experiment session finished");
        this.finishSession(true);
    }
    else {
        console.log("starting block " + this.currentBlockIdx);
        this.currentBlock = this.blocks[this.currentBlockIdx];
        this.currentTaskIdx = taskIndex;
        this.currentTask = this.currentBlock.subTasks()[this.currentTaskIdx];
        this.startRunningTask();
    }
};


Player.prototype.jumpToSpecificTask = function (taskToJumpId) {
    if (this.runOnlyTaskId) {
        this.finishSession(true);
    }
    else {
        // TODO: clean up of preloaded trials of old task.
        this.cleanUpCurrentTask();

        var found = false;
        var blockIdx = this.currentBlockIdx;
        while (!found && blockIdx < this.blocks.length) {
            var tasks = this.blocks[blockIdx].subTasks();
            var taskIdx = 0;
            while (!found && taskIdx < tasks.length) {
                if (tasks[taskIdx].id() === taskToJumpId) { // taskID found
                    this.setSpecificBlockAndTask(blockIdx, taskIdx);
                    found = true;
                }
                taskIdx++;
            }
            blockIdx++;
        }
    }
};


Player.prototype.jumpToSpecificBlock = function (blockToJumpId) {
    if (this.runOnlyTaskId) {
        this.finishSession(true);
    }
    else {
        // TODO: clean up of preloaded trials of old task.
        this.cleanUpCurrentTask();

        var found = false;
        var blockIdx = 0;//this.currentBlockIdx+1;
        while (!found && blockIdx < this.blocks.length) {
            if (this.blocks[blockIdx].id() === blockToJumpId) { // taskID found
                this.setSpecificBlockAndTask(blockIdx, 0);
                found = true;
            }
            blockIdx++;
        }
    }
};

Player.prototype.setupEyetrackingV2 = function () {
    var self = this;
    console.log("setupEyetrackingV2...");
    this.eyetracking = new Eyetracking.Eyetracking();
    this.eyetracking.state.webcamStream = this.video_stream;
    this.eyetracking.state.expSessionNr = this.expSessionNr;
    this.eyetracking.state.headPoseImgPaths = "/assets/img";
    this.eyetracking.state.calibrationImageType = this.experiment.publishing_data.calibrationImgType();
    this.eyetracking.state.calibrationType = this.experiment.publishing_data.calibrationType();
    this.eyetracking.state.calibrationInfantFriendly = this.experiment.publishing_data.calibrationInfantFriendly();
    this.eyetracking.state.uploadEnabled = this.experiment.exp_data.studySettings.eyetrackingUploadEnabled();
    this.eyetracking.state.useDriftCorrection = this.currentTask.useDriftCorrection();
    this.eyetracking.state.playSounds = this.experiment.publishing_data.calibrationPlaySounds();
    this.eyetracking.state.showGridPoints = this.experiment.publishing_data.calibrationShowGrid();
    this.eyetracking.state.textStrings = this.experiment.exp_data.staticStrings()["eyetracking"];
    this.eyetracking.state.showHeadPoseIgnoreBtn = this.experiment.exp_data.studySettings.showHeadPoseIgnoreBtn();


    $("#eyetracking-v2").show();
    this.eyetracking.setPredictionCallback(function (data) {
        if (self.currentFrame) {
            self.currentFrame.triggerEyetracking(data);
        }
    });
    this.eyetracking.init().then(function () {
        return self.eyetracking.start();
    }).then(function () {
        self.calibrateEyetrackingV2();
    });
}

Player.prototype.calibrateEyetrackingV2 = function () {
    var self = this;
    console.log("calibrateEyetrackingV2...")
    this.eyetracking.calibrate().then(function (calibResult) {
        self.eyetrackingCalibrationAccuracy = calibResult;
        self.startRunningTask();
    });
}

Player.prototype.startRunningTask = function () {
    var self = this;

    if (this.currentTask) {
        // start initialization of trials: Randomization and Preloading:
        this.trialIter = "init";
        console.log("start initialization of trials: Randomization and Preloading");

        // check if we need to initialize eyetracking V2:
        if (this.currentTask.useEyetrackingV2()) {
            if (!this.eyetracking) {
                // this is the first task that is using eyetracking, so need to load the module and initialize it:
                if (window.hasOwnProperty('Eyetracking')) {
                    self.setupEyetrackingV2();
                }
                else {
                    // first dynamically load eyetracking.js:
                    var script = document.createElement('script');
                    script.onload = function () {
                        self.setupEyetrackingV2();
                    };
                    script.src = "assets/js/eyetracking.js";
                    document.head.appendChild(script);
                }
                return;
            }
            else if (!this.eyetracking.wasCalibrated()) {
                this.calibrateEyetrackingV2();
                return;
            }
            this.eyetracking.startPrediction();
        }
        else {
            if (this.eyetracking) {
                this.eyetracking.stopPrediction();
            }
        }
        $("#eyetracking-v2").hide();

        // create array with variables that need to be reset after each trial: (the actual reset is done further below)
        var allFrameDataInTrial = [];
        $.each(this.currentTask.subSequencePerFactorGroup(), function (idx, subSequence) {
            allFrameDataInTrial = allFrameDataInTrial.concat(subSequence.elements());
        });
        this.variablesToReset = [];
        this.variablesToRecord = [];
        this.factorsVars = [];
        var variablesToResetById = {};
        var variablesToRecordById = {};

        for (var i = 0; i < allFrameDataInTrial.length; i++) {
            var allVariablesInFrame = allFrameDataInTrial[i].localWorkspaceVars();

            for (var j = 0; j < allVariablesInFrame.length; j++) {
                // if variable was not initialized then do it now:
                if (allVariablesInFrame[j].value() == null) {
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

        // add trial id and nr variable to recordings:
        this.variablesToRecord.push(this.experiment.exp_data.varTrialId());
        this.variablesToRecord.push(this.experiment.exp_data.varTrialNr());
        this.variablesToRecord.push(this.experiment.exp_data.varConditionId());

        // ad role id if experiment is joint experiment
        if (this.experiment.exp_data.isJointExp()) {
            this.variablesToRecord.push(this.experiment.exp_data.varRoleId()); // TODO: should be deleted here, is instead recorded per session
            this.variablesToRecord.push(this.experiment.exp_data.varMultiUserGroupId()); // TODO: should be deleted here is instead recorded per session
        }

        // add all factor vars to recordings
        var allEntities = this.experiment.exp_data.entities();
        for (var i = 0; i < allEntities.length; i++) {
            if (allEntities[i].type == "GlobalVar") {
                if (allEntities[i].isFactor() && allEntities[i].levels().length > 1) {
                    this.factorsVars.push(allEntities[i]);
                    this.variablesToRecord.push(allEntities[i]);
                }
            }
        }

        // inidisplayInitialCountdowntialize variables that are task specific:
        if (this.currentBlock) {
            this.experiment.exp_data.varBlockName().value().value(this.currentBlock.name());
        }
        this.experiment.exp_data.varBlockNr().value().value(this.currentBlockIdx + 1);
        this.experiment.exp_data.varTaskName().value().value(this.currentTask.name());
        this.experiment.exp_data.varTaskNr().value().value(this.currentTaskIdx + 1);

        if (this.experiment.exp_data.isJointExp()) {    // synchronize trials among participants
            self.syncTrialOrder();

        } else {                                        // 'regular' non-joint Experiment
            // start randomization:
            this.randomizedTrials = this.currentTask.doTrialRandomization(self.subjCounterGlobal, self.subjCounterPerGroup);
            if (this.randomizedTrials.length == 0) {
                self.finishSessionWithError("The trial randomization settings in this task are defined such no trial was selected for displaying.");
                return;
            }
            this.startFirstTrialInitialization();
        }
    }
    else {
        this.startNextBlock();
    }

};

Player.prototype.startFirstTrialInitialization = function () {

    var self = this;

    console.log("randomization finished... start first trial initialization...");
    this.addTrialViews(0, 0, this.currentTask);

    self.trialIter = "waitForStart";
    self.startRecordingsOfNewTask(function () {

        if (self.currentTask.displayInitialCountdown()) {
            $('#experimentViewPort').css({
                "cursor": 'none'
            });

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
                $('#experimentViewPort').css({
                    "cursor": 'default'
                });
                self.startNextTrial(0);
            }, 3000);
        }
        else {
            // $('#countdownSection').show();
            // $('#countdown').text("preloading task");
            setTimeout(function () {
                //  $('#countdownSection').hide();
                self.startNextTrial(0);
            }, 500);
        }
    });
};

Player.prototype.syncTrialOrder = function () {

    // Do randomization first (even if other randomization will be assigned from server)

    // start randomization:
    this.randomizedTrials = this.currentTask.doTrialRandomization();

    var trialOrderData = [];

    for (var i = 0; i < this.randomizedTrials.length; i++) {

        // retrieve relevant data
        var trialVariation = this.randomizedTrials[i].trialVariation;
        var condition = trialVariation.condition;
        var factorGroup = condition.factorGroup;

        // retrieve positions of relevant data
        var posTrialVariation = condition.trials.indexOf(trialVariation);
        var posCondition = factorGroup.conditionsLinear().indexOf(condition);
        var posFactorGroup = this.currentTask.factorGroups.indexOf(factorGroup);

        trialOrderData.push({
            trialVariationId: trialVariation.uniqueId(), // same as posTrialVariation + 1
            posTrialVariation: posTrialVariation,
            posCondition: posCondition,
            posFactorGroup: posFactorGroup
        });
    }

    // submit this trialorder (might receive different one if another participant already submitted)
    this.jointExpLobby.submitTrialOrder(trialOrderData, this.currentTaskIdx);

};

Player.prototype.startRecordingsOfNewTask = function (cb) {
    var self = this;
    if (!this.runOnlyTaskId && !this.isTestrun) {


        // record variables at start of task:
        var recordData = {
            expSessionNr: this.expSessionNr,
            expId: self.expId,
            blockNr: this.experiment.exp_data.varBlockNr().value().value(),
            blockId: this.currentBlock.id(),
            blockName: this.experiment.exp_data.varBlockName().value().value(),
            taskNr: this.experiment.exp_data.varTaskNr().value().value(),
            taskId: this.currentTask.id(),
            taskName: this.experiment.exp_data.varTaskName().value().value(),
            start_time: pgFormatDate(new Date()),
        };




        playerAjaxPost(
            '/recordStartTask',
            recordData,
            function (result) {
                if (result.success) {
                    self.recTaskId = result.recTaskId;
                    recordData.recTaskId = result.recTaskId;
                    if (self.experiment.publishing_data.sendRecordedDataToExternalServer()) {
                        if (self.exp_license === 'lab') {
                            playerAjaxPostExternal(
                                '/recordStartTask',
                                recordData,
                                null,
                                5 * 60 * 1000 // 5 minutes timeout
                            );
                        } else {
                            console.error("external data storage is only supported for lab license holders");
                        }
                    }
                    cb();
                }
                else {
                    self.finishSessionWithError("recording of new task failed with error: " + result.msg);
                    throw new Error("recording of new task failed failed with error: " + result.msg);
                }
            },
            5 * 60 * 1000 // 5 minutes timeout
        );
    }
    else {
        cb();
    }
};

Player.prototype.recordData = function (isDuringTrial) {
    var self = this;
    if (!this.runOnlyTaskId && !this.isTestrun) {

        if (this.trialIter === "waitForStart" || this.trialIter === "init") {
            return;
        }

        // record variables at end of trial:
        var recData = new RecData();

        // new, dynamic verison
        for (var i = 0; i < this.variablesToRecord.length; i++) {
            var saveByName = (self.experiment.publishing_data.sendRecordedDataToExternalServer() && this.exp_license === 'lab');
            recData.addRecording(this.variablesToRecord[i], saveByName, isDuringTrial);
        }

        // server command
        var recordedData = {
            expSessionNr: this.expSessionNr,
            trialNr: this.trialIter,
            recData: recData.toJS(),
            recTaskId: self.recTaskId,
            expId: self.expId,
            taskId: this.currentTask.id(),
        };

        // add new recording to queue:
        this.recordTrialQueue.push(recordedData);

        this.processRecordTrialQueue();

    }
};

Player.prototype.processRecordTrialQueue = function () {
    var self = this;
    if (this.recordTrialQueueIsUploading) {
        console.log("some previous trial upload is still in prgress...");
    }
    else {
        // check if there is something in the queue to upload:
        if (self.recordTrialQueue.length > 0) {
            console.log("starting next trial upload...");
            this.recordTrialQueueIsUploading = true;
            var nextRecordedData = self.recordTrialQueue[0];
            var callback = function (data) {
                if (data.success == false) {
                    if (data.errorThrown == "Payload Too Large" || data.status == 413) {

                        function countSize(obj) {
                            var counter = 0;
                            for (var k in obj) {
                                if (obj[k] instanceof Object) {
                                    counter += countSize(obj[k]);
                                } else {
                                    counter++;
                                };
                            }
                            return counter;
                        };

                        var maxSize = 0;
                        var globVarIdWithMaxSize = null;
                        for (var globVarId in nextRecordedData.recData.data) {
                            if (nextRecordedData.recData.data.hasOwnProperty(globVarId)) {
                                var paramSize = countSize(nextRecordedData.recData.data[globVarId]);
                                if (paramSize > maxSize) {
                                    maxSize = paramSize;
                                    globVarIdWithMaxSize = globVarId;
                                }
                            }
                        }

                        var largestGlobVar = self.experiment.exp_data.availableVars.byId[globVarIdWithMaxSize];
                        var largestVarErrMsg = "";
                        if (largestGlobVar && largestGlobVar.name()) {
                            largestVarErrMsg = "The largest recording was in variable " + largestGlobVar.name() + ". If you are the experiment creator, then please reduce the recording size of this variable to fix this problem.";
                        }

                        // remove first element from queue:
                        self.recordTrialQueue.shift();

                        self.finishSessionWithError("Recordings in this trial are exceeding the maximum allowed size. " + largestVarErrMsg);
                        self.processRecordTrialQueue();
                    }
                    else {
                        self.retryCounter += 1;
                        var retryInMs = self.retryCounter * 300;
                        console.log("error uploading trial data... retry in " + retryInMs + " ms...");
                        setTimeout(function () {
                            self.recordTrialQueueIsUploading = false;
                            self.processRecordTrialQueue();
                        }, retryInMs);
                    }
                }
                else {
                    // remove first element from queue:
                    self.recordTrialQueue.shift();
                    self.retryCounter = 0;
                    self.recordTrialQueueIsUploading = false;

                    // check if there is something in the queue to process:
                    self.processRecordTrialQueue();
                }
            };

            if (this.experiment.publishing_data.sendRecordedDataToExternalServer() && this.exp_license === 'lab') {
                playerAjaxPostExternal(
                    '/recordTrial',
                    nextRecordedData,
                    callback,
                    60 * 1000
                );

            }

            else {
                playerAjaxPost(
                    '/recordTrial',
                    nextRecordedData,
                    callback,
                    60 * 1000
                );
            }

        }

    }
};


Player.prototype.cleanUpCurrentTask = function () {
    this.cleanUpCurrentTrial();
    this.cleanUpNextTrial();
};

Player.prototype.cleanUpNextTrial = function () {
    this.cleanUpTrial(this.nextTrialFrames, this.nextTrialDiv, this.nextSequence);
    this.nextTrialIndexPreloaded = "NOTLOADED";
};

Player.prototype.cleanUpCurrentTrial = function () {
    this.cleanUpTrial(this.currentTrialFrames, this.currentTrialDiv, this.currentSequence);
};

Player.prototype.cleanUpTrial = function (currentTrialFrames, currentTrialDiv, currentSequence) {
    if (currentTrialFrames) {
        for (var oldTrialFrameKeys in currentTrialFrames) {
            if (currentTrialFrames.hasOwnProperty(oldTrialFrameKeys)) {
                currentTrialFrames[oldTrialFrameKeys].dispose();
            }
        }
    }

    if (currentTrialDiv) {
        ko.cleanNode(currentTrialDiv);
        currentTrialDiv.remove();
    }

    if (currentSequence) {
        currentSequence.dispose();
    }
};

Player.prototype.switchToNextPreloadedTrial = function () {
    // select next element from preload
    this.currentTrialFrames = this.nextTrialFrames;
    this.currentTrialDiv = this.nextTrialDiv;
    this.currentSequence = this.nextSequence;

    this.nextTrialFrames = null;
    this.nextTrialDiv = null;
    this.nextSequence = null;
};

Player.prototype.startNextTrial = function (trialIndex) {
    var self = this;

    if (this.isPaused()) {
        // wait until unpaused...
        this.subscriberPausedWhileTrialLoading = this.isPaused.subscribe(function (isPausedNew) {
            if (!isPausedNew) {
                self.subscriberPausedWhileTrialLoading.dispose();
            }
            self.startNextTrial(trialIndex);
        });
        return;
    }

    if (this.trialJumpInProgress) {
        // the last trial jump did not yet finish completely (i.e. preloading of next trial is not yet finished)

        // need to remember this call if no other call was there first:
        if (this.trialJumpDelayedCb === null) {
            // remember this call as a callback that will be automatically executed, once the preloading is finished
            this.trialJumpDelayedCb = function () {
                self.startNextTrial(trialIndex);
            };
        }

        // at the moment return and wait for delayed call once old call is finished:
        return true;
    }
    this.trialJumpInProgress = true;

    if (this.trialIter == "waitForStart") {
        this.trialIter = 0;
        this.trialIndex = 0;
    }
    else {
        this.recordData();
        // start next trial:
        this.trialIter++;
        this.trialIndex = trialIndex;
    }

    if (this.trialIndex >= this.randomizedTrials.length) {
        // trial loop finished:
        console.log("task finished");
        this.trialIter = "init"; // reset to init so that another trial loop in another block will start from the beginning
        this.trialIndex = null;

        // reset variables that would track concurrent calls to startNextTrial (should anyway already have this state):
        this.trialJumpInProgress = false;
        this.trialJumpDelayedCb = null;

        self.jumpToNextTask();
        return;
    }

    console.log("start trial iteration " + this.trialIter);
    var trialSelection = this.randomizedTrials[this.trialIndex];

    // already here remove current trial datamodels and views etc:
    this.cleanUpCurrentTrial();

    this.currentTrialId = trialSelection.trialVariation.uniqueId();
    console.log("start randomized trial id " + this.currentTrialId);

    // set some predefined variables for this trial:
    this.experiment.exp_data.varTrialId().value().value(this.currentTrialId);
    this.experiment.exp_data.varTrialNr().value().value(this.trialIter + 1);
    this.experiment.exp_data.varConditionId().value().value(trialSelection.condition.conditionIdx());

    // reset variables at start of trial:
    for (var i = 0; i < this.variablesToReset.length; i++) {
        this.variablesToReset[i].resetValueToStartValue();
    }

    // set factor values
    for (var i = 0; i < this.factorsVars.length; i++) {
        // TODO: this.factorsVars is not needed, because we could also just do this directly by reading out the factors that are within the condition:
        var factorValue = trialSelection.condition.getCurrentValueOfFactor(this.factorsVars[i].id());
        this.factorsVars[i].value().value(factorValue);
    }

    // check if current preloaded next trial corresponds to the desired next trialIndex. If not, we need to preload it instead:
    if (this.nextTrialIndexPreloaded != trialIndex) {
        // need to clean up the previously preloaded trial that is unfortunately not matching to the next desired trial:
        this.cleanUpNextTrial();

        // preload desired next trial:
        this.addTrialViews(this.trialIndex, this.trialIter, this.currentTask);

        // need to wait for rendering to finish:
        setTimeout(function () {
            self.startNextTrialContinue1();
        }, 1)
    }
    else {
        this.startNextTrialContinue1();
    }
};

Player.prototype.startNextTrialContinue1 = function () {
    var self = this;
    if (this.currentTask.useEyetrackingV2()) {
        this.eyetracking.stopPrediction();
        $("#eyetracking-v2").show();
        this.eyetracking.recalibrate(this.currentTask.eyetrackingV2numRecalibPoints(), this.currentTask.eyetrackingV2numDriftPoints()).then(
            function (result) {
                self.eyetrackingValidationAccuracy = result;
                console.log("eyetracking retest result: ", result);
                self.eyetracking.startPrediction();
                $("#eyetracking-v2").hide();
                self.startNextTrialContinue2();
            });
    }
    else {
        self.startNextTrialContinue2();
    }
}

Player.prototype.startNextTrialContinue2 = function () {
    var self = this;

    this.switchToNextPreloadedTrial();

    // go into trial sequence:
    this.currentSequence.currSelectedElement(null);
    this.currentSequence.selectNextElement();
    this.startNextPageOrFrame();

    // preload next trial if exists:
    if (this.trialIndex + 1 < this.randomizedTrials.length) {
        // call is async to allow first to execute time critical stuff that is user facing...
        setTimeout(function () {
            self.addTrialViews(self.trialIndex + 1, self.trialIter + 1, self.currentTask);
            self.startNextTrialFinished();
        }, 1);
    }
    else {
        this.startNextTrialFinished();
    }
};

Player.prototype.startNextTrialFinished = function () {
    // all things that were necessary for the previous jump are now finished (including preloading of next trial if there is one)..

    // now unlock new calls to startNextTrial:
    this.trialJumpInProgress = false;

    // if there was a call to startNextTrial during the time it was locked, then this will now be executed:
    if (this.trialJumpDelayedCb !== null) {
        // execute delayed call to startNextTrial that was delayed because previous trial jump was still in progress:
        this.trialJumpDelayedCb();

        // remove the callback immediately:
        this.trialJumpDelayedCb = null;
    }
};

Player.prototype.startNextPageOrFrame = function () {
    // this function is just interposed to manage synchronization.
    var subsequentElement = this.currentSequence.currSelectedElement();

    if (this.experiment.exp_data.isJointExp() && subsequentElement && subsequentElement.type != "EndOfSequence") {

        var subsequentPageOrFrame = this.currentTrialFrames[subsequentElement.id()];

        // check if next page or frame needs to be synchronized
        if (this.currentTask && this.currentTask.syncTaskStart && this.currentTask.syncTaskStart()) {
            // case: sync task start
            this.currentTask.syncTaskStart(false); // deactivate once used
            this.jointExpLobby.syncNextFrame(this.currentSequence.elements().indexOf(subsequentElement), this.trialIter);
        }
        else if ((subsequentPageOrFrame.frameData && subsequentPageOrFrame.frameData.syncFrame()) || (subsequentPageOrFrame.frameData && subsequentPageOrFrame.frameData.syncFrame())) {
            // case: sync next frame start (skip if task start is already synchronized)
            this.jointExpLobby.syncNextFrame(this.currentSequence.elements().indexOf(subsequentElement), this.trialIter);
        } else {
            this.startNextPageOrFrameOriginal();
        }
    } else {
        this.startNextPageOrFrameOriginal();
    }
};

Player.prototype.startNextPageOrFrameOriginal = function () {
    var currentElement = this.currentSequence.currSelectedElement();
    var frameIdx = this.currentSequence.elements().indexOf(currentElement);
    console.log('starting frame nr: ' + frameIdx + ' in trial nr: ' + this.trialIter);
    var lastMouseCoords = null;
    if (this.currentFrame) {
        lastMouseCoords = this.currentFrame.frameMouseXY();
    }

    switch (currentElement.type) {
        case 'FrameData':

            this.currentFrame = this.currentTrialFrames[currentElement.id()];
            this.currentFrame.startFrame(lastMouseCoords);
            break;
        case 'PageData':
            this.currentFrame = this.currentTrialFrames[currentElement.id()];
            this.currentFrame.startFrame(lastMouseCoords);
            break;
        case 'EndOfSequence':
            console.log("starting next trial");
            this.startNextTrial(this.trialIndex + 1);
            break;
        default:
            console.error("type " + currentElement.type + " is not defined.");
    }
};

Player.prototype.addTrialViews = function (trialIndex, trialIter, task) {

    this.nextTrialDiv = $(document.createElement('div'));
    this.nextTrialDiv.css({
        "width": "100%",
        "height": "100%"
    });
    $('#experimentTree').append(this.nextTrialDiv);
    var nextTrialSelection = this.randomizedTrials[trialIndex];

    var factorGroupIdx = task.factorGroups().indexOf(nextTrialSelection.factorGroup);
    this.nextSequence = task.subSequencePerFactorGroup()[factorGroupIdx].getDeepCopyForPlayer();
    this.nextSequence.selectTrialType(nextTrialSelection);
    var frameDataArr = this.nextSequence.elements();

    this.nextTrialFrames = {};
    for (var frameIdx = 0; frameIdx < frameDataArr.length; frameIdx++) {

        var frameDiv = $(document.createElement('div'));
        frameDiv.css({
            'display': 'none',
            "width": "100%",
            "height": "100%"
        });
        $(this.nextTrialDiv).append(frameDiv);

        var playerFrame = new PlayerFrame(frameDataArr[frameIdx], frameDiv, this);
        playerFrame.trialIter = trialIter;
        //playerFrame.frameData.selectTrialType(nextTrialSelection);
        playerFrame.init();
        this.nextTrialFrames[frameDataArr[frameIdx].id()] = playerFrame;
    }

    this.nextTrialIndexPreloaded = trialIndex;

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


Player.prototype.finishSessionWithError = function (err_msg) {
    if (this.sessionEnded) {
        // This is very important, so that the server is not DoS's in case of a player bug. Only allow sessionEnd once!
        return;
    }
    this.sessionEnded = true;
    $("#pauseScreen").empty();
    console.log("error during experiment...");


    if (this.experiment.publishing_data.sendRecordedDataToExternalServer()) {
        if (this.exp_license === 'lab') {
            playerAjaxPostExternal(
                '/errExpSession',
                {
                    expSessionNr: self.expSessionNr,
                    expId: self.expId,
                    err_msg: err_msg,
                }

            );
        } else {
            console.error("external data storage is only supported for lab license holders");
        }
    }

    playerAjaxPost(
        '/errExpSession',
        {
            err_msg: err_msg
        },
        function (data) {
            if (data.success == false) {
                console.error("cannot sent error to server...")
            }
        },
        60 * 1000
    );
    $('#experimentViewPort').hide();
    $('#sectionPreload').hide();
    $('#errEndExpSection').show();
    $('#err_msg').text(err_msg);
    $('#errEndExp').click(function () {
        history.go(-1);
    });
};

Player.prototype.getSessionVarData = function () {

    // collect values of variables with recording scope "subject" and recording scope "session":
    var subjectData = new RecData();
    var sessionData = new RecData();
    subjectData.scope = "subject";
    sessionData.scope = "session";
    var allVars = this.experiment.exp_data.availableVars();
    for (var i = 0; i < allVars.length; i++) {
        if (allVars[i].isRecorded()) {
            if (allVars[i].scope() == "subject") {
                subjectData.addRecording(allVars[i], true, false);
            }
            else if (allVars[i].scope() == "session") {
                sessionData.addRecording(allVars[i], true, false);
            }
        }
    }

    var var_data = {
        subjectData: subjectData.toJS(),
        sessionData: sessionData.toJS(),

        // the following manual recordings are all deprecated... please do not add new ones here:
        browserSpec: this.experiment.exp_data.varBrowserSpec().value().toJS(),
        versionSpec: this.experiment.exp_data.varBrowserVersionSpec().value().toJS(),
        systemSpec: this.experiment.exp_data.varSystemSpec().value().toJS(),
        agentSpec: this.experiment.exp_data.varAgentSpec().value().toJS(),
        fullscreen: this.experiment.exp_data.varFullscreenSpec().value().toJS(),
        timeDelayMean: this.experiment.exp_data.varTimeMeasureSpecMean().value().toJS(),
        crowdsourcinSubjId: this.experiment.exp_data.varCrowdsourcingSubjId().value().toJS(),
        crowdsourcingCode: this.experiment.exp_data.varCrowdsourcingCode().value().toJS(),
        serverResponseTimes: this.serverResponseTimes,
        timeDelayStd: this.experiment.exp_data.varTimeMeasureSpecStd().value().toJS(),
        subjCounterGlobal: this.experiment.exp_data.varSubjectNr().value().toJS(),
        subjCounterPerGroup: this.experiment.exp_data.varSubjectNrPerSubjGroup().value().toJS(),
        roleId: this.experiment.exp_data.varRoleId().value().toJS(),
        multiUserGroupId: this.experiment.exp_data.varMultiUserGroupId().value().toJS(),
        displayedLanguage: this.experiment.exp_data.varDisplayedLanguage().value().toJS(),
        pixelDensityPerMM: this.experiment.exp_data.varPixelDensityPerMM().value().toJS(),
        screenHeight: this.experiment.exp_data.varScreenTotalWidthY().value().toJS(),
        screenWidth: this.experiment.exp_data.varScreenTotalWidthX().value().toJS(),
        windowHeight: this.experiment.exp_data.varDisplayWidthY().value().toJS(),
        windowWidth: this.experiment.exp_data.varDisplayWidthX().value().toJS(),

    };
    return var_data;
}
Player.prototype.finishSession = function (showEndPage) {
    var self = this;
    if (this.sessionEnded) {
        // This is very important, so that the server is not DoS's in case of a player bug. Only allow sessionEnd once!
        return;
    }
    $("#pauseScreen").empty();
    this.sessionEnded = true;

    if (typeof showEndPage == "string") {
        self.endExpSectionCustomText(showEndPage);
    }

    if (this.experiment.exp_data.isJointExp()) {
        this.jointExpLobby.experimentFinished();
    }

    if (this.timeControlArray.length >= 1) {
        this.timeControlArray.splice(0, 1);
    }


    var total = 0;
    for (var i = 0; i < this.timeControlArray.length; i++) {
        total += this.timeControlArray[i];
    }
    var meanDelay = (total / this.timeControlArray.length) - Player.prototype.desiredDelayInMs;
    var maxDelay = Math.max.apply(null, this.timeControlArray) - Player.prototype.desiredDelayInMs;

    var stdDelay = 0;
    for (var key in this.timeControlArray) {
        stdDelay += Math.pow((parseFloat(this.timeControlArray[key] - Player.prototype.desiredDelayInMs) - meanDelay), 2);
    }
    var stdDelay = Math.sqrt(stdDelay / this.timeControlArray.length);

    this.experiment.exp_data.varTimeMeasureSpecMean().value().value(meanDelay);
    this.experiment.exp_data.varTimeMeasureSpecStd().value().value(stdDelay);
    //  this.experiment.exp_data.varTimeMeasureSpecMax().value().value(maxDelay);

    // set crowdsourcingCode
    if (this.isPlayerCalledWithType()) {
        this.experiment.exp_data.varCrowdsourcingCode().value().value(this.crowdsourcingCode());
    }

    var var_data = this.getSessionVarData();

    console.log("finishExpSession...");

    function onSentDataComplete() {
        if (showEndPage) {
            $('#experimentViewPort').hide();
            $('#endExpSection').show();
        }

        $('#endExp').click(function () {
            window.location = "/page/library";
        });

        self.exitFullscreen();
    }

    if (!this.runOnlyTaskId && !this.isTestrun) {

        var end_time = new Date();
        var nextStartTime = null;
        var nextEndTime = null;
        var reminderTime = null;
        var emailReminder = "noReminder";

        var nextStartWindow = this.getNextStartWindow(end_time);
        if (nextStartWindow) {
            if (nextStartWindow.start) {
                nextStartTime = pgFormatDate(nextStartWindow.start);
                var reminderDate = new Date(nextStartWindow.start.getTime());
                var reminderDelayMinutes = 0; // this could also be a setting somewhere in the editor...
                reminderDate.setMinutes(reminderDate.getMinutes() + reminderDelayMinutes);
                reminderTime = pgFormatDate(reminderDate);
            }
            if (nextStartWindow.end) {
                nextEndTime = pgFormatDate(nextStartWindow.end)
            }
            emailReminder = "sendTokenNow";
        }

        var self = this;

        var data_send = {
            expSessionNr: self.expSessionNr,
            end_time: pgFormatDate(end_time),
            nextStartTime: nextStartTime,
            nextEndTime: nextEndTime,
            reminderTime: reminderTime,
            emailReminder: emailReminder,
            var_data: var_data,
            selectedEmail: self.selectedEmail,
            expId: self.expId
        };

        if (this.experiment.publishing_data.sendRecordedDataToExternalServer()) {
            if (this.exp_license === 'lab') {
                playerAjaxPostExternal(
                    '/finishExpSession',
                    data_send,
                    null,
                    5 * 60 * 1000
                );
            } else {
                console.error("external data storage is only supported for lab license holders");
            }
        }

        playerAjaxPost(
            '/finishExpSession',
            data_send,
            function (data) {
                if (data.success == false) {
                    console.error("error during finishExpSession...")
                }
                else {
                    self.linkToStartNextSession(data.link)
                    if (nextStartWindow) {
                        self.showLinkOnEndPage(true);
                    }
                    onSentDataComplete();
                }
            },
            5 * 60 * 1000
        );
    }
    else {
        onSentDataComplete();
    }


};

Player.prototype.copyNextSessionLinkTarget = function () {

    this.copyTextContent($("#copyTarget")[0]);
};

Player.prototype.getScreenOrientation = function () {
    var orientation = window.screen.orientation;
    if (orientation) {
        return orientation.type.startsWith("portrait") ? "portrait" : "landscape";
    }
    else {
        // fallback 1:
        var mql = window.matchMedia("(orientation: portrait)");
        return mql.matches ? "portrait" : "landscape";
    }
    /*else {
        // fallback 2:
        var currAngle = (window.orientation + 360) % 90; // can result in 0 or 90
        if (!this.hasOwnProperty("angleWhenPortrait")) {
            // need to initialize (mapping window.orientation angles to portrait or landscape)
            if (window.innerHeight > window.innerWidth) { // portrait:
                this.angleWhenPortrait = currAngle;
            }
            else { // landscape:
                this.angleWhenPortrait = (currAngle + 90) % 90;
            }
        }
        return (currAngle == this.angleWhenPortrait) ? "portrait" : "landscape";
    }*/
}

Player.prototype.initScreenOrientation = function () {
    var self = this;

    var currOri = this.getScreenOrientation();
    this.screenOrientationCurrent(currOri);

    // check screen orientation:
    var orientation = window.screen.orientation;
    if (orientation) {
        orientation.addEventListener('change', function () {
            self.checkScreenOrientation();
        });
    }
    else {
        // fallback 1:
        var mql = window.matchMedia("(orientation: portrait)");
        mql.addListener(function (m) {
            self.checkScreenOrientation();
        });
    }
    /*else {
        // fallback 2:
        window.addEventListener("orientationchange", function() {
            self.checkScreenOrientation();
        }, false);
    }*/

    if (this.experiment.exp_data.studySettings.allowedOrientations() == "any") {
        // jallow changes during the experiment:
        this.screenOrientationRequired("any");
        return true;
    }
    else if (this.experiment.exp_data.studySettings.allowedOrientations() == "anylock") {
        // just make sure that the screen orientation does not change during the experiment:
        this.screenOrientationRequired(currOri);
        return true;
    }
    else {
        // set target orientation:
        this.screenOrientationRequired(this.experiment.exp_data.studySettings.allowedOrientations());

        // check if requirmeent is fullfilled:
        if (this.checkScreenOrientation()) {
            return true;
        }
        else {
            return false;
        }
    }
}

Player.prototype.checkScreenOrientation = function () {
    // update:
    this.screenOrientationCurrent(this.getScreenOrientation());
    if (this.screenOrientationRequired() == "any") {
        return true;
    }
    if (this.screenOrientationRequired() == this.screenOrientationCurrent()) {
        var orientation = window.screen.orientation;
        if (orientation) {
            orientation.lock(this.experiment.exp_data.studySettings.allowedOrientations());
        }
        this.pausedDueToOrientation(false);
        return true;
    }
    else {
        this.pausedDueToOrientation(true);
        return false;
    }
}

Player.prototype.startFullscreen = function () {
    var self = this;

    // for compatibility check if safari is used:
    if (this.experiment.exp_data.varBrowserSpec().value().value() === "Safari" &&
        parseFloat(this.experiment.exp_data.varBrowserVersionSpec().value().value()) < 10.1) {

        // check if some KeyboardTrigger has alphanumeric enabled:
        var alphaNumericEnabled = false;
        var allFramesOrPages = this.getAllFramesOrPagesInSession();
        $.each(allFramesOrPages, function (frameIdx, entity) {
            var actionsArr = [];
            $.each(entity.events(), function (idx, event) {
                var trigger = event.trigger();
                if (trigger instanceof TriggerKeyboard) {
                    if (trigger.alphaNumericEnabled()) {
                        alphaNumericEnabled = true;
                    }
                }
            });
        });
        if (alphaNumericEnabled) {
            // do not enter fullscreen mode:
            return;
        }
    }


    var element = document.documentElement;
    if (element.requestFullscreen) {
        element.requestFullscreen();
    } else if (element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
    } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
    }

    // set fullscreen check variable to true
    this.experiment.exp_data.varFullscreenSpec().value().setValue(true);

    function fs_status() {
        if (document.fullscreenElement) {
            return true;
        }
        else if (document.webkitFullscreenElement) {
            return true;
        }
        else if (document.mozFullScreenElement) {
            return true;
        }
        else {
            return false;
        }
    }

    function exitHandler() {
        if (!fs_status() && !self.sessionEnded) {
            self.experiment.exp_data.varFullscreenSpec().value().setValue(false);
            if (self.experiment.exp_data.studySettings.pauseOnExitFullscreen()) {
                self.pausedDueToFullscreen(true);
            }
        }
    }

    if (document.addEventListener) {
        document.addEventListener('webkitfullscreenchange', exitHandler, false);
        document.addEventListener('mozfullscreenchange', exitHandler, false);
        document.addEventListener('fullscreenchange', exitHandler, false);
        document.addEventListener('MSFullscreenChange', exitHandler, false);
    }

};

Player.prototype.continueFullscreen = function () {
    this.startFullscreen();
    this.pausedDueToFullscreen(false);
};

Player.prototype.exitFullscreen = function () {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    }
};


Player.prototype.getCurrentStartWindow = function () {
    var prevSessionEndTime = new Date();
    var sessionNr = this.sessionNr;
    if (this.prevSessionData) {
        if (this.prevSessionData.length > 0) {
            var ind = 0;
            var endTime = null;
            var newEndTime = null;
            this.prevSessionData.forEach(function (entry, index) {
                if (entry.end_time) {
                    if (endTime) {
                        newEndTime = new Date(entry.end_time);
                        if (newEndTime > endTime) {
                            endTime = newEndTime;
                            ind = index;
                        }
                    } else {
                        endTime = new Date(entry.end_time);
                        ind = index;
                    }

                }
            });

            prevSessionEndTime = new Date(this.prevSessionData[ind].end_time);
        }
    }

    var sessionTimeData = this.experiment.exp_data.availableGroups()[this.groupNr - 1].sessionTimeData()[sessionNr - 1];
    var currentDate = new Date();
    var currentStartWindow = this.determineNextSessionStartWindow(prevSessionEndTime, currentDate, sessionTimeData);
    return currentStartWindow;
};

Player.prototype.getNextStartWindow = function (prevSessionEndTime) {
    var sessionNr = this.sessionNr + 1;
    var sessionTimeData = this.experiment.exp_data.availableGroups()[this.groupNr - 1].sessionTimeData()[sessionNr - 1];

    if (!sessionTimeData) {
        // no more session defined:
        return false;
    }
    var currentDate = new Date();
    var nextStartWindow = this.determineNextSessionStartWindow(prevSessionEndTime, currentDate, sessionTimeData);
    return nextStartWindow;
};




Player.prototype.determineNextSessionStartWindow = function (prevSessionEndTime, currentDate, sessionTimeData) {

    var startDate = new Date();
    var endDate = new Date();

    var nextStartWindow = {
        start: null,
        end: null,
        current: null
    };

    if (sessionTimeData && sessionTimeData.startCondition() != "anytime") {
        if (sessionTimeData.startCondition() == "specific") {

            var timeOffsetInMS = currentDate.getTimezoneOffset() * 60000; // difference in ms
            currentDate.setTime(currentDate.getTime() + timeOffsetInMS);
            startDate.setTime(startDate.getTime() + timeOffsetInMS);
            endDate.setTime(endDate.getTime() + timeOffsetInMS);


            if (sessionTimeData.startTime() && sessionTimeData.endTime() && sessionTimeData.startDay() && sessionTimeData.endDay()) {

                var startMinute = parseInt(sessionTimeData.startTime().substring(3, 5));
                startDate.setMinutes(startMinute);
                var startHour = parseInt(sessionTimeData.startTime().substring(0, 2));
                startDate.setHours(startHour);
                var startDay = parseInt(sessionTimeData.startDay().substring(8, 10));
                startDate.setDate(startDay);
                var startMonth = parseInt(sessionTimeData.startDay().substring(5, 7)) - 1;
                startDate.setMonth(startMonth);
                var startYear = parseInt(sessionTimeData.startDay().substring(0, 4));
                startDate.setFullYear(startYear);

                var endMinute = parseInt(sessionTimeData.endTime().substring(3, 5));
                endDate.setMinutes(endMinute);
                var endHour = parseInt(sessionTimeData.endTime().substring(0, 2));
                endDate.setHours(endHour);
                var endDay = parseInt(sessionTimeData.endDay().substring(8, 10));
                endDate.setDate(endDay);
                var endMonth = parseInt(sessionTimeData.endDay().substring(5, 7)) - 1;
                endDate.setMonth(endMonth);
                var endYear = parseInt(sessionTimeData.endDay().substring(0, 4));
                endDate.setFullYear(endYear);
            }
            else {
                console.log("error: cannot calculate session start time because fields are not set")
            }

        }
        else if (sessionTimeData.startCondition() == "periodic") {

            var timeOffsetInMS = currentDate.getTimezoneOffset() * 60000; // difference in ms
            currentDate.setTime(currentDate.getTime() + timeOffsetInMS);
            startDate.setTime(startDate.getTime() + timeOffsetInMS);
            endDate.setTime(endDate.getTime() + timeOffsetInMS);

            if (sessionTimeData.startTime() && sessionTimeData.endTime() && sessionTimeData.startDay() && sessionTimeData.endDay() && sessionTimeData.startInterval()) {

                var startMinute = parseInt(sessionTimeData.startTime().substring(3, 5));
                startDate.setMinutes(startMinute);
                var startHour = parseInt(sessionTimeData.startTime().substring(0, 2));
                startDate.setHours(startHour);
                var startDay = parseInt(sessionTimeData.startDay().substring(8, 10));
                startDate.setDate(startDay);
                var startMonth = parseInt(sessionTimeData.startDay().substring(5, 7)) - 1;
                startDate.setMonth(startMonth);
                var startYear = parseInt(sessionTimeData.startDay().substring(0, 4));
                startDate.setFullYear(startYear);

                var endMinute = parseInt(sessionTimeData.endTime().substring(3, 5));
                endDate.setMinutes(endMinute);
                var endHour = parseInt(sessionTimeData.endTime().substring(0, 2));
                endDate.setHours(endHour);
                var endDay = parseInt(sessionTimeData.endDay().substring(8, 10));
                endDate.setDate(endDay);
                var endMonth = parseInt(sessionTimeData.endDay().substring(5, 7)) - 1;
                endDate.setMonth(endMonth);
                var endYear = parseInt(sessionTimeData.endDay().substring(0, 4));
                endDate.setFullYear(endYear);

                var timeDifference = currentDate - startDate;
                while (timeDifference > 0) {
                    // start date is in the past, need to update to find the next start period
                    if (sessionTimeData.startInterval() == 'every day') {
                        startDate.setDate(startDate.getDate() + 1);
                        endDate.setDate(endDate.getDate() + 1);
                    }
                    else if (sessionTimeData.startInterval() == 'every week') {
                        startDate.setDate(startDate.getDate() + 7);
                        endDate.setDate(endDate.getDate() + 7);
                    }
                    else if (sessionTimeData.startInterval() == 'every month') {

                        function addMonths(date, count) {
                            // this function handles many edge cases
                            if (date && count) {
                                var m, d = (date = new Date(+date)).getDate();
                                date.setMonth(date.getMonth() + count, 1);
                                m = date.getMonth();
                                date.setDate(d);
                                if (date.getMonth() !== m) date.setDate(0)
                            }
                            return date
                        }

                        startDate = addMonths(startDate, 1);
                        endDate = addMonths(endDate, 1);
                    }
                    timeDifference = currentDate - startDate;
                }

            }
            else {
                console.log("error: cannot calculate session start time because fields are not set")
            }

        }

        else if (sessionTimeData.startCondition() == "connectSession") {

            if (sessionTimeData.startTime() !== null && sessionTimeData.endTime() !== null && sessionTimeData.maximalDaysAfterLast() !== null && sessionTimeData.minimalDaysAfterLast() !== null) {
                startDate = new Date(prevSessionEndTime);
                endDate = new Date(prevSessionEndTime);
                var plusMinStart = parseInt(sessionTimeData.startTime().substring(3, 5));
                startDate.setMinutes(prevSessionEndTime.getMinutes() + plusMinStart);
                var plusHourStart = parseInt(sessionTimeData.startTime().substring(0, 2));
                startDate.setHours(startDate.getHours() + plusHourStart);
                var plusDaysStart = parseInt(sessionTimeData.minimalDaysAfterLast());
                startDate.setDate(startDate.getDate() + plusDaysStart);

                var plusMinEnd = parseInt(sessionTimeData.endTime().substring(3, 5));
                endDate.setMinutes(prevSessionEndTime.getMinutes() + plusMinEnd);
                var plusHoursEnd = parseInt(sessionTimeData.endTime().substring(0, 2));
                endDate.setHours(endDate.getHours() + plusHoursEnd);
                var plusDaysEnd = parseInt(sessionTimeData.maximalDaysAfterLast());
                endDate.setDate(endDate.getDate() + plusDaysEnd);

            }
            else {
                console.log("error: cannot calculate session start time because fields are not set.")
            }

        }

        else if (sessionTimeData.startCondition() == "anytime") {

        }

        if (endDate - startDate >= 0) {
            nextStartWindow = {
                start: startDate,
                end: endDate,
                current: currentDate
            };
        }
        else {
            console.log("error: allowed start time is later than end time.")
        }

    }

    return nextStartWindow

};


Player.prototype.getDifferenceBetweenDates = function (dateEarlier, dateLater) {

    var diff_in_ms = dateLater - dateEarlier;

    var one_day_in_ms = 1000 * 60 * 60 * 24;
    var one_hour_in_ms = 1000 * 60 * 60;
    var one_min_in_ms = 1000 * 60;

    if (diff_in_ms > 0) {
        var nrDays = Math.floor(diff_in_ms / one_day_in_ms);
        var remainder = diff_in_ms - (one_day_in_ms * nrDays);
        var nrHours = Math.floor(remainder / one_hour_in_ms);
        var remainder2 = remainder - (one_hour_in_ms * nrHours);
        var nrMinutes = Math.floor(remainder2 / one_min_in_ms);

        var part1 = ''; var part2 = ''; var part3 = '';
        if (nrDays > 1) {
            part1 = nrDays + ' days  ';
        }
        else if (nrDays == 1) {
            part1 = nrDays + ' day  ';
        }

        if (nrHours > 1) {
            part2 = nrHours + ' hours  ';
        }
        else if (nrHours == 1) {
            part2 = nrHours + ' hour  ';
        }

        if (nrMinutes > 1) {
            part3 = nrMinutes + ' minutes';
        }
        else if (nrMinutes == 1) {
            part3 = nrMinutes + ' minute';
        }
        if (diff_in_ms >= 60000) {
            var timeText = part1 + part2 + part3;
            return [nrDays, nrHours, nrMinutes, timeText];
        } else {
            return [nrDays, nrHours, nrMinutes, "less than 1 minute"];
        }
    }
    else {
        return [0, 0, 0, 'now'];
    }


};



Player.prototype.init = function () {
    var self = this;

    document.onmousedown = disableclick;
    function disableclick(event) {
        if (event.button == 2) {
            return false;
        }
    }
};
