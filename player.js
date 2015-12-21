// copyright by Caspar Goeke and Holger Finger

var Player = function() {
    var self = this;

    this.expId = location.search.split('id=')[1];
    this.experiment = null;

    console.log("requesting experiment with id "+this.expId+" from server.")

    var parameters = { expId: this.expId };
    $.get('/getExperiment', parameters, function(data){
        console.log("experiment spec loaded from server.");
        self.experiment = new Experiment().fromJS(data.expData);
        self.experiment.setPointers();
        console.log("experiment deserialized.");
    });

};


Player.prototype.init = function() {
    var self = this;


};