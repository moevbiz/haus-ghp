var domtoimage = require('dom-to-image');
var urlSlug = require('url-slug');
var striptags = require('striptags');

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
    e.stopPropagation();
    if (e.target.id != 'text' && e.target.tagName != 'I') {
        placeCaretAtEnd(text);
    }
})

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
        img.dataset.slug = urlSlug(striptags(text.innerText));
        img.id="image";

        container.style.display='none';
        document.getElementById('tool_container').style.display="none";
        frame.appendChild(img);
        frame.dataset.content="img";
        document.getElementById('generated').style.display="block";

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
    link.download = image.dataset.slug + '.png';
    link.href = image.src;
    link.click();
    link.remove();
})

copy.addEventListener('click', function() {
    copyTextToClipboard(striptags(text.innerText));
});

function fallbackCopyTextToClipboard(text) {
    var textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
  
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
  
    try {
      var successful = document.execCommand('copy');
      var msg = successful ? 'successful' : 'unsuccessful';
      console.log('Fallback: Copying text command was ' + msg);
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
    }
  
    document.body.removeChild(textArea);
  }

function copyTextToClipboard(text) {
if (!navigator.clipboard) {
    fallbackCopyTextToClipboard(text);
    return;
}
navigator.clipboard.writeText(text).then(function() {
    console.log('Async: Copying to clipboard was successful!');
}, function(err) {
    console.error('Async: Could not copy text: ', err);
});
}

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