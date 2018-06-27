
var PlayerPreloader = function(player) {
    var self = this;

    this.player = player;
    this.queue = new createjs.LoadQueue(true);
    this.preloadedObjectUrlsById = {};
    this.progress = ko.observable(0);

    this.queue.on("complete",function onComplete(event) {
        self.player.preloaderCompleted(true);
    });

    this.queue.on("error", function onError(event) {
        console.log('Preloader Error', event);
    });

    this.queue.on("fileload", function onFileLoad(event) {
        var item = event.item; // A reference to the item that was passed in to the LoadQueue
        var type = item.type;

        // Add any images to the page body.
        if (type == createjs.LoadQueue.IMAGE || type == createjs.LoadQueue.VIDEO || type == createjs.LoadQueue.SOUND) {
            var objectUrl = (window.URL || window.webkitURL).createObjectURL(event.rawResult);
            self.preloadedObjectUrlsById[event.item.id] = objectUrl;

            if (type == createjs.LoadQueue.IMAGE) {
                var elemToPreventCacheEviction = new Image;
                elemToPreventCacheEviction.src = objectUrl;
                $("#preloadedCache").append(elemToPreventCacheEviction);
            }
            else if (type == createjs.LoadQueue.VIDEO) {
                var elemToPreventCacheEviction = document.createElement('video');
                elemToPreventCacheEviction.src = objectUrl;
                $("#preloadedCache").append(elemToPreventCacheEviction);
            }
            else if (type == createjs.LoadQueue.SOUND) {
                var elemToPreventCacheEviction = document.createElement('audio');
                elemToPreventCacheEviction.src = objectUrl;
                $("#preloadedCache").append(elemToPreventCacheEviction);
            }
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

PlayerPreloader.prototype.cancel = function() {
    this.queue.cancel();
};


PlayerPreloader.prototype.start = function(contentList) {

    if (is_nwjs()) {
        // need to check if file exists locally:
        var fs = require('fs');
        var newContentList = [];
        for (var i = 0; i < contentList.length; i++) {
            if (contentList[i].src.charAt(0) == "/") {
                contentList[i].src = contentList[i].src.substring(1);
            }
            if (fs.existsSync(contentList[i].src)) {
                newContentList.push(contentList[i]);
            }
        }
        contentList = newContentList;
    }
    this.queue.loadManifest(contentList);
};

