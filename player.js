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

    });

};

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