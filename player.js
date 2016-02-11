// copyright by Caspar Goeke and Holger Finger

var Player = function() {
    var self = this;

    this.expId = location.search.split('id=')[1];
    this.experiment = null;
    this.sessionNr = 0;
    this.groupNr = 0;

    this.blocks = null;
    this.currentSequence = null;
    this.currentBlock = -1;
    this.currentTrialSelection = null;
    this.trialSpecifications = [];
    this.trialIter = -1;
    this.currentTrialDiv = null;
    this.playerFrame= null;

    console.log("requesting experiment with id "+this.expId+" from server.");

    var parameters = { expId: this.expId };
    $.get('/startExpPlayer', parameters, function(data){
        console.log("experiment spec loaded from server.");
        self.sessionNr = 0;//data.sessionNr; //TODO: work around for testing: starting always with first session.
        self.groupNr = data.groupNr;
        self.experiment = new Experiment().fromJS(data.expData);
        self.experiment.setPointers();
        console.log("experiment deserialized.");

        self.blocks = self.experiment.exp_data.groups()[self.groupNr].sessions()[self.sessionNr].blocks();

        //self.startNextBlock();

    });
};

Player.prototype.startNextBlock = function() {
    this.currentBlock++;
    if (this.blocks.length <= this.currentBlock){
        console.log("experiment session finished");
        this.finishSession();
    }
    else {
        console.log("starting block "+this.currentBlock);
        this.currentSequence = this.blocks[this.currentBlock].subSequence();
        this.parseNextElement();
    }
};

Player.prototype.parseNextElement = function() {

    var self = this;

    var currentElement = this.currentSequence.currSelectedElement();

    if (!currentElement){
        // we are just starting this sequence, so we have to select the first element.
        this.currentSequence.selectNextElement();
        currentElement = this.currentSequence.currSelectedElement();
    }
    else if (currentElement == "EndOfSequence"){
        console.log("EndOfSequence reached");
        this.endCurrentSequence();
        return;
    }

    switch (currentElement.type) {
        case 'StartBlock':
            console.log("StartBlock reached. continue to next element.");
            this.currentSequence.selectNextElement();
            this.parseNextElement();
            break;
        case 'EndBlock':
            console.log("EndBlock reached. Continue in parent.");
            this.endCurrentSequence();
            break;
        case 'ExpTrialLoop':
            console.log("Ich bin vom Typ ExpTrialLoop");

            if (this.trialIter == -1) {
                // beginning of trial loop:
                console.log("beginning of trial loop...");

                this.trialSpecifications = [];
                var numReps = currentElement.repsPerTrialType();

                var trialTypesInteracting = currentElement.trialTypesInteracting();
                for (var i=0; i<trialTypesInteracting.idx.length; i++){
                    var currentTrialSelection = {
                        type: 'interacting',
                        trialTypesInteractingIdx: i,
                        factors: currentElement.factors(),
                        levels: trialTypesInteracting.idx[i]
                    };
                    for (var k=0; k<numReps; k++) {
                        this.trialSpecifications.push(currentTrialSelection);
                    }
                }

                var trialTypesNonInteract = currentElement.trialTypesNonInteract();
                for (var i=0; i<trialTypesNonInteract.idx.length; i++){
                    var currentTrialSelection = {
                        type: 'noninteract',
                        factor: trialTypesNonInteract.idx[i][0],
                        level: trialTypesNonInteract.idx[i][1]
                    };
                    for (var k=0; k<numReps; k++) {
                        this.trialSpecifications.push(currentTrialSelection);
                    }
                }

                // now randomize:
                console.log("do randomization...");
                this.trial_randomization = [];
                for (var i = 0; i < this.trialSpecifications.length; i++) {
                    this.trial_randomization.push(i);
                }
                for (var i = this.trial_randomization.length - 1; i > 0; i--) {
                    var j = Math.floor(Math.random() * (i + 1)); // random number between 0 and i
                    var temp = this.trial_randomization[i];
                    this.trial_randomization[i] = this.trial_randomization[j];
                    this.trial_randomization[j] = temp;
                }
                console.log("randomization finished...start first trial initialization");

                this.addTrialViews(this.trialIter+1,currentElement);
            }

            if (this.trialIter >= this.trialSpecifications.length - 1) {
                // trial loop finished:
                console.log("trial loop finished");
                this.trialIter = -1;
                this.currentSequence.selectNextElement();
                self.parseNextElement();
                return;
            }
            else {

                // start next trial:
                this.trialIter++;
                console.log("start trial iteration "+this.trialIter);

                this.currentRandomizedTrialId = this.trial_randomization[this.trialIter];
                console.log("start randomized trial id "+this.currentRandomizedTrialId);

                this.addRecording(this.currentBlock, this.currentRandomizedTrialId,{
                    trialIter: this.trialIter
                });

                this.currentTrialSelection = this.trialSpecifications[this.currentRandomizedTrialId];

                // select next element from preload
                if(this.currentTrialDiv){
                    this.currentTrialDiv.remove();
                }
                this.currentTrialFrames = this.nextTrialFrames;
                this.currentTrialDiv = this.nextTrialDiv;

                // go into trial sequence:
                this.currentSequence = currentElement.subSequence();
                this.currentSequence.currSelectedElement(null);
                self.parseNextElement();

                this.addTrialViews(this.trialIter+1,currentElement);


            }
            break;
        case 'QuestionnaireEditorData':
            console.log("Ich bin vom Typ QuestionnaireEditorData");
            // TODO: render questionaire
            this.currentSequence.selectNextElement();
            self.parseNextElement();
            break;
        case 'TextEditorData':
            console.log("Ich bin vom Typ TextEditorData");
            // TODO: render Text
            this.currentSequence.selectNextElement();
            self.parseNextElement();
            break;
        case 'FrameData':
            console.log("Ich bin vom Typ FrameData");
            // startFrame
            this.currentTrialFrames[currentElement.id()].startFrame();

            break;
        default:
            console.error("type "+ currentElement.type + " is not defined.")
    }
};

Player.prototype.endCurrentSequence = function () {
    if (this.currentSequence.parent === null) {
        console.log("end of experimental block reached!");
        this.startNextBlock();
    }
    else {
        this.currentSequence = this.currentSequence.parent.parent;
        this.parseNextElement();
    }
};



Player.prototype.addTrialViews = function (trialIdx,trialLoop) {



    this.nextTrialDiv = $(document.createElement('div'));
    $('#experimentTree').append(this.nextTrialDiv);
    var nextRandomizedTrialId = this.trial_randomization[trialIdx];
    var nextTrialSelection = this.trialSpecifications[nextRandomizedTrialId];

    this.nextTrialFrames = {};

    var frameDataArr = trialLoop.subSequence().elements();
    for(var frameIdx =0;frameIdx<frameDataArr.length;frameIdx++){

        var frameDiv = $(document.createElement('div'));
        frameDiv.css('display','none');
        $(this.nextTrialDiv).append(frameDiv);

        var playerFrame = new PlayerFrame(frameDataArr[frameIdx],frameDiv,this);
        playerFrame.frameData.selectTrialType(nextTrialSelection);
        playerFrame.init();
        this.nextTrialFrames[frameDataArr[frameIdx].id()]=playerFrame;
    }

};



Player.prototype.HtmlBuilder = function(firstOrDefaultElement, parentId) {
    switch (firstOrDefaultElement.type) {
        case 'QuestionnaireEditorData':
            console.log("Ich bin vom Typ QuestionnaireEditorData");
            $('#' + parentId).append($("<li>").text(firstOrDefaultElement.type));
            break;
        case 'TextEditorData':
            console.log("Ich bin vom Typ TextEditorData");
            $('#' + parentId).append($("<li>").text(firstOrDefaultElement.type));
            break;
        case 'ImageData':
            console.log("Ich bin vom Typ ImageData");

            firstOrDefaultElement.modifier().selectedTrialType(this.currentTrialSelection);
            var fileId = firstOrDefaultElement.modifier().selectedTrialView.file_id();
            var source = "/files/" + fileId + "/" + firstOrDefaultElement.modifier().selectedTrialView.file_orig_name();
            var imgElement = $("<img style='cursor:pointer' class='experimentControl' id='" + fileId + "'>").attr("src", source);
            var newDiv = $("<div>");
            $(newDiv).css({
                position:  'absolute',
                top: firstOrDefaultElement.modifier().selectedTrialView.editorY(),
                left: firstOrDefaultElement.modifier().selectedTrialView.editorX()
            });
            newDiv.append(imgElement);
            $('#' + parentId).append(newDiv);
            $("#"+fileId).click(function(){
                player.addRecording(player.currentBlock, player.currentRandomizedTrialId, {
                    id: this.id,
                    time: Date.now() // Vorsicht IE8 und früher
                });
            });
            break;
        case 'VideoData':
            firstOrDefaultElement.modifier().selectedTrialType(this.currentTrialSelection);
            var videoElement = $('<video width="720" height="576" autoplay>').append($('<source type="video/mp4">')).attr("src", firstOrDefaultElement.vidSource());
            var newDiv = $("<div id='video'>");
            $(newDiv).css({
                //border: '1px solid red',
                position:  'absolute',
                //width: '720px',
                //height: '576px',
                top: '50%',
                left: '50%',
                marginTop: '-278px',
                marginLeft: '-360px'
            });
            //top:       firstOrDefaultElement.editorY() - 278,
            //    left:      firstOrDefaultElement.editorX() - 360
            newDiv.append(videoElement);
            $('#' + parentId).append(newDiv);
            break;
        case 'ExpBlock':
            console.log("Ich bin vom Typ ExpBlock");
            $('#' + parentId).append($("<ul>").append(
                $("<li id='" + firstOrDefaultElement.id() + "'>").text("ExpBlock")));
            this.HtmlBuilder(firstOrDefaultElement.subSequence(), firstOrDefaultElement.id());
            break;
        case 'ExpTrialLoop':
            console.log("Ich bin vom Typ ExpTrialLoop");
            $('#' + parentId).append($("<li id='" + firstOrDefaultElement.id() + "'>").text(firstOrDefaultElement.type));
            this.HtmlBuilder(firstOrDefaultElement.subSequence(), firstOrDefaultElement.id());
            break;
        case 'GlobalVar':
            console.log("Ich bin vom Typ GlobalVar");
            $('#' + parentId).append($("<li id='" + firstOrDefaultElement.id() + "'>").text(firstOrDefaultElement.type));
            break;
        default:
            console.error("type "+ firstOrDefaultElement.type + " is not defined.")
    }
}


Player.prototype.addRecording = function(blockNr, trialNr, recData) {
    if (this.experiment.is_recording()) {
        var recordData = {
            blockNr: blockNr,
            trialNr: trialNr,
            recData: recData
        };
        $.post('/record', recordData);
    }
};

Player.prototype.finishSession = function() {
    console.log("finishExpSession...");
    $.post('/finishExpSession', function( data ) {
        console.log("recording session completed.");
    });
};

Player.prototype.init = function() {
    var self = this;


};