// � by Caspar Goeke and Holger Finger


var PlayerFrame = function(frameData,frameDiv,player) {

    var self = this;

    this.frameData = frameData.getDeepCopy();
    this.frameData.playerFrame = this;

    this.frameDiv  = frameDiv;
    this.player = player;
    this.frameView = null;
    this.startedTime= null;
    this.state = 'preloaded'; // or 'displaying' or 'finished'
    this.trialIter = null;
    this.frameTimeout = null;
    this.elements = this.frameData.elements();
    this.mouseX = null;
    this.mouseY = null;

    this.onFrameStartCallbacks = [];
    this.onFrameEndCallbacks = [];

    // the following is stored to later remove the event listener:
    this.resizeEventListener = function() {
        self.resize();
    };

    window.addEventListener('resize', this.resizeEventListener, false);


};

PlayerFrame.prototype.init = function() {
    var self = this; 

    $(this.frameDiv).css({
        "background-color": this.frameData.bgColor()
    });

    var centeredDiv = $("<div/>");
    $(this.frameDiv).append(centeredDiv);

    $(this.frameDiv).mousemove(function(e){
            self.mouseX = e.pageX;
            self.mouseY = e.pageY;
    });

    if (this.frameData.type == 'FrameData') {
        this.frameView = new FrameView(centeredDiv,this,"playerView");
    }
    else {
        this.frameView = new PageView(centeredDiv,this,"playerView");
    }

    this.frameView.setDataModel(this.frameData);
    this.frameView.init(this.getViewSize());
    this.state = 'preloaded';

    if (this.frameData.type == 'FrameData') {
        var offX = (window.innerWidth - this.frameData.frameWidth() * this.frameView.scale()) / 2;
        var offY = (window.innerHeight - this.frameData.frameHeight() * this.frameView.scale()) / 2;
        $(centeredDiv).css({
            "position": "absolute",
            "left": offX,
            "top": offY
        });
    }
    else {
        $(centeredDiv).css({
            "width": "100%",
            "height": "100%"
        });
    }
};

PlayerFrame.prototype.dispose = function() {
    window.removeEventListener('resize', this.resizeEventListener , false);

    if (typeof this.frameView.dispose === "function") {
        this.frameView.dispose();
    }
};

PlayerFrame.prototype.resize = function() {
    console.log("warning player size changed!!! TODO: pause experiment...");
    // TODO: pause experiment
    this.frameView.resize(this.getViewSize());
};

PlayerFrame.prototype.getFrameTime = function() {
    return Date.now()-this.startedTime;
};

PlayerFrame.prototype.startFrame = function() {
    var self = this;

    if (this.state == 'preloaded' || this.state == 'finished') {

        this.state = 'displaying';
        this.setTimeOut();
        this.startedTime = Date.now();

        // setup callacks
        var events = this.frameData.events();
        for (var i = 0; i < events.length; i++){
            var event =  events[i];
            event.trigger().setupOnPlayerFrame(this);
        }

        for (var i = 0; i<this.onFrameStartCallbacks.length;i++) {
            this.onFrameStartCallbacks[i]();
        }

        this.frameDiv.css('display', 'block');


        // if emotion recording is enabled:
        if (this.frameData.parent.parent.webcamEnabled() && this.frameData.emotionEnabled()) {
            setTimeout(function () {
                if (self.state == 'displaying') {
                    console.log('make snapshot...');
                    Webcam.snap(function (data_uri) {
                        console.log("snap complete, image data is in data_uri");

                        var emotionVarId = self.frameData.parent.parent.trialEmotionVar().id();
                        var trialNr = self.player.trialIter;
                        var blockNr = self.player.currentBlockIdx;

                        Webcam.upload(data_uri, '/uploadWebcam?emotionVarId='+emotionVarId+'&trialNr='+trialNr+'&blockNr='+blockNr, function (code, text) {
                            console.log("Upload complete!");

                            if (self.frameData.emotionFeedbackEnabled()) {
                                var response = JSON.parse(text);

                                if (response.success) {

                                    // remove happiness bias:
                                    response.recData.data['happiness'] /= 10;

                                    var emotionLabels = ['anger', 'contempt', 'disgust', 'fear', 'happiness', 'sadness', 'surprise'];
                                    var emotions = [];
                                    var sum = 0;
                                    for (var k = 0; k < emotionLabels.length; k++) {
                                        var value = response.recData.data[emotionLabels[k]];
                                        sum += value;
                                        emotions.push(value);
                                    }
                                    for (var k = 0; k < emotionLabels.length; k++) {
                                        emotions[k] /= sum;
                                    }

                                    console.log(emotions);

                                    var data = [{
                                        x: emotionLabels,
                                        y: emotions,
                                        type: 'bar'
                                    }];

                                    var feedbackWrapperDiv = document.createElement('div');
                                    $(feedbackWrapperDiv).css({
                                        position: "absolute",
                                        width: "320px",
                                        height: "480px",
                                        top: (window.innerHeight - 480) / 2,
                                        left: (window.innerWidth - 320) / 2
                                    });
                                    $(self.frameDiv).append($(feedbackWrapperDiv));

                                    var resultsDiv = document.createElement('div');
                                    $(resultsDiv).css({
                                        width: "320px",
                                        height: "240px"
                                    });
                                    $(feedbackWrapperDiv).append($(resultsDiv));
                                    Plotly.newPlot(resultsDiv, data);

                                    var snapDiv = document.createElement('div');
                                    $(snapDiv).css({
                                        width: "320px",
                                        height: "240px"
                                    });
                                    $(feedbackWrapperDiv).append($(snapDiv));
                                    snapDiv.innerHTML = '<img src="' + data_uri + '"/>';
                                }
                            }

                        });
                    });
                }
            }, this.frameData.emotionOffset());
        }
    }

};


PlayerFrame.prototype.finishFrame = function() {
    console.log('switch frame state from displaying to finished in trialIter '+this.trialIter);
    this.state = 'finished';
    clearTimeout(this.frameTimeout);

    for (var i = 0; i<this.onFrameEndCallbacks.length;i++) {
        this.onFrameEndCallbacks[i]();
    }

    // destroy event listeners of triggers
    var events = this.frameData.events();
    for (var i = 0; i < events.length; i++){
        var event =  events[i];
        event.trigger().destroyOnPlayerFrame(this);
    }

    // remove document event handlers
    $(document).off("keyup");
    $(document).off("keydown");

    // empty div and make new frame

    this.frameDiv.css('display', 'none');
   // this.frameDiv.remove();
};


PlayerFrame.prototype.endFrame = function() {
    if (this.state == 'displaying') {
        this.finishFrame();
        // set next frame
        this.player.currentSequence.selectNextElement();
        this.player.startNextPageOrFrame();
    }
};

PlayerFrame.prototype.endFrameAndGoBack = function() {
    if (this.state == 'displaying') {
        this.finishFrame();
        // set next frame
        this.player.currentSequence.selectPreviousElement();
        this.player.startNextPageOrFrame();
    }
};

PlayerFrame.prototype.goToCustomFrame = function(customFrame) {
    if (this.state == 'displaying') {
        this.finishFrame();
        this.player.currentSequence.selectCustomElement(customFrame);
        this.player.startNextPageOrFrame();
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