
var PlayerPreloader = function(player) {
    var self = this;

    this.player = player;
    this.queue = new createjs.LoadQueue(true);
    this.preloadedObjectUrlsById = {};
    this.progress = ko.observable(0);
    this.contentList = []

    this.queue.on("complete",function onComplete(event) {
        self.player.preloaderCompleted(true);
    });

    this.queue.on("error", function onError(event) {
        console.log('Preloader Error', event);
        if (self.player.experiment.exp_data.studySettings.actionOnResourceError()== "abort experiment"){
            self.player.finishSessionWithError("ERROR: A resource could not be loaded! Please try to load the experiment again. If this error repeats please contact the creator of the experiment.")
        }
    });


    this.queue.on("fileload", function onFileLoad(event) {
        var item = event.item; // A reference to the item that was passed in to the LoadQueue
        var type = item.type;

        // Add any images to the page body.
        if (type == createjs.LoadQueue.IMAGE || type == createjs.LoadQueue.VIDEO || type == createjs.LoadQueue.SOUND) {
            var objectUrl = (window.URL || window.webkitURL).createObjectURL(event.rawResult);
            self.preloadedObjectUrlsById[event.item.id] = objectUrl;
            self.addToCache(type, objectUrl);
        }
        else {
            console.log("other content");
        }
    });

    /*this.queue.on("fileprogress",function onFileProgress(event) {
        //console.log('File progress', event);
    });*/

    this.queue.on("progress", function onProgress(event) {
        self.progress(event.loaded);
    });

};

PlayerPreloader.prototype.addToCache = function(type, objectUrl) {
    if (type == createjs.Types.IMAGE) {
        var elemToPreventCacheEviction = new Image;
        elemToPreventCacheEviction.src = objectUrl;
        $("#preloadedCache").append(elemToPreventCacheEviction);
    }
    else if (type == createjs.Types.VIDEO) {
        var elemToPreventCacheEviction = document.createElement('video');
        elemToPreventCacheEviction.src = objectUrl;
        $("#preloadedCache").append(elemToPreventCacheEviction);
    }
    else if (type == createjs.Types.SOUND) {
        var elemToPreventCacheEviction = document.createElement('audio');
        elemToPreventCacheEviction.src = objectUrl;
        $("#preloadedCache").append(elemToPreventCacheEviction);
    }
};

PlayerPreloader.prototype.cancel = function() {
    this.queue.cancel();
};

PlayerPreloader.prototype.nwjsLoadNext = function(idx) {
    var self = this;

    // determine file type:
    var match = createjs.URLUtils.parseURI(this.contentList[idx].src);
    if (match.extension) {
        var ext = match.extension;
    }
    var type = createjs.RequestUtils.getTypeByExtension(ext);

    var file = new File(this.contentList[idx].src, 'randomDivName'+idx);
    var fileReader = new FileReader();
    fileReader.readAsArrayBuffer(file);
    fileReader.onload = function(e) {
        console.log('load complete '+idx);
        var arr = new Uint8Array(fileReader.result);
        var objectBlob = new Blob([arr]);
        var objectUrl = (window.URL || window.webkitURL).createObjectURL(objectBlob);
        self.preloadedObjectUrlsById[self.contentList[idx].id] = objectUrl;
        self.addToCache(type, objectUrl);

        idx += 1;
        if (idx >= self.contentList.length) {
            self.player.preloaderCompleted(true);
            //self.queue.loadManifest(self.contentList);
        }
        else {
            self.nwjsLoadNext(idx);
        }
    };

    fileReader.onerror = function(e) {
        console.error(e);
    };

    /*var fileReader = new FileReader();
    fileReader.onload = function() {
        fs.writeFileSync('test.wav', Buffer.from(new Uint8Array(fileReader.result)));
    };
    fileReader.readAsArrayBuffer($scope.recordedInput);*/
};

PlayerPreloader.prototype.start = function(contentList) {
    this.contentList = contentList;

    /*if (is_nwjs()) {
        // need to check if file exists locally:
        var fs = require('fs');
        var newContentList = [];
        for (var i = 0; i < contentList.length; i++) {
            if (fs.existsSync(contentList[i].src)) {
                newContentList.push(contentList[i]);
            }
            else {
                console.warn("local offline file not found!")
            }
        }
        contentList = newContentList;
    }*/

    if (is_nwjs()) {
        this.nwjsLoadNext(0);
    }
    else {
        this.queue.loadManifest(this.contentList);
    }
};

