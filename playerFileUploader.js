
var PlayerFileUploader = function(player) {
    var self = this;

    this.player = player;

    this.uploadNumFiles = ko.observable(0);
    this.uploadCurrentFile = ko.observable(0);
    this.uploadPercentComplete = ko.observable(0);
    this.ajaxUploadQueue = [];
    this.ajaxUploadInProgress = false;
};

/**
 * adds an upload command to the the upload Queue
 *
 * @param {directory} parentFolderId - the directory where the file is located
 * @param {fileString} file - the file string
 */
PlayerFileUploader.prototype.addToAjaxUploadQueue = function(file, globalVarFile, callbackWhenFinished) {

    if (this.ajaxUploadInProgress){
        this.uploadNumFiles(this.uploadNumFiles() + 1);
        console.log("ajax upload in progress");
    }
    else {
        this.uploadNumFiles(1);
        this.uploadCurrentFile(0);
        console.log("this.uploadCurrentFile() is set to 0");
    }

    this.ajaxUploadQueue.push({
        file: file,
        globalVarFile: globalVarFile,
        callbackWhenFinished: callbackWhenFinished
    });
    this.checkAjaxUploadQueue();
};

/**
 * does the file upload
 */
PlayerFileUploader.prototype.checkAjaxUploadQueue = function() {
    var self = this;

    if (!this.ajaxUploadInProgress) {
        if (this.ajaxUploadQueue.length > 0) {
            this.ajaxUploadInProgress = true;
            this.uploadCurrentFile(this.uploadCurrentFile() + 1);

            console.log("this.uploadCurrentFile() = " + this.uploadCurrentFile());

            // start new upload of next file in queue:
            var formData = new FormData();
            formData.append('myFile', this.ajaxUploadQueue[0].file);
            var xhr = new XMLHttpRequest();
            xhr.open('post', '/player_upload', true);
            xhr.upload.onprogress = function (e) {
                if (e.lengthComputable) {
                    var percentage = (e.loaded / e.total) * 100;
                    console.log("upload percentage complete: "+percentage);
                    self.uploadPercentComplete(percentage);
                }
            };
            xhr.onerror = function (e) {
                console.log('An error occurred while submitting the form. Maybe your file is too big');
            };
            xhr.onload = function (e) {
                console.log(this.statusText);
                console.log(xhr.response);

                self.ajaxUploadQueue[0].callbackWhenFinished();

                // now start the next file:
                console.log("xhr.onload: start the next file");
                self.ajaxUploadQueue.shift();
                self.ajaxUploadInProgress = false;
                self.checkAjaxUploadQueue();

            };
            xhr.send(formData);

        }
    }
};
