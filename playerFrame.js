// � by Caspar Goeke and Holger Finger


var PlayerFrame = function(frameData,frameDiv,player) {

    this.frameData = frameData.getDeepCopy();
    this.frameDiv  = frameDiv;
    this.player = player;
    this.frameView = null;
    this.startedTime= null;

};

PlayerFrame.prototype.init = function() {


    this.frameView = new FrameView(this.frameDiv,this.frameData,this,"playerView");
    this.frameView.init(this.getViewSize());

    //this.frameDiv.css({'display':'block'});
};

PlayerFrame.prototype.startFrame = function() {

    console.log('starting frame...');
    this.setTimeOut();
    this.startedTime = Date.now();
    this.frameDiv.css('display','block');

    // if emotion recording is enabled:
    if (this.frameData.parent.parent.webcamEnabled() && this.frameData.emotionEnabled()) {
        setTimeout(function () {
            console.log('make snapshot...');
            Webcam.snap(function (data_uri) {
                console.log("snap complete, image data is in data_uri");
                Webcam.upload(data_uri, '/uploadWebcam', function (code, text) {
                    console.log("Upload complete!");
                    // 'code' will be the HTTP response code from the server, e.g. 200
                    // 'text' will be the raw response content
                });
            });
        }, this.frameData.emotionOffset());
    }

};


PlayerFrame.prototype.endFrame = function() {
    // set next frame
    this.player.currentSequence.selectNextElement();
    // empty div and make new frame
    this.frameDiv.remove();
    this.player.parseNextElement();

};


PlayerFrame.prototype.getViewSize = function() {
    var width = window.innerWidth;
    var height = window.innerHeight;
    return [width,height];
};


PlayerFrame.prototype.setTimeOut = function() {

    var self = this;
    if (this.frameData.offsetEnabled()){
        setTimeout(function() {
            self.endFrame();
        }, this.frameData.offset());
    }

};