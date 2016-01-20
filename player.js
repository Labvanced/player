// copyright by Caspar Goeke and Holger Finger

var Player = function() {
    var self = this;

    this.expId = location.search.split('id=')[1];
    this.experiment = null;
    this.sessionNr = 0;
    this.groupNr = 0;

    console.log("requesting experiment with id "+this.expId+" from server.");

    var parameters = { expId: this.expId };
    $.get('/getExperiment', parameters, function(data){
        console.log("experiment spec loaded from server.");
        self.sessionNr = data.sessionNr;
        self.groupNr = data.groupNr;
        self.experiment = new Experiment().fromJS(data.expData);
        self.experiment.setPointers();
        console.log("experiment deserialized.");

        self.addRecording(0,0,{
            testData: 12345
        });

        setTimeout(function(){
            self.addRecording(0,1,{
                someTrialRecording: 6789,
                someVariable: 43
            });
        }, 5000);

        setTimeout(function(){
            self.finishSession();
        }, 10000);

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

Player.prototype.finishSession = function() {
    console.log("finishExpSession...");
    $.post('/finishExpSession', function( data ) {
        console.log("finished recording session completed.");
    });
};

Player.prototype.init = function() {
    var self = this;


};