/**
 * This dialog gathers all potential participants for a specific experiment. In a next stept they'll be matched.
 * @param expData
 * @constructor
 */
var ExternalConnection = function(expData) {
    var self = this;
    this.expData = ko.observable(expData);
    this.socket = null;
};

/**
 * Create listeners in case enough players are in the lobby.
 */
ExternalConnection.prototype.initSocketAndListeners = function(cb) {

    var self = this;
    console.log("experiment is connecting to external devices");

    // create new io connection to jointExpServer
    var socketio_host_url = document.location.hostname +":8081"; // 'http://localhost:8070';
    if (window.location.protocol === "https:") {
        socketio_host_url = document.location.host;
    }

    this.socket = io.connect(socketio_host_url, {
        path: '/externalConnection'
    });

    console.log('exp id: ' + player.experiment.exp_id());

    this.socket.on('connect',function(){
        console.log("socket connected...");
        cb();
    });
};



ExternalConnection.prototype.experimentFinished = function(){
    this.socket.emit('experiment finished');
};
