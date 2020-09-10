// � by Caspar Goeke and Holger Finger


var PlayerFrame = function (frameData, frameDiv, player) {

    var self = this;

    this.frameData = frameData;//.getDeepCopy();
    this.frameData.playerFrame = this;

    this.frameDiv = frameDiv;
    this.player = player;
    this.frameView = null;
    this.startedTime = null;
    this.state = 'preloaded'; // or 'displaying' or 'paused' or 'finished'
    this.stateObs = ko.observable(this.state);
    this.trialIter = null;
    this.frameTimeout = null;
    this.elements = this.frameData.elements();

    this.onFrameStartCallbacks = [];
    this.onFrameEndCallbacks = [];
    this.onGlobalEventCallbacks = [];
    this.onEyetrackingCoords = [];
    this.websocketTriggerCallbacks = {};
    this.frameMouseX = null;
    this.frameMouseY = null;
    this.frameMouseXY = ko.observable(null);
    this.frameLastEyeCoordX = null;
    this.frameLastEyeCoordY = null;
    this.isPaused = ko.observable(false);

    // the following is stored   to later remove the event listener:
    this.resizeEventListener = function () {
        self.resize();
    };
    this.selectionEventListener = function () {
        if (self.frameView.subElemSelected == false) {
            self.frameView.parent.selectElement(null);
        }
    };
    window.addEventListener('resize', this.resizeEventListener, false);
    window.addEventListener('click', this.selectionEventListener, false);

    this.pausedElements = []; // due to experiment paused...!
};

PlayerFrame.prototype.init = function () {
    var self = this;

    $(this.frameDiv).css({
        "background-color": this.frameData.bgColor()
    });
    if (this.frameData.hideMouse()) {
        $(this.frameDiv).css({
            "cursor": 'none'
        });
    }
    else {
        $(this.frameDiv).css({
            "cursor": 'default'
        });
    }

    var centeredDiv = $("<div/>");
    $(this.frameDiv).append(centeredDiv);

    this.elementRandomization();
    if (this.frameData.type == 'FrameData') {
        this.frameView = new FrameView(centeredDiv, this, "playerView");
    }
    else {
        this.frameView = new PageView(centeredDiv, this, "playerView");
    }

    this.frameView.setDataModel(this.frameData);
    this.frameView.init(this.getViewSize());
    this.setState('preloaded');

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


PlayerFrame.prototype.setState = function (newState) {
    this.state = newState;
    this.stateObs(newState);
}

PlayerFrame.prototype.trackMouseMove = function () {
    var self = this;

    function handleMouseMove(event) {
        var dot, eventDoc, doc, body, pageX, pageY;
        event = event || window.event; // IE-ism

        // for mobile use 'originalEvent.touches[0]' object
        if (event.originalEvent.touches) {
            event = event.originalEvent.touches[0];
        }

        // If pageX/Y aren't available and clientX/Y are,
        // calculate pageX/Y - logic taken from jQuery.
        // (This is to support old IE)
        if (event.pageX == null && event.clientX != null) {
            eventDoc = (event.target && event.target.ownerDocument) || document;
            doc = eventDoc.documentElement;
            body = eventDoc.body;

            pageX = event.clientX +
                (doc && doc.scrollLeft || body && body.scrollLeft || 0) -
                (doc && doc.clientLeft || body && body.clientLeft || 0);
            pageY = event.clientY +
                (doc && doc.scrollTop || body && body.scrollTop || 0) -
                (doc && doc.clientTop || body && body.clientTop || 0);
        }

        if (self.frameData instanceof FrameData) {
            var scale = self.frameView.scale();
            var offX = (window.innerWidth - self.frameData.frameWidth() * scale) / 2;
            var offY = (window.innerHeight - self.frameData.frameHeight() * scale) / 2;
            pageX = (event.pageX - offX) / scale;
            pageY = (event.pageY - offY) / scale;
        }

        self.frameMouseX = pageX;
        self.frameMouseY = pageY;
        self.frameMouseXY([pageX, pageY]);

    }

    $(window).on("mousemove touchmove", handleMouseMove);
};

PlayerFrame.prototype.getMouseX = function () {
    return this.frameMouseX || Number.NaN;
};

PlayerFrame.prototype.getMouseY = function () {
    return this.frameMouseY || Number.NaN;
};

PlayerFrame.prototype.getMouseXY_Array = function () {
    var frameMouseXY = this.frameMouseXY();
    if (frameMouseXY) {
        return frameMouseXY;
    }
    else {
        return [Number.NaN, Number.NaN];
    }
};

PlayerFrame.prototype.elementRandomization = function () {

    var elems = this.frameData.elements();
    for (var i = 0; i < elems.length; i++) {
        var elem = elems[i];
        if (elem.content() instanceof ScaleElement || elem.content() instanceof CheckBoxElement || elem.content() instanceof LikertElement || elem.content() instanceof MultipleChoiceElement) {
            if (elem.content().reshuffleElements()) {
                elem.content().doReshuffle();
            }
        }
    }

    if (this.frameData.type == 'PageData' && this.frameData.needsToBeShuffled()) {
        this.frameData.reshuffleEntries();
    }

};


PlayerFrame.prototype.dispose = function () {
    $(window).off("mousemove touchmove");
    this.frameMouseX = null;
    this.frameMouseY = null;
    window.removeEventListener('resize', this.resizeEventListener, false);
    this.resizeEventListener = null;
    window.removeEventListener('click', this.selectionEventListener, false);
    this.selectionEventListener = null;

    if (typeof this.frameView.dispose === "function") {
        this.frameView.dispose();
    }
};

PlayerFrame.prototype.resize = function () {
    console.log("warning player size changed!");
    this.frameView.resize(this.getViewSize());
};

PlayerFrame.prototype.getFrameTime = function () {
    return Date.now() - this.startedTime;
};

PlayerFrame.prototype.getFrameName = function () {
    return this.frameView.frameData.name();
};

PlayerFrame.prototype.selectElement = function (selectedElement) {
    this.frameView.setSelectedElement(selectedElement);
};


PlayerFrame.prototype.triggerEyetracking = function (data) {
    if (typeof this.frameData.frameWidth == "function") {
        var scale = this.frameView.scale();
        var offX = (window.innerWidth - this.frameData.frameWidth() * scale) / 2;
        var offY = (window.innerHeight - this.frameData.frameHeight() * scale) / 2;
        var coordX = (data.x - offX) / scale;
        var coordY = (data.y - offY) / scale;
    } else {
        console.log("this.frameData.frameWidth is not a function");
        var coordX = data.x;
        var coordY = data.y;
    }
    jQuery.each(this.onEyetrackingCoords, function (idx, eyetrackingCb) {
        eyetrackingCb(coordX, coordY);
    });
    this.frameLastEyeCoordX = coordX;
    this.frameLastEyeCoordY = coordY;
    player.experiment.exp_data.varGazeX().value().value(coordX);
    player.experiment.exp_data.varGazeY().value().value(coordY);
};


PlayerFrame.prototype.startFrame = function (formerMouseCoords) {
    var self = this;

    if (this.state == 'preloaded' || this.state == 'finished') {
        if (formerMouseCoords) {
            this.setFormerMouseCoords(formerMouseCoords);
        }

        this.setState('displaying');
        this.setTimeOut();
        this.startedTime = Date.now();

        // setup callbacks:
        var events = this.frameData.events();
        for (var i = 0; i < events.length; i++) {
            var event = events[i];
            event.setupOnPlayerFrame(this);
        }

        if (this.frameData.nrOfTrackMousemove() > 0) {
            this.trackMouseMove();
        }

        for (var i = 0; i < this.onFrameStartCallbacks.length; i++) {
            this.onFrameStartCallbacks[i]();
        }

        if (this.state == 'displaying') { // in case e. g. onFrameStart-event has caused to be on another frame already.
            this.frameDiv.css('display', 'block');
        }
    }

};

PlayerFrame.prototype.setFormerMouseCoords = function (coordsXY) {
    this.frameMouseX = coordsXY[0];
    this.frameMouseY = coordsXY[1];
    this.frameMouseXY(coordsXY);
};


PlayerFrame.prototype.finishFrame = function () {
    console.log('switch frame state from displaying to finished in trialIter ' + this.trialIter);
    this.setState('finished');

    // clear setTimeouts
    clearTimeout(this.frameTimeout);

    for (var i = 0; i < this.onFrameEndCallbacks.length; i++) {
        this.onFrameEndCallbacks[i]();
    }

    // destroy event listeners of triggers
    var events = this.frameData.events();
    for (var i = 0; i < events.length; i++) {
        events[i].destroyOnPlayerFrame(this);
    }

    // remove document event handlers
    $(document).off("keyup");
    $(document).off("keydown");
    $(window).off("mousemove touchmove");

    // empty div and make new frame

    this.frameDiv.css('display', 'none');
    // this.frameDiv.remove();
};

PlayerFrame.prototype.pauseFrame = function () {
    // FIRST call the pause events:
    for (var i = 0; i < this.onGlobalEventCallbacks.length; i++) {
        this.onGlobalEventCallbacks[i]("expPaused");
    }

    // now pause all videos and audio elements:
    var pausedElements = [];
    $.each(this.elements, function (idx, elem) {
        var content = elem.content();
        if (content instanceof VideoElement || content instanceof AudioElement) {
            if (content.currentlyPlaying()) {
                console.log("stop playing video or audio.");
                content.currentlyPlaying(false);
                pausedElements.push(content);
            }
        }
    });
    this.pausedElements = pausedElements;

    // now pause experiment
    this.isPaused(true);
    var events = this.frameData.events();
    for (var i = 0; i < events.length; i++) {
        events[i].startPause(this);
    }
};

PlayerFrame.prototype.continueFrame = function () {
    // First continue experiment:
    this.isPaused(false);
    var events = this.frameData.events();
    for (var i = 0; i < events.length; i++) {
        events[i].stopPause(this);
    }

    // now continue all videos and audio elements:
    $.each(this.pausedElements, function (idx, elem) {
        if (elem instanceof VideoElement || elem instanceof AudioElement) {
            console.log("continue playing video or audio.");
            elem.currentlyPlaying(true);
        }
    });
    this.pausedElements = [];

    // now call continue events:
    for (var i = 0; i < this.onGlobalEventCallbacks.length; i++) {
        this.onGlobalEventCallbacks[i]("expContinued");
    }
};

PlayerFrame.prototype.endFrame = function () {
    if (this.state == 'displaying') {
        this.finishFrame();
        // set next frame
        this.player.currentSequence.selectNextElement();
        this.player.startNextPageOrFrame();
    }
};

PlayerFrame.prototype.endFrameAndGoBack = function () {
    if (this.state == 'displaying') {
        this.finishFrame();
        // set next frame
        this.player.currentSequence.selectPreviousElement();
        this.player.startNextPageOrFrame();
    }
};

PlayerFrame.prototype.goToCustomFrame = function (customFrame) {
    if (this.state == 'displaying') {
        this.finishFrame();
        this.player.currentSequence.selectCustomElement(customFrame);
        this.player.startNextPageOrFrame();
    }
};



PlayerFrame.prototype.getViewSize = function () {
    var width = window.innerWidth;
    var height = window.innerHeight;
    return [width, height];
};


PlayerFrame.prototype.setTimeOut = function () {

    var self = this;
    if (this.frameData.offsetEnabled()) {
        this.frameTimeout = setTimeout(function () {
            self.endFrame();
        }, this.frameData.offset());
    }

};