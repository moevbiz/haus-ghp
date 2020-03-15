var domtoimage = require('dom-to-image');
var slugify = require('slugify');

var slider = document.getElementById('font-size');
var frame = document.getElementById('frame');
var container = document.getElementById('text_container');
var text = document.getElementById('text');
var make = document.getElementById('make');
var save = document.getElementById('save');
var backBtn = document.getElementById('revert');

slider.addEventListener('input', function() {
    var size = slider.value;
    var text = document.getElementById('text');
    text.style.fontSize = size + "px";
});

container.addEventListener('click', function(e) {
    if (e.target.id != 'text') {
        placeCaretAtEnd(text);
    }
})

function placeCaretAtEnd(el) {
    el.focus();
    if (typeof window.getSelection != "undefined"
            && typeof document.createRange != "undefined") {
        var range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    } else if (typeof document.body.createTextRange != "undefined") {
        var textRange = document.body.createTextRange();
        textRange.moveToElementText(el);
        textRange.collapse(false);
        textRange.select();
    }
}

make.addEventListener('click', function() {
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
        img.dataset.generatedAt = Date.now();
        img.dataset.slugify = slugify(text.innerHTML);
        img.id="image";

        container.style.display='none';
        document.getElementById('tool_container').style.display="none";
        frame.appendChild(img);
        frame.dataset.content="img";
        document.getElementById('generated').style.display="flex";

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
    document.getElementById('generated').style.display="none";
})

save.addEventListener('click', function() {
    var image = document.getElementById('image');
    var link = document.createElement('a');
    link.download = image.dataset.slugify+ '.png';
    link.href = image.src;
    link.click();
    link.remove();
})