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
    this.currentFrame= null;
    this.webcamLoaded = false;

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

                if (currentElement.webcamEnabled() && !this.webcamLoaded){
                    /*$("#my_camera").css({
                        "display": "block",
                        "width": "640px",
                        "height": "480px"
                    });*/
                    Webcam.attach("#my_camera");
                    Webcam.on("load", function() {
                        console.log("webcam loaded");
                        self.webcamLoaded = true;
                        setTimeout(function(){
                            self.parseNextElement();
                        }, 3000);
                    });
                    Webcam.on("error", function(err_msg){
                        console.log("webcam error: "+err_msg);
                        self.finishSessionWithError(err_msg);
                    });
                    return;
                }

                this.trialSpecifications = currentElement.trialSpecifications();
                var numRep = currentElement.repsPerTrialType()

                // create trial_randomization first with increasing integer:
                this.trial_randomization = [];
                this.trial_present_order = [];
                for (var i = 0; i < this.trialSpecifications.length; i++) {
                    for (var j = 0; j < numRep ; j++) {
                        this.trial_randomization.push(i);
                        this.trial_present_order.push(j+numRep*i);
                    }
                }

                // now randomize:
                console.log("do randomization...");
                for (var i = this.trial_randomization.length - 1; i > 0; i--) {
                    var permuteWithIdx = Math.floor(Math.random() * (i + 1)); // random number between 0 and i
                    var temp1 = this.trial_randomization[i];
                    var temp2 = this.trial_present_order[i];
                    this.trial_randomization[i] = this.trial_randomization[permuteWithIdx];
                    this.trial_present_order[i] = this.trial_present_order[permuteWithIdx];
                    this.trial_randomization[permuteWithIdx] = temp1;
                    this.trial_present_order[permuteWithIdx] = temp2;
                }

                // make sure that there is spacing between repetitions:
                var minIntervalBetweenRep = currentElement.minIntervalBetweenRep();
                if (minIntervalBetweenRep>0) {
                    console.log("try to satify all constraints...");
                    for (var j = 0; j < 1000; j++) {
                        var constraintsSatisfied = true;
                        for (var i = 0; i < this.trial_randomization.length; i++) {
                            var stepsToLookBack = Math.min(i, minIntervalBetweenRep);
                            for (var k = 1; k <= stepsToLookBack; k++) {
                                // look back k steps:
                                if (this.trial_randomization[i] == this.trial_randomization[i-k]) {
                                    constraintsSatisfied = false;
                                    // permute trial i with any random other trial:
                                    var permuteWithIdx = Math.floor(Math.random() * this.trial_randomization.length);
                                    var temp1 = this.trial_randomization[i];
                                    var temp2 = this.trial_present_order[i];
                                    this.trial_randomization[i] = this.trial_randomization[permuteWithIdx];
                                    this.trial_present_order[i] = this.trial_present_order[permuteWithIdx];
                                    this.trial_randomization[permuteWithIdx] = temp1;
                                    this.trial_present_order[permuteWithIdx] = temp2;
                                }
                            }
                        }
                        if (constraintsSatisfied) {
                            console.log("all constraints were satisfied in iteration "+j);
                            break;
                        }
                        else {
                            console.log("not all constraints were satisfied in iteration "+j);
                        }
                    }
                    if (!constraintsSatisfied){
                        console.log("constraints could not be satisfied!");
                    }
                }

                console.log("randomization finished... start first trial initialization...");
                this.addTrialViews(this.trialIter+1,currentElement);
            }

            if (this.trialIter >= this.trial_randomization.length - 1) {
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

                // record user independent data
                // blockId
                var recData = new RecData(currentElement.parent.parent.blockId().id(),currentElement.parent.parent.name());
                this.addRecording(this.currentBlock, this.trialIter ,recData.toJS());

                // trialTypeId
                var recData = new RecData(currentElement.trialTypeIdVar().id(),this.currentRandomizedTrialId );
                this.addRecording(this.currentBlock, this.trialIter ,recData.toJS());

                // trialId
                var recData = new RecData(currentElement.trialUniqueIdVar().id(),this.trial_present_order[this.trialIter] );
                this.addRecording(this.currentBlock, this.trialIter ,recData.toJS());

                // trial presentation order
                var recData = new RecData(currentElement.trialOrderVar().id(), this.trialIter );
                this.addRecording(this.currentBlock, this.trialIter ,recData.toJS());

                // factors and add trial types
                this.currentTrialSelection = this.trialSpecifications[this.currentRandomizedTrialId];
                if (this.currentTrialSelection.type=="interacting"){
                    for (var fac = 0;fac<this.currentTrialSelection.factors.length;fac++){
                        var recData = new RecData(this.currentTrialSelection.factors[fac],this.currentTrialSelection.levels[fac]);
                        this.addRecording(this.currentBlock, this.trialIter ,recData.toJS());
                    }
                }
                else{
                    var recData = new RecData(this.currentTrialSelection.factor,this.currentTrialSelection.level);
                    this.addRecording(this.currentBlock, this.trialIter ,recData.toJS());

                }


                // select next element from preload
                if(this.currentTrialDiv){
                    this.currentTrialDiv.remove();
                }
                this.currentTrialFrames = this.nextTrialFrames;
                this.currentTrialDiv = this.nextTrialDiv;

                // go into trial sequence:
                this.currentSequence = currentElement.subSequence();
                this.currentSequence.currSelectedElement(null);
                this.parseNextElement();

                if (this.trialIter+1< this.trial_randomization.length ){
                    this.addTrialViews(this.trialIter+1,currentElement);
                }

            }
            break;
        case 'QuestionnaireEditorData':
            if (currentElement.isActive()) {
                console.log("Ich bin vom Typ QuestionnaireEditorData");
                var questDiv = $(document.createElement('div'));
                $(questDiv).css({
                    'display':'none',
                    'overflow':'auto'
                });
                $('#experimentTree').append(questDiv);
                this.currQuestionnaireView = new PlayerQuestView(currentElement,questDiv,this);
                this.currQuestionnaireView.init();
                this.currQuestionnaireView.start();
            }
            else {
                this.currentSequence.selectNextElement();
                self.parseNextElement();
            }
            break;
        case 'TextEditorData':
            console.log("Ich bin vom Typ TextEditorData");

            if (currentElement.isActive()) {
                this.nextTrialDiv = $(document.createElement('div'));
                this.nextTrialDiv.addClass( 'textFrameOuter' );
                $('#experimentTree').append(this.nextTrialDiv);

                var textWrapper = $(document.createElement('div'));
                textWrapper.addClass( 'textFrameCentered' );
                this.nextTrialDiv.append(textWrapper);

                // insert text that was entered in editor:
                textWrapper.html(currentElement.text());

                var buttonWrapper = $(document.createElement('div'));
                $(buttonWrapper).css({
                    'text-align': 'center'
                });
                textWrapper.append(buttonWrapper);

                buttonWrapper.append($('<button/>', {
                    "class": 'pointer btn btn-default',
                    text: 'continue',
                    click: function () {
                        self.nextTrialDiv.remove();
                        self.currentSequence.selectNextElement();
                        self.parseNextElement();
                    }
                }));

            }
            else {
                this.currentSequence.selectNextElement();
                self.parseNextElement();
            }

            break;
        case 'FrameData':
            console.log("Ich bin vom Typ FrameData");
            // startFrame
            this.currentFrame = this.currentTrialFrames[currentElement.id()];
            this.currentFrame.startFrame();

            break;
        default:
            console.error("type "+ currentElement.type + " is not defined.")
    }
};

Player.prototype.endCurrentSequence = function () {
    if (this.currentSequence.parent.type == "ExpBlock") {
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
        playerFrame.trialIdx = trialIdx;
        playerFrame.frameData.selectTrialType(nextTrialSelection);
        playerFrame.init();
        this.nextTrialFrames[frameDataArr[frameIdx].id()] = playerFrame;
    }

};


Player.prototype.getRandomizedTrialId = function () {
    return this.currentRandomizedTrialId;
};

Player.prototype.getTrialId = function () {
    return this.trialIter
};

Player.prototype.getBlockId = function () {
    return  this.currentBlock
};


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
        $('#endExpSection').show();
        $('#endExp').click(function(){
            history.go(-1);
        });
    });
};

Player.prototype.init = function() {
    var self = this;


};