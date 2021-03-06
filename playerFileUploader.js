
var PlayerFileUploader = function (player) {
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
PlayerFileUploader.prototype.addToAjaxUploadQueue = function (file, newFileName, globalVarFile, callbackWhenFinished) {

    if (file.size > 1024 * 1024 * 100) { // only allow files smaller than 100 MB
        console.log("file too large. cannot upload");
        return;
    }

    if (this.ajaxUploadInProgress) {
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
        newFileName: newFileName,
        globalVarFile: globalVarFile,
        callbackWhenFinished: callbackWhenFinished
    });
    this.checkAjaxUploadQueue();
};

/**
 * does the file upload
 */
PlayerFileUploader.prototype.checkAjaxUploadQueue = function () {
    var self = this;

    if (!this.ajaxUploadInProgress) {
        if (this.ajaxUploadQueue.length > 0) {

            this.ajaxUploadInProgress = true;
            this.uploadCurrentFile(this.uploadCurrentFile() + 1);

            console.log("this.uploadCurrentFile() = " + this.uploadCurrentFile());

            function onUploadComplete(file_guid, file_name) {
                console.log("upload is complete.");
                if (self.ajaxUploadQueue[0].callbackWhenFinished) {
                    self.ajaxUploadQueue[0].callbackWhenFinished(file_guid, file_name);
                }

                // now start the next file:
                self.ajaxUploadQueue.shift();
                self.ajaxUploadInProgress = false;
                self.checkAjaxUploadQueue();
            }

            if (this.player.runOnlyTaskId || this.player.isTestrun) {
                // simulated upload (use timeout to make testrun similar to real run):
                setTimeout(function () {
                    onUploadComplete(guid(), self.ajaxUploadQueue[0].newFileName);
                }, 500);
            }
            else {
                if (is_nwjs()) {
                    // save next file to disk:
                    var newFileName = this.ajaxUploadQueue[0].newFileName;
                    var reader = new FileReader();
                    reader.onload = function (e) {
                        var arrayBuffer = reader.result;
                        writeFileNwjs(arrayBuffer, newFileName, function (file_guid) {
                            onUploadComplete(file_guid, newFileName);
                        })
                    };
                    reader.readAsArrayBuffer(this.ajaxUploadQueue[0].file);
                }
                else {
                    // start new upload of next file in queue:
                    var formData = new FormData();
                    formData.append('expSessionNr', self.player.expSessionNr);
                    formData.append('newFileName', this.ajaxUploadQueue[0].newFileName);
                    formData.append('myFile', this.ajaxUploadQueue[0].file, this.ajaxUploadQueue[0].newFileName);
                    var xhr = new XMLHttpRequest();
                    xhr.open('post', '/player_upload', true);
                    xhr.upload.onprogress = function (e) {
                        if (e.lengthComputable) {
                            var percentage = (e.loaded / e.total) * 100;
                            console.log("upload percentage complete: " + percentage);
                            self.uploadPercentComplete(percentage);
                        }
                    };
                    xhr.onerror = function (e) {
                        console.log('An error occurred while uploading file. Maybe your file is too big');
                    };
                    xhr.onload = function (e) {
                        //console.log(this.statusText);
                        var result = JSON.parse(xhr.response);
                        onUploadComplete(result.file_guid, result.file_name);
                    };
                    xhr.send(formData);
                }
            }
        }
    }
};
