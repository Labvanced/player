// � by Caspar Goeke and Holger Finger


var PlayerFrame = function(frameData,frameDiv,player) {


    this.frameData = frameData;
    this.frameDiv  = frameDiv;
    this.player = player;
    this.fraemView = null;

};


PlayerFrame.prototype.init = function() {

    this.setTimeOut();
    this.frameView = new FrameView(this.frameDiv,this.frameData,this,"playerView");
    this.frameView.init(this.getViewSize());

    //this.frameDiv.css({'display':'block'});
};


PlayerFrame.prototype.endFrame = function() {
    // set next frame
    this.player.currentSequence.selectNextElement();
    // empty div and make new frame
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