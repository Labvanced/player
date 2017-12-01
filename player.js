// copyright by Caspar Goeke and Holger Finger


function is_nwjs(){
    try{
        return (typeof require('nw.gui') !== "undefined");
    } catch (e){
        return false;
    }
}

// Convert Javascript date to Pg YYYY-MM-DD HH:MI:SS-08
function pgFormatDate(date) {
    function zeroPad(d) {
        return ("0" + d).slice(-2);
    }
    var timeZoneOffsetInHours = date.getTimezoneOffset() / 60;
    var dayString = [date.getUTCFullYear(), zeroPad(date.getMonth() + 1), zeroPad(date.getDate())].join("-");
    var timeString = [zeroPad(date.getHours()), zeroPad(date.getMinutes()), zeroPad(date.getSeconds())].join(":");
    if (timeZoneOffsetInHours>0) {
        // WARNING: according to javascript spec's, the timezone has inverted sign, so we invert + to - and - to +
        timeZoneOffsetInHours = "-"+zeroPad(timeZoneOffsetInHours);
    }
    else if (timeZoneOffsetInHours<0) {
        timeZoneOffsetInHours = "+"+zeroPad(-timeZoneOffsetInHours);
    }
    else {
        timeZoneOffsetInHours = "+00";
    }
    return dayString+" "+timeString+timeZoneOffsetInHours;
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

        if (route=="/startPlayerSession") {
            sessionNr = p.sessionNr;
            var exp_subject_data = {
                exp_id: p.expId,
                subject_code: p.subject_code,
                survey_data: p.survey_data,
                group_nr: p.groupNr,
                last_completed_session_nr: 0,
                add_time: pgFormatDate(new Date())
            };
            db.exp_subjects.add(exp_subject_data).then(function(new_id){
                exp_subject_id = new_id;
                var rec_session_data = {
                    exp_subject_id: exp_subject_id,
                    session_nr: sessionNr,
                    start_time: null
                };
                return db.rec_sessions.add(rec_session_data);
            }).then(function(new_id){
                rec_session_id = new_id;
                callback({
                    success: true
                });

                // update list of recordings:
                win.refreshList();

            }).catch(function(error) {
                alert ("Ooops: " + error);
            });
        }

        if (route=="/setPlayerSessionStartedTime") {
            // set start time of session:
            var rec_session_changes = {
                start_time: p.start_time
            };
            db.rec_sessions.update(rec_session_id, rec_session_changes);
        }

        if (route=="/recordStartTask") {
            var rec_task_data = {
                rec_session_id: rec_session_id,
                block_nr: p.blockNr,
                block_id: p.blockId,
                task_nr: p.taskNr,
                task_id: p.taskId,
                start_time: p.start_time
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
                end_time: p.end_time,
                var_data:p.var_data
            };
            db.rec_sessions.update(rec_session_id, rec_session_changes);

            // update last completed session number:
            var exp_subject_changes = {
                last_completed_session_nr: sessionNr
            };

            db.exp_subjects.update(exp_subject_id, exp_subject_changes);

            // update list of recordings:
            win.refreshList();

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

    // determine whether this is a crowdsourcingSession
    this.crowdsourcingCode = ko.observable('');
    this.isCrowdsourcingSession = ko.observable(false);
    var isCrowdsourcingSession = getParameterByName("crowdsourcing");
    if (isCrowdsourcingSession =="true"){
        this.crowdsourcingCode(guid());
        this.isCrowdsourcingSession(true);
    }

    this.playerPreloader = new PlayerPreloader(this);

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

    // Jump to text task when pressing CNTL + Q
    // TODO might be useful to disable this in some routes
    function KeyPress(e) {
        var evtobj = window.event? event : e
        if (evtobj.keyCode == 81 && evtobj.ctrlKey){
            self.currentFrame.finishFrame();
            self.recordData();
            self.jumpToNextTask();
        }
    }
    document.onkeydown = KeyPress;

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
    this.nextStartWindow = null;

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

    this.webcamLoaded = false;
    this.variablesToReset = [];
    this.PixelDensityPerMM = null; // in pixel per mm

    this.sessionStartTime = pgFormatDate(new Date());

    this.preloaderCompleted = ko.observable(false);

    this.sessionEnded = false;
    this.timeControlArray = [];



    Webcam.on("error", function(err_msg){
        console.log("webcam error: "+err_msg);
        self.finishSessionWithError(err_msg);
    });

    //console.log("requesting experiment with id "+this.expId+" from server with askSubjData="+this.askSubjData+ " subject_code="+this.subject_code);

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
                self.playerPreloader.cancel();
                self.finishSessionWithError("Error: "+data.msg);
                return;
            }
            console.log("experiment spec loaded from server.");

            self.experiment = new Experiment().fromJS(data.expData);
            self.experiment.setPointers();
            console.log("experiment deserialized.");

            ko.applyBindings(self, $("#calibrateScreen")[0]);
            ko.applyBindings(self, $("#endExpSection")[0]);
            ko.applyBindings(self, $("#errEndExpSection")[0]);
            ko.applyBindings(self, $("#countdownSection")[0]);


            self.experiment.exp_data.initVars();

            // record browser and system specs
            self.detectBrowserAndSystemSpecs();

            // init default language:
            self.experiment.exp_data.updateLanguage();

            if (!self.expId) {
                self.expId = self.experiment.exp_id();
            }

            var expPrev =  new ExperimentStartupScreen(self.experiment);
            var newContent = jQuery('<div/>');
            newContent.load("/html_views/ExperimentStartupScreen.html", function () {
                newContent.prependTo('#expPreview');
                ko.applyBindings(expPrev, newContent[0]);
                expPrev.init();
            });

        });
    });

};

Player.prototype.detectBrowserAndSystemSpecs = function() {
    var unknown = '-';

    // screen
    var screenSize = '';
    if (screen.width) {
        var width = (screen.width) ? screen.width : '';
        var height = (screen.height) ? screen.height : '';
        screenSize += '' + width + " x " + height;
    }

    var nVer = navigator.appVersion;
    var nAgt = navigator.userAgent;
    var browser  = navigator.appName;
    var version  = ''+parseFloat(navigator.appVersion);
    var majorVersion = parseInt(navigator.appVersion,10);
    var nameOffset,verOffset,ix;

    // Opera
    if ((verOffset = nAgt.indexOf('Opera')) != -1) {
        browser = 'Opera';
        version = nAgt.substring(verOffset + 6);
        if ((verOffset = nAgt.indexOf('Version')) != -1) {
            version = nAgt.substring(verOffset + 8);
        }
    }
    // Opera Next
    if ((verOffset = nAgt.indexOf('OPR')) != -1) {
        browser = 'Opera';
        version = nAgt.substring(verOffset + 4);
    }
    // Edge
    else if ((verOffset = nAgt.indexOf('Edge')) != -1) {
        browser = 'Microsoft Edge';
        version = nAgt.substring(verOffset + 5);
    }
    // MSIE
    else if ((verOffset = nAgt.indexOf('MSIE')) != -1) {
        browser = 'Microsoft Internet Explorer';
        version = nAgt.substring(verOffset + 5);
    }
    // Chrome
    else if ((verOffset = nAgt.indexOf('Chrome')) != -1) {
        browser = 'Chrome';
        version = nAgt.substring(verOffset + 7);
    }
    // Safari
    else if ((verOffset = nAgt.indexOf('Safari')) != -1) {
        browser = 'Safari';
        version = nAgt.substring(verOffset + 7);
        if ((verOffset = nAgt.indexOf('Version')) != -1) {
            version = nAgt.substring(verOffset + 8);
        }
    }
    // Firefox
    else if ((verOffset = nAgt.indexOf('Firefox')) != -1) {
        browser = 'Firefox';
        version = nAgt.substring(verOffset + 8);
    }
    // MSIE 11+
    else if (nAgt.indexOf('Trident/') != -1) {
        browser = 'Microsoft Internet Explorer';
        version = nAgt.substring(nAgt.indexOf('rv:') + 3);
    }
    // Other browsers
    else if ((nameOffset = nAgt.lastIndexOf(' ') + 1) < (verOffset = nAgt.lastIndexOf('/'))) {
        browser = nAgt.substring(nameOffset, verOffset);
        version = nAgt.substring(verOffset + 1);
        if (browser.toLowerCase() == browser.toUpperCase()) {
            browser = navigator.appName;
        }
    }
    // trim the version string
    if ((ix = version.indexOf(';')) != -1) version = version.substring(0, ix);
    if ((ix = version.indexOf(' ')) != -1) version = version.substring(0, ix);
    if ((ix = version.indexOf(')')) != -1) version = version.substring(0, ix);

    majorVersion = parseInt('' + version, 10);
    if (isNaN(majorVersion)) {
        version = '' + parseFloat(navigator.appVersion);
        majorVersion = parseInt(navigator.appVersion, 10);
    }

    // mobile version
    var mobile = /Mobile|mini|Fennec|Android|iP(ad|od|hone)/.test(nVer);

    // cookie
    var cookieEnabled = (navigator.cookieEnabled) ? true : false;


    if (typeof navigator.cookieEnabled == 'undefined' && !cookieEnabled) {
        document.cookie = 'testcookie';
        cookieEnabled = (document.cookie.indexOf('testcookie') != -1) ? true : false;
    }

    // system
    var os = unknown;
    var clientStrings = [
        {s:'Windows 10', r:/(Windows 10.0|Windows NT 10.0)/},
        {s:'Windows 8.1', r:/(Windows 8.1|Windows NT 6.3)/},
        {s:'Windows 8', r:/(Windows 8|Windows NT 6.2)/},
        {s:'Windows 7', r:/(Windows 7|Windows NT 6.1)/},
        {s:'Windows Vista', r:/Windows NT 6.0/},
        {s:'Windows Server 2003', r:/Windows NT 5.2/},
        {s:'Windows XP', r:/(Windows NT 5.1|Windows XP)/},
        {s:'Windows 2000', r:/(Windows NT 5.0|Windows 2000)/},
        {s:'Windows ME', r:/(Win 9x 4.90|Windows ME)/},
        {s:'Windows 98', r:/(Windows 98|Win98)/},
        {s:'Windows 95', r:/(Windows 95|Win95|Windows_95)/},
        {s:'Windows NT 4.0', r:/(Windows NT 4.0|WinNT4.0|WinNT|Windows NT)/},
        {s:'Windows CE', r:/Windows CE/},
        {s:'Windows 3.11', r:/Win16/},
        {s:'Android', r:/Android/},
        {s:'Open BSD', r:/OpenBSD/},
        {s:'Sun OS', r:/SunOS/},
        {s:'Linux', r:/(Linux|X11)/},
        {s:'iOS', r:/(iPhone|iPad|iPod)/},
        {s:'Mac OS X', r:/Mac OS X/},
        {s:'Mac OS', r:/(MacPPC|MacIntel|Mac_PowerPC|Macintosh)/},
        {s:'QNX', r:/QNX/},
        {s:'UNIX', r:/UNIX/},
        {s:'BeOS', r:/BeOS/},
        {s:'OS/2', r:/OS\/2/},
        {s:'Search Bot', r:/(nuhk|Googlebot|Yammybot|Openbot|Slurp|MSNBot|Ask Jeeves\/Teoma|ia_archiver)/}
    ];
    for (var id in clientStrings) {
        var cs = clientStrings[id];
        if (cs.r.test(nAgt)) {
            os = cs.s;
            break;
        }
    }

    var osVersion = unknown;

    if (/Windows/.test(os)) {
        osVersion = /Windows (.*)/.exec(os)[1];
        os = 'Windows';
    }

    switch (os) {
        case 'Mac OS X':
            osVersion = /Mac OS X (10[\.\_\d]+)/.exec(nAgt)[1];
            break;

        case 'Android':
            osVersion = /Android ([\.\_\d]+)/.exec(nAgt)[1];
            break;

        case 'iOS':
            osVersion = /OS (\d+)_(\d+)_?(\d+)?/.exec(nVer);
            osVersion = osVersion[1] + '.' + osVersion[2] + '.' + (osVersion[3] | 0);
            break;
    }

    this.experiment.exp_data.varBrowserSpec().value().value(browser);
    this.experiment.exp_data.varBrowserVersionSpec().value().value(version);
    this.experiment.exp_data.varSystemSpec().value().value(os);
    this.experiment.exp_data.varAgentSpec().value().value(nAgt);
};


Player.prototype.timeMeasureControl = function() {

    var self = this;
    var desiredDelayInMs = 100;
    var distanceBetweenMeasures = 5000;
    var timerHandle = null;

    function measureTime(){
        var oldTime = new Date().getTime();
        setTimeout(function() {
            var newTime = new Date().getTime();
            var timeDifference = newTime-oldTime;
            self.timeControlArray.push(timeDifference);
            if (self.sessionEnded && timerHandle) {
                clearTimeout(timerHandle);
            }
        },desiredDelayInMs)
    }

    timerHandle = setInterval(measureTime,distanceBetweenMeasures);
    measureTime();

};


Player.prototype.getAllFramesOrPagesInSession = function() {
    var allFramesOrPages = [];
    var blocks = this.experiment.exp_data.availableGroups()[this.groupNr-1].sessions()[this.sessionNr-1].blocks();
    for (var i = 0; i<blocks.length; i++){
        var subTasks = blocks[i].subTasks();
        for (var j = 0; j<subTasks.length; j++) {
            var subSequences = subTasks[j].subSequencePerFactorGroup();
            for (var l = 0; l<subSequences.length;l++) {
                var elements = subSequences[l].elements();
                for (var m= 0; m<elements.length;m++) {
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

Player.prototype.preloadAllContent = function() {

    var contentList = [];
    var contentListById = {};

    function addToContents(file_id, file_orig_name) {
        var src = "/files/" + file_id + "/" + file_orig_name;
        var fileSpec = {
            id: file_id,
            src: src
        };
        if (!contentListById.hasOwnProperty(fileSpec.id)) {
            contentList.push(fileSpec);
            contentListById[fileSpec.id] = fileSpec;
        }
    }

    function deepDive(arr) {
        var t;
        if (arr[0].constructor === Array) {
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

    // parse images, video and audio elements in current session:
    var allFramesOrPages = this.getAllFramesOrPagesInSession();
    $.each(allFramesOrPages, function(frameIdx, entity) {

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
        $.each(entity.events(), function(idx, event) {
            event.getAllActions(actionsArr);
        });
        $.each(actionsArr, function(idx, action) {
            if (action instanceof ActionLoadFileIds) {
                $.each(action.files(), function(fileIdx, fileSpec) {
                    addToContents(fileSpec.id, fileSpec.name_original);
                });
            }
        });
    });

    if (contentList.length>0){
        this.playerPreloader.start(contentList);
    }
    else{
        this.preloaderCompleted(true);
    }
};

Player.prototype.setSubjectGroupNr = function(groupNr, sessionNr){
    this.groupNr = groupNr;
    this.sessionNr = sessionNr;

    console.log("groupNr="+groupNr+ " sessionNr="+sessionNr);

    this.subj_group = this.experiment.exp_data.availableGroups()[this.groupNr-1];
    if (!this.subj_group) {
        console.log(this.experiment.exp_data.staticStrings().playerErrorNoSubjGroup);
        this.finishSessionWithError(this.experiment.exp_data.staticStrings().playerErrorNoSubjGroup);
        return;
    }

    this.exp_session = this.subj_group.sessions()[this.sessionNr-1];
    if (!this.exp_session) {
        console.log(this.experiment.exp_data.staticStrings().playerErrorNoSession);
        this.finishSessionWithError(this.experiment.exp_data.staticStrings().playerErrorNoSession);
        return;
    }


    if (this.exp_session.blocks().length == 0) {
        console.log(this.experiment.exp_data.staticStrings().playerErrorNoBlock);
        this.finishSessionWithError(this.experiment.exp_data.staticStrings().playerErrorNoBlock);
        return;
    }

    // randomize Block Order
    if (this.exp_session.blockRandomization()=="permutation"){
        var n = this.exp_session.blocks().length;
        var perm = [];
        for (var i = 0; i<n; i++){
            perm.push(i);
        }
        this.exp_session.blocks()[0].subTasks()[0].reshuffle(perm);

        var newArr = [];
        for (var i = 0; i<n; i++){
            newArr.push(this.exp_session.blocks()[perm[i]])
        }
        this.exp_session.blocks(newArr);
    }
    this.blocks = this.exp_session.blocks();

    // initialize variables that are session specific:
    this.experiment.exp_data.varSubjectCode().value().value(this.subject_code);
    this.experiment.exp_data.varSubjectNr().value().value(0); // TODO
    this.experiment.exp_data.varGroupName().value().value(this.subj_group.name());
    this.experiment.exp_data.varSessionTimeStamp().value().value(this.sessionStartTime);
    this.experiment.exp_data.varSessionTimeStampEnd().value().value(null); // this variable makes no sense to use? can only be set at the end...
    this.experiment.exp_data.varSessionName().value().value(this.exp_session.name());
    this.experiment.exp_data.varSessionNr().value().value(this.sessionNr);

    this.calculateStartWindow("current");
};

Player.prototype.runCalibration = function(callback) {
    var self = this;

    var picWidthHeightRatio = 85.60 / 53.98;
    var displayDiagInPx = Math.sqrt(screen.width*screen.width + screen.height*screen.height);
    var convertInchToMM = 0.0393700787402;

    $( "#creditCard" ).resizable({
        aspectRatio: picWidthHeightRatio,
        handles: { 'e': '.ui-resizable-e'},
        resize: function(event, ui){
            var creditWidthInPixel = ui.size.width;
            self.PixelDensityPerMM = creditWidthInPixel / 85.60;

            // set number input:
            var displayDiagInMM = displayDiagInPx / self.PixelDensityPerMM;
            var displayDiagInInch = displayDiagInMM * convertInchToMM;
            $("#calibrationInput").val(displayDiagInInch);

            console.log("creditWidthInPixel=" + creditWidthInPixel + " PixelDensityPerMM="+self.PixelDensityPerMM);
        }
    });

    function numberInputChanged() {
        var displayDiagInInch = $("#calibrationInput").val();
        var displayDiagInMM = displayDiagInInch / convertInchToMM; // converting inch to mm
        self.PixelDensityPerMM = displayDiagInPx / displayDiagInMM;

        // set size of image:
        var creditWidthInPixel = self.PixelDensityPerMM * 85.60;
        $( "#creditCard" ).width(creditWidthInPixel);
        $( "#creditCard" ).height(creditWidthInPixel / picWidthHeightRatio);

        console.log("displayDiagInPx="+displayDiagInPx+" displayDiagInMM="+displayDiagInMM+" PixelDensityPerMM="+self.PixelDensityPerMM);
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


Player.prototype.setupPlayerDesign = function() {

    $('#experimentViewPort').css({
        "background-color": this.experiment.exp_data.studySettings.bgColor()
    });
};


Player.prototype.startExperiment = function() {

    this.timeMeasureControl();

    this.setupPlayerDesign();

    var self = this;
    if (this.runOnlyTaskId){
        // run a test task session:
        this.currentTaskIdx = NaN;
        this.currentTask = this.experiment.exp_data.entities.byId[this.runOnlyTaskId];
        if (this.currentTask.zoomMode() === "visualDegree" || this.currentTask.zoomMode() === "millimeter") {
            // first run calibration:
            this.runCalibration(function() {
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
        if (!self.isTestrun) {
            playerAjaxPost(
                '/setPlayerSessionStartedTime',
                {
                    start_time: this.sessionStartTime
                },
                function (result) {
                    console.log('recorded session start time');
                }
            );
        }
        if (needsCalibration) {
            // first run calibration:
            this.runCalibration(function() {
                self.startNextBlock();
            });
        }
        else {
            this.startNextBlock();
        }
    }
};

Player.prototype.startNextBlock = function() {
    this.currentBlockIdx++;
    if (this.blocks.length <= this.currentBlockIdx){
        console.log("experiment session finished");
        this.finishSession(true);
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

Player.prototype.setSpecificBlockAndTask = function(blockIndex,taskIndex) {
    this.currentBlockIdx = blockIndex;
    if (this.blocks.length <= this.currentBlockIdx){
        console.log("experiment session finished");
        this.finishSession(true);
    }
    else {
        console.log("starting block "+this.currentBlockIdx);
        this.currentBlock = this.blocks[this.currentBlockIdx];
        this.currentTaskIdx = taskIndex;
        this.currentTask = this.currentBlock.subTasks()[this.currentTaskIdx];
        this.startRunningTask();
    }
};


Player.prototype.jumpToSpecificTask = function(taskToJumpId) {
    if (this.runOnlyTaskId) {
        this.finishSession(true);
    }
    else {
        // TODO: clean up of preloaded trials of old task.
        this.cleanUpCurrentTask();

        for (var i = this.currentBlockIdx; i<this.blocks.length; i++){
            var tasks = this.blocks[i].subTasks();
            for (var k = 0; k<tasks.length; k++){
                if (tasks[k].id()===taskToJumpId){ // taskID found
                    this.setSpecificBlockAndTask(i,k);
                    break;
                }
            }
        }
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

        // add trial id and nr variable to recordings:
        this.variablesToRecord.push(this.experiment.exp_data.varTrialId());
        this.variablesToRecord.push(this.experiment.exp_data.varTrialNr());
        this.variablesToRecord.push(this.experiment.exp_data.varConditionId());

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

        // initialize variables that are task specific:
        if (this.currentBlock) {
            this.experiment.exp_data.varBlockName().value().value(this.currentBlock.name());
        }
        this.experiment.exp_data.varBlockNr().value().value(this.currentBlockIdx+1);
        this.experiment.exp_data.varTaskName().value().value(this.currentTask.name());
        this.experiment.exp_data.varTaskNr().value().value(this.currentTaskIdx+1);

        // start randomization:
        this.randomizedTrials = this.currentTask.doTrialRandomization();

        console.log("randomization finished... start first trial initialization...");
        this.addTrialViews(0,0, this.currentTask);

        self.trialIter = "waitForStart";
        self.startRecordingsOfNewTask();

        if (this.currentTask.displayInitialCountdown()) {
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
        // record variables at start of task:
        var recordData = {
            blockNr: this.experiment.exp_data.varBlockNr().value().value(),
            blockId: this.currentBlock.id(),
            blockName: this.experiment.exp_data.varBlockName().value().value(),
            taskNr: this.experiment.exp_data.varTaskNr().value().value(),
            taskId: this.currentTask.id(),
            taskName: this.experiment.exp_data.varTaskName().value().value(),
            start_time: pgFormatDate(new Date())
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

Player.prototype.cleanUpCurrentTask = function() {
    this.cleanUpCurrentTrial();

    // if there is still some trial of the current task preloaded, then switch to it and clean it up:
    if (this.nextTrialFrames) {
        this.switchToNextPreloadedTrial();
        this.cleanUpCurrentTrial();
    }
};

Player.prototype.cleanUpCurrentTrial = function() {
    if (this.currentTrialDiv) {
        this.currentTrialDiv.remove();
    }
    for( var oldTrialFrameKeys in this.currentTrialFrames ) {
        if (this.currentTrialFrames.hasOwnProperty(oldTrialFrameKeys)) {
            this.currentTrialFrames[oldTrialFrameKeys].dispose();
        }
    }
};

Player.prototype.switchToNextPreloadedTrial = function() {
    // select next element from preload
    this.currentTrialFrames = this.nextTrialFrames;
    this.currentTrialDiv = this.nextTrialDiv;
    this.currentSequence = this.nextSequence;

    this.nextTrialFrames = null;
    this.nextTrialDiv = null;
    this.nextSequence = null;
};

Player.prototype.startNextTrial = function() {
    var self = this;

    if (this.trialIter == "waitForStart") {
        this.trialIter = 0;
        this.trialIndex = 0;
    }
    else {
        this.recordData();
        // start next trial:
        this.trialIter++;
        this.trialIndex++;
    }

    if (this.trialIndex >= this.randomizedTrials.length) {
        // trial loop finished:
        console.log("task finished");
        this.trialIter = "init"; // reset to init so that another trial loop in another block will start from the beginning
        this.trialIndex = null;

        if (this.webcamLoaded){
            console.log("removing webcam");
            Webcam.reset();
            this.webcamLoaded = false;
        }

        self.jumpToNextTask();
        return;
    }

    console.log("start trial iteration " + this.trialIter);
    var trialSelection = this.randomizedTrials[this.trialIndex];

    this.currentTrialId = trialSelection.trialVariation.uniqueId();
    console.log("start randomized trial id " + this.currentTrialId);

    // set some predefined variables for this trial:
    this.experiment.exp_data.varTrialId().value().value(this.currentTrialId);
    this.experiment.exp_data.varTrialNr().value().value(this.trialIter+1);
    this.experiment.exp_data.varConditionId().value().value(trialSelection.condition.conditionIdx()); // TODO set condition id

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

    this.cleanUpCurrentTrial();
    this.switchToNextPreloadedTrial();

    // go into trial sequence:
    this.currentSequence.currSelectedElement(null);
    this.currentSequence.selectNextElement();
    this.startNextPageOrFrame();

    // preload next trial:
    if (this.trialIndex + 1 < this.randomizedTrials.length) {
        setTimeout(function(){
            self.addTrialViews(self.trialIndex + 1,self.trialIter + 1, self.currentTask);
        }, 1);
    }
};







Player.prototype.startSpecificTrial = function(trialId) {

    var self = this;

    if (this.trialIter == "waitForStart") {
        this.trialIter = 0;
        this.trialIndex  = 0;
    }

    var trialIds = [];
    for (var j = 0; j< this.randomizedTrials.length; j++){
        trialIds.push( this.randomizedTrials[j].trialVariation.uniqueId());
    }

    var indexOfNewTrial = trialIds.indexOf(parseInt(trialId));
    if (indexOfNewTrial instanceof Array){
        var trialIndex  = indexOfNewTrial[0];
    }
    else if (indexOfNewTrial >=0){
        var trialIndex  = indexOfNewTrial;
    }
    else {
        var trialIndex  = this.trialIter+1;
    }

    this.trialIter++;
    this.trialIndex = trialIndex;


    if (trialIndex >= this.randomizedTrials.length) {
        // trial loop finished:
        console.log("task finished");
        this.trialIter = "init"; // reset to init so that another trial loop in another block will start from the beginning
        this.trialIndex = null;

        if (this.webcamLoaded){
            console.log("removing webcam");
            Webcam.reset();
            this.webcamLoaded = false;
        }

        self.jumpToNextTask();
        return;
    }

    console.log("start trial iteration " + this.trialIter);
    var trialSelection = this.randomizedTrials[this.trialIndex];

    this.currentTrialId = trialSelection.trialVariation.uniqueId();
     if (trialId !=  this.currentTrialId){
         console.log("Error: Trial ID is false!");
     }
     console.log("start randomized trial id " + this.currentTrialId);

    // set some predefined variables for this trial:
    this.experiment.exp_data.varTrialId().value().value(this.currentTrialId);
    this.experiment.exp_data.varTrialNr().value().value(this.trialIter+1);
    this.experiment.exp_data.varConditionId().value().value(trialSelection.condition.conditionIdx()); // TODO set condition id

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

    //this.cleanUpCurrentTrial();

    // preload next trial, and start it
    this.addTrialViews(this.trialIndex, this.trialIter, this.currentTask);
    this.switchToNextPreloadedTrial();


    // go into trial sequence:
    this.currentSequence.currSelectedElement(null);
    this.currentSequence.selectNextElement();
    this.startNextPageOrFrame();

    // preload next trial:
    if (this.trialIndex + 1 < this.randomizedTrials.length) {
        setTimeout(function(){
            self.addTrialViews(self.trialIndex + 1,self.trialIter + 1, self.currentTask);
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

Player.prototype.addTrialViews = function (trialIndex,trialIter,task) {

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
        //playerFrame.frameData.selectTrialType(nextTrialSelection);
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
    this.sessionEnded = true;
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

Player.prototype.finishSession = function(showEndPage) {

    this.sessionEnded = true;

    var total = 0;
    for(var i = 0; i < this.timeControlArray.length; i++) {
        total += this.timeControlArray[i];
    }
    var meanDelay = (total / this.timeControlArray.length)-100;
    var maxDelay = Math.max.apply(null,this.timeControlArray)-100;
    this.experiment.exp_data.varTimeMeasureSpecMean().value().value(meanDelay);
    this.experiment.exp_data.varTimeMeasureSpecMax().value().value(maxDelay);

    // set crowdsourcingCode
    if (this.isCrowdsourcingSession()){
        this.experiment.exp_data.varCrowdsourcingCode().value().value(this.crowdsourcingCode());
    }


    var var_data = {
        browserSpec: this.experiment.exp_data.varBrowserSpec().value().toJS(),
        versionSpec: this.experiment.exp_data.varBrowserVersionSpec().value().toJS(),
        systemSpec: this.experiment.exp_data.varSystemSpec().value().toJS(),
        agentSpec: this.experiment.exp_data.varAgentSpec().value().toJS(),
        fullscreen: this.experiment.exp_data.varFullscreenSpec().value().toJS(),
        timeDelayMean: this.experiment.exp_data.varTimeMeasureSpecMean().value().toJS(),
        timeDelayMax: this.experiment.exp_data.varTimeMeasureSpecMax().value().toJS(),
        crowdsourcingCode:this.experiment.exp_data.varCrowdsourcingCode().value().toJS()

    };




    console.log("finishExpSession...");
    if (!this.runOnlyTaskId && !this.isTestrun) {
        this.calculateStartWindow("next");

        var nextStartTime = null;
        if (this.nextStartWindow.start) {
            nextStartTime = pgFormatDate(this.nextStartWindow.start)
        }
        var nextEndTime = null;
        if (this.nextStartWindow.start) {
            nextEndTime = pgFormatDate(this.nextStartWindow.end)
        }
        var currentDate = null;
        if (this.nextStartWindow.current) {
            currentDate = pgFormatDate(this.nextStartWindow.current)
        }

        playerAjaxPost('/finishExpSession', {
            end_time: currentDate,
            nextStartTime: nextStartTime,
            nextEndTime: nextEndTime,
            var_data: var_data
        });

    }


    if (showEndPage){
        $('#experimentViewPort').hide();
        $('#endExpSection').show();
    }

    $('#endExp').click(function(){
        window.location = "/page/library";
    });

    this.exitFullscreen();

};

Player.prototype.startFullscreen = function() {
    var self = this;

    // for compatibility check if safari is used:
    if (this.experiment.exp_data.varBrowserSpec().value().value() === "Safari"){
        // check if some KeyboardTrigger has alphanumeric enabled:
        var alphaNumericEnabled = false;
        var allFramesOrPages = this.getAllFramesOrPagesInSession();
        $.each(allFramesOrPages, function(frameIdx, entity) {
            var actionsArr = [];
            $.each(entity.events(), function(idx, event) {
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
    if(element.requestFullscreen) {
        element.requestFullscreen();
    } else if(element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
    } else if(element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
    } else if(element.msRequestFullscreen) {
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

    function exitHandler()
    {
        if (!fs_status()) {
            self.experiment.exp_data.varFullscreenSpec().value().setValue(false);
        }
    }

    if (document.addEventListener)
    {
        document.addEventListener('webkitfullscreenchange', exitHandler, false);
        document.addEventListener('mozfullscreenchange', exitHandler, false);
        document.addEventListener('fullscreenchange', exitHandler, false);
        document.addEventListener('MSFullscreenChange', exitHandler, false);
    }

};

Player.prototype.exitFullscreen = function() {
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

Player.prototype.calculateStartWindow = function(currentOrNext) {
    if (currentOrNext == "current"){
        var sessionNr = this.sessionNr-1;
        var newDateStart = new Date();
        var currentDate = new Date();
        var newDateEnd = new Date();
    }
    else if (currentOrNext == "next"){
        var sessionNr = this.sessionNr;
        var currentDate = new Date();
        var newDateStart = new Date();
        var newDateEnd = new Date();
    }

    var sessionTimeData= this.experiment.exp_data.availableGroups()[ this.groupNr-1].sessionTimeData()[sessionNr];
    this.nextStartWindow = this.determineNextSessionStartWindow(newDateStart,newDateEnd,currentDate,sessionTimeData);
};




Player.prototype.determineNextSessionStartWindow = function(startDate,endDate,currentDate,sessionTimeData) {

    var nextStartWindow = {
        start: startDate,
        end: endDate,
        current: currentDate
    };

    if (sessionTimeData){
        if (sessionTimeData.startCondition()=="specific"){

            if (sessionTimeData.startTime() && sessionTimeData.endTime() && sessionTimeData.startDay() && sessionTimeData.endDay()){

                var startMinute = parseInt(sessionTimeData.startTime().substring(3,5));
                startDate.setMinutes(startMinute);
                var startHour = parseInt(sessionTimeData.startTime().substring(0,2));
                startDate.setHours(startHour);
                var startDay = parseInt(sessionTimeData.startDay().substring(8,10));
                startDate.setDate(startDay);
                var startMonth = parseInt(sessionTimeData.startDay().substring(5,7))-1;
                startDate.setMonth(startMonth);
                var startYear = parseInt(sessionTimeData.startDay().substring(0,4));
                startDate.setFullYear(startYear);

                var endMinute = parseInt(sessionTimeData.endTime().substring(3,5));
                endDate.setMinutes(endMinute);
                var endHour = parseInt(sessionTimeData.endTime().substring(0,2));
                endDate.setHours(endHour);
                var endDay = parseInt(sessionTimeData.endDay().substring(8,10));
                endDate.setDate(endDay);
                var endMonth = parseInt(sessionTimeData.endDay().substring(5,7))-1;
                endDate.setMonth(endMonth);
                var endYear = parseInt(sessionTimeData.endDay().substring(0,4));
                endDate.setFullYear(endYear);
            }
            else{
                console.log("error: cannot calculate session start time because fields are not set")
            }

        }
        else if (sessionTimeData.startCondition()=="periodic"){

            if (sessionTimeData.startTime() && sessionTimeData.endTime() && sessionTimeData.startDay() && sessionTimeData.endDay() && sessionTimeData.startInterval()){

                var startMinute = parseInt(sessionTimeData.startTime().substring(3,5));
                startDate.setMinutes(startMinute);
                var startHour = parseInt(sessionTimeData.startTime().substring(0,2));
                startDate.setHours(startHour);
                var startDay = parseInt(sessionTimeData.startDay().substring(8,10));
                startDate.setDate(startDay);
                var startMonth = parseInt(sessionTimeData.startDay().substring(5,7))-1;
                startDate.setMonth(startMonth);
                var startYear = parseInt(sessionTimeData.startDay().substring(0,4));
                startDate.setFullYear(startYear);

                var endMinute = parseInt(sessionTimeData.endTime().substring(3,5));
                endDate.setMinutes(endMinute);
                var endHour = parseInt(sessionTimeData.endTime().substring(0,2));
                endDate.setHours(endHour);
                var endDay = parseInt(sessionTimeData.endDay().substring(8,10));
                endDate.setDate(endDay);
                var endMonth = parseInt(sessionTimeData.endDay().substring(5,7))-1;
                endDate.setMonth(endMonth);
                var endYear = parseInt(sessionTimeData.endDay().substring(0,4));
                endDate.setFullYear(endYear);


                var timeDifference =  currentDate-startDate;
                while (timeDifference >0){
                // start date is in the past, need to update to find the next start period
                    if (sessionTimeData.startInterval() == 'every day'){
                        startDate.setDate(startDate.getDate()+1);
                        endDate.setDate(endDate.getDate()+1);
                    }
                    else if(sessionTimeData.startInterval() == 'every week'){
                        startDate.setDate(startDate.getDate()+7);
                        endDate.setDate(endDate.getDate()+7);
                    }
                    else if(sessionTimeData.startInterval() == 'every month'){
                        startDate.setMonth(startDate.setMonth()+1);
                        endDate.setMonth(endDate.setMonth()+1);
                    }
                    timeDifference =  currentDate-startDate;
                }

            }
            else{
                console.log("error: cannot calculate session start time because fields are not set")
            }

        }

        else if (sessionTimeData.startCondition()=="connectSession"){

            if (sessionTimeData.startTime() && sessionTimeData.endTime() && sessionTimeData.maximalDaysAfterLast() && sessionTimeData.minimalDaysAfterLast()){
                var plusMinStart = parseInt(sessionTimeData.startTime().substring(3,5));
                startDate.setMinutes(startDate.getMinutes() +plusMinStart);
                var plusHourStart = parseInt(sessionTimeData.startTime().substring(0,2));
                startDate.setHours(startDate.getHours() +plusHourStart);
                var plusDaysStart = parseInt( sessionTimeData.minimalDaysAfterLast());
                startDate.setDate(startDate.getDate() +plusDaysStart);

                var plusMinEnd = parseInt(sessionTimeData.endTime().substring(3,5));
                endDate.setMinutes(endDate.getMinutes() +plusMinEnd);
                var plusHoursEnd = parseInt(sessionTimeData.endTime().substring(0,2));
                endDate.setHours(endDate.getHours() +plusHoursEnd);
                var plusDaysEnd = parseInt( sessionTimeData.maximalDaysAfterLast());
                endDate.setDate(endDate.getDate() +plusDaysEnd);

            }
            else{
                console.log("error: cannot calculate session start time because fields are not set.")
            }


        }

        else if (sessionTimeData.startCondition()=="anytime"){

        }

        if (endDate-startDate>=0){
            nextStartWindow.start = startDate;
            nextStartWindow.end = endDate
        }
        else{
            console.log("error: allowed start time is later than end time.")
        }

    }
    else {
        // last session reached
        // TODO starting from the beginning OR not
    }
    return nextStartWindow

};


Player.prototype.getDifferenceBetweenDates = function(dateEarlier,dateLater) {

    var diff_in_ms = dateLater-dateEarlier;

    var one_day_in_ms=1000*60*60*24;
    var one_hour_in_ms=1000*60*60;
    var one_min_in_ms=1000*60;

    if (diff_in_ms >0){
        var nrDays = Math.floor(diff_in_ms /one_day_in_ms);
        var remainder = diff_in_ms-(one_day_in_ms*nrDays);
        var nrHours =  Math.floor(remainder / one_hour_in_ms);
        var remainder2 = remainder - (one_hour_in_ms*nrHours);
        var nrMinutes =  Math.floor(remainder2 / one_min_in_ms);

        var part1= ''; var part2= ''; var part3= '';
        if (nrDays >1){
            part1 = nrDays+'days  ';
        }
        else if(nrDays ==1) {
            part1 = nrDays+'day  ';
        }

        if (nrHours >1){
             part2 = nrHours+'hours  ';
        }
        else if(nrHours ==1){
             part2 = nrHours+'hour  ';
        }

        if (nrMinutes >1){
             part3 = nrMinutes+'minutes';
        }
        else if(nrMinutes ==1){
             part3 = nrMinutes+'minute';
        }

        var timeText = part1 +part2 +part3;
        return [nrDays,nrHours,nrMinutes,timeText];
    }
    else{
        return [0,0,0,'now'];
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