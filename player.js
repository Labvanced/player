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
    this.currentTrialId = -1;
    this.currentTrialDiv = null;

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

        self.startNextBlock();

    });
};

Player.prototype.startNextBlock = function() {
    this.currentBlock++;
    if (this.blocks.length <= this.currentBlock){
        console.log("experiment session finished");
        this.finishSession();
    }
    else {
        this.currentSequence = this.blocks[this.currentBlock].subSequence();
        this.parseNextElement();
    }
};

Player.prototype.parseNextElement = function() {

    var self = this;

    var currentElement = this.currentSequence.currSelectedElement();

    if (!currentElement){
        this.currentSequence.selectNextElement();
        currentElement = this.currentSequence.currSelectedElement();
    }

    switch (currentElement.type) {
        case 'StartBlock':
            console.log("StartBlock reached. continue to next element.");
            this.currentSequence.selectNextElement();
            self.parseNextElement();
            break;
        case 'EndBlock':
            console.log("EndBlock reached. Continue in parent.");
            if (this.currentSequence.parent === null){
                console.log("end of experimental block reached!");
                this.startNextBlock();
                break;
            }
            else {
                this.currentSequence = this.currentSequence.parent.parent;
                self.parseNextElement();
            }
            break;
        case 'ExpTrialLoop':
            console.log("Ich bin vom Typ ExpTrialLoop");

            var numTrials = currentElement.trialTypesInteracting().idx.length;

            
            if (this.currentTrialId >= numTrials-1) {
                // trial loop finished:
                console.log("trial loop finished");
                this.currentTrialId = -1;
                this.currentSequence.selectNextElement();
                self.parseNextElement();
                return;
            }
            else {

                // remove old trial div:
                if (this.currentTrialDiv){
                    this.currentTrialDiv.remove();
                    this.currentTrialDiv = null;
                }

                // start next trial:
                this.currentTrialId++;
                console.log("start trial id "+this.currentTrialId);

                this.addRecording(0,0,{
                    trialStart: this.currentTrialId
                });

                this.currentTrialDiv = $("<div id='" + currentElement.id() + "_" + this.currentTrialId + "'>");
                $('#experimentTree').append(this.currentTrialDiv);
                this.currentTrialSelection = {
                    type: 'interacting',
                    trialTypesInteractingIdx: this.currentTrialId,
                    factors: currentElement.factors(),
                    levels: currentElement.trialTypesInteracting().idx[this.currentTrialId]
                };

                // go into trial sequence:
                this.currentSequence = currentElement.subSequence();
                this.currentSequence.currSelectedElement(null);
                self.parseNextElement();
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
            for(var i = 0; i < currentElement.elements().length; i++) {
                this.HtmlBuilder(currentElement.elements()[i], this.currentTrialDiv.attr('id'));
            }

            // TODO: jump to next frame on mouse click or other events... instead of fixed time delay:
            setTimeout(function() {
                    self.currentSequence.selectNextElement();
                    self.parseNextElement();
                }, 10000);

            break;
        default:
            console.error("type "+ currentElement.type + " is not defined.")
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
                top: $('#video').position().top - 278 + firstOrDefaultElement.editorY() - 150,
                left: $('#video').position().left - 360 + firstOrDefaultElement.editorX() - 250
            });
            newDiv.append(imgElement);
            $('#' + parentId).append(newDiv);
            $("#"+fileId).click(function(){
                player.addRecording(player.currentBlock, player.currentTrialId, {
                    id: this.id,
                    time: Date.now() // Vorsicht IE8 und früher
                });
            });
            break;
        case 'VideoData':
            firstOrDefaultElement.modifier().selectedTrialType(this.currentTrialSelection);
            var source = "/files/" + firstOrDefaultElement.modifier().selectedTrialView.file_id() + "/" + firstOrDefaultElement.modifier().selectedTrialView.file_orig_name();
            var videoElement = $('<video width="720" height="576" autoplay>').append($('<source type="video/mp4">')).attr("src", source);
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
    var recordData = {
        blockNr: blockNr,
        trialNr: trialNr,
        recData: recData
    };
    $.post('/record', recordData);
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