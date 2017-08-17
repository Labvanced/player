var queue        = new createjs.LoadQueue(true),
    $state       = $("#state"),
    $progress    = $("#progress"),
    $progressbar = $("#progressbar .bar");


queue.on("complete",     onComplete);
queue.on("error",        onError);
queue.on("fileload",     onFileLoad);
queue.on("fileprogress", onFileProgress);
queue.on("progress",     onProgress);

var reps = 0;
function getRandomArbitrary(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function showStimuli(obj) {
    var itemId = getRandomArbitrary(0, 6);
    //var obj = document.getElementById(id);
    console.log("show: " + obj + "item: " + itemId);
    obj.src = list[itemId].src;
    obj.style.display = "block";
    setTimeout(function() {
        hideStimuli(obj);
    }, getRandomArbitrary(1000, 5000));
}
function hideStimuli(obj) {
    console.log("hide: " + obj);
    obj.style.display = "none";
    reps++;
    if (reps <= 20)
        showStimuli(obj);
    return;
}

function onComplete(event) {

    var currentDate = new Date();
    var newDateStart = new Date();
    var newDateEnd = new Date();
    var sessionTimeData= player.experiment.exp_data.availableGroups()[ player.groupNr-1].sessionTimeData()[player.sessionNr-1];
    var nextStartWindow = player.determineNextSessionStartWindow(newDateStart,newDateEnd,currentDate,sessionTimeData);

    $progressbar.addClass("complete");
    $('#stillLoading').hide();

    if (currentDate>=nextStartWindow.end){
        // last start window in the past
        $('#sessionOver').show();
    }
    else if (currentDate>=nextStartWindow.start && currentDate<=nextStartWindow.end)  {
        // currently running
        $('#readyToStart').show();
        $('#startExp').click(function(){
            launchIntoFullscreen(document.documentElement);

            $('#sectionPreload').html("<h1>Starting Experiment...</h1>");
            $('#sectionPreload').css("text-align","center");

            $("#startExpSection").hide();

            // wait for five seconds:
            setTimeout(function(){
                $("#sectionPreload").hide();

                // TODO: this check is not working yet:
                var fullscreenEnabled = document.fullscreenEnabled || document.mozFullScreenEnabled || document.webkitFullscreenEnabled;
                if (fullscreenEnabled){
                    player.startExperiment();
                }
            },5000);

        });
    }
    else if (currentDate<nextStartWindow.start){
        // running in the future
        var timeToWait = player.getDifferenceBetweenDates(currentDate,nextStartWindow.start);


        $('#timeToNextSession').text(timeToWait[3]);
        $('#sessionNotReady').show();

        $('#calcStartingTime').click(function(){
            var currentDate = new Date();
            var timeToWait =  player.getDifferenceBetweenDates(currentDate,nextStartWindow.start);
            $('#timeToNextSession').text(timeToWait[3]);

            if (timeToWait[3]== 'ready'){
                $("#sessionNotReady").hide();
                $('#readyToStart').show();
                $('#startExp').click(function(){
                    launchIntoFullscreen(document.documentElement);

                    $('#sectionPreload').html("<h1>Starting Experiment...</h1>");
                    $('#sectionPreload').css("text-align","center");

                    $("#startExpSection").hide();

                    // wait for five seconds:
                    setTimeout(function(){
                        $("#sectionPreload").hide();

                        // TODO: this check is not working yet:
                        var fullscreenEnabled = document.fullscreenEnabled || document.mozFullScreenEnabled || document.webkitFullscreenEnabled;
                        if (fullscreenEnabled){
                            player.startExperiment();
                        }
                    },5000);

                });
            }

        });

    }

}


function onError(event) {
    // console.log('Error', event);
}

var preloadedObjectUrlsById = {};

function onFileLoad(event) {
    var item = event.item; // A reference to the item that was passed in to the LoadQueue
    var type = item.type;

    // Add any images to the page body.
    if (type == createjs.LoadQueue.IMAGE || type == createjs.LoadQueue.VIDEO || type == createjs.LoadQueue.SOUND) {
        var objectUrl = (window.URL || window.webkitURL).createObjectURL(event.rawResult);
        preloadedObjectUrlsById[event.item.id] = objectUrl;
    }
    else {
        console.log("other content");
    }
}

function onFileProgress(event) {
    //console.log('File progress', event);
}

function onProgress(event) {
    var progress = Math.round(event.loaded * 100);

    //console.log('General progress', Math.round(event.loaded) * 100, event);
    $progress.text(progress + "%");
    $progressbar.css({
        'width': progress + "%"
    });
}