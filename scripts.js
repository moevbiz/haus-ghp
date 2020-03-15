var domtoimage = require('dom-to-image');

var slider = document.getElementById('font-size');
var frame = document.getElementById('frame');
var container = document.getElementById('text_container');
var text = document.getElementById('text');
var saveBtn = document.getElementById('save');
var backBtn = document.getElementById('revert');

slider.addEventListener('input', function() {
    var size = slider.value;
    var text = document.getElementById('text');
    text.style.fontSize = size + "px";
});

container.addEventListener('click', function() {
    text.focus();
})

save.addEventListener('click', function() {
    var node = container;
    var scale = 750 / node.offsetWidth;
    domtoimage.toPng(node, {
        height: node.offsetHeight * scale,
        width: node.offsetWidth * scale,
        style: {
            transform: "scale(" + scale + ")",
            transformOrigin: "top left",
            width: node.offsetWidth + "px",
            height: node.offsetHeight + "px",
            'background-color': 'white',
        }
    })
    .then(function (dataUrl) {
        console.log(container.clientWidth);
        var img = new Image();
        img.src = dataUrl;
        img.className="img";
        container.style.display='none';
        document.getElementById('tool_container').style.display="none";
        frame.appendChild(img);
        frame.dataset.content="img";
        backBtn.parentElement.style.display="block";
    })
    .catch(function (error) {
        console.error('oops, something went wrong!', error);
    });
})

backBtn.addEventListener('click', function() {
    frame.removeChild(frame.getElementsByTagName('img')[0]);
    frame.dataset.content="edit";
    container.style.display='flex';
    document.getElementById('tool_container').style.display="block";
    this.parentElement.style.display="none";
})