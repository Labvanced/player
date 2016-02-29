// � by Caspar Goeke and Holger Finger


var PlayerFrame = function(frameData,frameDiv,player) {

    this.frameData = frameData.getDeepCopy();
    this.frameDiv  = frameDiv;
    this.player = player;
    this.frameView = null;
    this.startedTime= null;
    this.state = 'preloaded'; // or 'displaying' or 'finished'
    this.trialIdx = null;
    this.frameTimeout = null;
    this.elements = this.frameData.elements()

};

PlayerFrame.prototype.init = function() {


    this.frameView = new FrameView(this.frameDiv,this.frameData,this,"playerView");
    this.frameView.init(this.getViewSize());
    this.state = 'preloaded';

    //this.frameDiv.css({'display':'block'});
};

PlayerFrame.prototype.startFrame = function() {
    var self = this;

    if (this.state == 'preloaded') {
        console.log('starting frame in trialIdx '+this.trialIdx);
        this.state = 'displaying';
        this.setTimeOut();
        this.startedTime = Date.now();
        this.frameDiv.css('display', 'block');

        for (var i = 0; i<this.elements.length; i++){
            if (this.elements[i] instanceof VideoData){
                $($(this.frameDiv).children()[i]).children()[0].play();
            }
        }

        // if emotion recording is enabled:
        if (this.frameData.parent.parent.webcamEnabled() && this.frameData.emotionEnabled()) {
            setTimeout(function () {
                if (self.state == 'displaying') {
                    console.log('make snapshot...');
                    Webcam.snap(function (data_uri) {
                        console.log("snap complete, image data is in data_uri");

                        var emotionVarId = self.frameData.parent.parent.trialEmotionVar().id();
                        var trialNr = self.player.trialIter;
                        var blockNr = self.player.currentBlock;

                        Webcam.upload(data_uri, '/uploadWebcam?emotionVarId='+emotionVarId+'&trialNr='+trialNr+'&blockNr='+blockNr, function (code, text) {
                            console.log("Upload complete!");
                            // 'code' will be the HTTP response code from the server, e.g. 200
                            // 'text' will be the raw response content
                        });
                    });
                }
            }, this.frameData.emotionOffset());
        }
    }

};


PlayerFrame.prototype.endFrame = function() {
    if (this.state == 'displaying') {
        console.log('switch frame state from displaying to finished in trialIdx '+this.trialIdx);
        this.state = 'finished';
        clearTimeout(this.frameTimeout);
        // set next frame
        this.player.currentSequence.selectNextElement();
        // empty div and make new frame
        this.frameDiv.remove();
        this.player.parseNextElement();
    }
};


PlayerFrame.prototype.getViewSize = function() {
    var width = window.innerWidth;
    var height = window.innerHeight;
    return [width,height];
};


PlayerFrame.prototype.setTimeOut = function() {

    var self = this;
    if (this.frameData.offsetEnabled()){
        this.frameTimeout = setTimeout(function() {
            self.endFrame();
        }, this.frameData.offset());
    }

};