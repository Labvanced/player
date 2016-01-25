var queue        = new createjs.LoadQueue(),
    $state       = $("#state"),
    $progress    = $("#progress"),
    $progressbar = $("#progressbar .bar");


queue.on("complete",     onComplete);
queue.on("error",        onError);
queue.on("fileload",     onFileLoad);
queue.on("fileprogress", onFileProgress);
queue.on("progress",     onProgress);

var list = [
    {
        id: "1",
        src: "https://images.unsplash.com/photo-1446034295857-c39f8844fad4"
    },
    {
        id: "2",
        src: "https://images.unsplash.com/photo-1447522200268-a0378dac3fba"
    },
    {
        id: "3",
        src: "https://images.unsplash.com/photo-1447876394678-42a7efa1b6db"
    },
    {
        id: "4",
        src: "https://images.unsplash.com/photo-1435186376919-88c211714029"
    },
    {
        id: "5",
        src: "https://images.unsplash.com/photo-1444792131309-2e517032ded6"
    },
    {
        id: "6",
        src: "https://images.unsplash.com/photo-1445127040028-b1bdb9acd16e"
    },
    {
        id: "7",
        src: "https://images.unsplash.com/photo-1446426156356-92b664d86b77"
    }
];
queue.loadManifest(list);
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
    $progressbar.addClass("complete");
    $("#sectionPreload").toggle();
    $("#sectionExperiment").show();
    //showStimuli(document.getElementById("stimuli-1"));
    //showStimuli(document.getElementById("stimuli-2"));
}

function onError(event) {
  // console.log('Error', event);
}

function onFileLoad(event) {
  // console.log('File loaded', event);
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