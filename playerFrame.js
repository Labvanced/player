// � by Caspar Goeke and Holger Finger


var PlayerFrame = function(frameData,frameDiv,player) {

    var self = this;

    this.frameData = frameData.getDeepCopy();
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

    this.onFrameEndCallbacks = [];

    window.addEventListener('resize', function() {
        self.resize();
    }, false);


};

PlayerFrame.prototype.init = function() {
    var self = this; 
    if (this.frameData.bgColorEnabled()) {
        $(this.frameDiv).css({
            "background-color": this.frameData.bgColor()
        });
    }
    var centeredDiv = $("<div/>");
    $(this.frameDiv).append(centeredDiv);

    $(this.frameDiv).mousemove(function(e){
            self.mouseX = e.pageX;
            self.mouseY = e.pageY;
    });

    this.frameView = new FrameView(centeredDiv,this.frameData,this,"playerView");
    this.frameView.init(this.getViewSize());
    this.state = 'preloaded';
    var offX = (window.innerWidth-this.frameData.frameWidth()*this.frameView.scale())/2 ;
    var offY = (window.innerHeight-this.frameData.frameHeight()*this.frameView.scale())/2;

    $(centeredDiv).css({
        "position": "absolute",
        "left": offX,
        "top": offY
    });
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

    if (this.state == 'preloaded') {
        console.log('starting frame in trialIter '+this.trialIter);
        this.state = 'displaying';
        this.setTimeOut();
        this.startedTime = Date.now();

        // setup callacks
        var events = this.frameData.events();
        for (var i = 0; i < events.length; i++){
            var event =  events[i];
            event.trigger().setupOnPlayerFrame(this);
        }


        this.frameDiv.css('display', 'block');

        var viewElements = this.frameView.viewElements();
        for (var i = 0; i< viewElements.length; i++){
            if(viewElements[i].dataModel.content){
                if (viewElements[i].dataModel.content() instanceof VideoElement){
                    viewElements[i].content.play();
                }
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


PlayerFrame.prototype.endFrame = function() {
    if (this.state == 'displaying') {
        console.log('switch frame state from displaying to finished in trialIter '+this.trialIter);
        this.state = 'finished';
        clearTimeout(this.frameTimeout);

        for (var i = 0; i<this.onFrameEndCallbacks.length;i++) {
            this.onFrameEndCallbacks[i]();
        }

        // setup callacks
        var events = this.frameData.events();
        for (var i = 0; i < events.length; i++){
            var event =  events[i];
            event.trigger().destroyOnPlayerFrame(this);
        }

        /**
        // save all questionaire element data, if there are some: TOTO  depreciated, can be deleted, 
        var recData = new RecData();
        for (var i = 0; i<this.elements.length;i++){
            if (this.elements[i].content) {
                var content = this.elements[i].content();
                if (content.answer) {
                    recData.addRecording(content.variable());
                }
            }
        }

        player.addRecording(player.getBlockId(), player.getTrialId(), recData.toJS());
         **/

        // remove document event handlers
        $(document).off("keyup");
        $(document).off("keydown");

        // set next frame
        this.player.currentSequence.selectNextElement();
        // empty div and make new frame
        this.frameDiv.remove();
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