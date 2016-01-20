// copyright by Caspar Goeke and Holger Finger

var Player = function() {
    var self = this;

    this.expId = location.search.split('id=')[1];
    this.experiment = null;
    this.sessionNr = 0;

    console.log("requesting experiment with id "+this.expId+" from server.");

    var parameters = { expId: this.expId };
    $.get('/getExperiment', parameters, function(data){
        console.log("experiment spec loaded from server.");
        self.sessionNr = data.sessionNr;
        self.experiment = new Experiment().fromJS(data.expData);
        self.experiment.setPointers();
        console.log("experiment deserialized.");

        self.addRecording(0,0,{
            testData: 12345
        })

    }).done(function() {
        self.HtmlBuilder(self.experiment.exp_data.entities.byId["2a06e0c6c4a34de0ec59f9aa0411a9fe"], "2a06e0c6c4a34de0ec59f9aa0411a9fe");
    });

};
Player.prototype.HtmlBuilder = function(firstOrDefaultElement, parentId) {
    switch (firstOrDefaultElement.type) {
        case 'StartBlock':
            console.log("Ich bin vom Typ StartBlock");
            $('#' + parentId).append($("<li>").text(firstOrDefaultElement.type));
            break;
        case 'EndBlock':
            console.log("Ich bin vom Typ EndBlock");
            $('#' + parentId).append($("<li>").text(firstOrDefaultElement.type));
            break;
        case 'QuestionnaireEditorData':
            console.log("Ich bin vom Typ QuestionnaireEditorData");
            $('#' + parentId).append($("<li>").text(firstOrDefaultElement.type));
            break;
        case 'Connection':
            console.log("Ich bin vom Typ Connection");
            $('#' + parentId).append($("<li>").text(firstOrDefaultElement.type));
            break;
        case 'Sequence':
            console.log("Ich bin vom Typ Sequence");
            $('#' + parentId).append(
                $("<ul id='" + firstOrDefaultElement.id() + "'>"));
            $('#' + firstOrDefaultElement.id()).append($("<li>").text("ExpSession"));
            for(i = 0; i < firstOrDefaultElement.elements().length; i++) {
                this.HtmlBuilder(firstOrDefaultElement.elements()[i], firstOrDefaultElement.id());
            }
            break;
        case 'TextEditorData':
            console.log("Ich bin vom Typ TextEditorData");
            $('#' + parentId).append($("<li>").text(firstOrDefaultElement.type));
            break;
        case 'FrameData':
            console.log("Ich bin vom Typ FrameData");
            $('#' + parentId).append($("<ul id='" + firstOrDefaultElement.id() + "'>").append(
                $("<li>").text(firstOrDefaultElement.type)));
            for(i = 0; i < firstOrDefaultElement.elements().length; i++) {
                this.HtmlBuilder(firstOrDefaultElement.elements()[i], firstOrDefaultElement.id());
            }
            break;
        case 'SubjectGroup':
            console.log("Ich bin vom Typ SubjectGroup");
            $('#experimentTree').append(
                $("<li id='" + firstOrDefaultElement.id() + "'>").text("SubjectGroup"));
            console.log(firstOrDefaultElement.sessions().length);
                for(i = 0; i < firstOrDefaultElement.sessions().length; i++) {
                    this.HtmlBuilder(firstOrDefaultElement.sessions()[i], firstOrDefaultElement.id());
                }
            break;
        case 'ExpSession':
            console.log("ExpSession");
            $('#' + parentId).append($("<ul>").append(
                $("<li id='" + firstOrDefaultElement.id() + "'>").text("ExpSession")));
            for(i = 0; i < firstOrDefaultElement.blocks().length; i++) {
                this.HtmlBuilder(firstOrDefaultElement.blocks()[i], firstOrDefaultElement.id());
            }
            break;
        case 'ImageData':
            console.log("Ich bin vom Typ ImageData");
            $('#' + parentId).append($("<li>").text(" -- " + firstOrDefaultElement.type));
            break;
        case 'VideoData':
            console.log("Ich bin vom Typ VideoData");
            $('#' + parentId).append($("<li>").text(" -- " + firstOrDefaultElement.type));
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
            console.error("type "+ entityJson.type + " is not defined.")
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


Player.prototype.init = function() {
    var self = this;


};