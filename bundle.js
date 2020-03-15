(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
(function (global) {
    'use strict';

    var util = newUtil();
    var inliner = newInliner();
    var fontFaces = newFontFaces();
    var images = newImages();

    // Default impl options
    var defaultOptions = {
        // Default is to fail on error, no placeholder
        imagePlaceholder: undefined,
        // Default cache bust is false, it will use the cache
        cacheBust: false
    };

    var domtoimage = {
        toSvg: toSvg,
        toPng: toPng,
        toJpeg: toJpeg,
        toBlob: toBlob,
        toPixelData: toPixelData,
        impl: {
            fontFaces: fontFaces,
            images: images,
            util: util,
            inliner: inliner,
            options: {}
        }
    };

    if (typeof module !== 'undefined')
        module.exports = domtoimage;
    else
        global.domtoimage = domtoimage;


    /**
     * @param {Node} node - The DOM Node object to render
     * @param {Object} options - Rendering options
     * @param {Function} options.filter - Should return true if passed node should be included in the output
     *          (excluding node means excluding it's children as well). Not called on the root node.
     * @param {String} options.bgcolor - color for the background, any valid CSS color value.
     * @param {Number} options.width - width to be applied to node before rendering.
     * @param {Number} options.height - height to be applied to node before rendering.
     * @param {Object} options.style - an object whose properties to be copied to node's style before rendering.
     * @param {Number} options.quality - a Number between 0 and 1 indicating image quality (applicable to JPEG only),
                defaults to 1.0.
     * @param {String} options.imagePlaceholder - dataURL to use as a placeholder for failed images, default behaviour is to fail fast on images we can't fetch
     * @param {Boolean} options.cacheBust - set to true to cache bust by appending the time to the request url
     * @return {Promise} - A promise that is fulfilled with a SVG image data URL
     * */
    function toSvg(node, options) {
        options = options || {};
        copyOptions(options);
        return Promise.resolve(node)
            .then(function (node) {
                return cloneNode(node, options.filter, true);
            })
            .then(embedFonts)
            .then(inlineImages)
            .then(applyOptions)
            .then(function (clone) {
                return makeSvgDataUri(clone,
                    options.width || util.width(node),
                    options.height || util.height(node)
                );
            });

        function applyOptions(clone) {
            if (options.bgcolor) clone.style.backgroundColor = options.bgcolor;

            if (options.width) clone.style.width = options.width + 'px';
            if (options.height) clone.style.height = options.height + 'px';

            if (options.style)
                Object.keys(options.style).forEach(function (property) {
                    clone.style[property] = options.style[property];
                });

            return clone;
        }
    }

    /**
     * @param {Node} node - The DOM Node object to render
     * @param {Object} options - Rendering options, @see {@link toSvg}
     * @return {Promise} - A promise that is fulfilled with a Uint8Array containing RGBA pixel data.
     * */
    function toPixelData(node, options) {
        return draw(node, options || {})
            .then(function (canvas) {
                return canvas.getContext('2d').getImageData(
                    0,
                    0,
                    util.width(node),
                    util.height(node)
                ).data;
            });
    }

    /**
     * @param {Node} node - The DOM Node object to render
     * @param {Object} options - Rendering options, @see {@link toSvg}
     * @return {Promise} - A promise that is fulfilled with a PNG image data URL
     * */
    function toPng(node, options) {
        return draw(node, options || {})
            .then(function (canvas) {
                return canvas.toDataURL();
            });
    }

    /**
     * @param {Node} node - The DOM Node object to render
     * @param {Object} options - Rendering options, @see {@link toSvg}
     * @return {Promise} - A promise that is fulfilled with a JPEG image data URL
     * */
    function toJpeg(node, options) {
        options = options || {};
        return draw(node, options)
            .then(function (canvas) {
                return canvas.toDataURL('image/jpeg', options.quality || 1.0);
            });
    }

    /**
     * @param {Node} node - The DOM Node object to render
     * @param {Object} options - Rendering options, @see {@link toSvg}
     * @return {Promise} - A promise that is fulfilled with a PNG image blob
     * */
    function toBlob(node, options) {
        return draw(node, options || {})
            .then(util.canvasToBlob);
    }

    function copyOptions(options) {
        // Copy options to impl options for use in impl
        if(typeof(options.imagePlaceholder) === 'undefined') {
            domtoimage.impl.options.imagePlaceholder = defaultOptions.imagePlaceholder;
        } else {
            domtoimage.impl.options.imagePlaceholder = options.imagePlaceholder;
        }

        if(typeof(options.cacheBust) === 'undefined') {
            domtoimage.impl.options.cacheBust = defaultOptions.cacheBust;
        } else {
            domtoimage.impl.options.cacheBust = options.cacheBust;
        }
    }

    function draw(domNode, options) {
        return toSvg(domNode, options)
            .then(util.makeImage)
            .then(util.delay(100))
            .then(function (image) {
                var canvas = newCanvas(domNode);
                canvas.getContext('2d').drawImage(image, 0, 0);
                return canvas;
            });

        function newCanvas(domNode) {
            var canvas = document.createElement('canvas');
            canvas.width = options.width || util.width(domNode);
            canvas.height = options.height || util.height(domNode);

            if (options.bgcolor) {
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = options.bgcolor;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            return canvas;
        }
    }

    function cloneNode(node, filter, root) {
        if (!root && filter && !filter(node)) return Promise.resolve();

        return Promise.resolve(node)
            .then(makeNodeCopy)
            .then(function (clone) {
                return cloneChildren(node, clone, filter);
            })
            .then(function (clone) {
                return processClone(node, clone);
            });

        function makeNodeCopy(node) {
            if (node instanceof HTMLCanvasElement) return util.makeImage(node.toDataURL());
            return node.cloneNode(false);
        }

        function cloneChildren(original, clone, filter) {
            var children = original.childNodes;
            if (children.length === 0) return Promise.resolve(clone);

            return cloneChildrenInOrder(clone, util.asArray(children), filter)
                .then(function () {
                    return clone;
                });

            function cloneChildrenInOrder(parent, children, filter) {
                var done = Promise.resolve();
                children.forEach(function (child) {
                    done = done
                        .then(function () {
                            return cloneNode(child, filter);
                        })
                        .then(function (childClone) {
                            if (childClone) parent.appendChild(childClone);
                        });
                });
                return done;
            }
        }

        function processClone(original, clone) {
            if (!(clone instanceof Element)) return clone;

            return Promise.resolve()
                .then(cloneStyle)
                .then(clonePseudoElements)
                .then(copyUserInput)
                .then(fixSvg)
                .then(function () {
                    return clone;
                });

            function cloneStyle() {
                copyStyle(window.getComputedStyle(original), clone.style);

                function copyStyle(source, target) {
                    if (source.cssText) target.cssText = source.cssText;
                    else copyProperties(source, target);

                    function copyProperties(source, target) {
                        util.asArray(source).forEach(function (name) {
                            target.setProperty(
                                name,
                                source.getPropertyValue(name),
                                source.getPropertyPriority(name)
                            );
                        });
                    }
                }
            }

            function clonePseudoElements() {
                [':before', ':after'].forEach(function (element) {
                    clonePseudoElement(element);
                });

                function clonePseudoElement(element) {
                    var style = window.getComputedStyle(original, element);
                    var content = style.getPropertyValue('content');

                    if (content === '' || content === 'none') return;

                    var className = util.uid();
                    clone.className = clone.className + ' ' + className;
                    var styleElement = document.createElement('style');
                    styleElement.appendChild(formatPseudoElementStyle(className, element, style));
                    clone.appendChild(styleElement);

                    function formatPseudoElementStyle(className, element, style) {
                        var selector = '.' + className + ':' + element;
                        var cssText = style.cssText ? formatCssText(style) : formatCssProperties(style);
                        return document.createTextNode(selector + '{' + cssText + '}');

                        function formatCssText(style) {
                            var content = style.getPropertyValue('content');
                            return style.cssText + ' content: ' + content + ';';
                        }

                        function formatCssProperties(style) {

                            return util.asArray(style)
                                .map(formatProperty)
                                .join('; ') + ';';

                            function formatProperty(name) {
                                return name + ': ' +
                                    style.getPropertyValue(name) +
                                    (style.getPropertyPriority(name) ? ' !important' : '');
                            }
                        }
                    }
                }
            }

            function copyUserInput() {
                if (original instanceof HTMLTextAreaElement) clone.innerHTML = original.value;
                if (original instanceof HTMLInputElement) clone.setAttribute("value", original.value);
            }

            function fixSvg() {
                if (!(clone instanceof SVGElement)) return;
                clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

                if (!(clone instanceof SVGRectElement)) return;
                ['width', 'height'].forEach(function (attribute) {
                    var value = clone.getAttribute(attribute);
                    if (!value) return;

                    clone.style.setProperty(attribute, value);
                });
            }
        }
    }

    function embedFonts(node) {
        return fontFaces.resolveAll()
            .then(function (cssText) {
                var styleNode = document.createElement('style');
                node.appendChild(styleNode);
                styleNode.appendChild(document.createTextNode(cssText));
                return node;
            });
    }

    function inlineImages(node) {
        return images.inlineAll(node)
            .then(function () {
                return node;
            });
    }

    function makeSvgDataUri(node, width, height) {
        return Promise.resolve(node)
            .then(function (node) {
                node.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
                return new XMLSerializer().serializeToString(node);
            })
            .then(util.escapeXhtml)
            .then(function (xhtml) {
                return '<foreignObject x="0" y="0" width="100%" height="100%">' + xhtml + '</foreignObject>';
            })
            .then(function (foreignObject) {
                return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
                    foreignObject + '</svg>';
            })
            .then(function (svg) {
                return 'data:image/svg+xml;charset=utf-8,' + svg;
            });
    }

    function newUtil() {
        return {
            escape: escape,
            parseExtension: parseExtension,
            mimeType: mimeType,
            dataAsUrl: dataAsUrl,
            isDataUrl: isDataUrl,
            canvasToBlob: canvasToBlob,
            resolveUrl: resolveUrl,
            getAndEncode: getAndEncode,
            uid: uid(),
            delay: delay,
            asArray: asArray,
            escapeXhtml: escapeXhtml,
            makeImage: makeImage,
            width: width,
            height: height
        };

        function mimes() {
            /*
             * Only WOFF and EOT mime types for fonts are 'real'
             * see http://www.iana.org/assignments/media-types/media-types.xhtml
             */
            var WOFF = 'application/font-woff';
            var JPEG = 'image/jpeg';

            return {
                'woff': WOFF,
                'woff2': WOFF,
                'ttf': 'application/font-truetype',
                'eot': 'application/vnd.ms-fontobject',
                'png': 'image/png',
                'jpg': JPEG,
                'jpeg': JPEG,
                'gif': 'image/gif',
                'tiff': 'image/tiff',
                'svg': 'image/svg+xml'
            };
        }

        function parseExtension(url) {
            var match = /\.([^\.\/]*?)$/g.exec(url);
            if (match) return match[1];
            else return '';
        }

        function mimeType(url) {
            var extension = parseExtension(url).toLowerCase();
            return mimes()[extension] || '';
        }

        function isDataUrl(url) {
            return url.search(/^(data:)/) !== -1;
        }

        function toBlob(canvas) {
            return new Promise(function (resolve) {
                var binaryString = window.atob(canvas.toDataURL().split(',')[1]);
                var length = binaryString.length;
                var binaryArray = new Uint8Array(length);

                for (var i = 0; i < length; i++)
                    binaryArray[i] = binaryString.charCodeAt(i);

                resolve(new Blob([binaryArray], {
                    type: 'image/png'
                }));
            });
        }

        function canvasToBlob(canvas) {
            if (canvas.toBlob)
                return new Promise(function (resolve) {
                    canvas.toBlob(resolve);
                });

            return toBlob(canvas);
        }

        function resolveUrl(url, baseUrl) {
            var doc = document.implementation.createHTMLDocument();
            var base = doc.createElement('base');
            doc.head.appendChild(base);
            var a = doc.createElement('a');
            doc.body.appendChild(a);
            base.href = baseUrl;
            a.href = url;
            return a.href;
        }

        function uid() {
            var index = 0;

            return function () {
                return 'u' + fourRandomChars() + index++;

                function fourRandomChars() {
                    /* see http://stackoverflow.com/a/6248722/2519373 */
                    return ('0000' + (Math.random() * Math.pow(36, 4) << 0).toString(36)).slice(-4);
                }
            };
        }

        function makeImage(uri) {
            return new Promise(function (resolve, reject) {
                var image = new Image();
                image.onload = function () {
                    resolve(image);
                };
                image.onerror = reject;
                image.src = uri;
            });
        }

        function getAndEncode(url) {
            var TIMEOUT = 30000;
            if(domtoimage.impl.options.cacheBust) {
                // Cache bypass so we dont have CORS issues with cached images
                // Source: https://developer.mozilla.org/en/docs/Web/API/XMLHttpRequest/Using_XMLHttpRequest#Bypassing_the_cache
                url += ((/\?/).test(url) ? "&" : "?") + (new Date()).getTime();
            }

            return new Promise(function (resolve) {
                var request = new XMLHttpRequest();

                request.onreadystatechange = done;
                request.ontimeout = timeout;
                request.responseType = 'blob';
                request.timeout = TIMEOUT;
                request.open('GET', url, true);
                request.send();

                var placeholder;
                if(domtoimage.impl.options.imagePlaceholder) {
                    var split = domtoimage.impl.options.imagePlaceholder.split(/,/);
                    if(split && split[1]) {
                        placeholder = split[1];
                    }
                }

                function done() {
                    if (request.readyState !== 4) return;

                    if (request.status !== 200) {
                        if(placeholder) {
                            resolve(placeholder);
                        } else {
                            fail('cannot fetch resource: ' + url + ', status: ' + request.status);
                        }

                        return;
                    }

                    var encoder = new FileReader();
                    encoder.onloadend = function () {
                        var content = encoder.result.split(/,/)[1];
                        resolve(content);
                    };
                    encoder.readAsDataURL(request.response);
                }

                function timeout() {
                    if(placeholder) {
                        resolve(placeholder);
                    } else {
                        fail('timeout of ' + TIMEOUT + 'ms occured while fetching resource: ' + url);
                    }
                }

                function fail(message) {
                    console.error(message);
                    resolve('');
                }
            });
        }

        function dataAsUrl(content, type) {
            return 'data:' + type + ';base64,' + content;
        }

        function escape(string) {
            return string.replace(/([.*+?^${}()|\[\]\/\\])/g, '\\$1');
        }

        function delay(ms) {
            return function (arg) {
                return new Promise(function (resolve) {
                    setTimeout(function () {
                        resolve(arg);
                    }, ms);
                });
            };
        }

        function asArray(arrayLike) {
            var array = [];
            var length = arrayLike.length;
            for (var i = 0; i < length; i++) array.push(arrayLike[i]);
            return array;
        }

        function escapeXhtml(string) {
            return string.replace(/#/g, '%23').replace(/\n/g, '%0A');
        }

        function width(node) {
            var leftBorder = px(node, 'border-left-width');
            var rightBorder = px(node, 'border-right-width');
            return node.scrollWidth + leftBorder + rightBorder;
        }

        function height(node) {
            var topBorder = px(node, 'border-top-width');
            var bottomBorder = px(node, 'border-bottom-width');
            return node.scrollHeight + topBorder + bottomBorder;
        }

        function px(node, styleProperty) {
            var value = window.getComputedStyle(node).getPropertyValue(styleProperty);
            return parseFloat(value.replace('px', ''));
        }
    }

    function newInliner() {
        var URL_REGEX = /url\(['"]?([^'"]+?)['"]?\)/g;

        return {
            inlineAll: inlineAll,
            shouldProcess: shouldProcess,
            impl: {
                readUrls: readUrls,
                inline: inline
            }
        };

        function shouldProcess(string) {
            return string.search(URL_REGEX) !== -1;
        }

        function readUrls(string) {
            var result = [];
            var match;
            while ((match = URL_REGEX.exec(string)) !== null) {
                result.push(match[1]);
            }
            return result.filter(function (url) {
                return !util.isDataUrl(url);
            });
        }

        function inline(string, url, baseUrl, get) {
            return Promise.resolve(url)
                .then(function (url) {
                    return baseUrl ? util.resolveUrl(url, baseUrl) : url;
                })
                .then(get || util.getAndEncode)
                .then(function (data) {
                    return util.dataAsUrl(data, util.mimeType(url));
                })
                .then(function (dataUrl) {
                    return string.replace(urlAsRegex(url), '$1' + dataUrl + '$3');
                });

            function urlAsRegex(url) {
                return new RegExp('(url\\([\'"]?)(' + util.escape(url) + ')([\'"]?\\))', 'g');
            }
        }

        function inlineAll(string, baseUrl, get) {
            if (nothingToInline()) return Promise.resolve(string);

            return Promise.resolve(string)
                .then(readUrls)
                .then(function (urls) {
                    var done = Promise.resolve(string);
                    urls.forEach(function (url) {
                        done = done.then(function (string) {
                            return inline(string, url, baseUrl, get);
                        });
                    });
                    return done;
                });

            function nothingToInline() {
                return !shouldProcess(string);
            }
        }
    }

    function newFontFaces() {
        return {
            resolveAll: resolveAll,
            impl: {
                readAll: readAll
            }
        };

        function resolveAll() {
            return readAll(document)
                .then(function (webFonts) {
                    return Promise.all(
                        webFonts.map(function (webFont) {
                            return webFont.resolve();
                        })
                    );
                })
                .then(function (cssStrings) {
                    return cssStrings.join('\n');
                });
        }

        function readAll() {
            return Promise.resolve(util.asArray(document.styleSheets))
                .then(getCssRules)
                .then(selectWebFontRules)
                .then(function (rules) {
                    return rules.map(newWebFont);
                });

            function selectWebFontRules(cssRules) {
                return cssRules
                    .filter(function (rule) {
                        return rule.type === CSSRule.FONT_FACE_RULE;
                    })
                    .filter(function (rule) {
                        return inliner.shouldProcess(rule.style.getPropertyValue('src'));
                    });
            }

            function getCssRules(styleSheets) {
                var cssRules = [];
                styleSheets.forEach(function (sheet) {
                    try {
                        util.asArray(sheet.cssRules || []).forEach(cssRules.push.bind(cssRules));
                    } catch (e) {
                        console.log('Error while reading CSS rules from ' + sheet.href, e.toString());
                    }
                });
                return cssRules;
            }

            function newWebFont(webFontRule) {
                return {
                    resolve: function resolve() {
                        var baseUrl = (webFontRule.parentStyleSheet || {}).href;
                        return inliner.inlineAll(webFontRule.cssText, baseUrl);
                    },
                    src: function () {
                        return webFontRule.style.getPropertyValue('src');
                    }
                };
            }
        }
    }

    function newImages() {
        return {
            inlineAll: inlineAll,
            impl: {
                newImage: newImage
            }
        };

        function newImage(element) {
            return {
                inline: inline
            };

            function inline(get) {
                if (util.isDataUrl(element.src)) return Promise.resolve();

                return Promise.resolve(element.src)
                    .then(get || util.getAndEncode)
                    .then(function (data) {
                        return util.dataAsUrl(data, util.mimeType(element.src));
                    })
                    .then(function (dataUrl) {
                        return new Promise(function (resolve, reject) {
                            element.onload = resolve;
                            element.onerror = reject;
                            element.src = dataUrl;
                        });
                    });
            }
        }

        function inlineAll(node) {
            if (!(node instanceof Element)) return Promise.resolve(node);

            return inlineBackground(node)
                .then(function () {
                    if (node instanceof HTMLImageElement)
                        return newImage(node).inline();
                    else
                        return Promise.all(
                            util.asArray(node.childNodes).map(function (child) {
                                return inlineAll(child);
                            })
                        );
                });

            function inlineBackground(node) {
                var background = node.style.getPropertyValue('background');

                if (!background) return Promise.resolve(node);

                return inliner.inlineAll(background)
                    .then(function (inlined) {
                        node.style.setProperty(
                            'background',
                            inlined,
                            node.style.getPropertyPriority('background')
                        );
                    })
                    .then(function () {
                        return node;
                    });
            }
        }
    }
})(this);

},{}],2:[function(require,module,exports){

;(function (name, root, factory) {
  if (typeof exports === 'object') {
    module.exports = factory()
    module.exports['default'] = factory()
  }
  /* istanbul ignore next */
  else if (typeof define === 'function' && define.amd) {
    define(factory)
  }
  else {
    root[name] = factory()
  }
}('slugify', this, function () {
  var charMap = JSON.parse('{"$":"dollar","%":"percent","&":"and","<":"less",">":"greater","|":"or","¢":"cent","£":"pound","¤":"currency","¥":"yen","©":"(c)","ª":"a","®":"(r)","º":"o","À":"A","Á":"A","Â":"A","Ã":"A","Ä":"A","Å":"A","Æ":"AE","Ç":"C","È":"E","É":"E","Ê":"E","Ë":"E","Ì":"I","Í":"I","Î":"I","Ï":"I","Ð":"D","Ñ":"N","Ò":"O","Ó":"O","Ô":"O","Õ":"O","Ö":"O","Ø":"O","Ù":"U","Ú":"U","Û":"U","Ü":"U","Ý":"Y","Þ":"TH","ß":"ss","à":"a","á":"a","â":"a","ã":"a","ä":"a","å":"a","æ":"ae","ç":"c","è":"e","é":"e","ê":"e","ë":"e","ì":"i","í":"i","î":"i","ï":"i","ð":"d","ñ":"n","ò":"o","ó":"o","ô":"o","õ":"o","ö":"o","ø":"o","ù":"u","ú":"u","û":"u","ü":"u","ý":"y","þ":"th","ÿ":"y","Ā":"A","ā":"a","Ă":"A","ă":"a","Ą":"A","ą":"a","Ć":"C","ć":"c","Č":"C","č":"c","Ď":"D","ď":"d","Đ":"DJ","đ":"dj","Ē":"E","ē":"e","Ė":"E","ė":"e","Ę":"e","ę":"e","Ě":"E","ě":"e","Ğ":"G","ğ":"g","Ģ":"G","ģ":"g","Ĩ":"I","ĩ":"i","Ī":"i","ī":"i","Į":"I","į":"i","İ":"I","ı":"i","Ķ":"k","ķ":"k","Ļ":"L","ļ":"l","Ľ":"L","ľ":"l","Ł":"L","ł":"l","Ń":"N","ń":"n","Ņ":"N","ņ":"n","Ň":"N","ň":"n","Ő":"O","ő":"o","Œ":"OE","œ":"oe","Ŕ":"R","ŕ":"r","Ř":"R","ř":"r","Ś":"S","ś":"s","Ş":"S","ş":"s","Š":"S","š":"s","Ţ":"T","ţ":"t","Ť":"T","ť":"t","Ũ":"U","ũ":"u","Ū":"u","ū":"u","Ů":"U","ů":"u","Ű":"U","ű":"u","Ų":"U","ų":"u","Ŵ":"W","ŵ":"w","Ŷ":"Y","ŷ":"y","Ÿ":"Y","Ź":"Z","ź":"z","Ż":"Z","ż":"z","Ž":"Z","ž":"z","ƒ":"f","Ơ":"O","ơ":"o","Ư":"U","ư":"u","ǈ":"LJ","ǉ":"lj","ǋ":"NJ","ǌ":"nj","Ș":"S","ș":"s","Ț":"T","ț":"t","˚":"o","Ά":"A","Έ":"E","Ή":"H","Ί":"I","Ό":"O","Ύ":"Y","Ώ":"W","ΐ":"i","Α":"A","Β":"B","Γ":"G","Δ":"D","Ε":"E","Ζ":"Z","Η":"H","Θ":"8","Ι":"I","Κ":"K","Λ":"L","Μ":"M","Ν":"N","Ξ":"3","Ο":"O","Π":"P","Ρ":"R","Σ":"S","Τ":"T","Υ":"Y","Φ":"F","Χ":"X","Ψ":"PS","Ω":"W","Ϊ":"I","Ϋ":"Y","ά":"a","έ":"e","ή":"h","ί":"i","ΰ":"y","α":"a","β":"b","γ":"g","δ":"d","ε":"e","ζ":"z","η":"h","θ":"8","ι":"i","κ":"k","λ":"l","μ":"m","ν":"n","ξ":"3","ο":"o","π":"p","ρ":"r","ς":"s","σ":"s","τ":"t","υ":"y","φ":"f","χ":"x","ψ":"ps","ω":"w","ϊ":"i","ϋ":"y","ό":"o","ύ":"y","ώ":"w","Ё":"Yo","Ђ":"DJ","Є":"Ye","І":"I","Ї":"Yi","Ј":"J","Љ":"LJ","Њ":"NJ","Ћ":"C","Џ":"DZ","А":"A","Б":"B","В":"V","Г":"G","Д":"D","Е":"E","Ж":"Zh","З":"Z","И":"I","Й":"J","К":"K","Л":"L","М":"M","Н":"N","О":"O","П":"P","Р":"R","С":"S","Т":"T","У":"U","Ф":"F","Х":"H","Ц":"C","Ч":"Ch","Ш":"Sh","Щ":"Sh","Ъ":"U","Ы":"Y","Ь":"","Э":"E","Ю":"Yu","Я":"Ya","а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ж":"zh","з":"z","и":"i","й":"j","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"c","ч":"ch","ш":"sh","щ":"sh","ъ":"u","ы":"y","ь":"","э":"e","ю":"yu","я":"ya","ё":"yo","ђ":"dj","є":"ye","і":"i","ї":"yi","ј":"j","љ":"lj","њ":"nj","ћ":"c","ѝ":"u","џ":"dz","Ґ":"G","ґ":"g","Ғ":"GH","ғ":"gh","Қ":"KH","қ":"kh","Ң":"NG","ң":"ng","Ү":"UE","ү":"ue","Ұ":"U","ұ":"u","Һ":"H","һ":"h","Ә":"AE","ә":"ae","Ө":"OE","ө":"oe","฿":"baht","ა":"a","ბ":"b","გ":"g","დ":"d","ე":"e","ვ":"v","ზ":"z","თ":"t","ი":"i","კ":"k","ლ":"l","მ":"m","ნ":"n","ო":"o","პ":"p","ჟ":"zh","რ":"r","ს":"s","ტ":"t","უ":"u","ფ":"f","ქ":"k","ღ":"gh","ყ":"q","შ":"sh","ჩ":"ch","ც":"ts","ძ":"dz","წ":"ts","ჭ":"ch","ხ":"kh","ჯ":"j","ჰ":"h","Ẁ":"W","ẁ":"w","Ẃ":"W","ẃ":"w","Ẅ":"W","ẅ":"w","ẞ":"SS","Ạ":"A","ạ":"a","Ả":"A","ả":"a","Ấ":"A","ấ":"a","Ầ":"A","ầ":"a","Ẩ":"A","ẩ":"a","Ẫ":"A","ẫ":"a","Ậ":"A","ậ":"a","Ắ":"A","ắ":"a","Ằ":"A","ằ":"a","Ẳ":"A","ẳ":"a","Ẵ":"A","ẵ":"a","Ặ":"A","ặ":"a","Ẹ":"E","ẹ":"e","Ẻ":"E","ẻ":"e","Ẽ":"E","ẽ":"e","Ế":"E","ế":"e","Ề":"E","ề":"e","Ể":"E","ể":"e","Ễ":"E","ễ":"e","Ệ":"E","ệ":"e","Ỉ":"I","ỉ":"i","Ị":"I","ị":"i","Ọ":"O","ọ":"o","Ỏ":"O","ỏ":"o","Ố":"O","ố":"o","Ồ":"O","ồ":"o","Ổ":"O","ổ":"o","Ỗ":"O","ỗ":"o","Ộ":"O","ộ":"o","Ớ":"O","ớ":"o","Ờ":"O","ờ":"o","Ở":"O","ở":"o","Ỡ":"O","ỡ":"o","Ợ":"O","ợ":"o","Ụ":"U","ụ":"u","Ủ":"U","ủ":"u","Ứ":"U","ứ":"u","Ừ":"U","ừ":"u","Ử":"U","ử":"u","Ữ":"U","ữ":"u","Ự":"U","ự":"u","Ỳ":"Y","ỳ":"y","Ỵ":"Y","ỵ":"y","Ỷ":"Y","ỷ":"y","Ỹ":"Y","ỹ":"y","‘":"\'","’":"\'","“":"\\\"","”":"\\\"","†":"+","•":"*","…":"...","₠":"ecu","₢":"cruzeiro","₣":"french franc","₤":"lira","₥":"mill","₦":"naira","₧":"peseta","₨":"rupee","₩":"won","₪":"new shequel","₫":"dong","€":"euro","₭":"kip","₮":"tugrik","₯":"drachma","₰":"penny","₱":"peso","₲":"guarani","₳":"austral","₴":"hryvnia","₵":"cedi","₸":"kazakhstani tenge","₹":"indian rupee","₽":"russian ruble","₿":"bitcoin","℠":"sm","™":"tm","∂":"d","∆":"delta","∑":"sum","∞":"infinity","♥":"love","元":"yuan","円":"yen","﷼":"rial"}')
  var locales = JSON.parse('{"vi":{"Đ":"D","đ":"d"}}')

  function replace (string, options) {
    if (typeof string !== 'string') {
      throw new Error('slugify: string argument expected')
    }

    options = (typeof options === 'string')
      ? {replacement: options}
      : options || {}

    var locale = locales[options.locale] || {}

    var replacement = options.replacement || '-'

    var slug = string.split('')
      // replace characters based on charMap
      .reduce(function (result, ch) {
        return result + (locale[ch] || charMap[ch] || ch)
      }, '')
      // remove not allowed characters
      .replace(options.remove || /[^\w\s$*_+~.()'"!\-:@]+/g, '')
      // trim leading/trailing spaces
      .trim()
      // convert spaces to replacement character
      // also remove duplicates of the replacement character
      .replace(new RegExp('[\\s' + replacement + ']+', 'g'), replacement)

    if (options.lower) {
      slug = slug.toLowerCase()
    }

    if (options.strict) {
      // remove anything besides letters, numbers, and the replacement char
      slug = slug
        .replace(new RegExp('[^a-zA-Z0-9' + replacement + ']', 'g'), '')
    }

    return slug
  }

  replace.extend = function (customMap) {
    for (var key in customMap) {
      charMap[key] = customMap[key]
    }
  }

  return replace
}))

},{}],3:[function(require,module,exports){
'use strict';

(function (global) {

    // minimal symbol polyfill for IE11 and others
    if (typeof Symbol !== 'function') {
        var Symbol = function(name) {
            return name;
        }

        Symbol.nonNative = true;
    }

    const STATE_PLAINTEXT = Symbol('plaintext');
    const STATE_HTML      = Symbol('html');
    const STATE_COMMENT   = Symbol('comment');

    const ALLOWED_TAGS_REGEX  = /<(\w*)>/g;
    const NORMALIZE_TAG_REGEX = /<\/?([^\s\/>]+)/;

    function striptags(html, allowable_tags, tag_replacement) {
        html            = html || '';
        allowable_tags  = allowable_tags || [];
        tag_replacement = tag_replacement || '';

        let context = init_context(allowable_tags, tag_replacement);

        return striptags_internal(html, context);
    }

    function init_striptags_stream(allowable_tags, tag_replacement) {
        allowable_tags  = allowable_tags || [];
        tag_replacement = tag_replacement || '';

        let context = init_context(allowable_tags, tag_replacement);

        return function striptags_stream(html) {
            return striptags_internal(html || '', context);
        };
    }

    striptags.init_streaming_mode = init_striptags_stream;

    function init_context(allowable_tags, tag_replacement) {
        allowable_tags = parse_allowable_tags(allowable_tags);

        return {
            allowable_tags : allowable_tags,
            tag_replacement: tag_replacement,

            state         : STATE_PLAINTEXT,
            tag_buffer    : '',
            depth         : 0,
            in_quote_char : ''
        };
    }

    function striptags_internal(html, context) {
        let allowable_tags  = context.allowable_tags;
        let tag_replacement = context.tag_replacement;

        let state         = context.state;
        let tag_buffer    = context.tag_buffer;
        let depth         = context.depth;
        let in_quote_char = context.in_quote_char;
        let output        = '';

        for (let idx = 0, length = html.length; idx < length; idx++) {
            let char = html[idx];

            if (state === STATE_PLAINTEXT) {
                switch (char) {
                    case '<':
                        state       = STATE_HTML;
                        tag_buffer += char;
                        break;

                    default:
                        output += char;
                        break;
                }
            }

            else if (state === STATE_HTML) {
                switch (char) {
                    case '<':
                        // ignore '<' if inside a quote
                        if (in_quote_char) {
                            break;
                        }

                        // we're seeing a nested '<'
                        depth++;
                        break;

                    case '>':
                        // ignore '>' if inside a quote
                        if (in_quote_char) {
                            break;
                        }

                        // something like this is happening: '<<>>'
                        if (depth) {
                            depth--;

                            break;
                        }

                        // this is closing the tag in tag_buffer
                        in_quote_char = '';
                        state         = STATE_PLAINTEXT;
                        tag_buffer   += '>';

                        if (allowable_tags.has(normalize_tag(tag_buffer))) {
                            output += tag_buffer;
                        } else {
                            output += tag_replacement;
                        }

                        tag_buffer = '';
                        break;

                    case '"':
                    case '\'':
                        // catch both single and double quotes

                        if (char === in_quote_char) {
                            in_quote_char = '';
                        } else {
                            in_quote_char = in_quote_char || char;
                        }

                        tag_buffer += char;
                        break;

                    case '-':
                        if (tag_buffer === '<!-') {
                            state = STATE_COMMENT;
                        }

                        tag_buffer += char;
                        break;

                    case ' ':
                    case '\n':
                        if (tag_buffer === '<') {
                            state      = STATE_PLAINTEXT;
                            output    += '< ';
                            tag_buffer = '';

                            break;
                        }

                        tag_buffer += char;
                        break;

                    default:
                        tag_buffer += char;
                        break;
                }
            }

            else if (state === STATE_COMMENT) {
                switch (char) {
                    case '>':
                        if (tag_buffer.slice(-2) == '--') {
                            // close the comment
                            state = STATE_PLAINTEXT;
                        }

                        tag_buffer = '';
                        break;

                    default:
                        tag_buffer += char;
                        break;
                }
            }
        }

        // save the context for future iterations
        context.state         = state;
        context.tag_buffer    = tag_buffer;
        context.depth         = depth;
        context.in_quote_char = in_quote_char;

        return output;
    }

    function parse_allowable_tags(allowable_tags) {
        let tag_set = new Set();

        if (typeof allowable_tags === 'string') {
            let match;

            while ((match = ALLOWED_TAGS_REGEX.exec(allowable_tags))) {
                tag_set.add(match[1]);
            }
        }

        else if (!Symbol.nonNative &&
                 typeof allowable_tags[Symbol.iterator] === 'function') {

            tag_set = new Set(allowable_tags);
        }

        else if (typeof allowable_tags.forEach === 'function') {
            // IE11 compatible
            allowable_tags.forEach(tag_set.add, tag_set);
        }

        return tag_set;
    }

    function normalize_tag(tag_buffer) {
        let match = NORMALIZE_TAG_REGEX.exec(tag_buffer);

        return match ? match[1].toLowerCase() : null;
    }

    if (typeof define === 'function' && define.amd) {
        // AMD
        define(function module_factory() { return striptags; });
    }

    else if (typeof module === 'object' && module.exports) {
        // Node
        module.exports = striptags;
    }

    else {
        // Browser
        global.striptags = striptags;
    }
}(this));

},{}],4:[function(require,module,exports){
module.exports = [ "\x00","\x01","\x02","\x03","\x04","\x05","\x06","\x07","\x08","\x09","\x0a","\x0b","\x0c","\x0d","\x0e","\x0f","\x10","\x11","\x12","\x13","\x14","\x15","\x16","\x17","\x18","\x19","\x1a","\x1b","\x1c","\x1d","\x1e","\x1f"," ","!","\"","#","$","%","&","'","(",")","*","+",",","-",".","/","0","1","2","3","4","5","6","7","8","9",":",";","<","=",">","?","@","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","[","\\","]","^","_","`","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z","{","|","}","~","\x7f","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""," ","!","C/","PS","$?","Y=","|","SS","\"","(c)","a","<<","!","","(r)","-","deg","+-","2","3","'","u","P","*",",","1","o",">>","1/4","1/2","3/4","?","A","A","A","A","A","A","AE","C","E","E","E","E","I","I","I","I","D","N","O","O","O","O","O","x","O","U","U","U","U","U","Th","ss","a","a","a","a","a","a","ae","c","e","e","e","e","i","i","i","i","d","n","o","o","o","o","o","/","o","u","u","u","u","y","th","y" ];

},{}],5:[function(require,module,exports){
module.exports = [ "A","a","A","a","A","a","C","c","C","c","C","c","C","c","D","d","D","d","E","e","E","e","E","e","E","e","E","e","G","g","G","g","G","g","G","g","H","h","H","h","I","i","I","i","I","i","I","i","I","i","IJ","","J","j","K","k","k","L","l","L","l","L","l","L","l","L","l","N","n","N","n","N","n","'n","ng","NG","O","o","O","o","O","o","OE","oe","R","r","R","r","R","r","S","s","S","s","S","s","S","s","T","t","T","t","T","t","U","u","U","u","U","u","U","u","U","u","U","u","W","w","Y","y","Y","Z","z","Z","z","Z","z","s","b","B","B","b","6","6","O","C","c","D","D","D","d","d","3","@","E","F","f","G","G","hv","I","I","K","k","l","l","W","N","n","O","O","o","OI","oi","P","p","YR","2","2","SH","sh","t","T","t","T","U","u","Y","V","Y","y","Z","z","ZH","ZH","zh","zh","2","5","5","ts","w","|","||","|=","!","DZ","Dz","dz","LJ","Lj","lj","NJ","Nj","nj","A","a","I","i","O","o","U","u","U","u","U","u","U","u","U","u","@","A","a","A","a","AE","ae","G","g","G","g","K","k","O","o","O","o","ZH","zh","j","DZ","D","dz","G","g","HV","W","N","n","A","a","AE","ae","O","o" ];

},{}],6:[function(require,module,exports){
module.exports = [ "A","a","A","a","E","e","E","e","I","i","I","i","O","o","O","o","R","r","R","r","U","u","U","u","S","s","T","t","Y","y","H","h","[?]","[?]","OU","ou","Z","z","A","a","E","e","O","o","O","o","O","o","O","o","Y","y","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","a","a","a","b","o","c","d","d","e","@","@","e","e","e","e","j","g","g","g","g","u","Y","h","h","i","i","I","l","l","l","lZ","W","W","m","n","n","n","o","OE","O","F","R","R","R","R","r","r","R","R","R","s","S","j","S","S","t","t","U","U","v","^","W","Y","Y","z","z","Z","Z","?","?","?","C","@","B","E","G","H","j","k","L","q","?","?","dz","dZ","dz","ts","tS","tC","fN","ls","lz","WW","]]","[?]","[?]","k","h","j","r","r","r","r","w","y","'","\"","`","'","`","`","'","?","?","<",">","^","V","^","V","'","-","/","\\",",","_","\\","/",":",".","`","'","^","V","+","-","V",".","@",",","~","\"","R","X","G","l","s","x","?","","","","","","","","V","=","\"","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],7:[function(require,module,exports){
module.exports = [ "","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","","","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","'",",","[?]","[?]","[?]","[?]","","[?]","[?]","[?]","?","[?]","[?]","[?]","[?]","[?]","","","A",";","E","E","I","[?]","O","[?]","U","O","I","A","B","G","D","E","Z","E","Th","I","K","L","M","N","Ks","O","P","R","[?]","S","T","U","Ph","Kh","Ps","O","I","U","a","e","e","i","u","a","b","g","d","e","z","e","th","i","k","l","m","n","x","o","p","r","s","s","t","u","ph","kh","ps","o","i","u","o","u","o","[?]","b","th","U","U","U","ph","p","&","[?]","[?]","St","st","W","w","Q","q","Sp","sp","Sh","sh","F","f","Kh","kh","H","h","G","g","CH","ch","Ti","ti","k","r","c","j","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],8:[function(require,module,exports){
module.exports = [ "Ie","Io","Dj","Gj","Ie","Dz","I","Yi","J","Lj","Nj","Tsh","Kj","I","U","Dzh","A","B","V","G","D","Ie","Zh","Z","I","I","K","L","M","N","O","P","R","S","T","U","F","Kh","Ts","Ch","Sh","Shch","","Y","'","E","Iu","Ia","a","b","v","gh","d","ie","zh","z","i","i","k","l","m","n","o","p","r","s","t","u","f","kh","ts","ch","sh","shch","","y","'","e","iu","ia","ie","io","dj","gj","ie","dz","i","yi","j","lj","nj","tsh","kj","i","u","dzh","O","o","E","e","Ie","ie","E","e","Ie","ie","O","o","Io","io","Ks","ks","Ps","ps","F","f","Y","y","Y","y","u","u","O","o","O","o","Ot","ot","Q","q","*1000*","","","","","[?]","*100.000*","*1.000.000*","[?]","[?]","\"","\"","R'","r'","G'","g'","G'","g'","G'","g'","Zh'","zh'","Z'","z'","K'","k'","K'","k'","K'","k'","K'","k'","N'","n'","Ng","ng","P'","p'","Kh","kh","S'","s'","T'","t'","U","u","U'","u'","Kh'","kh'","Tts","tts","Ch'","ch'","Ch'","ch'","H","h","Ch","ch","Ch'","ch'","`","Zh","zh","K'","k'","[?]","[?]","N'","n'","[?]","[?]","Ch","ch","[?]","[?]","[?]","a","a","A","a","Ae","ae","Ie","ie","@","@","@","@","Zh","zh","Z","z","Dz","dz","I","i","I","i","O","o","O","o","O","o","E","e","U","u","U","u","U","u","Ch","ch","[?]","[?]","Y","y","[?]","[?]","[?]","[?]","[?]" ];

},{}],9:[function(require,module,exports){
module.exports = [ "[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","A","B","G","D","E","Z","E","E","T`","Zh","I","L","Kh","Ts","K","H","Dz","Gh","Ch","M","Y","N","Sh","O","Ch`","P","J","Rh","S","V","T","R","Ts`","W","P`","K`","O","F","[?]","[?]","<","'","/","!",",","?",".","[?]","a","b","g","d","e","z","e","e","t`","zh","i","l","kh","ts","k","h","dz","gh","ch","m","y","n","sh","o","ch`","p","j","rh","s","v","t","r","ts`","w","p`","k`","o","f","ew","[?]",".","-","[?]","[?]","[?]","[?]","[?]","[?]","","","","","","","","","","","","","","","","","","[?]","","","","","","","","","","","","","","@","e","a","o","i","e","e","a","a","o","[?]","u","'","","","","","","",":","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","","b","g","d","h","v","z","kh","t","y","k","k","l","m","m","n","n","s","`","p","p","ts","ts","q","r","sh","t","[?]","[?]","[?]","[?]","[?]","V","oy","i","'","\"","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],10:[function(require,module,exports){
module.exports = [ "[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]",",","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]",";","[?]","[?]","[?]","?","[?]","","a","'","w'","","y'","","b","@","t","th","j","H","kh","d","dh","r","z","s","sh","S","D","T","Z","aa","G","[?]","[?]","[?]","[?]","[?]","","f","q","k","l","m","n","h","w","~","y","an","un","in","a","u","i","W","","","'","'","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","0","1","2","3","4","5","6","7","8","9","%",".",",","*","[?]","[?]","","'","'","'","","'","'w","'u","'y","tt","tth","b","t","T","p","th","bh","'h","H","ny","dy","H","ch","cch","dd","D","D","Dt","dh","ddh","d","D","D","rr","R","R","R","R","R","R","j","R","S","S","S","S","S","T","GH","F","F","F","v","f","ph","Q","Q","kh","k","K","K","ng","K","g","G","N","G","G","G","L","L","L","L","N","N","N","N","N","h","Ch","hy","h","H","@","W","oe","oe","u","yu","yu","W","v","y","Y","Y","W","","","y","y'",".","ae","","","","","","","","@","#","","","","","","","","","","","^","","","","","[?]","[?]","0","1","2","3","4","5","6","7","8","9","Sh","D","Gh","&","+m" ];

},{}],11:[function(require,module,exports){
module.exports = [ "//","/",",","!","!","-",",",",",";","?","~","{","}","*","[?]","","'","","b","g","g","d","d","h","w","z","H","t","t","y","yh","k","l","m","n","s","s","`","p","p","S","q","r","sh","t","[?]","[?]","[?]","a","a","a","A","A","A","e","e","e","E","i","i","u","u","u","o","","`","'","","","X","Q","@","@","|","+","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","h","sh","n","r","b","L","k","'","v","m","f","dh","th","l","g","ny","s","d","z","t","y","p","j","ch","tt","hh","kh","th","z","sh","s","d","t","z","`","gh","q","w","a","aa","i","ee","u","oo","e","ey","o","oa","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],12:[function(require,module,exports){
module.exports = [ "[?]","N","N","H","[?]","a","aa","i","ii","u","uu","R","L","eN","e","e","ai","oN","o","o","au","k","kh","g","gh","ng","c","ch","j","jh","ny","tt","tth","dd","ddh","nn","t","th","d","dh","n","nnn","p","ph","b","bh","m","y","r","rr","l","l","lll","v","sh","ss","s","h","[?]","[?]","'","'","aa","i","ii","u","uu","R","RR","eN","e","e","ai","oN","o","o","au","","[?]","[?]","AUM","'","'","`","'","[?]","[?]","[?]","q","khh","ghh","z","dddh","rh","f","yy","RR","LL","L","LL"," / "," // ","0","1","2","3","4","5","6","7","8","9",".","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","N","N","H","[?]","a","aa","i","ii","u","uu","R","RR","[?]","[?]","e","ai","[?]","[?]","o","au","k","kh","g","gh","ng","c","ch","j","jh","ny","tt","tth","dd","ddh","nn","t","th","d","dh","n","[?]","p","ph","b","bh","m","y","r","[?]","l","[?]","[?]","[?]","sh","ss","s","h","[?]","[?]","'","[?]","aa","i","ii","u","uu","R","RR","[?]","[?]","e","ai","[?]","[?]","o","au","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","+","[?]","[?]","[?]","[?]","rr","rh","[?]","yy","RR","LL","L","LL","[?]","[?]","0","1","2","3","4","5","6","7","8","9","r'","r`","Rs","Rs","1/","2/","3/","4/"," 1 - 1/","/16","","[?]","[?]","[?]","[?]" ];

},{}],13:[function(require,module,exports){
module.exports = [ "[?]","[?]","N","[?]","[?]","a","aa","i","ii","u","uu","[?]","[?]","[?]","[?]","ee","ai","[?]","[?]","oo","au","k","kh","g","gh","ng","c","ch","j","jh","ny","tt","tth","dd","ddh","nn","t","th","d","dh","n","[?]","p","ph","b","bb","m","y","r","[?]","l","ll","[?]","v","sh","[?]","s","h","[?]","[?]","'","[?]","aa","i","ii","u","uu","[?]","[?]","[?]","[?]","ee","ai","[?]","[?]","oo","au","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","khh","ghh","z","rr","[?]","f","[?]","[?]","[?]","[?]","[?]","[?]","[?]","0","1","2","3","4","5","6","7","8","9","N","H","","","G.E.O.","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","N","N","H","[?]","a","aa","i","ii","u","uu","R","[?]","eN","[?]","e","ai","oN","[?]","o","au","k","kh","g","gh","ng","c","ch","j","jh","ny","tt","tth","dd","ddh","nn","t","th","d","dh","n","[?]","p","ph","b","bh","m","ya","r","[?]","l","ll","[?]","v","sh","ss","s","h","[?]","[?]","'","'","aa","i","ii","u","uu","R","RR","eN","[?]","e","ai","oN","[?]","o","au","","[?]","[?]","AUM","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","RR","[?]","[?]","[?]","[?]","[?]","0","1","2","3","4","5","6","7","8","9","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],14:[function(require,module,exports){
module.exports = [ "[?]","N","N","H","[?]","a","aa","i","ii","u","uu","R","L","[?]","[?]","e","ai","[?]","[?]","o","au","k","kh","g","gh","ng","c","ch","j","jh","ny","tt","tth","dd","ddh","nn","t","th","d","dh","n","[?]","p","ph","b","bh","m","y","r","[?]","l","ll","[?]","","sh","ss","s","h","[?]","[?]","'","'","aa","i","ii","u","uu","R","[?]","[?]","[?]","e","ai","[?]","[?]","o","au","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","+","+","[?]","[?]","[?]","[?]","rr","rh","[?]","yy","RR","LL","[?]","[?]","[?]","[?]","0","1","2","3","4","5","6","7","8","9","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","N","H","[?]","a","aa","i","ii","u","uu","[?]","[?]","[?]","e","ee","ai","[?]","o","oo","au","k","[?]","[?]","[?]","ng","c","[?]","j","[?]","ny","tt","[?]","[?]","[?]","nn","t","[?]","[?]","[?]","n","nnn","p","[?]","[?]","[?]","m","y","r","rr","l","ll","lll","v","[?]","ss","s","h","[?]","[?]","[?]","[?]","aa","i","ii","u","uu","[?]","[?]","[?]","e","ee","ai","[?]","o","oo","au","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","+","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","0","1","2","3","4","5","6","7","8","9","+10+","+100+","+1000+","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],15:[function(require,module,exports){
module.exports = [ "[?]","N","N","H","[?]","a","aa","i","ii","u","uu","R","L","[?]","e","ee","ai","[?]","o","oo","au","k","kh","g","gh","ng","c","ch","j","jh","ny","tt","tth","dd","ddh","nn","t","th","d","dh","n","[?]","p","ph","b","bh","m","y","r","rr","l","ll","[?]","v","sh","ss","s","h","[?]","[?]","[?]","[?]","aa","i","ii","u","uu","R","RR","[?]","e","ee","ai","[?]","o","oo","au","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","+","+","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","RR","LL","[?]","[?]","[?]","[?]","0","1","2","3","4","5","6","7","8","9","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","N","H","[?]","a","aa","i","ii","u","uu","R","L","[?]","e","ee","ai","[?]","o","oo","au","k","kh","g","gh","ng","c","ch","j","jh","ny","tt","tth","dd","ddh","nn","t","th","d","dh","n","[?]","p","ph","b","bh","m","y","r","rr","l","ll","[?]","v","sh","ss","s","h","[?]","[?]","[?]","[?]","aa","i","ii","u","uu","R","RR","[?]","e","ee","ai","[?]","o","oo","au","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","+","+","[?]","[?]","[?]","[?]","[?]","[?]","[?]","lll","[?]","RR","LL","[?]","[?]","[?]","[?]","0","1","2","3","4","5","6","7","8","9","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],16:[function(require,module,exports){
module.exports = [ "[?]","[?]","N","H","[?]","a","aa","i","ii","u","uu","R","L","[?]","e","ee","ai","[?]","o","oo","au","k","kh","g","gh","ng","c","ch","j","jh","ny","tt","tth","dd","ddh","nn","t","th","d","dh","n","[?]","p","ph","b","bh","m","y","r","rr","l","ll","lll","v","sh","ss","s","h","[?]","[?]","[?]","[?]","aa","i","ii","u","uu","R","[?]","[?]","e","ee","ai","","o","oo","au","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","+","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","RR","LL","[?]","[?]","[?]","[?]","0","1","2","3","4","5","6","7","8","9","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","N","H","[?]","a","aa","ae","aae","i","ii","u","uu","R","RR","L","LL","e","ee","ai","o","oo","au","[?]","[?]","[?]","k","kh","g","gh","ng","nng","c","ch","j","jh","ny","jny","nyj","tt","tth","dd","ddh","nn","nndd","t","th","d","dh","n","[?]","nd","p","ph","b","bh","m","mb","y","r","[?]","l","[?]","[?]","v","sh","ss","s","h","ll","f","[?]","[?]","[?]","","[?]","[?]","[?]","[?]","aa","ae","aae","i","ii","u","[?]","uu","[?]","R","e","ee","ai","o","oo","au","L","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","RR","LL"," . ","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],17:[function(require,module,exports){
module.exports = [ "[?]","k","kh","kh","kh","kh","kh","ng","cch","ch","ch","ch","ch","y","d","t","th","th","th","n","d","t","th","th","th","n","b","p","ph","f","ph","f","ph","m","y","r","R","l","L","w","s","s","s","h","l","`","h","~","a","a","aa","am","i","ii","ue","uue","u","uu","'","[?]","[?]","[?]","[?]","Bh.","e","ae","o","ai","ai","ao","+","","","","","","","M",""," * ","0","1","2","3","4","5","6","7","8","9"," // "," /// ","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","k","kh","[?]","kh","[?]","[?]","ng","ch","[?]","s","[?]","[?]","ny","[?]","[?]","[?]","[?]","[?]","[?]","d","h","th","th","[?]","n","b","p","ph","f","ph","f","[?]","m","y","r","[?]","l","[?]","w","[?]","[?]","s","h","[?]","`","","~","a","","aa","am","i","ii","y","yy","u","uu","[?]","o","l","ny","[?]","[?]","e","ei","o","ay","ai","[?]","+","[?]","","","","","","M","[?]","[?]","0","1","2","3","4","5","6","7","8","9","[?]","[?]","hn","hm","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],18:[function(require,module,exports){
module.exports = [ "AUM","","","","","","",""," // "," * ","","-"," / "," / "," // "," -/ "," +/ "," X/ "," /XX/ "," /X/ ",", ","","","","","","","","","","","","0","1","2","3","4","5","6","7","8","9",".5","1.5","2.5","3.5","4.5","5.5","6.5","7.5","8.5","-.5","+","*","^","_","","~","[?]","]","[[","]]","","","k","kh","g","gh","ng","c","ch","j","[?]","ny","tt","tth","dd","ddh","nn","t","th","d","dh","n","p","ph","b","bh","m","ts","tsh","dz","dzh","w","zh","z","'","y","r","l","sh","ssh","s","h","a","kss","r","[?]","[?]","[?]","[?]","[?]","[?]","aa","i","ii","u","uu","R","RR","L","LL","e","ee","o","oo","M","H","i","ii","","","","","","","","","","","[?]","[?]","[?]","[?]","k","kh","g","gh","ng","c","ch","j","[?]","ny","tt","tth","dd","ddh","nn","t","th","d","dh","n","p","ph","b","bh","m","ts","tsh","dz","dzh","w","zh","z","'","y","r","l","sh","ss","s","h","a","kss","w","y","r","[?]","X"," :X: "," /O/ "," /o/ "," \\o\\ "," (O) ","","","","","","","","","","[?]","[?]","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],19:[function(require,module,exports){
module.exports = [ "k","kh","g","gh","ng","c","ch","j","jh","ny","nny","tt","tth","dd","ddh","nn","tt","th","d","dh","n","p","ph","b","bh","m","y","r","l","w","s","h","ll","a","[?]","i","ii","u","uu","e","[?]","o","au","[?]","aa","i","ii","u","uu","e","ai","[?]","[?]","[?]","N","'",":","","[?]","[?]","[?]","[?]","[?]","[?]","0","1","2","3","4","5","6","7","8","9"," / "," // ","n*","r*","l*","e*","sh","ss","R","RR","L","LL","R","RR","L","LL","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","A","B","G","D","E","V","Z","T`","I","K","L","M","N","O","P","Zh","R","S","T","U","P`","K`","G'","Q","Sh","Ch`","C`","Z'","C","Ch","X","J","H","E","Y","W","Xh","OE","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","a","b","g","d","e","v","z","t`","i","k","l","m","n","o","p","zh","r","s","t","u","p`","k`","g'","q","sh","ch`","c`","z'","c","ch","x","j","h","e","y","w","xh","oe","f","[?]","[?]","[?]","[?]"," // ","[?]","[?]","[?]" ];

},{}],20:[function(require,module,exports){
module.exports = [ "g","gg","n","d","dd","r","m","b","bb","s","ss","","j","jj","c","k","t","p","h","ng","nn","nd","nb","dg","rn","rr","rh","rN","mb","mN","bg","bn","","bs","bsg","bst","bsb","bss","bsj","bj","bc","bt","bp","bN","bbN","sg","sn","sd","sr","sm","sb","sbg","sss","s","sj","sc","sk","st","sp","sh","","","","","Z","g","d","m","b","s","Z","","j","c","t","p","N","j","","","","","ck","ch","","","pb","pN","hh","Q","[?]","[?]","[?]","[?]","[?]","","","a","ae","ya","yae","eo","e","yeo","ye","o","wa","wae","oe","yo","u","weo","we","wi","yu","eu","yi","i","a-o","a-u","ya-o","ya-yo","eo-o","eo-u","eo-eu","yeo-o","yeo-u","o-eo","o-e","o-ye","o-o","o-u","yo-ya","yo-yae","yo-yeo","yo-o","yo-i","u-a","u-ae","u-eo-eu","u-ye","u-u","yu-a","yu-eo","yu-e","yu-yeo","yu-ye","yu-u","yu-i","eu-u","eu-eu","yi-u","i-a","i-ya","i-o","i-u","i-eu","i-U","U","U-eo","U-u","U-i","UU","[?]","[?]","[?]","[?]","[?]","g","gg","gs","n","nj","nh","d","l","lg","lm","lb","ls","lt","lp","lh","m","b","bs","s","ss","ng","j","c","k","t","p","h","gl","gsg","ng","nd","ns","nZ","nt","dg","tl","lgs","ln","ld","lth","ll","lmg","lms","lbs","lbh","rNp","lss","lZ","lk","lQ","mg","ml","mb","ms","mss","mZ","mc","mh","mN","bl","bp","ph","pN","sg","sd","sl","sb","Z","g","ss","","kh","N","Ns","NZ","pb","pN","hn","hl","hm","hb","Q","[?]","[?]","[?]","[?]","[?]" ];

},{}],21:[function(require,module,exports){
module.exports = [ "ha","hu","hi","haa","hee","he","ho","[?]","la","lu","li","laa","lee","le","lo","lwa","hha","hhu","hhi","hhaa","hhee","hhe","hho","hhwa","ma","mu","mi","maa","mee","me","mo","mwa","sza","szu","szi","szaa","szee","sze","szo","szwa","ra","ru","ri","raa","ree","re","ro","rwa","sa","su","si","saa","see","se","so","swa","sha","shu","shi","shaa","shee","she","sho","shwa","qa","qu","qi","qaa","qee","qe","qo","[?]","qwa","[?]","qwi","qwaa","qwee","qwe","[?]","[?]","qha","qhu","qhi","qhaa","qhee","qhe","qho","[?]","qhwa","[?]","qhwi","qhwaa","qhwee","qhwe","[?]","[?]","ba","bu","bi","baa","bee","be","bo","bwa","va","vu","vi","vaa","vee","ve","vo","vwa","ta","tu","ti","taa","tee","te","to","twa","ca","cu","ci","caa","cee","ce","co","cwa","xa","xu","xi","xaa","xee","xe","xo","[?]","xwa","[?]","xwi","xwaa","xwee","xwe","[?]","[?]","na","nu","ni","naa","nee","ne","no","nwa","nya","nyu","nyi","nyaa","nyee","nye","nyo","nywa","'a","'u","[?]","'aa","'ee","'e","'o","'wa","ka","ku","ki","kaa","kee","ke","ko","[?]","kwa","[?]","kwi","kwaa","kwee","kwe","[?]","[?]","kxa","kxu","kxi","kxaa","kxee","kxe","kxo","[?]","kxwa","[?]","kxwi","kxwaa","kxwee","kxwe","[?]","[?]","wa","wu","wi","waa","wee","we","wo","[?]","`a","`u","`i","`aa","`ee","`e","`o","[?]","za","zu","zi","zaa","zee","ze","zo","zwa","zha","zhu","zhi","zhaa","zhee","zhe","zho","zhwa","ya","yu","yi","yaa","yee","ye","yo","[?]","da","du","di","daa","dee","de","do","dwa","dda","ddu","ddi","ddaa","ddee","dde","ddo","ddwa" ];

},{}],22:[function(require,module,exports){
module.exports = [ "ja","ju","ji","jaa","jee","je","jo","jwa","ga","gu","gi","gaa","gee","ge","go","[?]","gwa","[?]","gwi","gwaa","gwee","gwe","[?]","[?]","gga","ggu","ggi","ggaa","ggee","gge","ggo","[?]","tha","thu","thi","thaa","thee","the","tho","thwa","cha","chu","chi","chaa","chee","che","cho","chwa","pha","phu","phi","phaa","phee","phe","pho","phwa","tsa","tsu","tsi","tsaa","tsee","tse","tso","tswa","tza","tzu","tzi","tzaa","tzee","tze","tzo","[?]","fa","fu","fi","faa","fee","fe","fo","fwa","pa","pu","pi","paa","pee","pe","po","pwa","rya","mya","fya","[?]","[?]","[?]","[?]","[?]","[?]"," ",".",",",";",":",":: ","?","//","1","2","3","4","5","6","7","8","9","10+","20+","30+","40+","50+","60+","70+","80+","90+","100+","10,000+","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","a","e","i","o","u","v","ga","ka","ge","gi","go","gu","gv","ha","he","hi","ho","hu","hv","la","le","li","lo","lu","lv","ma","me","mi","mo","mu","na","hna","nah","ne","ni","no","nu","nv","qua","que","qui","quo","quu","quv","sa","s","se","si","so","su","sv","da","ta","de","te","di","ti","do","du","dv","dla","tla","tle","tli","tlo","tlu","tlv","tsa","tse","tsi","tso","tsu","tsv","wa","we","wi","wo","wu","wv","ya","ye","yi","yo","yu","yv","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],23:[function(require,module,exports){
module.exports = [ "[?]","e","aai","i","ii","o","oo","oo","ee","i","a","aa","we","we","wi","wi","wii","wii","wo","wo","woo","woo","woo","wa","wa","waa","waa","waa","ai","w","'","t","k","sh","s","n","w","n","[?]","w","c","?","l","en","in","on","an","pe","paai","pi","pii","po","poo","poo","hee","hi","pa","paa","pwe","pwe","pwi","pwi","pwii","pwii","pwo","pwo","pwoo","pwoo","pwa","pwa","pwaa","pwaa","pwaa","p","p","h","te","taai","ti","tii","to","too","too","dee","di","ta","taa","twe","twe","twi","twi","twii","twii","two","two","twoo","twoo","twa","twa","twaa","twaa","twaa","t","tte","tti","tto","tta","ke","kaai","ki","kii","ko","koo","koo","ka","kaa","kwe","kwe","kwi","kwi","kwii","kwii","kwo","kwo","kwoo","kwoo","kwa","kwa","kwaa","kwaa","kwaa","k","kw","keh","kih","koh","kah","ce","caai","ci","cii","co","coo","coo","ca","caa","cwe","cwe","cwi","cwi","cwii","cwii","cwo","cwo","cwoo","cwoo","cwa","cwa","cwaa","cwaa","cwaa","c","th","me","maai","mi","mii","mo","moo","moo","ma","maa","mwe","mwe","mwi","mwi","mwii","mwii","mwo","mwo","mwoo","mwoo","mwa","mwa","mwaa","mwaa","mwaa","m","m","mh","m","m","ne","naai","ni","nii","no","noo","noo","na","naa","nwe","nwe","nwa","nwa","nwaa","nwaa","nwaa","n","ng","nh","le","laai","li","lii","lo","loo","loo","la","laa","lwe","lwe","lwi","lwi","lwii","lwii","lwo","lwo","lwoo","lwoo","lwa","lwa","lwaa","lwaa","l","l","l","se","saai","si","sii","so","soo","soo","sa","saa","swe","swe","swi","swi","swii","swii","swo","swo","swoo","swoo" ];

},{}],24:[function(require,module,exports){
module.exports = [ "swa","swa","swaa","swaa","swaa","s","s","sw","s","sk","skw","sW","spwa","stwa","skwa","scwa","she","shi","shii","sho","shoo","sha","shaa","shwe","shwe","shwi","shwi","shwii","shwii","shwo","shwo","shwoo","shwoo","shwa","shwa","shwaa","shwaa","sh","ye","yaai","yi","yii","yo","yoo","yoo","ya","yaa","ywe","ywe","ywi","ywi","ywii","ywii","ywo","ywo","ywoo","ywoo","ywa","ywa","ywaa","ywaa","ywaa","y","y","y","yi","re","re","le","raai","ri","rii","ro","roo","lo","ra","raa","la","rwaa","rwaa","r","r","r","fe","faai","fi","fii","fo","foo","fa","faa","fwaa","fwaa","f","the","the","thi","thi","thii","thii","tho","thoo","tha","thaa","thwaa","thwaa","th","tthe","tthi","ttho","ttha","tth","tye","tyi","tyo","tya","he","hi","hii","ho","hoo","ha","haa","h","h","hk","qaai","qi","qii","qo","qoo","qa","qaa","q","tlhe","tlhi","tlho","tlha","re","ri","ro","ra","ngaai","ngi","ngii","ngo","ngoo","nga","ngaa","ng","nng","she","shi","sho","sha","the","thi","tho","tha","th","lhi","lhii","lho","lhoo","lha","lhaa","lh","the","thi","thii","tho","thoo","tha","thaa","th","b","e","i","o","a","we","wi","wo","wa","ne","ni","no","na","ke","ki","ko","ka","he","hi","ho","ha","ghu","gho","ghe","ghee","ghi","gha","ru","ro","re","ree","ri","ra","wu","wo","we","wee","wi","wa","hwu","hwo","hwe","hwee","hwi","hwa","thu","tho","the","thee","thi","tha","ttu","tto","tte","ttee","tti","tta","pu","po","pe","pee","pi","pa","p","gu","go","ge","gee","gi","ga","khu","kho","khe","khee","khi","kha","kku","kko","kke","kkee","kki" ];

},{}],25:[function(require,module,exports){
module.exports = [ "kka","kk","nu","no","ne","nee","ni","na","mu","mo","me","mee","mi","ma","yu","yo","ye","yee","yi","ya","ju","ju","jo","je","jee","ji","ji","ja","jju","jjo","jje","jjee","jji","jja","lu","lo","le","lee","li","la","dlu","dlo","dle","dlee","dli","dla","lhu","lho","lhe","lhee","lhi","lha","tlhu","tlho","tlhe","tlhee","tlhi","tlha","tlu","tlo","tle","tlee","tli","tla","zu","zo","ze","zee","zi","za","z","z","dzu","dzo","dze","dzee","dzi","dza","su","so","se","see","si","sa","shu","sho","she","shee","shi","sha","sh","tsu","tso","tse","tsee","tsi","tsa","chu","cho","che","chee","chi","cha","ttsu","ttso","ttse","ttsee","ttsi","ttsa","X",".","qai","ngai","nngi","nngii","nngo","nngoo","nnga","nngaa","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]"," ","b","l","f","s","n","h","d","t","c","q","m","g","ng","z","r","a","o","u","e","i","ch","th","ph","p","x","p","<",">","[?]","[?]","[?]","f","v","u","yr","y","w","th","th","a","o","ac","ae","o","o","o","oe","on","r","k","c","k","g","ng","g","g","w","h","h","h","h","n","n","n","i","e","j","g","ae","a","eo","p","z","s","s","s","c","z","t","t","d","b","b","p","p","e","m","m","m","l","l","ng","ng","d","o","ear","ior","qu","qu","qu","s","yr","yr","yr","q","x",".",":","+","17","18","19","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],26:[function(require,module,exports){
module.exports = [ "[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","k","kh","g","gh","ng","c","ch","j","jh","ny","t","tth","d","ddh","nn","t","th","d","dh","n","p","ph","b","bh","m","y","r","l","v","sh","ss","s","h","l","q","a","aa","i","ii","u","uk","uu","uuv","ry","ryy","ly","lyy","e","ai","oo","oo","au","a","aa","aa","i","ii","y","yy","u","uu","ua","oe","ya","ie","e","ae","ai","oo","au","M","H","a`","","","","r","","!","","","","","","."," // ",":","+","++"," * "," /// ","KR","'","[?]","[?]","[?]","0","1","2","3","4","5","6","7","8","9","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],27:[function(require,module,exports){
module.exports = [ " @ "," ... ",", ",". ",": "," // ","","-",", ",". ","","","","","","[?]","0","1","2","3","4","5","6","7","8","9","[?]","[?]","[?]","[?]","[?]","[?]","a","e","i","o","u","O","U","ee","n","ng","b","p","q","g","m","l","s","sh","t","d","ch","j","y","r","w","f","k","kha","ts","z","h","zr","lh","zh","ch","-","e","i","o","u","O","U","ng","b","p","q","g","m","t","d","ch","j","ts","y","w","k","g","h","jy","ny","dz","e","i","iy","U","u","ng","k","g","h","p","sh","t","d","j","f","g","h","ts","z","r","ch","zh","i","k","r","f","zh","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","H","X","W","M"," 3 "," 333 ","a","i","k","ng","c","tt","tth","dd","nn","t","d","p","ph","ss","zh","z","a","t","zh","gh","ng","c","jh","tta","ddh","t","dh","ss","cy","zh","z","u","y","bh","'","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],28:[function(require,module,exports){
module.exports = [ "A","a","B","b","B","b","B","b","C","c","D","d","D","d","D","d","D","d","D","d","E","e","E","e","E","e","E","e","E","e","F","f","G","g","H","h","H","h","H","h","H","h","H","h","I","i","I","i","K","k","K","k","K","k","L","l","L","l","L","l","L","l","M","m","M","m","M","m","N","n","N","n","N","n","N","n","O","o","O","o","O","o","O","o","P","p","P","p","R","r","R","r","R","r","R","r","S","s","S","s","S","s","S","s","S","s","T","t","T","t","T","t","T","t","U","u","U","u","U","u","U","u","U","u","V","v","V","v","W","w","W","w","W","w","W","w","W","w","X","x","X","x","Y","y","Z","z","Z","z","Z","z","h","t","w","y","a","S","[?]","[?]","[?]","[?]","A","a","A","a","A","a","A","a","A","a","A","a","A","a","A","a","A","a","A","a","A","a","A","a","E","e","E","e","E","e","E","e","E","e","E","e","E","e","E","e","I","i","I","i","O","o","O","o","O","o","O","o","O","o","O","o","O","o","O","o","O","o","O","o","O","o","O","o","U","u","U","u","U","u","U","u","U","u","U","u","U","u","Y","y","Y","y","Y","y","Y","y","[?]","[?]","[?]","[?]","[?]" ];

},{}],29:[function(require,module,exports){
module.exports = [ "a","a","a","a","a","a","a","a","A","A","A","A","A","A","A","A","e","e","e","e","e","e","[?]","[?]","E","E","E","E","E","E","[?]","[?]","e","e","e","e","e","e","e","e","E","E","E","E","E","E","E","E","i","i","i","i","i","i","i","i","I","I","I","I","I","I","I","I","o","o","o","o","o","o","[?]","[?]","O","O","O","O","O","O","[?]","[?]","u","u","u","u","u","u","u","u","[?]","U","[?]","U","[?]","U","[?]","U","o","o","o","o","o","o","o","o","O","O","O","O","O","O","O","O","a","a","e","e","e","e","i","i","o","o","u","u","o","o","[?]","[?]","a","a","a","a","a","a","a","a","A","A","A","A","A","A","A","A","e","e","e","e","e","e","e","e","E","E","E","E","E","E","E","E","o","o","o","o","o","o","o","o","O","O","O","O","O","O","O","O","a","a","a","a","a","[?]","a","a","A","A","A","A","A","'","i","'","~","\"~","e","e","e","[?]","e","e","E","E","E","E","E","'`","''","'~","i","i","i","i","[?]","[?]","i","i","I","I","I","I","[?]","`'","`'","`~","u","u","u","u","R","R","u","u","U","U","U","U","R","\"`","\"'","`","[?]","[?]","o","o","o","[?]","o","o","O","O","O","O","O","'","`" ];

},{}],30:[function(require,module,exports){
module.exports = [ " "," "," "," "," "," "," "," "," "," "," "," ","","","","","-","-","-","-","--","--","||","_","'","'",",","'","\"","\"",",,","\"","+","++","*","*>",".","..","...",".","\n","\n\n","","","","",""," ","%0","%00","'","''","'''","`","``","```","^","<",">","*","!!","!?","-","_","-","^","***","--","/","-[","]-","[?]","?!","!?","7","PP","(]","[)","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","","","","","","","0","","","","4","5","6","7","8","9","+","-","=","(",")","n","0","1","2","3","4","5","6","7","8","9","+","-","=","(",")","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","ECU","CL","Cr","FF","L","mil","N","Pts","Rs","W","NS","D","EU","K","T","Dr","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","","","","","","","","","","","","","","","","","","","","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],31:[function(require,module,exports){
module.exports = [ "","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]"," 1/3 "," 2/3 "," 1/5 "," 2/5 "," 3/5 "," 4/5 "," 1/6 "," 5/6 "," 1/8 "," 3/8 "," 5/8 "," 7/8 "," 1/","I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","L","C","D","M","i","ii","iii","iv","v","vi","vii","viii","ix","x","xi","xii","l","c","d","m","(D","D)","((|))",")","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","-","|","-","|","-","|","\\","/","\\","/","-","-","~","~","-","|","-","|","-","-","-","|","-","|","|","-","-","-","-","-","-","|","|","|","|","|","|","|","^","V","\\","=","V","^","-","-","|","|","-","-","|","|","=","|","=","=","|","=","|","=","=","=","=","=","=","|","=","|","=","|","\\","/","\\","/","=","=","~","~","|","|","-","|","-","|","-","-","-","|","-","|","|","|","|","|","|","|","-","\\","\\","|","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],32:[function(require,module,exports){
module.exports = [ "[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],33:[function(require,module,exports){
arguments[4][32][0].apply(exports,arguments)
},{"dup":32}],34:[function(require,module,exports){
module.exports = [ "","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","","","","","","","","","","","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],35:[function(require,module,exports){
module.exports = [ "-","-","|","|","-","-","|","|","-","-","|","|","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","-","-","|","|","-","|","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","+","/","\\","X","-","|","-","|","-","|","-","|","-","|","-","|","#","#","#","#","#","#","#","#","#","#","#","#","#","#","#","#","#","#","#","#","-","|","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","#","#","#","#","#","#","#","#","#","#","#","#","#","#","#","#","#","#","^","^","^","^",">",">",">",">",">",">","V","V","V","V","<","<","<","<","<","<","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","*","#","#","#","#","#","^","^","^","O","#","#","#","#","#","#","#","#","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],36:[function(require,module,exports){
module.exports = [ "","","","","","","","","","","","","","","","","","","","","[?]","[?]","[?]","[?]","[?]","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],37:[function(require,module,exports){
module.exports = [ "[?]","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","[?]","[?]","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","[?]","","","","","","","","","","","","","","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],38:[function(require,module,exports){
module.exports = [ " ","a","1","b","'","k","2","l","@","c","i","f","/","m","s","p","\"","e","3","h","9","o","6","r","^","d","j","g",">","n","t","q",",","*","5","<","-","u","8","v",".","%","[","$","+","x","!","&",";",":","4","\\","0","z","7","(","_","?","w","]","#","y",")","=","[d7]","[d17]","[d27]","[d127]","[d37]","[d137]","[d237]","[d1237]","[d47]","[d147]","[d247]","[d1247]","[d347]","[d1347]","[d2347]","[d12347]","[d57]","[d157]","[d257]","[d1257]","[d357]","[d1357]","[d2357]","[d12357]","[d457]","[d1457]","[d2457]","[d12457]","[d3457]","[d13457]","[d23457]","[d123457]","[d67]","[d167]","[d267]","[d1267]","[d367]","[d1367]","[d2367]","[d12367]","[d467]","[d1467]","[d2467]","[d12467]","[d3467]","[d13467]","[d23467]","[d123467]","[d567]","[d1567]","[d2567]","[d12567]","[d3567]","[d13567]","[d23567]","[d123567]","[d4567]","[d14567]","[d24567]","[d124567]","[d34567]","[d134567]","[d234567]","[d1234567]","[d8]","[d18]","[d28]","[d128]","[d38]","[d138]","[d238]","[d1238]","[d48]","[d148]","[d248]","[d1248]","[d348]","[d1348]","[d2348]","[d12348]","[d58]","[d158]","[d258]","[d1258]","[d358]","[d1358]","[d2358]","[d12358]","[d458]","[d1458]","[d2458]","[d12458]","[d3458]","[d13458]","[d23458]","[d123458]","[d68]","[d168]","[d268]","[d1268]","[d368]","[d1368]","[d2368]","[d12368]","[d468]","[d1468]","[d2468]","[d12468]","[d3468]","[d13468]","[d23468]","[d123468]","[d568]","[d1568]","[d2568]","[d12568]","[d3568]","[d13568]","[d23568]","[d123568]","[d4568]","[d14568]","[d24568]","[d124568]","[d34568]","[d134568]","[d234568]","[d1234568]","[d78]","[d178]","[d278]","[d1278]","[d378]","[d1378]","[d2378]","[d12378]","[d478]","[d1478]","[d2478]","[d12478]","[d3478]","[d13478]","[d23478]","[d123478]","[d578]","[d1578]","[d2578]","[d12578]","[d3578]","[d13578]","[d23578]","[d123578]","[d4578]","[d14578]","[d24578]","[d124578]","[d34578]","[d134578]","[d234578]","[d1234578]","[d678]","[d1678]","[d2678]","[d12678]","[d3678]","[d13678]","[d23678]","[d123678]","[d4678]","[d14678]","[d24678]","[d124678]","[d34678]","[d134678]","[d234678]","[d1234678]","[d5678]","[d15678]","[d25678]","[d125678]","[d35678]","[d135678]","[d235678]","[d1235678]","[d45678]","[d145678]","[d245678]","[d1245678]","[d345678]","[d1345678]","[d2345678]","[d12345678]" ];

},{}],39:[function(require,module,exports){
module.exports = [ "[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?]","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],40:[function(require,module,exports){
module.exports = [ "[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?]","[?]","[?]" ];

},{}],41:[function(require,module,exports){
module.exports = [ " ",", ",". ","\"","[JIS]","\"","/","0","<","> ","<<",">> ","[","] ","{","} ","[(",")] ","@","X ","[","] ","[[","]] ","((",")) ","[[","]] ","~ ","``","''",",,","@","1","2","3","4","5","6","7","8","9","","","","","","","~","+","+","+","+","","@"," // ","+10+","+20+","+30+","[?]","[?]","[?]","","","[?]","a","a","i","i","u","u","e","e","o","o","ka","ga","ki","gi","ku","gu","ke","ge","ko","go","sa","za","si","zi","su","zu","se","ze","so","zo","ta","da","ti","di","tu","tu","du","te","de","to","do","na","ni","nu","ne","no","ha","ba","pa","hi","bi","pi","hu","bu","pu","he","be","pe","ho","bo","po","ma","mi","mu","me","mo","ya","ya","yu","yu","yo","yo","ra","ri","ru","re","ro","wa","wa","wi","we","wo","n","vu","[?]","[?]","[?]","[?]","","","","","\"","\"","[?]","[?]","a","a","i","i","u","u","e","e","o","o","ka","ga","ki","gi","ku","gu","ke","ge","ko","go","sa","za","si","zi","su","zu","se","ze","so","zo","ta","da","ti","di","tu","tu","du","te","de","to","do","na","ni","nu","ne","no","ha","ba","pa","hi","bi","pi","hu","bu","pu","he","be","pe","ho","bo","po","ma","mi","mu","me","mo","ya","ya","yu","yu","yo","yo","ra","ri","ru","re","ro","wa","wa","wi","we","wo","n","vu","ka","ke","va","vi","ve","vo","","","\"","\"" ];

},{}],42:[function(require,module,exports){
module.exports = [ "[?]","[?]","[?]","[?]","[?]","B","P","M","F","D","T","N","L","G","K","H","J","Q","X","ZH","CH","SH","R","Z","C","S","A","O","E","EH","AI","EI","AU","OU","AN","EN","ANG","ENG","ER","I","U","IU","V","NG","GN","[?]","[?]","[?]","[?]","g","gg","gs","n","nj","nh","d","dd","r","lg","lm","lb","ls","lt","lp","rh","m","b","bb","bs","s","ss","","j","jj","c","k","t","p","h","a","ae","ya","yae","eo","e","yeo","ye","o","wa","wae","oe","yo","u","weo","we","wi","yu","eu","yi","i","","nn","nd","ns","nZ","lgs","ld","lbs","lZ","lQ","mb","ms","mZ","mN","bg","","bsg","bst","bj","bt","bN","bbN","sg","sn","sd","sb","sj","Z","","N","Ns","NZ","pN","hh","Q","yo-ya","yo-yae","yo-i","yu-yeo","yu-ye","yu-i","U","U-i","[?]","","","","","","","","","","","","","","","","","BU","ZI","JI","GU","EE","ENN","OO","ONN","IR","ANN","INN","UNN","IM","NGG","AINN","AUNN","AM","OM","ONG","INNN","P","T","K","H","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],43:[function(require,module,exports){
module.exports = [ "(g)","(n)","(d)","(r)","(m)","(b)","(s)","()","(j)","(c)","(k)","(t)","(p)","(h)","(ga)","(na)","(da)","(ra)","(ma)","(ba)","(sa)","(a)","(ja)","(ca)","(ka)","(ta)","(pa)","(ha)","(ju)","[?]","[?]","[?]","(1) ","(2) ","(3) ","(4) ","(5) ","(6) ","(7) ","(8) ","(9) ","(10) ","(Yue) ","(Huo) ","(Shui) ","(Mu) ","(Jin) ","(Tu) ","(Ri) ","(Zhu) ","(You) ","(She) ","(Ming) ","(Te) ","(Cai) ","(Zhu) ","(Lao) ","(Dai) ","(Hu) ","(Xue) ","(Jian) ","(Qi) ","(Zi) ","(Xie) ","(Ji) ","(Xiu) ","<<",">>","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","(g)","(n)","(d)","(r)","(m)","(b)","(s)","()","(j)","(c)","(k)","(t)","(p)","(h)","(ga)","(na)","(da)","(ra)","(ma)","(ba)","(sa)","(a)","(ja)","(ca)","(ka)","(ta)","(pa)","(ha)","[?]","[?]","[?]","KIS ","(1) ","(2) ","(3) ","(4) ","(5) ","(6) ","(7) ","(8) ","(9) ","(10) ","(Yue) ","(Huo) ","(Shui) ","(Mu) ","(Jin) ","(Tu) ","(Ri) ","(Zhu) ","(You) ","(She) ","(Ming) ","(Te) ","(Cai) ","(Zhu) ","(Lao) ","(Mi) ","(Nan) ","(Nu) ","(Shi) ","(You) ","(Yin) ","(Zhu) ","(Xiang) ","(Xiu) ","(Xie) ","(Zheng) ","(Shang) ","(Zhong) ","(Xia) ","(Zuo) ","(You) ","(Yi) ","(Zong) ","(Xue) ","(Jian) ","(Qi) ","(Zi) ","(Xie) ","(Ye) ","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","1M","2M","3M","4M","5M","6M","7M","8M","9M","10M","11M","12M","[?]","[?]","[?]","[?]","a","i","u","u","o","ka","ki","ku","ke","ko","sa","si","su","se","so","ta","ti","tu","te","to","na","ni","nu","ne","no","ha","hi","hu","he","ho","ma","mi","mu","me","mo","ya","yu","yo","ra","ri","ru","re","ro","wa","wi","we","wo" ];

},{}],44:[function(require,module,exports){
module.exports = [ "apartment","alpha","ampere","are","inning","inch","won","escudo","acre","ounce","ohm","kai-ri","carat","calorie","gallon","gamma","giga","guinea","curie","guilder","kilo","kilogram","kilometer","kilowatt","gram","gram ton","cruzeiro","krone","case","koruna","co-op","cycle","centime","shilling","centi","cent","dozen","desi","dollar","ton","nano","knot","heights","percent","parts","barrel","piaster","picul","pico","building","farad","feet","bushel","franc","hectare","peso","pfennig","hertz","pence","page","beta","point","volt","hon","pound","hall","horn","micro","mile","mach","mark","mansion","micron","milli","millibar","mega","megaton","meter","yard","yard","yuan","liter","lira","rupee","ruble","rem","roentgen","watt","0h","1h","2h","3h","4h","5h","6h","7h","8h","9h","10h","11h","12h","13h","14h","15h","16h","17h","18h","19h","20h","21h","22h","23h","24h","HPA","da","AU","bar","oV","pc","[?]","[?]","[?]","[?]","Heisei","Syouwa","Taisyou","Meiji","Inc.","pA","nA","microamp","mA","kA","kB","MB","GB","cal","kcal","pF","nF","microFarad","microgram","mg","kg","Hz","kHz","MHz","GHz","THz","microliter","ml","dl","kl","fm","nm","micrometer","mm","cm","km","mm^2","cm^2","m^2","km^2","mm^4","cm^3","m^3","km^3","m/s","m/s^2","Pa","kPa","MPa","GPa","rad","rad/s","rad/s^2","ps","ns","microsecond","ms","pV","nV","microvolt","mV","kV","MV","pW","nW","microwatt","mW","kW","MW","kOhm","MOhm","a.m.","Bq","cc","cd","C/kg","Co.","dB","Gy","ha","HP","in","K.K.","KM","kt","lm","ln","log","lx","mb","mil","mol","pH","p.m.","PPM","PR","sr","Sv","Wb","[?]","[?]","1d","2d","3d","4d","5d","6d","7d","8d","9d","10d","11d","12d","13d","14d","15d","16d","17d","18d","19d","20d","21d","22d","23d","24d","25d","26d","27d","28d","29d","30d","31d" ];

},{}],45:[function(require,module,exports){
module.exports = [ "[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?] ","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],46:[function(require,module,exports){
module.exports = [ "Yi ","Ding ","Kao ","Qi ","Shang ","Xia ","[?] ","Mo ","Zhang ","San ","Shang ","Xia ","Ji ","Bu ","Yu ","Mian ","Gai ","Chou ","Chou ","Zhuan ","Qie ","Pi ","Shi ","Shi ","Qiu ","Bing ","Ye ","Cong ","Dong ","Si ","Cheng ","Diu ","Qiu ","Liang ","Diu ","You ","Liang ","Yan ","Bing ","Sang ","Gun ","Jiu ","Ge ","Ya ","Qiang ","Zhong ","Ji ","Jie ","Feng ","Guan ","Chuan ","Chan ","Lin ","Zhuo ","Zhu ","Ha ","Wan ","Dan ","Wei ","Zhu ","Jing ","Li ","Ju ","Pie ","Fu ","Yi ","Yi ","Nai ","Shime ","Jiu ","Jiu ","Zhe ","Yao ","Yi ","[?] ","Zhi ","Wu ","Zha ","Hu ","Fa ","Le ","Zhong ","Ping ","Pang ","Qiao ","Hu ","Guai ","Cheng ","Cheng ","Yi ","Yin ","[?] ","Mie ","Jiu ","Qi ","Ye ","Xi ","Xiang ","Gai ","Diu ","Hal ","[?] ","Shu ","Twul ","Shi ","Ji ","Nang ","Jia ","Kel ","Shi ","[?] ","Ol ","Mai ","Luan ","Cal ","Ru ","Xue ","Yan ","Fu ","Sha ","Na ","Gan ","Sol ","El ","Cwul ","[?] ","Gan ","Chi ","Gui ","Gan ","Luan ","Lin ","Yi ","Jue ","Liao ","Ma ","Yu ","Zheng ","Shi ","Shi ","Er ","Chu ","Yu ","Yu ","Yu ","Yun ","Hu ","Qi ","Wu ","Jing ","Si ","Sui ","Gen ","Gen ","Ya ","Xie ","Ya ","Qi ","Ya ","Ji ","Tou ","Wang ","Kang ","Ta ","Jiao ","Hai ","Yi ","Chan ","Heng ","Mu ","[?] ","Xiang ","Jing ","Ting ","Liang ","Xiang ","Jing ","Ye ","Qin ","Bo ","You ","Xie ","Dan ","Lian ","Duo ","Wei ","Ren ","Ren ","Ji ","La ","Wang ","Yi ","Shi ","Ren ","Le ","Ding ","Ze ","Jin ","Pu ","Chou ","Ba ","Zhang ","Jin ","Jie ","Bing ","Reng ","Cong ","Fo ","San ","Lun ","Sya ","Cang ","Zi ","Shi ","Ta ","Zhang ","Fu ","Xian ","Xian ","Tuo ","Hong ","Tong ","Ren ","Qian ","Gan ","Yi ","Di ","Dai ","Ling ","Yi ","Chao ","Chang ","Sa ","[?] ","Yi ","Mu ","Men ","Ren ","Jia ","Chao ","Yang ","Qian ","Zhong ","Pi ","Wan ","Wu ","Jian ","Jie ","Yao ","Feng ","Cang ","Ren ","Wang ","Fen ","Di ","Fang " ];

},{}],47:[function(require,module,exports){
module.exports = [ "Zhong ","Qi ","Pei ","Yu ","Diao ","Dun ","Wen ","Yi ","Xin ","Kang ","Yi ","Ji ","Ai ","Wu ","Ji ","Fu ","Fa ","Xiu ","Jin ","Bei ","Dan ","Fu ","Tang ","Zhong ","You ","Huo ","Hui ","Yu ","Cui ","Chuan ","San ","Wei ","Chuan ","Che ","Ya ","Xian ","Shang ","Chang ","Lun ","Cang ","Xun ","Xin ","Wei ","Zhu ","[?] ","Xuan ","Nu ","Bo ","Gu ","Ni ","Ni ","Xie ","Ban ","Xu ","Ling ","Zhou ","Shen ","Qu ","Si ","Beng ","Si ","Jia ","Pi ","Yi ","Si ","Ai ","Zheng ","Dian ","Han ","Mai ","Dan ","Zhu ","Bu ","Qu ","Bi ","Shao ","Ci ","Wei ","Di ","Zhu ","Zuo ","You ","Yang ","Ti ","Zhan ","He ","Bi ","Tuo ","She ","Yu ","Yi ","Fo ","Zuo ","Kou ","Ning ","Tong ","Ni ","Xuan ","Qu ","Yong ","Wa ","Qian ","[?] ","Ka ","[?] ","Pei ","Huai ","He ","Lao ","Xiang ","Ge ","Yang ","Bai ","Fa ","Ming ","Jia ","Er ","Bing ","Ji ","Hen ","Huo ","Gui ","Quan ","Tiao ","Jiao ","Ci ","Yi ","Shi ","Xing ","Shen ","Tuo ","Kan ","Zhi ","Gai ","Lai ","Yi ","Chi ","Kua ","Guang ","Li ","Yin ","Shi ","Mi ","Zhu ","Xu ","You ","An ","Lu ","Mou ","Er ","Lun ","Tong ","Cha ","Chi ","Xun ","Gong ","Zhou ","Yi ","Ru ","Jian ","Xia ","Jia ","Zai ","Lu ","Ko ","Jiao ","Zhen ","Ce ","Qiao ","Kuai ","Chai ","Ning ","Nong ","Jin ","Wu ","Hou ","Jiong ","Cheng ","Zhen ","Zuo ","Chou ","Qin ","Lu ","Ju ","Shu ","Ting ","Shen ","Tuo ","Bo ","Nan ","Hao ","Bian ","Tui ","Yu ","Xi ","Cu ","E ","Qiu ","Xu ","Kuang ","Ku ","Wu ","Jun ","Yi ","Fu ","Lang ","Zu ","Qiao ","Li ","Yong ","Hun ","Jing ","Xian ","San ","Pai ","Su ","Fu ","Xi ","Li ","Fu ","Ping ","Bao ","Yu ","Si ","Xia ","Xin ","Xiu ","Yu ","Ti ","Che ","Chou ","[?] ","Yan ","Lia ","Li ","Lai ","[?] ","Jian ","Xiu ","Fu ","He ","Ju ","Xiao ","Pai ","Jian ","Biao ","Chu ","Fei ","Feng ","Ya ","An ","Bei ","Yu ","Xin ","Bi ","Jian " ];

},{}],48:[function(require,module,exports){
module.exports = [ "Chang ","Chi ","Bing ","Zan ","Yao ","Cui ","Lia ","Wan ","Lai ","Cang ","Zong ","Ge ","Guan ","Bei ","Tian ","Shu ","Shu ","Men ","Dao ","Tan ","Jue ","Chui ","Xing ","Peng ","Tang ","Hou ","Yi ","Qi ","Ti ","Gan ","Jing ","Jie ","Sui ","Chang ","Jie ","Fang ","Zhi ","Kong ","Juan ","Zong ","Ju ","Qian ","Ni ","Lun ","Zhuo ","Wei ","Luo ","Song ","Leng ","Hun ","Dong ","Zi ","Ben ","Wu ","Ju ","Nai ","Cai ","Jian ","Zhai ","Ye ","Zhi ","Sha ","Qing ","[?] ","Ying ","Cheng ","Jian ","Yan ","Nuan ","Zhong ","Chun ","Jia ","Jie ","Wei ","Yu ","Bing ","Ruo ","Ti ","Wei ","Pian ","Yan ","Feng ","Tang ","Wo ","E ","Xie ","Che ","Sheng ","Kan ","Di ","Zuo ","Cha ","Ting ","Bei ","Ye ","Huang ","Yao ","Zhan ","Chou ","Yan ","You ","Jian ","Xu ","Zha ","Ci ","Fu ","Bi ","Zhi ","Zong ","Mian ","Ji ","Yi ","Xie ","Xun ","Si ","Duan ","Ce ","Zhen ","Ou ","Tou ","Tou ","Bei ","Za ","Lu ","Jie ","Wei ","Fen ","Chang ","Gui ","Sou ","Zhi ","Su ","Xia ","Fu ","Yuan ","Rong ","Li ","Ru ","Yun ","Gou ","Ma ","Bang ","Dian ","Tang ","Hao ","Jie ","Xi ","Shan ","Qian ","Jue ","Cang ","Chu ","San ","Bei ","Xiao ","Yong ","Yao ","Tan ","Suo ","Yang ","Fa ","Bing ","Jia ","Dai ","Zai ","Tang ","[?] ","Bin ","Chu ","Nuo ","Can ","Lei ","Cui ","Yong ","Zao ","Zong ","Peng ","Song ","Ao ","Chuan ","Yu ","Zhai ","Cou ","Shang ","Qiang ","Jing ","Chi ","Sha ","Han ","Zhang ","Qing ","Yan ","Di ","Xi ","Lu ","Bei ","Piao ","Jin ","Lian ","Lu ","Man ","Qian ","Xian ","Tan ","Ying ","Dong ","Zhuan ","Xiang ","Shan ","Qiao ","Jiong ","Tui ","Zun ","Pu ","Xi ","Lao ","Chang ","Guang ","Liao ","Qi ","Deng ","Chan ","Wei ","Ji ","Fan ","Hui ","Chuan ","Jian ","Dan ","Jiao ","Jiu ","Seng ","Fen ","Xian ","Jue ","E ","Jiao ","Jian ","Tong ","Lin ","Bo ","Gu ","[?] ","Su ","Xian ","Jiang ","Min ","Ye ","Jin ","Jia ","Qiao ","Pi ","Feng ","Zhou ","Ai ","Sai " ];

},{}],49:[function(require,module,exports){
module.exports = [ "Yi ","Jun ","Nong ","Chan ","Yi ","Dang ","Jing ","Xuan ","Kuai ","Jian ","Chu ","Dan ","Jiao ","Sha ","Zai ","[?] ","Bin ","An ","Ru ","Tai ","Chou ","Chai ","Lan ","Ni ","Jin ","Qian ","Meng ","Wu ","Ning ","Qiong ","Ni ","Chang ","Lie ","Lei ","Lu ","Kuang ","Bao ","Du ","Biao ","Zan ","Zhi ","Si ","You ","Hao ","Chen ","Chen ","Li ","Teng ","Wei ","Long ","Chu ","Chan ","Rang ","Shu ","Hui ","Li ","Luo ","Zan ","Nuo ","Tang ","Yan ","Lei ","Nang ","Er ","Wu ","Yun ","Zan ","Yuan ","Xiong ","Chong ","Zhao ","Xiong ","Xian ","Guang ","Dui ","Ke ","Dui ","Mian ","Tu ","Chang ","Er ","Dui ","Er ","Xin ","Tu ","Si ","Yan ","Yan ","Shi ","Shi ","Dang ","Qian ","Dou ","Fen ","Mao ","Shen ","Dou ","Bai ","Jing ","Li ","Huang ","Ru ","Wang ","Nei ","Quan ","Liang ","Yu ","Ba ","Gong ","Liu ","Xi ","[?] ","Lan ","Gong ","Tian ","Guan ","Xing ","Bing ","Qi ","Ju ","Dian ","Zi ","Ppwun ","Yang ","Jian ","Shou ","Ji ","Yi ","Ji ","Chan ","Jiong ","Mao ","Ran ","Nei ","Yuan ","Mao ","Gang ","Ran ","Ce ","Jiong ","Ce ","Zai ","Gua ","Jiong ","Mao ","Zhou ","Mou ","Gou ","Xu ","Mian ","Mi ","Rong ","Yin ","Xie ","Kan ","Jun ","Nong ","Yi ","Mi ","Shi ","Guan ","Meng ","Zhong ","Ju ","Yuan ","Ming ","Kou ","Lam ","Fu ","Xie ","Mi ","Bing ","Dong ","Tai ","Gang ","Feng ","Bing ","Hu ","Chong ","Jue ","Hu ","Kuang ","Ye ","Leng ","Pan ","Fu ","Min ","Dong ","Xian ","Lie ","Xia ","Jian ","Jing ","Shu ","Mei ","Tu ","Qi ","Gu ","Zhun ","Song ","Jing ","Liang ","Qing ","Diao ","Ling ","Dong ","Gan ","Jian ","Yin ","Cou ","Yi ","Li ","Cang ","Ming ","Zhuen ","Cui ","Si ","Duo ","Jin ","Lin ","Lin ","Ning ","Xi ","Du ","Ji ","Fan ","Fan ","Fan ","Feng ","Ju ","Chu ","Tako ","Feng ","Mok ","Ci ","Fu ","Feng ","Ping ","Feng ","Kai ","Huang ","Kai ","Gan ","Deng ","Ping ","Qu ","Xiong ","Kuai ","Tu ","Ao ","Chu ","Ji ","Dang ","Han ","Han ","Zao " ];

},{}],50:[function(require,module,exports){
module.exports = [ "Dao ","Diao ","Dao ","Ren ","Ren ","Chuang ","Fen ","Qie ","Yi ","Ji ","Kan ","Qian ","Cun ","Chu ","Wen ","Ji ","Dan ","Xing ","Hua ","Wan ","Jue ","Li ","Yue ","Lie ","Liu ","Ze ","Gang ","Chuang ","Fu ","Chu ","Qu ","Ju ","Shan ","Min ","Ling ","Zhong ","Pan ","Bie ","Jie ","Jie ","Bao ","Li ","Shan ","Bie ","Chan ","Jing ","Gua ","Gen ","Dao ","Chuang ","Kui ","Ku ","Duo ","Er ","Zhi ","Shua ","Quan ","Cha ","Ci ","Ke ","Jie ","Gui ","Ci ","Gui ","Kai ","Duo ","Ji ","Ti ","Jing ","Lou ","Gen ","Ze ","Yuan ","Cuo ","Xue ","Ke ","La ","Qian ","Cha ","Chuang ","Gua ","Jian ","Cuo ","Li ","Ti ","Fei ","Pou ","Chan ","Qi ","Chuang ","Zi ","Gang ","Wan ","Bo ","Ji ","Duo ","Qing ","Yan ","Zhuo ","Jian ","Ji ","Bo ","Yan ","Ju ","Huo ","Sheng ","Jian ","Duo ","Duan ","Wu ","Gua ","Fu ","Sheng ","Jian ","Ge ","Zha ","Kai ","Chuang ","Juan ","Chan ","Tuan ","Lu ","Li ","Fou ","Shan ","Piao ","Kou ","Jiao ","Gua ","Qiao ","Jue ","Hua ","Zha ","Zhuo ","Lian ","Ju ","Pi ","Liu ","Gui ","Jiao ","Gui ","Jian ","Jian ","Tang ","Huo ","Ji ","Jian ","Yi ","Jian ","Zhi ","Chan ","Cuan ","Mo ","Li ","Zhu ","Li ","Ya ","Quan ","Ban ","Gong ","Jia ","Wu ","Mai ","Lie ","Jin ","Keng ","Xie ","Zhi ","Dong ","Zhu ","Nu ","Jie ","Qu ","Shao ","Yi ","Zhu ","Miao ","Li ","Jing ","Lao ","Lao ","Juan ","Kou ","Yang ","Wa ","Xiao ","Mou ","Kuang ","Jie ","Lie ","He ","Shi ","Ke ","Jing ","Hao ","Bo ","Min ","Chi ","Lang ","Yong ","Yong ","Mian ","Ke ","Xun ","Juan ","Qing ","Lu ","Pou ","Meng ","Lai ","Le ","Kai ","Mian ","Dong ","Xu ","Xu ","Kan ","Wu ","Yi ","Xun ","Weng ","Sheng ","Lao ","Mu ","Lu ","Piao ","Shi ","Ji ","Qin ","Qiang ","Jiao ","Quan ","Yang ","Yi ","Jue ","Fan ","Juan ","Tong ","Ju ","Dan ","Xie ","Mai ","Xun ","Xun ","Lu ","Li ","Che ","Rang ","Quan ","Bao ","Shao ","Yun ","Jiu ","Bao ","Gou ","Wu " ];

},{}],51:[function(require,module,exports){
module.exports = [ "Yun ","Mwun ","Nay ","Gai ","Gai ","Bao ","Cong ","[?] ","Xiong ","Peng ","Ju ","Tao ","Ge ","Pu ","An ","Pao ","Fu ","Gong ","Da ","Jiu ","Qiong ","Bi ","Hua ","Bei ","Nao ","Chi ","Fang ","Jiu ","Yi ","Za ","Jiang ","Kang ","Jiang ","Kuang ","Hu ","Xia ","Qu ","Bian ","Gui ","Qie ","Zang ","Kuang ","Fei ","Hu ","Tou ","Gui ","Gui ","Hui ","Dan ","Gui ","Lian ","Lian ","Suan ","Du ","Jiu ","Qu ","Xi ","Pi ","Qu ","Yi ","Qia ","Yan ","Bian ","Ni ","Qu ","Shi ","Xin ","Qian ","Nian ","Sa ","Zu ","Sheng ","Wu ","Hui ","Ban ","Shi ","Xi ","Wan ","Hua ","Xie ","Wan ","Bei ","Zu ","Zhuo ","Xie ","Dan ","Mai ","Nan ","Dan ","Ji ","Bo ","Shuai ","Bu ","Kuang ","Bian ","Bu ","Zhan ","Qia ","Lu ","You ","Lu ","Xi ","Gua ","Wo ","Xie ","Jie ","Jie ","Wei ","Ang ","Qiong ","Zhi ","Mao ","Yin ","Wei ","Shao ","Ji ","Que ","Luan ","Shi ","Juan ","Xie ","Xu ","Jin ","Que ","Wu ","Ji ","E ","Qing ","Xi ","[?] ","Han ","Zhan ","E ","Ting ","Li ","Zhe ","Han ","Li ","Ya ","Ya ","Yan ","She ","Zhi ","Zha ","Pang ","[?] ","He ","Ya ","Zhi ","Ce ","Pang ","Ti ","Li ","She ","Hou ","Ting ","Zui ","Cuo ","Fei ","Yuan ","Ce ","Yuan ","Xiang ","Yan ","Li ","Jue ","Sha ","Dian ","Chu ","Jiu ","Qin ","Ao ","Gui ","Yan ","Si ","Li ","Chang ","Lan ","Li ","Yan ","Yan ","Yuan ","Si ","Gong ","Lin ","Qiu ","Qu ","Qu ","Uk ","Lei ","Du ","Xian ","Zhuan ","San ","Can ","Can ","Can ","Can ","Ai ","Dai ","You ","Cha ","Ji ","You ","Shuang ","Fan ","Shou ","Guai ","Ba ","Fa ","Ruo ","Shi ","Shu ","Zhuo ","Qu ","Shou ","Bian ","Xu ","Jia ","Pan ","Sou ","Gao ","Wei ","Sou ","Die ","Rui ","Cong ","Kou ","Gu ","Ju ","Ling ","Gua ","Tao ","Kou ","Zhi ","Jiao ","Zhao ","Ba ","Ding ","Ke ","Tai ","Chi ","Shi ","You ","Qiu ","Po ","Xie ","Hao ","Si ","Tan ","Chi ","Le ","Diao ","Ji ","[?] ","Hong " ];

},{}],52:[function(require,module,exports){
module.exports = [ "Mie ","Xu ","Mang ","Chi ","Ge ","Xuan ","Yao ","Zi ","He ","Ji ","Diao ","Cun ","Tong ","Ming ","Hou ","Li ","Tu ","Xiang ","Zha ","Xia ","Ye ","Lu ","A ","Ma ","Ou ","Xue ","Yi ","Jun ","Chou ","Lin ","Tun ","Yin ","Fei ","Bi ","Qin ","Qin ","Jie ","Bu ","Fou ","Ba ","Dun ","Fen ","E ","Han ","Ting ","Hang ","Shun ","Qi ","Hong ","Zhi ","Shen ","Wu ","Wu ","Chao ","Ne ","Xue ","Xi ","Chui ","Dou ","Wen ","Hou ","Ou ","Wu ","Gao ","Ya ","Jun ","Lu ","E ","Ge ","Mei ","Ai ","Qi ","Cheng ","Wu ","Gao ","Fu ","Jiao ","Hong ","Chi ","Sheng ","Ne ","Tun ","Fu ","Yi ","Dai ","Ou ","Li ","Bai ","Yuan ","Kuai ","[?] ","Qiang ","Wu ","E ","Shi ","Quan ","Pen ","Wen ","Ni ","M ","Ling ","Ran ","You ","Di ","Zhou ","Shi ","Zhou ","Tie ","Xi ","Yi ","Qi ","Ping ","Zi ","Gu ","Zi ","Wei ","Xu ","He ","Nao ","Xia ","Pei ","Yi ","Xiao ","Shen ","Hu ","Ming ","Da ","Qu ","Ju ","Gem ","Za ","Tuo ","Duo ","Pou ","Pao ","Bi ","Fu ","Yang ","He ","Zha ","He ","Hai ","Jiu ","Yong ","Fu ","Que ","Zhou ","Wa ","Ka ","Gu ","Ka ","Zuo ","Bu ","Long ","Dong ","Ning ","Tha ","Si ","Xian ","Huo ","Qi ","Er ","E ","Guang ","Zha ","Xi ","Yi ","Lie ","Zi ","Mie ","Mi ","Zhi ","Yao ","Ji ","Zhou ","Ge ","Shuai ","Zan ","Xiao ","Ke ","Hui ","Kua ","Huai ","Tao ","Xian ","E ","Xuan ","Xiu ","Wai ","Yan ","Lao ","Yi ","Ai ","Pin ","Shen ","Tong ","Hong ","Xiong ","Chi ","Wa ","Ha ","Zai ","Yu ","Di ","Pai ","Xiang ","Ai ","Hen ","Kuang ","Ya ","Da ","Xiao ","Bi ","Yue ","[?] ","Hua ","Sasou ","Kuai ","Duo ","[?] ","Ji ","Nong ","Mou ","Yo ","Hao ","Yuan ","Long ","Pou ","Mang ","Ge ","E ","Chi ","Shao ","Li ","Na ","Zu ","He ","Ku ","Xiao ","Xian ","Lao ","Bo ","Zhe ","Zha ","Liang ","Ba ","Mie ","Le ","Sui ","Fou ","Bu ","Han ","Heng ","Geng ","Shuo ","Ge " ];

},{}],53:[function(require,module,exports){
module.exports = [ "You ","Yan ","Gu ","Gu ","Bai ","Han ","Suo ","Chun ","Yi ","Ai ","Jia ","Tu ","Xian ","Huan ","Li ","Xi ","Tang ","Zuo ","Qiu ","Che ","Wu ","Zao ","Ya ","Dou ","Qi ","Di ","Qin ","Ma ","Mal ","Hong ","Dou ","Kes ","Lao ","Liang ","Suo ","Zao ","Huan ","Lang ","Sha ","Ji ","Zuo ","Wo ","Feng ","Yin ","Hu ","Qi ","Shou ","Wei ","Shua ","Chang ","Er ","Li ","Qiang ","An ","Jie ","Yo ","Nian ","Yu ","Tian ","Lai ","Sha ","Xi ","Tuo ","Hu ","Ai ","Zhou ","Nou ","Ken ","Zhuo ","Zhuo ","Shang ","Di ","Heng ","Lan ","A ","Xiao ","Xiang ","Tun ","Wu ","Wen ","Cui ","Sha ","Hu ","Qi ","Qi ","Tao ","Dan ","Dan ","Ye ","Zi ","Bi ","Cui ","Chuo ","He ","Ya ","Qi ","Zhe ","Pei ","Liang ","Xian ","Pi ","Sha ","La ","Ze ","Qing ","Gua ","Pa ","Zhe ","Se ","Zhuan ","Nie ","Guo ","Luo ","Yan ","Di ","Quan ","Tan ","Bo ","Ding ","Lang ","Xiao ","[?] ","Tang ","Chi ","Ti ","An ","Jiu ","Dan ","Ke ","Yong ","Wei ","Nan ","Shan ","Yu ","Zhe ","La ","Jie ","Hou ","Han ","Die ","Zhou ","Chai ","Wai ","Re ","Yu ","Yin ","Zan ","Yao ","Wo ","Mian ","Hu ","Yun ","Chuan ","Hui ","Huan ","Huan ","Xi ","He ","Ji ","Kui ","Zhong ","Wei ","Sha ","Xu ","Huang ","Du ","Nie ","Xuan ","Liang ","Yu ","Sang ","Chi ","Qiao ","Yan ","Dan ","Pen ","Can ","Li ","Yo ","Zha ","Wei ","Miao ","Ying ","Pen ","Phos ","Kui ","Xi ","Yu ","Jie ","Lou ","Ku ","Sao ","Huo ","Ti ","Yao ","He ","A ","Xiu ","Qiang ","Se ","Yong ","Su ","Hong ","Xie ","Yi ","Suo ","Ma ","Cha ","Hai ","Ke ","Ta ","Sang ","Tian ","Ru ","Sou ","Wa ","Ji ","Pang ","Wu ","Xian ","Shi ","Ge ","Zi ","Jie ","Luo ","Weng ","Wa ","Si ","Chi ","Hao ","Suo ","Jia ","Hai ","Suo ","Qin ","Nie ","He ","Cis ","Sai ","Ng ","Ge ","Na ","Dia ","Ai ","[?] ","Tong ","Bi ","Ao ","Ao ","Lian ","Cui ","Zhe ","Mo ","Sou ","Sou ","Tan " ];

},{}],54:[function(require,module,exports){
module.exports = [ "Di ","Qi ","Jiao ","Chong ","Jiao ","Kai ","Tan ","San ","Cao ","Jia ","Ai ","Xiao ","Piao ","Lou ","Ga ","Gu ","Xiao ","Hu ","Hui ","Guo ","Ou ","Xian ","Ze ","Chang ","Xu ","Po ","De ","Ma ","Ma ","Hu ","Lei ","Du ","Ga ","Tang ","Ye ","Beng ","Ying ","Saai ","Jiao ","Mi ","Xiao ","Hua ","Mai ","Ran ","Zuo ","Peng ","Lao ","Xiao ","Ji ","Zhu ","Chao ","Kui ","Zui ","Xiao ","Si ","Hao ","Fu ","Liao ","Qiao ","Xi ","Xiu ","Tan ","Tan ","Mo ","Xun ","E ","Zun ","Fan ","Chi ","Hui ","Zan ","Chuang ","Cu ","Dan ","Yu ","Tun ","Cheng ","Jiao ","Ye ","Xi ","Qi ","Hao ","Lian ","Xu ","Deng ","Hui ","Yin ","Pu ","Jue ","Qin ","Xun ","Nie ","Lu ","Si ","Yan ","Ying ","Da ","Dan ","Yu ","Zhou ","Jin ","Nong ","Yue ","Hui ","Qi ","E ","Zao ","Yi ","Shi ","Jiao ","Yuan ","Ai ","Yong ","Jue ","Kuai ","Yu ","Pen ","Dao ","Ge ","Xin ","Dun ","Dang ","Sin ","Sai ","Pi ","Pi ","Yin ","Zui ","Ning ","Di ","Lan ","Ta ","Huo ","Ru ","Hao ","Xia ","Ya ","Duo ","Xi ","Chou ","Ji ","Jin ","Hao ","Ti ","Chang ","[?] ","[?] ","Ca ","Ti ","Lu ","Hui ","Bo ","You ","Nie ","Yin ","Hu ","Mo ","Huang ","Zhe ","Li ","Liu ","Haai ","Nang ","Xiao ","Mo ","Yan ","Li ","Lu ","Long ","Fu ","Dan ","Chen ","Pin ","Pi ","Xiang ","Huo ","Mo ","Xi ","Duo ","Ku ","Yan ","Chan ","Ying ","Rang ","Dian ","La ","Ta ","Xiao ","Jiao ","Chuo ","Huan ","Huo ","Zhuan ","Nie ","Xiao ","Ca ","Li ","Chan ","Chai ","Li ","Yi ","Luo ","Nang ","Zan ","Su ","Xi ","So ","Jian ","Za ","Zhu ","Lan ","Nie ","Nang ","[?] ","[?] ","Wei ","Hui ","Yin ","Qiu ","Si ","Nin ","Jian ","Hui ","Xin ","Yin ","Nan ","Tuan ","Tuan ","Dun ","Kang ","Yuan ","Jiong ","Pian ","Yun ","Cong ","Hu ","Hui ","Yuan ","You ","Guo ","Kun ","Cong ","Wei ","Tu ","Wei ","Lun ","Guo ","Qun ","Ri ","Ling ","Gu ","Guo ","Tai ","Guo ","Tu ","You " ];

},{}],55:[function(require,module,exports){
module.exports = [ "Guo ","Yin ","Hun ","Pu ","Yu ","Han ","Yuan ","Lun ","Quan ","Yu ","Qing ","Guo ","Chuan ","Wei ","Yuan ","Quan ","Ku ","Fu ","Yuan ","Yuan ","E ","Tu ","Tu ","Tu ","Tuan ","Lue ","Hui ","Yi ","Yuan ","Luan ","Luan ","Tu ","Ya ","Tu ","Ting ","Sheng ","Pu ","Lu ","Iri ","Ya ","Zai ","Wei ","Ge ","Yu ","Wu ","Gui ","Pi ","Yi ","Di ","Qian ","Qian ","Zhen ","Zhuo ","Dang ","Qia ","Akutsu ","Yama ","Kuang ","Chang ","Qi ","Nie ","Mo ","Ji ","Jia ","Zhi ","Zhi ","Ban ","Xun ","Tou ","Qin ","Fen ","Jun ","Keng ","Tun ","Fang ","Fen ","Ben ","Tan ","Kan ","Pi ","Zuo ","Keng ","Bi ","Xing ","Di ","Jing ","Ji ","Kuai ","Di ","Jing ","Jian ","Tan ","Li ","Ba ","Wu ","Fen ","Zhui ","Po ","Pan ","Tang ","Kun ","Qu ","Tan ","Zhi ","Tuo ","Gan ","Ping ","Dian ","Gua ","Ni ","Tai ","Pi ","Jiong ","Yang ","Fo ","Ao ","Liu ","Qiu ","Mu ","Ke ","Gou ","Xue ","Ba ","Chi ","Che ","Ling ","Zhu ","Fu ","Hu ","Zhi ","Chui ","La ","Long ","Long ","Lu ","Ao ","Tay ","Pao ","[?] ","Xing ","Dong ","Ji ","Ke ","Lu ","Ci ","Chi ","Lei ","Gai ","Yin ","Hou ","Dui ","Zhao ","Fu ","Guang ","Yao ","Duo ","Duo ","Gui ","Cha ","Yang ","Yin ","Fa ","Gou ","Yuan ","Die ","Xie ","Ken ","Jiong ","Shou ","E ","Ha ","Dian ","Hong ","Wu ","Kua ","[?] ","Tao ","Dang ","Kai ","Gake ","Nao ","An ","Xing ","Xian ","Huan ","Bang ","Pei ","Ba ","Yi ","Yin ","Han ","Xu ","Chui ","Cen ","Geng ","Ai ","Peng ","Fang ","Que ","Yong ","Xun ","Jia ","Di ","Mai ","Lang ","Xuan ","Cheng ","Yan ","Jin ","Zhe ","Lei ","Lie ","Bu ","Cheng ","Gomi ","Bu ","Shi ","Xun ","Guo ","Jiong ","Ye ","Nian ","Di ","Yu ","Bu ","Ya ","Juan ","Sui ","Pi ","Cheng ","Wan ","Ju ","Lun ","Zheng ","Kong ","Chong ","Dong ","Dai ","Tan ","An ","Cai ","Shu ","Beng ","Kan ","Zhi ","Duo ","Yi ","Zhi ","Yi ","Pei ","Ji ","Zhun ","Qi ","Sao ","Ju ","Ni " ];

},{}],56:[function(require,module,exports){
module.exports = [ "Ku ","Ke ","Tang ","Kun ","Ni ","Jian ","Dui ","Jin ","Gang ","Yu ","E ","Peng ","Gu ","Tu ","Leng ","[?] ","Ya ","Qian ","[?] ","An ","[?] ","Duo ","Nao ","Tu ","Cheng ","Yin ","Hun ","Bi ","Lian ","Guo ","Die ","Zhuan ","Hou ","Bao ","Bao ","Yu ","Di ","Mao ","Jie ","Ruan ","E ","Geng ","Kan ","Zong ","Yu ","Huang ","E ","Yao ","Yan ","Bao ","Ji ","Mei ","Chang ","Du ","Tuo ","Yin ","Feng ","Zhong ","Jie ","Zhen ","Feng ","Gang ","Chuan ","Jian ","Pyeng ","Toride ","Xiang ","Huang ","Leng ","Duan ","[?] ","Xuan ","Ji ","Ji ","Kuai ","Ying ","Ta ","Cheng ","Yong ","Kai ","Su ","Su ","Shi ","Mi ","Ta ","Weng ","Cheng ","Tu ","Tang ","Que ","Zhong ","Li ","Peng ","Bang ","Sai ","Zang ","Dui ","Tian ","Wu ","Cheng ","Xun ","Ge ","Zhen ","Ai ","Gong ","Yan ","Kan ","Tian ","Yuan ","Wen ","Xie ","Liu ","Ama ","Lang ","Chang ","Peng ","Beng ","Chen ","Cu ","Lu ","Ou ","Qian ","Mei ","Mo ","Zhuan ","Shuang ","Shu ","Lou ","Chi ","Man ","Biao ","Jing ","Qi ","Shu ","Di ","Zhang ","Kan ","Yong ","Dian ","Chen ","Zhi ","Xi ","Guo ","Qiang ","Jin ","Di ","Shang ","Mu ","Cui ","Yan ","Ta ","Zeng ","Qi ","Qiang ","Liang ","[?] ","Zhui ","Qiao ","Zeng ","Xu ","Shan ","Shan ","Ba ","Pu ","Kuai ","Dong ","Fan ","Que ","Mo ","Dun ","Dun ","Dun ","Di ","Sheng ","Duo ","Duo ","Tan ","Deng ","Wu ","Fen ","Huang ","Tan ","Da ","Ye ","Sho ","Mama ","Yu ","Qiang ","Ji ","Qiao ","Ken ","Yi ","Pi ","Bi ","Dian ","Jiang ","Ye ","Yong ","Bo ","Tan ","Lan ","Ju ","Huai ","Dang ","Rang ","Qian ","Xun ","Lan ","Xi ","He ","Ai ","Ya ","Dao ","Hao ","Ruan ","Mama ","Lei ","Kuang ","Lu ","Yan ","Tan ","Wei ","Huai ","Long ","Long ","Rui ","Li ","Lin ","Rang ","Ten ","Xun ","Yan ","Lei ","Ba ","[?] ","Shi ","Ren ","[?] ","Zhuang ","Zhuang ","Sheng ","Yi ","Mai ","Ke ","Zhu ","Zhuang ","Hu ","Hu ","Kun ","Yi ","Hu ","Xu ","Kun ","Shou ","Mang ","Zun " ];

},{}],57:[function(require,module,exports){
module.exports = [ "Shou ","Yi ","Zhi ","Gu ","Chu ","Jiang ","Feng ","Bei ","Cay ","Bian ","Sui ","Qun ","Ling ","Fu ","Zuo ","Xia ","Xiong ","[?] ","Nao ","Xia ","Kui ","Xi ","Wai ","Yuan ","Mao ","Su ","Duo ","Duo ","Ye ","Qing ","Uys ","Gou ","Gou ","Qi ","Meng ","Meng ","Yin ","Huo ","Chen ","Da ","Ze ","Tian ","Tai ","Fu ","Guai ","Yao ","Yang ","Hang ","Gao ","Shi ","Ben ","Tai ","Tou ","Yan ","Bi ","Yi ","Kua ","Jia ","Duo ","Kwu ","Kuang ","Yun ","Jia ","Pa ","En ","Lian ","Huan ","Di ","Yan ","Pao ","Quan ","Qi ","Nai ","Feng ","Xie ","Fen ","Dian ","[?] ","Kui ","Zou ","Huan ","Qi ","Kai ","Zha ","Ben ","Yi ","Jiang ","Tao ","Zang ","Ben ","Xi ","Xiang ","Fei ","Diao ","Xun ","Keng ","Dian ","Ao ","She ","Weng ","Pan ","Ao ","Wu ","Ao ","Jiang ","Lian ","Duo ","Yun ","Jiang ","Shi ","Fen ","Huo ","Bi ","Lian ","Duo ","Nu ","Nu ","Ding ","Nai ","Qian ","Jian ","Ta ","Jiu ","Nan ","Cha ","Hao ","Xian ","Fan ","Ji ","Shuo ","Ru ","Fei ","Wang ","Hong ","Zhuang ","Fu ","Ma ","Dan ","Ren ","Fu ","Jing ","Yan ","Xie ","Wen ","Zhong ","Pa ","Du ","Ji ","Keng ","Zhong ","Yao ","Jin ","Yun ","Miao ","Pei ","Shi ","Yue ","Zhuang ","Niu ","Yan ","Na ","Xin ","Fen ","Bi ","Yu ","Tuo ","Feng ","Yuan ","Fang ","Wu ","Yu ","Gui ","Du ","Ba ","Ni ","Zhou ","Zhuo ","Zhao ","Da ","Nai ","Yuan ","Tou ","Xuan ","Zhi ","E ","Mei ","Mo ","Qi ","Bi ","Shen ","Qie ","E ","He ","Xu ","Fa ","Zheng ","Min ","Ban ","Mu ","Fu ","Ling ","Zi ","Zi ","Shi ","Ran ","Shan ","Yang ","Man ","Jie ","Gu ","Si ","Xing ","Wei ","Zi ","Ju ","Shan ","Pin ","Ren ","Yao ","Tong ","Jiang ","Shu ","Ji ","Gai ","Shang ","Kuo ","Juan ","Jiao ","Gou ","Mu ","Jian ","Jian ","Yi ","Nian ","Zhi ","Ji ","Ji ","Xian ","Heng ","Guang ","Jun ","Kua ","Yan ","Ming ","Lie ","Pei ","Yan ","You ","Yan ","Cha ","Shen ","Yin ","Chi ","Gui ","Quan ","Zi " ];

},{}],58:[function(require,module,exports){
module.exports = [ "Song ","Wei ","Hong ","Wa ","Lou ","Ya ","Rao ","Jiao ","Luan ","Ping ","Xian ","Shao ","Li ","Cheng ","Xiao ","Mang ","Fu ","Suo ","Wu ","Wei ","Ke ","Lai ","Chuo ","Ding ","Niang ","Xing ","Nan ","Yu ","Nuo ","Pei ","Nei ","Juan ","Shen ","Zhi ","Han ","Di ","Zhuang ","E ","Pin ","Tui ","Han ","Mian ","Wu ","Yan ","Wu ","Xi ","Yan ","Yu ","Si ","Yu ","Wa ","[?] ","Xian ","Ju ","Qu ","Shui ","Qi ","Xian ","Zhui ","Dong ","Chang ","Lu ","Ai ","E ","E ","Lou ","Mian ","Cong ","Pou ","Ju ","Po ","Cai ","Ding ","Wan ","Biao ","Xiao ","Shu ","Qi ","Hui ","Fu ","E ","Wo ","Tan ","Fei ","Wei ","Jie ","Tian ","Ni ","Quan ","Jing ","Hun ","Jing ","Qian ","Dian ","Xing ","Hu ","Wa ","Lai ","Bi ","Yin ","Chou ","Chuo ","Fu ","Jing ","Lun ","Yan ","Lan ","Kun ","Yin ","Ya ","Ju ","Li ","Dian ","Xian ","Hwa ","Hua ","Ying ","Chan ","Shen ","Ting ","Dang ","Yao ","Wu ","Nan ","Ruo ","Jia ","Tou ","Xu ","Yu ","Wei ","Ti ","Rou ","Mei ","Dan ","Ruan ","Qin ","Hui ","Wu ","Qian ","Chun ","Mao ","Fu ","Jie ","Duan ","Xi ","Zhong ","Mei ","Huang ","Mian ","An ","Ying ","Xuan ","Jie ","Wei ","Mei ","Yuan ","Zhen ","Qiu ","Ti ","Xie ","Tuo ","Lian ","Mao ","Ran ","Si ","Pian ","Wei ","Wa ","Jiu ","Hu ","Ao ","[?] ","Bou ","Xu ","Tou ","Gui ","Zou ","Yao ","Pi ","Xi ","Yuan ","Ying ","Rong ","Ru ","Chi ","Liu ","Mei ","Pan ","Ao ","Ma ","Gou ","Kui ","Qin ","Jia ","Sao ","Zhen ","Yuan ","Cha ","Yong ","Ming ","Ying ","Ji ","Su ","Niao ","Xian ","Tao ","Pang ","Lang ","Nao ","Bao ","Ai ","Pi ","Pin ","Yi ","Piao ","Yu ","Lei ","Xuan ","Man ","Yi ","Zhang ","Kang ","Yong ","Ni ","Li ","Di ","Gui ","Yan ","Jin ","Zhuan ","Chang ","Ce ","Han ","Nen ","Lao ","Mo ","Zhe ","Hu ","Hu ","Ao ","Nen ","Qiang ","Ma ","Pie ","Gu ","Wu ","Jiao ","Tuo ","Zhan ","Mao ","Xian ","Xian ","Mo ","Liao ","Lian ","Hua " ];

},{}],59:[function(require,module,exports){
module.exports = [ "Gui ","Deng ","Zhi ","Xu ","Yi ","Hua ","Xi ","Hui ","Rao ","Xi ","Yan ","Chan ","Jiao ","Mei ","Fan ","Fan ","Xian ","Yi ","Wei ","Jiao ","Fu ","Shi ","Bi ","Shan ","Sui ","Qiang ","Lian ","Huan ","Xin ","Niao ","Dong ","Yi ","Can ","Ai ","Niang ","Neng ","Ma ","Tiao ","Chou ","Jin ","Ci ","Yu ","Pin ","Yong ","Xu ","Nai ","Yan ","Tai ","Ying ","Can ","Niao ","Wo ","Ying ","Mian ","Kaka ","Ma ","Shen ","Xing ","Ni ","Du ","Liu ","Yuan ","Lan ","Yan ","Shuang ","Ling ","Jiao ","Niang ","Lan ","Xian ","Ying ","Shuang ","Shuai ","Quan ","Mi ","Li ","Luan ","Yan ","Zhu ","Lan ","Zi ","Jie ","Jue ","Jue ","Kong ","Yun ","Zi ","Zi ","Cun ","Sun ","Fu ","Bei ","Zi ","Xiao ","Xin ","Meng ","Si ","Tai ","Bao ","Ji ","Gu ","Nu ","Xue ","[?] ","Zhuan ","Hai ","Luan ","Sun ","Huai ","Mie ","Cong ","Qian ","Shu ","Chan ","Ya ","Zi ","Ni ","Fu ","Zi ","Li ","Xue ","Bo ","Ru ","Lai ","Nie ","Nie ","Ying ","Luan ","Mian ","Zhu ","Rong ","Ta ","Gui ","Zhai ","Qiong ","Yu ","Shou ","An ","Tu ","Song ","Wan ","Rou ","Yao ","Hong ","Yi ","Jing ","Zhun ","Mi ","Zhu ","Dang ","Hong ","Zong ","Guan ","Zhou ","Ding ","Wan ","Yi ","Bao ","Shi ","Shi ","Chong ","Shen ","Ke ","Xuan ","Shi ","You ","Huan ","Yi ","Tiao ","Shi ","Xian ","Gong ","Cheng ","Qun ","Gong ","Xiao ","Zai ","Zha ","Bao ","Hai ","Yan ","Xiao ","Jia ","Shen ","Chen ","Rong ","Huang ","Mi ","Kou ","Kuan ","Bin ","Su ","Cai ","Zan ","Ji ","Yuan ","Ji ","Yin ","Mi ","Kou ","Qing ","Que ","Zhen ","Jian ","Fu ","Ning ","Bing ","Huan ","Mei ","Qin ","Han ","Yu ","Shi ","Ning ","Qin ","Ning ","Zhi ","Yu ","Bao ","Kuan ","Ning ","Qin ","Mo ","Cha ","Ju ","Gua ","Qin ","Hu ","Wu ","Liao ","Shi ","Zhu ","Zhai ","Shen ","Wei ","Xie ","Kuan ","Hui ","Liao ","Jun ","Huan ","Yi ","Yi ","Bao ","Qin ","Chong ","Bao ","Feng ","Cun ","Dui ","Si ","Xun ","Dao ","Lu ","Dui ","Shou " ];

},{}],60:[function(require,module,exports){
module.exports = [ "Po ","Feng ","Zhuan ","Fu ","She ","Ke ","Jiang ","Jiang ","Zhuan ","Wei ","Zun ","Xun ","Shu ","Dui ","Dao ","Xiao ","Ji ","Shao ","Er ","Er ","Er ","Ga ","Jian ","Shu ","Chen ","Shang ","Shang ","Mo ","Ga ","Chang ","Liao ","Xian ","Xian ","[?] ","Wang ","Wang ","You ","Liao ","Liao ","Yao ","Mang ","Wang ","Wang ","Wang ","Ga ","Yao ","Duo ","Kui ","Zhong ","Jiu ","Gan ","Gu ","Gan ","Tui ","Gan ","Gan ","Shi ","Yin ","Chi ","Kao ","Ni ","Jin ","Wei ","Niao ","Ju ","Pi ","Ceng ","Xi ","Bi ","Ju ","Jie ","Tian ","Qu ","Ti ","Jie ","Wu ","Diao ","Shi ","Shi ","Ping ","Ji ","Xie ","Chen ","Xi ","Ni ","Zhan ","Xi ","[?] ","Man ","E ","Lou ","Ping ","Ti ","Fei ","Shu ","Xie ","Tu ","Lu ","Lu ","Xi ","Ceng ","Lu ","Ju ","Xie ","Ju ","Jue ","Liao ","Jue ","Shu ","Xi ","Che ","Tun ","Ni ","Shan ","[?] ","Xian ","Li ","Xue ","Nata ","[?] ","Long ","Yi ","Qi ","Ren ","Wu ","Han ","Shen ","Yu ","Chu ","Sui ","Qi ","[?] ","Yue ","Ban ","Yao ","Ang ","Ya ","Wu ","Jie ","E ","Ji ","Qian ","Fen ","Yuan ","Qi ","Cen ","Qian ","Qi ","Cha ","Jie ","Qu ","Gang ","Xian ","Ao ","Lan ","Dao ","Ba ","Zuo ","Zuo ","Yang ","Ju ","Gang ","Ke ","Gou ","Xue ","Bei ","Li ","Tiao ","Ju ","Yan ","Fu ","Xiu ","Jia ","Ling ","Tuo ","Pei ","You ","Dai ","Kuang ","Yue ","Qu ","Hu ","Po ","Min ","An ","Tiao ","Ling ","Chi ","Yuri ","Dong ","Cem ","Kui ","Xiu ","Mao ","Tong ","Xue ","Yi ","Kura ","He ","Ke ","Luo ","E ","Fu ","Xun ","Die ","Lu ","An ","Er ","Gai ","Quan ","Tong ","Yi ","Mu ","Shi ","An ","Wei ","Hu ","Zhi ","Mi ","Li ","Ji ","Tong ","Wei ","You ","Sang ","Xia ","Li ","Yao ","Jiao ","Zheng ","Luan ","Jiao ","E ","E ","Yu ","Ye ","Bu ","Qiao ","Qun ","Feng ","Feng ","Nao ","Li ","You ","Xian ","Hong ","Dao ","Shen ","Cheng ","Tu ","Geng ","Jun ","Hao ","Xia ","Yin ","Yu " ];

},{}],61:[function(require,module,exports){
module.exports = [ "Lang ","Kan ","Lao ","Lai ","Xian ","Que ","Kong ","Chong ","Chong ","Ta ","Lin ","Hua ","Ju ","Lai ","Qi ","Min ","Kun ","Kun ","Zu ","Gu ","Cui ","Ya ","Ya ","Gang ","Lun ","Lun ","Leng ","Jue ","Duo ","Zheng ","Guo ","Yin ","Dong ","Han ","Zheng ","Wei ","Yao ","Pi ","Yan ","Song ","Jie ","Beng ","Zu ","Jue ","Dong ","Zhan ","Gu ","Yin ","[?] ","Ze ","Huang ","Yu ","Wei ","Yang ","Feng ","Qiu ","Dun ","Ti ","Yi ","Zhi ","Shi ","Zai ","Yao ","E ","Zhu ","Kan ","Lu ","Yan ","Mei ","Gan ","Ji ","Ji ","Huan ","Ting ","Sheng ","Mei ","Qian ","Wu ","Yu ","Zong ","Lan ","Jue ","Yan ","Yan ","Wei ","Zong ","Cha ","Sui ","Rong ","Yamashina ","Qin ","Yu ","Kewashii ","Lou ","Tu ","Dui ","Xi ","Weng ","Cang ","Dang ","Hong ","Jie ","Ai ","Liu ","Wu ","Song ","Qiao ","Zi ","Wei ","Beng ","Dian ","Cuo ","Qian ","Yong ","Nie ","Cuo ","Ji ","[?] ","Tao ","Song ","Zong ","Jiang ","Liao ","Kang ","Chan ","Die ","Cen ","Ding ","Tu ","Lou ","Zhang ","Zhan ","Zhan ","Ao ","Cao ","Qu ","Qiang ","Zui ","Zui ","Dao ","Dao ","Xi ","Yu ","Bo ","Long ","Xiang ","Ceng ","Bo ","Qin ","Jiao ","Yan ","Lao ","Zhan ","Lin ","Liao ","Liao ","Jin ","Deng ","Duo ","Zun ","Jiao ","Gui ","Yao ","Qiao ","Yao ","Jue ","Zhan ","Yi ","Xue ","Nao ","Ye ","Ye ","Yi ","E ","Xian ","Ji ","Xie ","Ke ","Xi ","Di ","Ao ","Zui ","[?] ","Ni ","Rong ","Dao ","Ling ","Za ","Yu ","Yue ","Yin ","[?] ","Jie ","Li ","Sui ","Long ","Long ","Dian ","Ying ","Xi ","Ju ","Chan ","Ying ","Kui ","Yan ","Wei ","Nao ","Quan ","Chao ","Cuan ","Luan ","Dian ","Dian ","[?] ","Yan ","Yan ","Yan ","Nao ","Yan ","Chuan ","Gui ","Chuan ","Zhou ","Huang ","Jing ","Xun ","Chao ","Chao ","Lie ","Gong ","Zuo ","Qiao ","Ju ","Gong ","Kek ","Wu ","Pwu ","Pwu ","Chai ","Qiu ","Qiu ","Ji ","Yi ","Si ","Ba ","Zhi ","Zhao ","Xiang ","Yi ","Jin ","Xun ","Juan ","Phas ","Xun ","Jin ","Fu " ];

},{}],62:[function(require,module,exports){
module.exports = [ "Za ","Bi ","Shi ","Bu ","Ding ","Shuai ","Fan ","Nie ","Shi ","Fen ","Pa ","Zhi ","Xi ","Hu ","Dan ","Wei ","Zhang ","Tang ","Dai ","Ma ","Pei ","Pa ","Tie ","Fu ","Lian ","Zhi ","Zhou ","Bo ","Zhi ","Di ","Mo ","Yi ","Yi ","Ping ","Qia ","Juan ","Ru ","Shuai ","Dai ","Zheng ","Shui ","Qiao ","Zhen ","Shi ","Qun ","Xi ","Bang ","Dai ","Gui ","Chou ","Ping ","Zhang ","Sha ","Wan ","Dai ","Wei ","Chang ","Sha ","Qi ","Ze ","Guo ","Mao ","Du ","Hou ","Zheng ","Xu ","Mi ","Wei ","Wo ","Fu ","Yi ","Bang ","Ping ","Tazuna ","Gong ","Pan ","Huang ","Dao ","Mi ","Jia ","Teng ","Hui ","Zhong ","Shan ","Man ","Mu ","Biao ","Guo ","Ze ","Mu ","Bang ","Zhang ","Jiong ","Chan ","Fu ","Zhi ","Hu ","Fan ","Chuang ","Bi ","Hei ","[?] ","Mi ","Qiao ","Chan ","Fen ","Meng ","Bang ","Chou ","Mie ","Chu ","Jie ","Xian ","Lan ","Gan ","Ping ","Nian ","Qian ","Bing ","Bing ","Xing ","Gan ","Yao ","Huan ","You ","You ","Ji ","Yan ","Pi ","Ting ","Ze ","Guang ","Zhuang ","Mo ","Qing ","Bi ","Qin ","Dun ","Chuang ","Gui ","Ya ","Bai ","Jie ","Xu ","Lu ","Wu ","[?] ","Ku ","Ying ","Di ","Pao ","Dian ","Ya ","Miao ","Geng ","Ci ","Fu ","Tong ","Pang ","Fei ","Xiang ","Yi ","Zhi ","Tiao ","Zhi ","Xiu ","Du ","Zuo ","Xiao ","Tu ","Gui ","Ku ","Pang ","Ting ","You ","Bu ","Ding ","Cheng ","Lai ","Bei ","Ji ","An ","Shu ","Kang ","Yong ","Tuo ","Song ","Shu ","Qing ","Yu ","Yu ","Miao ","Sou ","Ce ","Xiang ","Fei ","Jiu ","He ","Hui ","Liu ","Sha ","Lian ","Lang ","Sou ","Jian ","Pou ","Qing ","Jiu ","Jiu ","Qin ","Ao ","Kuo ","Lou ","Yin ","Liao ","Dai ","Lu ","Yi ","Chu ","Chan ","Tu ","Si ","Xin ","Miao ","Chang ","Wu ","Fei ","Guang ","Koc ","Kuai ","Bi ","Qiang ","Xie ","Lin ","Lin ","Liao ","Lu ","[?] ","Ying ","Xian ","Ting ","Yong ","Li ","Ting ","Yin ","Xun ","Yan ","Ting ","Di ","Po ","Jian ","Hui ","Nai ","Hui ","Gong ","Nian " ];

},{}],63:[function(require,module,exports){
module.exports = [ "Kai ","Bian ","Yi ","Qi ","Nong ","Fen ","Ju ","Yan ","Yi ","Zang ","Bi ","Yi ","Yi ","Er ","San ","Shi ","Er ","Shi ","Shi ","Gong ","Diao ","Yin ","Hu ","Fu ","Hong ","Wu ","Tui ","Chi ","Jiang ","Ba ","Shen ","Di ","Zhang ","Jue ","Tao ","Fu ","Di ","Mi ","Xian ","Hu ","Chao ","Nu ","Jing ","Zhen ","Yi ","Mi ","Quan ","Wan ","Shao ","Ruo ","Xuan ","Jing ","Dun ","Zhang ","Jiang ","Qiang ","Peng ","Dan ","Qiang ","Bi ","Bi ","She ","Dan ","Jian ","Gou ","Sei ","Fa ","Bi ","Kou ","Nagi ","Bie ","Xiao ","Dan ","Kuo ","Qiang ","Hong ","Mi ","Kuo ","Wan ","Jue ","Ji ","Ji ","Gui ","Dang ","Lu ","Lu ","Tuan ","Hui ","Zhi ","Hui ","Hui ","Yi ","Yi ","Yi ","Yi ","Huo ","Huo ","Shan ","Xing ","Wen ","Tong ","Yan ","Yan ","Yu ","Chi ","Cai ","Biao ","Diao ","Bin ","Peng ","Yong ","Piao ","Zhang ","Ying ","Chi ","Chi ","Zhuo ","Tuo ","Ji ","Pang ","Zhong ","Yi ","Wang ","Che ","Bi ","Chi ","Ling ","Fu ","Wang ","Zheng ","Cu ","Wang ","Jing ","Dai ","Xi ","Xun ","Hen ","Yang ","Huai ","Lu ","Hou ","Wa ","Cheng ","Zhi ","Xu ","Jing ","Tu ","Cong ","[?] ","Lai ","Cong ","De ","Pai ","Xi ","[?] ","Qi ","Chang ","Zhi ","Cong ","Zhou ","Lai ","Yu ","Xie ","Jie ","Jian ","Chi ","Jia ","Bian ","Huang ","Fu ","Xun ","Wei ","Pang ","Yao ","Wei ","Xi ","Zheng ","Piao ","Chi ","De ","Zheng ","Zheng ","Bie ","De ","Chong ","Che ","Jiao ","Wei ","Jiao ","Hui ","Mei ","Long ","Xiang ","Bao ","Qu ","Xin ","Shu ","Bi ","Yi ","Le ","Ren ","Dao ","Ding ","Gai ","Ji ","Ren ","Ren ","Chan ","Tan ","Te ","Te ","Gan ","Qi ","Shi ","Cun ","Zhi ","Wang ","Mang ","Xi ","Fan ","Ying ","Tian ","Min ","Min ","Zhong ","Chong ","Wu ","Ji ","Wu ","Xi ","Ye ","You ","Wan ","Cong ","Zhong ","Kuai ","Yu ","Bian ","Zhi ","Qi ","Cui ","Chen ","Tai ","Tun ","Qian ","Nian ","Hun ","Xiong ","Niu ","Wang ","Xian ","Xin ","Kang ","Hu ","Kai ","Fen " ];

},{}],64:[function(require,module,exports){
module.exports = [ "Huai ","Tai ","Song ","Wu ","Ou ","Chang ","Chuang ","Ju ","Yi ","Bao ","Chao ","Min ","Pei ","Zuo ","Zen ","Yang ","Kou ","Ban ","Nu ","Nao ","Zheng ","Pa ","Bu ","Tie ","Gu ","Hu ","Ju ","Da ","Lian ","Si ","Chou ","Di ","Dai ","Yi ","Tu ","You ","Fu ","Ji ","Peng ","Xing ","Yuan ","Ni ","Guai ","Fu ","Xi ","Bi ","You ","Qie ","Xuan ","Cong ","Bing ","Huang ","Xu ","Chu ","Pi ","Xi ","Xi ","Tan ","Koraeru ","Zong ","Dui ","[?] ","Ki ","Yi ","Chi ","Ren ","Xun ","Shi ","Xi ","Lao ","Heng ","Kuang ","Mu ","Zhi ","Xie ","Lian ","Tiao ","Huang ","Die ","Hao ","Kong ","Gui ","Heng ","Xi ","Xiao ","Shu ","S ","Kua ","Qiu ","Yang ","Hui ","Hui ","Chi ","Jia ","Yi ","Xiong ","Guai ","Lin ","Hui ","Zi ","Xu ","Chi ","Xiang ","Nu ","Hen ","En ","Ke ","Tong ","Tian ","Gong ","Quan ","Xi ","Qia ","Yue ","Peng ","Ken ","De ","Hui ","E ","Kyuu ","Tong ","Yan ","Kai ","Ce ","Nao ","Yun ","Mang ","Yong ","Yong ","Yuan ","Pi ","Kun ","Qiao ","Yue ","Yu ","Yu ","Jie ","Xi ","Zhe ","Lin ","Ti ","Han ","Hao ","Qie ","Ti ","Bu ","Yi ","Qian ","Hui ","Xi ","Bei ","Man ","Yi ","Heng ","Song ","Quan ","Cheng ","Hui ","Wu ","Wu ","You ","Li ","Liang ","Huan ","Cong ","Yi ","Yue ","Li ","Nin ","Nao ","E ","Que ","Xuan ","Qian ","Wu ","Min ","Cong ","Fei ","Bei ","Duo ","Cui ","Chang ","Men ","Li ","Ji ","Guan ","Guan ","Xing ","Dao ","Qi ","Kong ","Tian ","Lun ","Xi ","Kan ","Kun ","Ni ","Qing ","Chou ","Dun ","Guo ","Chan ","Liang ","Wan ","Yuan ","Jin ","Ji ","Lin ","Yu ","Huo ","He ","Quan ","Tan ","Ti ","Ti ","Nie ","Wang ","Chuo ","Bu ","Hun ","Xi ","Tang ","Xin ","Wei ","Hui ","E ","Rui ","Zong ","Jian ","Yong ","Dian ","Ju ","Can ","Cheng ","De ","Bei ","Qie ","Can ","Dan ","Guan ","Duo ","Nao ","Yun ","Xiang ","Zhui ","Die ","Huang ","Chun ","Qiong ","Re ","Xing ","Ce ","Bian ","Hun ","Zong ","Ti " ];

},{}],65:[function(require,module,exports){
module.exports = [ "Qiao ","Chou ","Bei ","Xuan ","Wei ","Ge ","Qian ","Wei ","Yu ","Yu ","Bi ","Xuan ","Huan ","Min ","Bi ","Yi ","Mian ","Yong ","Kai ","Dang ","Yin ","E ","Chen ","Mou ","Ke ","Ke ","Yu ","Ai ","Qie ","Yan ","Nuo ","Gan ","Yun ","Zong ","Sai ","Leng ","Fen ","[?] ","Kui ","Kui ","Que ","Gong ","Yun ","Su ","Su ","Qi ","Yao ","Song ","Huang ","Ji ","Gu ","Ju ","Chuang ","Ni ","Xie ","Kai ","Zheng ","Yong ","Cao ","Sun ","Shen ","Bo ","Kai ","Yuan ","Xie ","Hun ","Yong ","Yang ","Li ","Sao ","Tao ","Yin ","Ci ","Xu ","Qian ","Tai ","Huang ","Yun ","Shen ","Ming ","[?] ","She ","Cong ","Piao ","Mo ","Mu ","Guo ","Chi ","Can ","Can ","Can ","Cui ","Min ","Te ","Zhang ","Tong ","Ao ","Shuang ","Man ","Guan ","Que ","Zao ","Jiu ","Hui ","Kai ","Lian ","Ou ","Song ","Jin ","Yin ","Lu ","Shang ","Wei ","Tuan ","Man ","Qian ","She ","Yong ","Qing ","Kang ","Di ","Zhi ","Lou ","Juan ","Qi ","Qi ","Yu ","Ping ","Liao ","Cong ","You ","Chong ","Zhi ","Tong ","Cheng ","Qi ","Qu ","Peng ","Bei ","Bie ","Chun ","Jiao ","Zeng ","Chi ","Lian ","Ping ","Kui ","Hui ","Qiao ","Cheng ","Yin ","Yin ","Xi ","Xi ","Dan ","Tan ","Duo ","Dui ","Dui ","Su ","Jue ","Ce ","Xiao ","Fan ","Fen ","Lao ","Lao ","Chong ","Han ","Qi ","Xian ","Min ","Jing ","Liao ","Wu ","Can ","Jue ","Cu ","Xian ","Tan ","Sheng ","Pi ","Yi ","Chu ","Xian ","Nao ","Dan ","Tan ","Jing ","Song ","Han ","Jiao ","Wai ","Huan ","Dong ","Qin ","Qin ","Qu ","Cao ","Ken ","Xie ","Ying ","Ao ","Mao ","Yi ","Lin ","Se ","Jun ","Huai ","Men ","Lan ","Ai ","Lin ","Yan ","Gua ","Xia ","Chi ","Yu ","Yin ","Dai ","Meng ","Ai ","Meng ","Dui ","Qi ","Mo ","Lan ","Men ","Chou ","Zhi ","Nuo ","Nuo ","Yan ","Yang ","Bo ","Zhi ","Kuang ","Kuang ","You ","Fu ","Liu ","Mie ","Cheng ","[?] ","Chan ","Meng ","Lan ","Huai ","Xuan ","Rang ","Chan ","Ji ","Ju ","Huan ","She ","Yi " ];

},{}],66:[function(require,module,exports){
module.exports = [ "Lian ","Nan ","Mi ","Tang ","Jue ","Gang ","Gang ","Gang ","Ge ","Yue ","Wu ","Jian ","Xu ","Shu ","Rong ","Xi ","Cheng ","Wo ","Jie ","Ge ","Jian ","Qiang ","Huo ","Qiang ","Zhan ","Dong ","Qi ","Jia ","Die ","Zei ","Jia ","Ji ","Shi ","Kan ","Ji ","Kui ","Gai ","Deng ","Zhan ","Chuang ","Ge ","Jian ","Jie ","Yu ","Jian ","Yan ","Lu ","Xi ","Zhan ","Xi ","Xi ","Chuo ","Dai ","Qu ","Hu ","Hu ","Hu ","E ","Shi ","Li ","Mao ","Hu ","Li ","Fang ","Suo ","Bian ","Dian ","Jiong ","Shang ","Yi ","Yi ","Shan ","Hu ","Fei ","Yan ","Shou ","T ","Cai ","Zha ","Qiu ","Le ","Bu ","Ba ","Da ","Reng ","Fu ","Hameru ","Zai ","Tuo ","Zhang ","Diao ","Kang ","Yu ","Ku ","Han ","Shen ","Cha ","Yi ","Gu ","Kou ","Wu ","Tuo ","Qian ","Zhi ","Ren ","Kuo ","Men ","Sao ","Yang ","Niu ","Ban ","Che ","Rao ","Xi ","Qian ","Ban ","Jia ","Yu ","Fu ","Ao ","Xi ","Pi ","Zhi ","Zi ","E ","Dun ","Zhao ","Cheng ","Ji ","Yan ","Kuang ","Bian ","Chao ","Ju ","Wen ","Hu ","Yue ","Jue ","Ba ","Qin ","Zhen ","Zheng ","Yun ","Wan ","Nu ","Yi ","Shu ","Zhua ","Pou ","Tou ","Dou ","Kang ","Zhe ","Pou ","Fu ","Pao ","Ba ","Ao ","Ze ","Tuan ","Kou ","Lun ","Qiang ","[?] ","Hu ","Bao ","Bing ","Zhi ","Peng ","Tan ","Pu ","Pi ","Tai ","Yao ","Zhen ","Zha ","Yang ","Bao ","He ","Ni ","Yi ","Di ","Chi ","Pi ","Za ","Mo ","Mo ","Shen ","Ya ","Chou ","Qu ","Min ","Chu ","Jia ","Fu ","Zhan ","Zhu ","Dan ","Chai ","Mu ","Nian ","La ","Fu ","Pao ","Ban ","Pai ","Ling ","Na ","Guai ","Qian ","Ju ","Tuo ","Ba ","Tuo ","Tuo ","Ao ","Ju ","Zhuo ","Pan ","Zhao ","Bai ","Bai ","Di ","Ni ","Ju ","Kuo ","Long ","Jian ","[?] ","Yong ","Lan ","Ning ","Bo ","Ze ","Qian ","Hen ","Gua ","Shi ","Jie ","Zheng ","Nin ","Gong ","Gong ","Quan ","Shuan ","Cun ","Zan ","Kao ","Chi ","Xie ","Ce ","Hui ","Pin ","Zhuai ","Shi ","Na " ];

},{}],67:[function(require,module,exports){
module.exports = [ "Bo ","Chi ","Gua ","Zhi ","Kuo ","Duo ","Duo ","Zhi ","Qie ","An ","Nong ","Zhen ","Ge ","Jiao ","Ku ","Dong ","Ru ","Tiao ","Lie ","Zha ","Lu ","Die ","Wa ","Jue ","Mushiru ","Ju ","Zhi ","Luan ","Ya ","Zhua ","Ta ","Xie ","Nao ","Dang ","Jiao ","Zheng ","Ji ","Hui ","Xun ","Ku ","Ai ","Tuo ","Nuo ","Cuo ","Bo ","Geng ","Ti ","Zhen ","Cheng ","Suo ","Suo ","Keng ","Mei ","Long ","Ju ","Peng ","Jian ","Yi ","Ting ","Shan ","Nuo ","Wan ","Xie ","Cha ","Feng ","Jiao ","Wu ","Jun ","Jiu ","Tong ","Kun ","Huo ","Tu ","Zhuo ","Pou ","Le ","Ba ","Han ","Shao ","Nie ","Juan ","Ze ","Song ","Ye ","Jue ","Bu ","Huan ","Bu ","Zun ","Yi ","Zhai ","Lu ","Sou ","Tuo ","Lao ","Sun ","Bang ","Jian ","Huan ","Dao ","[?] ","Wan ","Qin ","Peng ","She ","Lie ","Min ","Men ","Fu ","Bai ","Ju ","Dao ","Wo ","Ai ","Juan ","Yue ","Zong ","Chen ","Chui ","Jie ","Tu ","Ben ","Na ","Nian ","Nuo ","Zu ","Wo ","Xi ","Xian ","Cheng ","Dian ","Sao ","Lun ","Qing ","Gang ","Duo ","Shou ","Diao ","Pou ","Di ","Zhang ","Gun ","Ji ","Tao ","Qia ","Qi ","Pai ","Shu ","Qian ","Ling ","Yi ","Ya ","Jue ","Zheng ","Liang ","Gua ","Yi ","Huo ","Shan ","Zheng ","Lue ","Cai ","Tan ","Che ","Bing ","Jie ","Ti ","Kong ","Tui ","Yan ","Cuo ","Zou ","Ju ","Tian ","Qian ","Ken ","Bai ","Shou ","Jie ","Lu ","Guo ","Haba ","[?] ","Zhi ","Dan ","Mang ","Xian ","Sao ","Guan ","Peng ","Yuan ","Nuo ","Jian ","Zhen ","Jiu ","Jian ","Yu ","Yan ","Kui ","Nan ","Hong ","Rou ","Pi ","Wei ","Sai ","Zou ","Xuan ","Miao ","Ti ","Nie ","Cha ","Shi ","Zong ","Zhen ","Yi ","Shun ","Heng ","Bian ","Yang ","Huan ","Yan ","Zuan ","An ","Xu ","Ya ","Wo ","Ke ","Chuai ","Ji ","Ti ","La ","La ","Cheng ","Kai ","Jiu ","Jiu ","Tu ","Jie ","Hui ","Geng ","Chong ","Shuo ","She ","Xie ","Yuan ","Qian ","Ye ","Cha ","Zha ","Bei ","Yao ","[?] ","[?] ","Lan ","Wen ","Qin " ];

},{}],68:[function(require,module,exports){
module.exports = [ "Chan ","Ge ","Lou ","Zong ","Geng ","Jiao ","Gou ","Qin ","Yong ","Que ","Chou ","Chi ","Zhan ","Sun ","Sun ","Bo ","Chu ","Rong ","Beng ","Cuo ","Sao ","Ke ","Yao ","Dao ","Zhi ","Nu ","Xie ","Jian ","Sou ","Qiu ","Gao ","Xian ","Shuo ","Sang ","Jin ","Mie ","E ","Chui ","Nuo ","Shan ","Ta ","Jie ","Tang ","Pan ","Ban ","Da ","Li ","Tao ","Hu ","Zhi ","Wa ","Xia ","Qian ","Wen ","Qiang ","Tian ","Zhen ","E ","Xi ","Nuo ","Quan ","Cha ","Zha ","Ge ","Wu ","En ","She ","Kang ","She ","Shu ","Bai ","Yao ","Bin ","Sou ","Tan ","Sa ","Chan ","Suo ","Liao ","Chong ","Chuang ","Guo ","Bing ","Feng ","Shuai ","Di ","Qi ","Sou ","Zhai ","Lian ","Tang ","Chi ","Guan ","Lu ","Luo ","Lou ","Zong ","Gai ","Hu ","Zha ","Chuang ","Tang ","Hua ","Cui ","Nai ","Mo ","Jiang ","Gui ","Ying ","Zhi ","Ao ","Zhi ","Nie ","Man ","Shan ","Kou ","Shu ","Suo ","Tuan ","Jiao ","Mo ","Mo ","Zhe ","Xian ","Keng ","Piao ","Jiang ","Yin ","Gou ","Qian ","Lue ","Ji ","Ying ","Jue ","Pie ","Pie ","Lao ","Dun ","Xian ","Ruan ","Kui ","Zan ","Yi ","Xun ","Cheng ","Cheng ","Sa ","Nao ","Heng ","Si ","Qian ","Huang ","Da ","Zun ","Nian ","Lin ","Zheng ","Hui ","Zhuang ","Jiao ","Ji ","Cao ","Dan ","Dan ","Che ","Bo ","Che ","Jue ","Xiao ","Liao ","Ben ","Fu ","Qiao ","Bo ","Cuo ","Zhuo ","Zhuan ","Tuo ","Pu ","Qin ","Dun ","Nian ","[?] ","Xie ","Lu ","Jiao ","Cuan ","Ta ","Han ","Qiao ","Zhua ","Jian ","Gan ","Yong ","Lei ","Kuo ","Lu ","Shan ","Zhuo ","Ze ","Pu ","Chuo ","Ji ","Dang ","Suo ","Cao ","Qing ","Jing ","Huan ","Jie ","Qin ","Kuai ","Dan ","Xi ","Ge ","Pi ","Bo ","Ao ","Ju ","Ye ","[?] ","Mang ","Sou ","Mi ","Ji ","Tai ","Zhuo ","Dao ","Xing ","Lan ","Ca ","Ju ","Ye ","Ru ","Ye ","Ye ","Ni ","Hu ","Ji ","Bin ","Ning ","Ge ","Zhi ","Jie ","Kuo ","Mo ","Jian ","Xie ","Lie ","Tan ","Bai ","Sou ","Lu ","Lue ","Rao ","Zhi " ];

},{}],69:[function(require,module,exports){
module.exports = [ "Pan ","Yang ","Lei ","Sa ","Shu ","Zan ","Nian ","Xian ","Jun ","Huo ","Li ","La ","Han ","Ying ","Lu ","Long ","Qian ","Qian ","Zan ","Qian ","Lan ","San ","Ying ","Mei ","Rang ","Chan ","[?] ","Cuan ","Xi ","She ","Luo ","Jun ","Mi ","Li ","Zan ","Luan ","Tan ","Zuan ","Li ","Dian ","Wa ","Dang ","Jiao ","Jue ","Lan ","Li ","Nang ","Zhi ","Gui ","Gui ","Qi ","Xin ","Pu ","Sui ","Shou ","Kao ","You ","Gai ","Yi ","Gong ","Gan ","Ban ","Fang ","Zheng ","Bo ","Dian ","Kou ","Min ","Wu ","Gu ","He ","Ce ","Xiao ","Mi ","Chu ","Ge ","Di ","Xu ","Jiao ","Min ","Chen ","Jiu ","Zhen ","Duo ","Yu ","Chi ","Ao ","Bai ","Xu ","Jiao ","Duo ","Lian ","Nie ","Bi ","Chang ","Dian ","Duo ","Yi ","Gan ","San ","Ke ","Yan ","Dun ","Qi ","Dou ","Xiao ","Duo ","Jiao ","Jing ","Yang ","Xia ","Min ","Shu ","Ai ","Qiao ","Ai ","Zheng ","Di ","Zhen ","Fu ","Shu ","Liao ","Qu ","Xiong ","Xi ","Jiao ","Sen ","Jiao ","Zhuo ","Yi ","Lian ","Bi ","Li ","Xiao ","Xiao ","Wen ","Xue ","Qi ","Qi ","Zhai ","Bin ","Jue ","Zhai ","[?] ","Fei ","Ban ","Ban ","Lan ","Yu ","Lan ","Wei ","Dou ","Sheng ","Liao ","Jia ","Hu ","Xie ","Jia ","Yu ","Zhen ","Jiao ","Wo ","Tou ","Chu ","Jin ","Chi ","Yin ","Fu ","Qiang ","Zhan ","Qu ","Zhuo ","Zhan ","Duan ","Zhuo ","Si ","Xin ","Zhuo ","Zhuo ","Qin ","Lin ","Zhuo ","Chu ","Duan ","Zhu ","Fang ","Xie ","Hang ","Yu ","Shi ","Pei ","You ","Mye ","Pang ","Qi ","Zhan ","Mao ","Lu ","Pei ","Pi ","Liu ","Fu ","Fang ","Xuan ","Jing ","Jing ","Ni ","Zu ","Zhao ","Yi ","Liu ","Shao ","Jian ","Es ","Yi ","Qi ","Zhi ","Fan ","Piao ","Fan ","Zhan ","Guai ","Sui ","Yu ","Wu ","Ji ","Ji ","Ji ","Huo ","Ri ","Dan ","Jiu ","Zhi ","Zao ","Xie ","Tiao ","Xun ","Xu ","Xu ","Xu ","Gan ","Han ","Tai ","Di ","Xu ","Chan ","Shi ","Kuang ","Yang ","Shi ","Wang ","Min ","Min ","Tun ","Chun ","Wu " ];

},{}],70:[function(require,module,exports){
module.exports = [ "Yun ","Bei ","Ang ","Ze ","Ban ","Jie ","Kun ","Sheng ","Hu ","Fang ","Hao ","Gui ","Chang ","Xuan ","Ming ","Hun ","Fen ","Qin ","Hu ","Yi ","Xi ","Xin ","Yan ","Ze ","Fang ","Tan ","Shen ","Ju ","Yang ","Zan ","Bing ","Xing ","Ying ","Xuan ","Pei ","Zhen ","Ling ","Chun ","Hao ","Mei ","Zuo ","Mo ","Bian ","Xu ","Hun ","Zhao ","Zong ","Shi ","Shi ","Yu ","Fei ","Die ","Mao ","Ni ","Chang ","Wen ","Dong ","Ai ","Bing ","Ang ","Zhou ","Long ","Xian ","Kuang ","Tiao ","Chao ","Shi ","Huang ","Huang ","Xuan ","Kui ","Xu ","Jiao ","Jin ","Zhi ","Jin ","Shang ","Tong ","Hong ","Yan ","Gai ","Xiang ","Shai ","Xiao ","Ye ","Yun ","Hui ","Han ","Han ","Jun ","Wan ","Xian ","Kun ","Zhou ","Xi ","Cheng ","Sheng ","Bu ","Zhe ","Zhe ","Wu ","Han ","Hui ","Hao ","Chen ","Wan ","Tian ","Zhuo ","Zui ","Zhou ","Pu ","Jing ","Xi ","Shan ","Yi ","Xi ","Qing ","Qi ","Jing ","Gui ","Zhen ","Yi ","Zhi ","An ","Wan ","Lin ","Liang ","Chang ","Wang ","Xiao ","Zan ","Hi ","Xuan ","Xuan ","Yi ","Xia ","Yun ","Hui ","Fu ","Min ","Kui ","He ","Ying ","Du ","Wei ","Shu ","Qing ","Mao ","Nan ","Jian ","Nuan ","An ","Yang ","Chun ","Yao ","Suo ","Jin ","Ming ","Jiao ","Kai ","Gao ","Weng ","Chang ","Qi ","Hao ","Yan ","Li ","Ai ","Ji ","Gui ","Men ","Zan ","Xie ","Hao ","Mu ","Mo ","Cong ","Ni ","Zhang ","Hui ","Bao ","Han ","Xuan ","Chuan ","Liao ","Xian ","Dan ","Jing ","Pie ","Lin ","Tun ","Xi ","Yi ","Ji ","Huang ","Tai ","Ye ","Ye ","Li ","Tan ","Tong ","Xiao ","Fei ","Qin ","Zhao ","Hao ","Yi ","Xiang ","Xing ","Sen ","Jiao ","Bao ","Jing ","Yian ","Ai ","Ye ","Ru ","Shu ","Meng ","Xun ","Yao ","Pu ","Li ","Chen ","Kuang ","Die ","[?] ","Yan ","Huo ","Lu ","Xi ","Rong ","Long ","Nang ","Luo ","Luan ","Shai ","Tang ","Yan ","Chu ","Yue ","Yue ","Qu ","Yi ","Geng ","Ye ","Hu ","He ","Shu ","Cao ","Cao ","Noboru ","Man ","Ceng ","Ceng ","Ti " ];

},{}],71:[function(require,module,exports){
module.exports = [ "Zui ","Can ","Xu ","Hui ","Yin ","Qie ","Fen ","Pi ","Yue ","You ","Ruan ","Peng ","Ban ","Fu ","Ling ","Fei ","Qu ","[?] ","Nu ","Tiao ","Shuo ","Zhen ","Lang ","Lang ","Juan ","Ming ","Huang ","Wang ","Tun ","Zhao ","Ji ","Qi ","Ying ","Zong ","Wang ","Tong ","Lang ","[?] ","Meng ","Long ","Mu ","Deng ","Wei ","Mo ","Ben ","Zha ","Zhu ","Zhu ","[?] ","Zhu ","Ren ","Ba ","Po ","Duo ","Duo ","Dao ","Li ","Qiu ","Ji ","Jiu ","Bi ","Xiu ","Ting ","Ci ","Sha ","Eburi ","Za ","Quan ","Qian ","Yu ","Gan ","Wu ","Cha ","Shan ","Xun ","Fan ","Wu ","Zi ","Li ","Xing ","Cai ","Cun ","Ren ","Shao ","Tuo ","Di ","Zhang ","Mang ","Chi ","Yi ","Gu ","Gong ","Du ","Yi ","Qi ","Shu ","Gang ","Tiao ","Moku ","Soma ","Tochi ","Lai ","Sugi ","Mang ","Yang ","Ma ","Miao ","Si ","Yuan ","Hang ","Fei ","Bei ","Jie ","Dong ","Gao ","Yao ","Xian ","Chu ","Qun ","Pa ","Shu ","Hua ","Xin ","Chou ","Zhu ","Chou ","Song ","Ban ","Song ","Ji ","Yue ","Jin ","Gou ","Ji ","Mao ","Pi ","Bi ","Wang ","Ang ","Fang ","Fen ","Yi ","Fu ","Nan ","Xi ","Hu ","Ya ","Dou ","Xun ","Zhen ","Yao ","Lin ","Rui ","E ","Mei ","Zhao ","Guo ","Zhi ","Cong ","Yun ","Waku ","Dou ","Shu ","Zao ","[?] ","Li ","Haze ","Jian ","Cheng ","Matsu ","Qiang ","Feng ","Nan ","Xiao ","Xian ","Ku ","Ping ","Yi ","Xi ","Zhi ","Guai ","Xiao ","Jia ","Jia ","Gou ","Fu ","Mo ","Yi ","Ye ","Ye ","Shi ","Nie ","Bi ","Duo ","Yi ","Ling ","Bing ","Ni ","La ","He ","Pan ","Fan ","Zhong ","Dai ","Ci ","Yang ","Fu ","Bo ","Mou ","Gan ","Qi ","Ran ","Rou ","Mao ","Zhao ","Song ","Zhe ","Xia ","You ","Shen ","Ju ","Tuo ","Zuo ","Nan ","Ning ","Yong ","Di ","Zhi ","Zha ","Cha ","Dan ","Gu ","Pu ","Jiu ","Ao ","Fu ","Jian ","Bo ","Duo ","Ke ","Nai ","Zhu ","Bi ","Liu ","Chai ","Zha ","Si ","Zhu ","Pei ","Shi ","Guai ","Cha ","Yao ","Jue ","Jiu ","Shi " ];

},{}],72:[function(require,module,exports){
module.exports = [ "Zhi ","Liu ","Mei ","Hoy ","Rong ","Zha ","[?] ","Biao ","Zhan ","Jie ","Long ","Dong ","Lu ","Sayng ","Li ","Lan ","Yong ","Shu ","Xun ","Shuan ","Qi ","Zhen ","Qi ","Li ","Yi ","Xiang ","Zhen ","Li ","Su ","Gua ","Kan ","Bing ","Ren ","Xiao ","Bo ","Ren ","Bing ","Zi ","Chou ","Yi ","Jie ","Xu ","Zhu ","Jian ","Zui ","Er ","Er ","You ","Fa ","Gong ","Kao ","Lao ","Zhan ","Li ","Yin ","Yang ","He ","Gen ","Zhi ","Chi ","Ge ","Zai ","Luan ","Fu ","Jie ","Hang ","Gui ","Tao ","Guang ","Wei ","Kuang ","Ru ","An ","An ","Juan ","Yi ","Zhuo ","Ku ","Zhi ","Qiong ","Tong ","Sang ","Sang ","Huan ","Jie ","Jiu ","Xue ","Duo ","Zhui ","Yu ","Zan ","Kasei ","Ying ","Masu ","[?] ","Zhan ","Ya ","Nao ","Zhen ","Dang ","Qi ","Qiao ","Hua ","Kuai ","Jiang ","Zhuang ","Xun ","Suo ","Sha ","Zhen ","Bei ","Ting ","Gua ","Jing ","Bo ","Ben ","Fu ","Rui ","Tong ","Jue ","Xi ","Lang ","Liu ","Feng ","Qi ","Wen ","Jun ","Gan ","Cu ","Liang ","Qiu ","Ting ","You ","Mei ","Bang ","Long ","Peng ","Zhuang ","Di ","Xuan ","Tu ","Zao ","Ao ","Gu ","Bi ","Di ","Han ","Zi ","Zhi ","Ren ","Bei ","Geng ","Jian ","Huan ","Wan ","Nuo ","Jia ","Tiao ","Ji ","Xiao ","Lu ","Huan ","Shao ","Cen ","Fen ","Song ","Meng ","Wu ","Li ","Li ","Dou ","Cen ","Ying ","Suo ","Ju ","Ti ","Jie ","Kun ","Zhuo ","Shu ","Chan ","Fan ","Wei ","Jing ","Li ","Bing ","Fumoto ","Shikimi ","Tao ","Zhi ","Lai ","Lian ","Jian ","Zhuo ","Ling ","Li ","Qi ","Bing ","Zhun ","Cong ","Qian ","Mian ","Qi ","Qi ","Cai ","Gun ","Chan ","Te ","Fei ","Pai ","Bang ","Pou ","Hun ","Zong ","Cheng ","Zao ","Ji ","Li ","Peng ","Yu ","Yu ","Gu ","Hun ","Dong ","Tang ","Gang ","Wang ","Di ","Xi ","Fan ","Cheng ","Zhan ","Qi ","Yuan ","Yan ","Yu ","Quan ","Yi ","Sen ","Ren ","Chui ","Leng ","Qi ","Zhuo ","Fu ","Ke ","Lai ","Zou ","Zou ","Zhuo ","Guan ","Fen ","Fen ","Chen ","Qiong ","Nie " ];

},{}],73:[function(require,module,exports){
module.exports = [ "Wan ","Guo ","Lu ","Hao ","Jie ","Yi ","Chou ","Ju ","Ju ","Cheng ","Zuo ","Liang ","Qiang ","Zhi ","Zhui ","Ya ","Ju ","Bei ","Jiao ","Zhuo ","Zi ","Bin ","Peng ","Ding ","Chu ","Chang ","Kunugi ","Momiji ","Jian ","Gui ","Xi ","Du ","Qian ","Kunugi ","Soko ","Shide ","Luo ","Zhi ","Ken ","Myeng ","Tafu ","[?] ","Peng ","Zhan ","[?] ","Tuo ","Sen ","Duo ","Ye ","Fou ","Wei ","Wei ","Duan ","Jia ","Zong ","Jian ","Yi ","Shen ","Xi ","Yan ","Yan ","Chuan ","Zhan ","Chun ","Yu ","He ","Zha ","Wo ","Pian ","Bi ","Yao ","Huo ","Xu ","Ruo ","Yang ","La ","Yan ","Ben ","Hun ","Kui ","Jie ","Kui ","Si ","Feng ","Xie ","Tuo ","Zhi ","Jian ","Mu ","Mao ","Chu ","Hu ","Hu ","Lian ","Leng ","Ting ","Nan ","Yu ","You ","Mei ","Song ","Xuan ","Xuan ","Ying ","Zhen ","Pian ","Ye ","Ji ","Jie ","Ye ","Chu ","Shun ","Yu ","Cou ","Wei ","Mei ","Di ","Ji ","Jie ","Kai ","Qiu ","Ying ","Rou ","Heng ","Lou ","Le ","Hazou ","Katsura ","Pin ","Muro ","Gai ","Tan ","Lan ","Yun ","Yu ","Chen ","Lu ","Ju ","Sakaki ","[?] ","Pi ","Xie ","Jia ","Yi ","Zhan ","Fu ","Nai ","Mi ","Lang ","Rong ","Gu ","Jian ","Ju ","Ta ","Yao ","Zhen ","Bang ","Sha ","Yuan ","Zi ","Ming ","Su ","Jia ","Yao ","Jie ","Huang ","Gan ","Fei ","Zha ","Qian ","Ma ","Sun ","Yuan ","Xie ","Rong ","Shi ","Zhi ","Cui ","Yun ","Ting ","Liu ","Rong ","Tang ","Que ","Zhai ","Si ","Sheng ","Ta ","Ke ","Xi ","Gu ","Qi ","Kao ","Gao ","Sun ","Pan ","Tao ","Ge ","Xun ","Dian ","Nou ","Ji ","Shuo ","Gou ","Chui ","Qiang ","Cha ","Qian ","Huai ","Mei ","Xu ","Gang ","Gao ","Zhuo ","Tuo ","Hashi ","Yang ","Dian ","Jia ","Jian ","Zui ","Kashi ","Ori ","Bin ","Zhu ","[?] ","Xi ","Qi ","Lian ","Hui ","Yong ","Qian ","Guo ","Gai ","Gai ","Tuan ","Hua ","Cu ","Sen ","Cui ","Beng ","You ","Hu ","Jiang ","Hu ","Huan ","Kui ","Yi ","Nie ","Gao ","Kang ","Gui ","Gui ","Cao ","Man ","Jin " ];

},{}],74:[function(require,module,exports){
module.exports = [ "Di ","Zhuang ","Le ","Lang ","Chen ","Cong ","Li ","Xiu ","Qing ","Shuang ","Fan ","Tong ","Guan ","Ji ","Suo ","Lei ","Lu ","Liang ","Mi ","Lou ","Chao ","Su ","Ke ","Shu ","Tang ","Biao ","Lu ","Jiu ","Shu ","Zha ","Shu ","Zhang ","Men ","Mo ","Niao ","Yang ","Tiao ","Peng ","Zhu ","Sha ","Xi ","Quan ","Heng ","Jian ","Cong ","[?] ","Hokuso ","Qiang ","Tara ","Ying ","Er ","Xin ","Zhi ","Qiao ","Zui ","Cong ","Pu ","Shu ","Hua ","Kui ","Zhen ","Zun ","Yue ","Zhan ","Xi ","Xun ","Dian ","Fa ","Gan ","Mo ","Wu ","Qiao ","Nao ","Lin ","Liu ","Qiao ","Xian ","Run ","Fan ","Zhan ","Tuo ","Lao ","Yun ","Shun ","Tui ","Cheng ","Tang ","Meng ","Ju ","Cheng ","Su ","Jue ","Jue ","Tan ","Hui ","Ji ","Nuo ","Xiang ","Tuo ","Ning ","Rui ","Zhu ","Chuang ","Zeng ","Fen ","Qiong ","Ran ","Heng ","Cen ","Gu ","Liu ","Lao ","Gao ","Chu ","Zusa ","Nude ","Ca ","San ","Ji ","Dou ","Shou ","Lu ","[?] ","[?] ","Yuan ","Ta ","Shu ","Jiang ","Tan ","Lin ","Nong ","Yin ","Xi ","Sui ","Shan ","Zui ","Xuan ","Cheng ","Gan ","Ju ","Zui ","Yi ","Qin ","Pu ","Yan ","Lei ","Feng ","Hui ","Dang ","Ji ","Sui ","Bo ","Bi ","Ding ","Chu ","Zhua ","Kuai ","Ji ","Jie ","Jia ","Qing ","Zhe ","Jian ","Qiang ","Dao ","Yi ","Biao ","Song ","She ","Lin ","Kunugi ","Cha ","Meng ","Yin ","Tao ","Tai ","Mian ","Qi ","Toan ","Bin ","Huo ","Ji ","Qian ","Mi ","Ning ","Yi ","Gao ","Jian ","Yin ","Er ","Qing ","Yan ","Qi ","Mi ","Zhao ","Gui ","Chun ","Ji ","Kui ","Po ","Deng ","Chu ","[?] ","Mian ","You ","Zhi ","Guang ","Qian ","Lei ","Lei ","Sa ","Lu ","Li ","Cuan ","Lu ","Mie ","Hui ","Ou ","Lu ","Jie ","Gao ","Du ","Yuan ","Li ","Fei ","Zhuo ","Sou ","Lian ","Tamo ","Chu ","[?] ","Zhu ","Lu ","Yan ","Li ","Zhu ","Chen ","Jie ","E ","Su ","Huai ","Nie ","Yu ","Long ","Lai ","[?] ","Xian ","Kwi ","Ju ","Xiao ","Ling ","Ying ","Jian ","Yin ","You ","Ying " ];

},{}],75:[function(require,module,exports){
module.exports = [ "Xiang ","Nong ","Bo ","Chan ","Lan ","Ju ","Shuang ","She ","Wei ","Cong ","Quan ","Qu ","Cang ","[?] ","Yu ","Luo ","Li ","Zan ","Luan ","Dang ","Jue ","Em ","Lan ","Lan ","Zhu ","Lei ","Li ","Ba ","Nang ","Yu ","Ling ","Tsuki ","Qian ","Ci ","Huan ","Xin ","Yu ","Yu ","Qian ","Ou ","Xu ","Chao ","Chu ","Chi ","Kai ","Yi ","Jue ","Xi ","Xu ","Xia ","Yu ","Kuai ","Lang ","Kuan ","Shuo ","Xi ","Ai ","Yi ","Qi ","Hu ","Chi ","Qin ","Kuan ","Kan ","Kuan ","Kan ","Chuan ","Sha ","Gua ","Yin ","Xin ","Xie ","Yu ","Qian ","Xiao ","Yi ","Ge ","Wu ","Tan ","Jin ","Ou ","Hu ","Ti ","Huan ","Xu ","Pen ","Xi ","Xiao ","Xu ","Xi ","Sen ","Lian ","Chu ","Yi ","Kan ","Yu ","Chuo ","Huan ","Zhi ","Zheng ","Ci ","Bu ","Wu ","Qi ","Bu ","Bu ","Wai ","Ju ","Qian ","Chi ","Se ","Chi ","Se ","Zhong ","Sui ","Sui ","Li ","Cuo ","Yu ","Li ","Gui ","Dai ","Dai ","Si ","Jian ","Zhe ","Mo ","Mo ","Yao ","Mo ","Cu ","Yang ","Tian ","Sheng ","Dai ","Shang ","Xu ","Xun ","Shu ","Can ","Jue ","Piao ","Qia ","Qiu ","Su ","Qing ","Yun ","Lian ","Yi ","Fou ","Zhi ","Ye ","Can ","Hun ","Dan ","Ji ","Ye ","Zhen ","Yun ","Wen ","Chou ","Bin ","Ti ","Jin ","Shang ","Yin ","Diao ","Cu ","Hui ","Cuan ","Yi ","Dan ","Du ","Jiang ","Lian ","Bin ","Du ","Tsukusu ","Jian ","Shu ","Ou ","Duan ","Zhu ","Yin ","Qing ","Yi ","Sha ","Que ","Ke ","Yao ","Jun ","Dian ","Hui ","Hui ","Gu ","Que ","Ji ","Yi ","Ou ","Hui ","Duan ","Yi ","Xiao ","Wu ","Guan ","Mu ","Mei ","Mei ","Ai ","Zuo ","Du ","Yu ","Bi ","Bi ","Bi ","Pi ","Pi ","Bi ","Chan ","Mao ","[?] ","[?] ","Pu ","Mushiru ","Jia ","Zhan ","Sai ","Mu ","Tuo ","Xun ","Er ","Rong ","Xian ","Ju ","Mu ","Hao ","Qiu ","Dou ","Mushiru ","Tan ","Pei ","Ju ","Duo ","Cui ","Bi ","San ","[?] ","Mao ","Sui ","Yu ","Yu ","Tuo ","He ","Jian ","Ta ","San " ];

},{}],76:[function(require,module,exports){
module.exports = [ "Lu ","Mu ","Li ","Tong ","Rong ","Chang ","Pu ","Luo ","Zhan ","Sao ","Zhan ","Meng ","Luo ","Qu ","Die ","Shi ","Di ","Min ","Jue ","Mang ","Qi ","Pie ","Nai ","Qi ","Dao ","Xian ","Chuan ","Fen ","Ri ","Nei ","[?] ","Fu ","Shen ","Dong ","Qing ","Qi ","Yin ","Xi ","Hai ","Yang ","An ","Ya ","Ke ","Qing ","Ya ","Dong ","Dan ","Lu ","Qing ","Yang ","Yun ","Yun ","Shui ","San ","Zheng ","Bing ","Yong ","Dang ","Shitamizu ","Le ","Ni ","Tun ","Fan ","Gui ","Ting ","Zhi ","Qiu ","Bin ","Ze ","Mian ","Cuan ","Hui ","Diao ","Yi ","Cha ","Zhuo ","Chuan ","Wan ","Fan ","Dai ","Xi ","Tuo ","Mang ","Qiu ","Qi ","Shan ","Pai ","Han ","Qian ","Wu ","Wu ","Xun ","Si ","Ru ","Gong ","Jiang ","Chi ","Wu ","Tsuchi ","[?] ","Tang ","Zhi ","Chi ","Qian ","Mi ","Yu ","Wang ","Qing ","Jing ","Rui ","Jun ","Hong ","Tai ","Quan ","Ji ","Bian ","Bian ","Gan ","Wen ","Zhong ","Fang ","Xiong ","Jue ","Hang ","Niou ","Qi ","Fen ","Xu ","Xu ","Qin ","Yi ","Wo ","Yun ","Yuan ","Hang ","Yan ","Chen ","Chen ","Dan ","You ","Dun ","Hu ","Huo ","Qie ","Mu ","Rou ","Mei ","Ta ","Mian ","Wu ","Chong ","Tian ","Bi ","Sha ","Zhi ","Pei ","Pan ","Zhui ","Za ","Gou ","Liu ","Mei ","Ze ","Feng ","Ou ","Li ","Lun ","Cang ","Feng ","Wei ","Hu ","Mo ","Mei ","Shu ","Ju ","Zan ","Tuo ","Tuo ","Tuo ","He ","Li ","Mi ","Yi ","Fa ","Fei ","You ","Tian ","Zhi ","Zhao ","Gu ","Zhan ","Yan ","Si ","Kuang ","Jiong ","Ju ","Xie ","Qiu ","Yi ","Jia ","Zhong ","Quan ","Bo ","Hui ","Mi ","Ben ","Zhuo ","Chu ","Le ","You ","Gu ","Hong ","Gan ","Fa ","Mao ","Si ","Hu ","Ping ","Ci ","Fan ","Chi ","Su ","Ning ","Cheng ","Ling ","Pao ","Bo ","Qi ","Si ","Ni ","Ju ","Yue ","Zhu ","Sheng ","Lei ","Xuan ","Xue ","Fu ","Pan ","Min ","Tai ","Yang ","Ji ","Yong ","Guan ","Beng ","Xue ","Long ","Lu ","[?] ","Bo ","Xie ","Po ","Ze ","Jing ","Yin " ];

},{}],77:[function(require,module,exports){
module.exports = [ "Zhou ","Ji ","Yi ","Hui ","Hui ","Zui ","Cheng ","Yin ","Wei ","Hou ","Jian ","Yang ","Lie ","Si ","Ji ","Er ","Xing ","Fu ","Sa ","Suo ","Zhi ","Yin ","Wu ","Xi ","Kao ","Zhu ","Jiang ","Luo ","[?] ","An ","Dong ","Yi ","Mou ","Lei ","Yi ","Mi ","Quan ","Jin ","Mo ","Wei ","Xiao ","Xie ","Hong ","Xu ","Shuo ","Kuang ","Tao ","Qie ","Ju ","Er ","Zhou ","Ru ","Ping ","Xun ","Xiong ","Zhi ","Guang ","Huan ","Ming ","Huo ","Wa ","Qia ","Pai ","Wu ","Qu ","Liu ","Yi ","Jia ","Jing ","Qian ","Jiang ","Jiao ","Cheng ","Shi ","Zhuo ","Ce ","Pal ","Kuai ","Ji ","Liu ","Chan ","Hun ","Hu ","Nong ","Xun ","Jin ","Lie ","Qiu ","Wei ","Zhe ","Jun ","Han ","Bang ","Mang ","Zhuo ","You ","Xi ","Bo ","Dou ","Wan ","Hong ","Yi ","Pu ","Ying ","Lan ","Hao ","Lang ","Han ","Li ","Geng ","Fu ","Wu ","Lian ","Chun ","Feng ","Yi ","Yu ","Tong ","Lao ","Hai ","Jin ","Jia ","Chong ","Weng ","Mei ","Sui ","Cheng ","Pei ","Xian ","Shen ","Tu ","Kun ","Pin ","Nie ","Han ","Jing ","Xiao ","She ","Nian ","Tu ","Yong ","Xiao ","Xian ","Ting ","E ","Su ","Tun ","Juan ","Cen ","Ti ","Li ","Shui ","Si ","Lei ","Shui ","Tao ","Du ","Lao ","Lai ","Lian ","Wei ","Wo ","Yun ","Huan ","Di ","[?] ","Run ","Jian ","Zhang ","Se ","Fu ","Guan ","Xing ","Shou ","Shuan ","Ya ","Chuo ","Zhang ","Ye ","Kong ","Wo ","Han ","Tuo ","Dong ","He ","Wo ","Ju ","Gan ","Liang ","Hun ","Ta ","Zhuo ","Dian ","Qie ","De ","Juan ","Zi ","Xi ","Yao ","Qi ","Gu ","Guo ","Han ","Lin ","Tang ","Zhou ","Peng ","Hao ","Chang ","Shu ","Qi ","Fang ","Chi ","Lu ","Nao ","Ju ","Tao ","Cong ","Lei ","Zhi ","Peng ","Fei ","Song ","Tian ","Pi ","Dan ","Yu ","Ni ","Yu ","Lu ","Gan ","Mi ","Jing ","Ling ","Lun ","Yin ","Cui ","Qu ","Huai ","Yu ","Nian ","Shen ","Piao ","Chun ","Wa ","Yuan ","Lai ","Hun ","Qing ","Yan ","Qian ","Tian ","Miao ","Zhi ","Yin ","Mi " ];

},{}],78:[function(require,module,exports){
module.exports = [ "Ben ","Yuan ","Wen ","Re ","Fei ","Qing ","Yuan ","Ke ","Ji ","She ","Yuan ","Shibui ","Lu ","Zi ","Du ","[?] ","Jian ","Min ","Pi ","Tani ","Yu ","Yuan ","Shen ","Shen ","Rou ","Huan ","Zhu ","Jian ","Nuan ","Yu ","Qiu ","Ting ","Qu ","Du ","Feng ","Zha ","Bo ","Wo ","Wo ","Di ","Wei ","Wen ","Ru ","Xie ","Ce ","Wei ","Ge ","Gang ","Yan ","Hong ","Xuan ","Mi ","Ke ","Mao ","Ying ","Yan ","You ","Hong ","Miao ","Xing ","Mei ","Zai ","Hun ","Nai ","Kui ","Shi ","E ","Pai ","Mei ","Lian ","Qi ","Qi ","Mei ","Tian ","Cou ","Wei ","Can ","Tuan ","Mian ","Hui ","Mo ","Xu ","Ji ","Pen ","Jian ","Jian ","Hu ","Feng ","Xiang ","Yi ","Yin ","Zhan ","Shi ","Jie ","Cheng ","Huang ","Tan ","Yu ","Bi ","Min ","Shi ","Tu ","Sheng ","Yong ","Qu ","Zhong ","Suei ","Jiu ","Jiao ","Qiou ","Yin ","Tang ","Long ","Huo ","Yuan ","Nan ","Ban ","You ","Quan ","Chui ","Liang ","Chan ","Yan ","Chun ","Nie ","Zi ","Wan ","Shi ","Man ","Ying ","Ratsu ","Kui ","[?] ","Jian ","Xu ","Lu ","Gui ","Gai ","[?] ","[?] ","Po ","Jin ","Gui ","Tang ","Yuan ","Suo ","Yuan ","Lian ","Yao ","Meng ","Zhun ","Sheng ","Ke ","Tai ","Da ","Wa ","Liu ","Gou ","Sao ","Ming ","Zha ","Shi ","Yi ","Lun ","Ma ","Pu ","Wei ","Li ","Cai ","Wu ","Xi ","Wen ","Qiang ","Ze ","Shi ","Su ","Yi ","Zhen ","Sou ","Yun ","Xiu ","Yin ","Rong ","Hun ","Su ","Su ","Ni ","Ta ","Shi ","Ru ","Wei ","Pan ","Chu ","Chu ","Pang ","Weng ","Cang ","Mie ","He ","Dian ","Hao ","Huang ","Xi ","Zi ","Di ","Zhi ","Ying ","Fu ","Jie ","Hua ","Ge ","Zi ","Tao ","Teng ","Sui ","Bi ","Jiao ","Hui ","Gun ","Yin ","Gao ","Long ","Zhi ","Yan ","She ","Man ","Ying ","Chun ","Lu ","Lan ","Luan ","[?] ","Bin ","Tan ","Yu ","Sou ","Hu ","Bi ","Biao ","Zhi ","Jiang ","Kou ","Shen ","Shang ","Di ","Mi ","Ao ","Lu ","Hu ","Hu ","You ","Chan ","Fan ","Yong ","Gun ","Man " ];

},{}],79:[function(require,module,exports){
module.exports = [ "Qing ","Yu ","Piao ","Ji ","Ya ","Jiao ","Qi ","Xi ","Ji ","Lu ","Lu ","Long ","Jin ","Guo ","Cong ","Lou ","Zhi ","Gai ","Qiang ","Li ","Yan ","Cao ","Jiao ","Cong ","Qun ","Tuan ","Ou ","Teng ","Ye ","Xi ","Mi ","Tang ","Mo ","Shang ","Han ","Lian ","Lan ","Wa ","Li ","Qian ","Feng ","Xuan ","Yi ","Man ","Zi ","Mang ","Kang ","Lei ","Peng ","Shu ","Zhang ","Zhang ","Chong ","Xu ","Huan ","Kuo ","Jian ","Yan ","Chuang ","Liao ","Cui ","Ti ","Yang ","Jiang ","Cong ","Ying ","Hong ","Xun ","Shu ","Guan ","Ying ","Xiao ","[?] ","[?] ","Xu ","Lian ","Zhi ","Wei ","Pi ","Jue ","Jiao ","Po ","Dang ","Hui ","Jie ","Wu ","Pa ","Ji ","Pan ","Gui ","Xiao ","Qian ","Qian ","Xi ","Lu ","Xi ","Xuan ","Dun ","Huang ","Min ","Run ","Su ","Liao ","Zhen ","Zhong ","Yi ","Di ","Wan ","Dan ","Tan ","Chao ","Xun ","Kui ","Yie ","Shao ","Tu ","Zhu ","San ","Hei ","Bi ","Shan ","Chan ","Chan ","Shu ","Tong ","Pu ","Lin ","Wei ","Se ","Se ","Cheng ","Jiong ","Cheng ","Hua ","Jiao ","Lao ","Che ","Gan ","Cun ","Heng ","Si ","Shu ","Peng ","Han ","Yun ","Liu ","Hong ","Fu ","Hao ","He ","Xian ","Jian ","Shan ","Xi ","Oki ","[?] ","Lan ","[?] ","Yu ","Lin ","Min ","Zao ","Dang ","Wan ","Ze ","Xie ","Yu ","Li ","Shi ","Xue ","Ling ","Man ","Zi ","Yong ","Kuai ","Can ","Lian ","Dian ","Ye ","Ao ","Huan ","Zhen ","Chan ","Man ","Dan ","Dan ","Yi ","Sui ","Pi ","Ju ","Ta ","Qin ","Ji ","Zhuo ","Lian ","Nong ","Guo ","Jin ","Fen ","Se ","Ji ","Sui ","Hui ","Chu ","Ta ","Song ","Ding ","[?] ","Zhu ","Lai ","Bin ","Lian ","Mi ","Shi ","Shu ","Mi ","Ning ","Ying ","Ying ","Meng ","Jin ","Qi ","Pi ","Ji ","Hao ","Ru ","Zui ","Wo ","Tao ","Yin ","Yin ","Dui ","Ci ","Huo ","Jing ","Lan ","Jun ","Ai ","Pu ","Zhuo ","Wei ","Bin ","Gu ","Qian ","Xing ","Hama ","Kuo ","Fei ","[?] ","Boku ","Jian ","Wei ","Luo ","Zan ","Lu ","Li " ];

},{}],80:[function(require,module,exports){
module.exports = [ "You ","Yang ","Lu ","Si ","Jie ","Ying ","Du ","Wang ","Hui ","Xie ","Pan ","Shen ","Biao ","Chan ","Mo ","Liu ","Jian ","Pu ","Se ","Cheng ","Gu ","Bin ","Huo ","Xian ","Lu ","Qin ","Han ","Ying ","Yong ","Li ","Jing ","Xiao ","Ying ","Sui ","Wei ","Xie ","Huai ","Hao ","Zhu ","Long ","Lai ","Dui ","Fan ","Hu ","Lai ","[?] ","[?] ","Ying ","Mi ","Ji ","Lian ","Jian ","Ying ","Fen ","Lin ","Yi ","Jian ","Yue ","Chan ","Dai ","Rang ","Jian ","Lan ","Fan ","Shuang ","Yuan ","Zhuo ","Feng ","She ","Lei ","Lan ","Cong ","Qu ","Yong ","Qian ","Fa ","Guan ","Que ","Yan ","Hao ","Hyeng ","Sa ","Zan ","Luan ","Yan ","Li ","Mi ","Shan ","Tan ","Dang ","Jiao ","Chan ","[?] ","Hao ","Ba ","Zhu ","Lan ","Lan ","Nang ","Wan ","Luan ","Xun ","Xian ","Yan ","Gan ","Yan ","Yu ","Huo ","Si ","Mie ","Guang ","Deng ","Hui ","Xiao ","Xiao ","Hu ","Hong ","Ling ","Zao ","Zhuan ","Jiu ","Zha ","Xie ","Chi ","Zhuo ","Zai ","Zai ","Can ","Yang ","Qi ","Zhong ","Fen ","Niu ","Jiong ","Wen ","Po ","Yi ","Lu ","Chui ","Pi ","Kai ","Pan ","Yan ","Kai ","Pang ","Mu ","Chao ","Liao ","Gui ","Kang ","Tun ","Guang ","Xin ","Zhi ","Guang ","Guang ","Wei ","Qiang ","[?] ","Da ","Xia ","Zheng ","Zhu ","Ke ","Zhao ","Fu ","Ba ","Duo ","Duo ","Ling ","Zhuo ","Xuan ","Ju ","Tan ","Pao ","Jiong ","Pao ","Tai ","Tai ","Bing ","Yang ","Tong ","Han ","Zhu ","Zha ","Dian ","Wei ","Shi ","Lian ","Chi ","Huang ","[?] ","Hu ","Shuo ","Lan ","Jing ","Jiao ","Xu ","Xing ","Quan ","Lie ","Huan ","Yang ","Xiao ","Xiu ","Xian ","Yin ","Wu ","Zhou ","Yao ","Shi ","Wei ","Tong ","Xue ","Zai ","Kai ","Hong ","Luo ","Xia ","Zhu ","Xuan ","Zheng ","Po ","Yan ","Hui ","Guang ","Zhe ","Hui ","Kao ","[?] ","Fan ","Shao ","Ye ","Hui ","[?] ","Tang ","Jin ","Re ","[?] ","Xi ","Fu ","Jiong ","Che ","Pu ","Jing ","Zhuo ","Ting ","Wan ","Hai ","Peng ","Lang ","Shan ","Hu ","Feng ","Chi ","Rong " ];

},{}],81:[function(require,module,exports){
module.exports = [ "Hu ","Xi ","Shu ","He ","Xun ","Ku ","Jue ","Xiao ","Xi ","Yan ","Han ","Zhuang ","Jun ","Di ","Xie ","Ji ","Wu ","[?] ","[?] ","Han ","Yan ","Huan ","Men ","Ju ","Chou ","Bei ","Fen ","Lin ","Kun ","Hun ","Tun ","Xi ","Cui ","Wu ","Hong ","Ju ","Fu ","Wo ","Jiao ","Cong ","Feng ","Ping ","Qiong ","Ruo ","Xi ","Qiong ","Xin ","Zhuo ","Yan ","Yan ","Yi ","Jue ","Yu ","Gang ","Ran ","Pi ","Gu ","[?] ","Sheng ","Chang ","Shao ","[?] ","[?] ","[?] ","[?] ","Chen ","He ","Kui ","Zhong ","Duan ","Xia ","Hui ","Feng ","Lian ","Xuan ","Xing ","Huang ","Jiao ","Jian ","Bi ","Ying ","Zhu ","Wei ","Tuan ","Tian ","Xi ","Nuan ","Nuan ","Chan ","Yan ","Jiong ","Jiong ","Yu ","Mei ","Sha ","Wei ","Ye ","Xin ","Qiong ","Rou ","Mei ","Huan ","Xu ","Zhao ","Wei ","Fan ","Qiu ","Sui ","Yang ","Lie ","Zhu ","Jie ","Gao ","Gua ","Bao ","Hu ","Yun ","Xia ","[?] ","[?] ","Bian ","Gou ","Tui ","Tang ","Chao ","Shan ","N ","Bo ","Huang ","Xie ","Xi ","Wu ","Xi ","Yun ","He ","He ","Xi ","Yun ","Xiong ","Nai ","Shan ","Qiong ","Yao ","Xun ","Mi ","Lian ","Ying ","Wen ","Rong ","Oozutsu ","[?] ","Qiang ","Liu ","Xi ","Bi ","Biao ","Zong ","Lu ","Jian ","Shou ","Yi ","Lou ","Feng ","Sui ","Yi ","Tong ","Jue ","Zong ","Yun ","Hu ","Yi ","Zhi ","Ao ","Wei ","Liao ","Han ","Ou ","Re ","Jiong ","Man ","[?] ","Shang ","Cuan ","Zeng ","Jian ","Xi ","Xi ","Xi ","Yi ","Xiao ","Chi ","Huang ","Chan ","Ye ","Qian ","Ran ","Yan ","Xian ","Qiao ","Zun ","Deng ","Dun ","Shen ","Jiao ","Fen ","Si ","Liao ","Yu ","Lin ","Tong ","Shao ","Fen ","Fan ","Yan ","Xun ","Lan ","Mei ","Tang ","Yi ","Jing ","Men ","[?] ","[?] ","Ying ","Yu ","Yi ","Xue ","Lan ","Tai ","Zao ","Can ","Sui ","Xi ","Que ","Cong ","Lian ","Hui ","Zhu ","Xie ","Ling ","Wei ","Yi ","Xie ","Zhao ","Hui ","Tatsu ","Nung ","Lan ","Ru ","Xian ","Kao ","Xun ","Jin ","Chou ","Chou ","Yao " ];

},{}],82:[function(require,module,exports){
module.exports = [ "He ","Lan ","Biao ","Rong ","Li ","Mo ","Bao ","Ruo ","Lu ","La ","Ao ","Xun ","Kuang ","Shuo ","[?] ","Li ","Lu ","Jue ","Liao ","Yan ","Xi ","Xie ","Long ","Ye ","[?] ","Rang ","Yue ","Lan ","Cong ","Jue ","Tong ","Guan ","[?] ","Che ","Mi ","Tang ","Lan ","Zhu ","[?] ","Ling ","Cuan ","Yu ","Zhua ","Tsumekanmuri ","Pa ","Zheng ","Pao ","Cheng ","Yuan ","Ai ","Wei ","[?] ","Jue ","Jue ","Fu ","Ye ","Ba ","Die ","Ye ","Yao ","Zu ","Shuang ","Er ","Qiang ","Chuang ","Ge ","Zang ","Die ","Qiang ","Yong ","Qiang ","Pian ","Ban ","Pan ","Shao ","Jian ","Pai ","Du ","Chuang ","Tou ","Zha ","Bian ","Die ","Bang ","Bo ","Chuang ","You ","[?] ","Du ","Ya ","Cheng ","Niu ","Ushihen ","Pin ","Jiu ","Mou ","Tuo ","Mu ","Lao ","Ren ","Mang ","Fang ","Mao ","Mu ","Gang ","Wu ","Yan ","Ge ","Bei ","Si ","Jian ","Gu ","You ","Ge ","Sheng ","Mu ","Di ","Qian ","Quan ","Quan ","Zi ","Te ","Xi ","Mang ","Keng ","Qian ","Wu ","Gu ","Xi ","Li ","Li ","Pou ","Ji ","Gang ","Zhi ","Ben ","Quan ","Run ","Du ","Ju ","Jia ","Jian ","Feng ","Pian ","Ke ","Ju ","Kao ","Chu ","Xi ","Bei ","Luo ","Jie ","Ma ","San ","Wei ","Li ","Dun ","Tong ","[?] ","Jiang ","Ikenie ","Li ","Du ","Lie ","Pi ","Piao ","Bao ","Xi ","Chou ","Wei ","Kui ","Chou ","Quan ","Fan ","Ba ","Fan ","Qiu ","Ji ","Cai ","Chuo ","An ","Jie ","Zhuang ","Guang ","Ma ","You ","Kang ","Bo ","Hou ","Ya ","Yin ","Huan ","Zhuang ","Yun ","Kuang ","Niu ","Di ","Qing ","Zhong ","Mu ","Bei ","Pi ","Ju ","Ni ","Sheng ","Pao ","Xia ","Tuo ","Hu ","Ling ","Fei ","Pi ","Ni ","Ao ","You ","Gou ","Yue ","Ju ","Dan ","Po ","Gu ","Xian ","Ning ","Huan ","Hen ","Jiao ","He ","Zhao ","Ji ","Xun ","Shan ","Ta ","Rong ","Shou ","Tong ","Lao ","Du ","Xia ","Shi ","Hua ","Zheng ","Yu ","Sun ","Yu ","Bi ","Mang ","Xi ","Juan ","Li ","Xia ","Yin ","Suan ","Lang ","Bei ","Zhi ","Yan " ];

},{}],83:[function(require,module,exports){
module.exports = [ "Sha ","Li ","Han ","Xian ","Jing ","Pai ","Fei ","Yao ","Ba ","Qi ","Ni ","Biao ","Yin ","Lai ","Xi ","Jian ","Qiang ","Kun ","Yan ","Guo ","Zong ","Mi ","Chang ","Yi ","Zhi ","Zheng ","Ya ","Meng ","Cai ","Cu ","She ","Kari ","Cen ","Luo ","Hu ","Zong ","Ji ","Wei ","Feng ","Wo ","Yuan ","Xing ","Zhu ","Mao ","Wei ","Yuan ","Xian ","Tuan ","Ya ","Nao ","Xie ","Jia ","Hou ","Bian ","You ","You ","Mei ","Zha ","Yao ","Sun ","Bo ","Ming ","Hua ","Yuan ","Sou ","Ma ","Yuan ","Dai ","Yu ","Shi ","Hao ","[?] ","Yi ","Zhen ","Chuang ","Hao ","Man ","Jing ","Jiang ","Mu ","Zhang ","Chan ","Ao ","Ao ","Hao ","Cui ","Fen ","Jue ","Bi ","Bi ","Huang ","Pu ","Lin ","Yu ","Tong ","Yao ","Liao ","Shuo ","Xiao ","Swu ","Ton ","Xi ","Ge ","Juan ","Du ","Hui ","Kuai ","Xian ","Xie ","Ta ","Xian ","Xun ","Ning ","Pin ","Huo ","Nou ","Meng ","Lie ","Nao ","Guang ","Shou ","Lu ","Ta ","Xian ","Mi ","Rang ","Huan ","Nao ","Luo ","Xian ","Qi ","Jue ","Xuan ","Miao ","Zi ","Lu ","Lu ","Yu ","Su ","Wang ","Qiu ","Ga ","Ding ","Le ","Ba ","Ji ","Hong ","Di ","Quan ","Gan ","Jiu ","Yu ","Ji ","Yu ","Yang ","Ma ","Gong ","Wu ","Fu ","Wen ","Jie ","Ya ","Fen ","Bian ","Beng ","Yue ","Jue ","Yun ","Jue ","Wan ","Jian ","Mei ","Dan ","Pi ","Wei ","Huan ","Xian ","Qiang ","Ling ","Dai ","Yi ","An ","Ping ","Dian ","Fu ","Xuan ","Xi ","Bo ","Ci ","Gou ","Jia ","Shao ","Po ","Ci ","Ke ","Ran ","Sheng ","Shen ","Yi ","Zu ","Jia ","Min ","Shan ","Liu ","Bi ","Zhen ","Zhen ","Jue ","Fa ","Long ","Jin ","Jiao ","Jian ","Li ","Guang ","Xian ","Zhou ","Gong ","Yan ","Xiu ","Yang ","Xu ","Luo ","Su ","Zhu ","Qin ","Ken ","Xun ","Bao ","Er ","Xiang ","Yao ","Xia ","Heng ","Gui ","Chong ","Xu ","Ban ","Pei ","[?] ","Dang ","Ei ","Hun ","Wen ","E ","Cheng ","Ti ","Wu ","Wu ","Cheng ","Jun ","Mei ","Bei ","Ting ","Xian ","Chuo " ];

},{}],84:[function(require,module,exports){
module.exports = [ "Han ","Xuan ","Yan ","Qiu ","Quan ","Lang ","Li ","Xiu ","Fu ","Liu ","Ye ","Xi ","Ling ","Li ","Jin ","Lian ","Suo ","Chiisai ","[?] ","Wan ","Dian ","Pin ","Zhan ","Cui ","Min ","Yu ","Ju ","Chen ","Lai ","Wen ","Sheng ","Wei ","Dian ","Chu ","Zhuo ","Pei ","Cheng ","Hu ","Qi ","E ","Kun ","Chang ","Qi ","Beng ","Wan ","Lu ","Cong ","Guan ","Yan ","Diao ","Bei ","Lin ","Qin ","Pi ","Pa ","Que ","Zhuo ","Qin ","Fa ","[?] ","Qiong ","Du ","Jie ","Hun ","Yu ","Mao ","Mei ","Chun ","Xuan ","Ti ","Xing ","Dai ","Rou ","Min ","Zhen ","Wei ","Ruan ","Huan ","Jie ","Chuan ","Jian ","Zhuan ","Yang ","Lian ","Quan ","Xia ","Duan ","Yuan ","Ye ","Nao ","Hu ","Ying ","Yu ","Huang ","Rui ","Se ","Liu ","Shi ","Rong ","Suo ","Yao ","Wen ","Wu ","Jin ","Jin ","Ying ","Ma ","Tao ","Liu ","Tang ","Li ","Lang ","Gui ","Zhen ","Qiang ","Cuo ","Jue ","Zhao ","Yao ","Ai ","Bin ","Tu ","Chang ","Kun ","Zhuan ","Cong ","Jin ","Yi ","Cui ","Cong ","Qi ","Li ","Ying ","Suo ","Qiu ","Xuan ","Ao ","Lian ","Man ","Zhang ","Yin ","[?] ","Ying ","Zhi ","Lu ","Wu ","Deng ","Xiou ","Zeng ","Xun ","Qu ","Dang ","Lin ","Liao ","Qiong ","Su ","Huang ","Gui ","Pu ","Jing ","Fan ","Jin ","Liu ","Ji ","[?] ","Jing ","Ai ","Bi ","Can ","Qu ","Zao ","Dang ","Jiao ","Gun ","Tan ","Hui ","Huan ","Se ","Sui ","Tian ","[?] ","Yu ","Jin ","Lu ","Bin ","Shou ","Wen ","Zui ","Lan ","Xi ","Ji ","Xuan ","Ruan ","Huo ","Gai ","Lei ","Du ","Li ","Zhi ","Rou ","Li ","Zan ","Qiong ","Zhe ","Gui ","Sui ","La ","Long ","Lu ","Li ","Zan ","Lan ","Ying ","Mi ","Xiang ","Xi ","Guan ","Dao ","Zan ","Huan ","Gua ","Bo ","Die ","Bao ","Hu ","Zhi ","Piao ","Ban ","Rang ","Li ","Wa ","Dekaguramu ","Jiang ","Qian ","Fan ","Pen ","Fang ","Dan ","Weng ","Ou ","Deshiguramu ","Miriguramu ","Thon ","Hu ","Ling ","Yi ","Ping ","Ci ","Hekutogura ","Juan ","Chang ","Chi ","Sarake ","Dang ","Meng ","Pou " ];

},{}],85:[function(require,module,exports){
module.exports = [ "Zhui ","Ping ","Bian ","Zhou ","Zhen ","Senchigura ","Ci ","Ying ","Qi ","Xian ","Lou ","Di ","Ou ","Meng ","Zhuan ","Peng ","Lin ","Zeng ","Wu ","Pi ","Dan ","Weng ","Ying ","Yan ","Gan ","Dai ","Shen ","Tian ","Tian ","Han ","Chang ","Sheng ","Qing ","Sheng ","Chan ","Chan ","Rui ","Sheng ","Su ","Sen ","Yong ","Shuai ","Lu ","Fu ","Yong ","Beng ","Feng ","Ning ","Tian ","You ","Jia ","Shen ","Zha ","Dian ","Fu ","Nan ","Dian ","Ping ","Ting ","Hua ","Ting ","Quan ","Zi ","Meng ","Bi ","Qi ","Liu ","Xun ","Liu ","Chang ","Mu ","Yun ","Fan ","Fu ","Geng ","Tian ","Jie ","Jie ","Quan ","Wei ","Fu ","Tian ","Mu ","Tap ","Pan ","Jiang ","Wa ","Da ","Nan ","Liu ","Ben ","Zhen ","Chu ","Mu ","Mu ","Ce ","Cen ","Gai ","Bi ","Da ","Zhi ","Lue ","Qi ","Lue ","Pan ","Kesa ","Fan ","Hua ","Yu ","Yu ","Mu ","Jun ","Yi ","Liu ","Yu ","Die ","Chou ","Hua ","Dang ","Chuo ","Ji ","Wan ","Jiang ","Sheng ","Chang ","Tuan ","Lei ","Ji ","Cha ","Liu ","Tatamu ","Tuan ","Lin ","Jiang ","Jiang ","Chou ","Bo ","Die ","Die ","Pi ","Nie ","Dan ","Shu ","Shu ","Zhi ","Yi ","Chuang ","Nai ","Ding ","Bi ","Jie ","Liao ","Gong ","Ge ","Jiu ","Zhou ","Xia ","Shan ","Xu ","Nue ","Li ","Yang ","Chen ","You ","Ba ","Jie ","Jue ","Zhi ","Xia ","Cui ","Bi ","Yi ","Li ","Zong ","Chuang ","Feng ","Zhu ","Pao ","Pi ","Gan ","Ke ","Ci ","Xie ","Qi ","Dan ","Zhen ","Fa ","Zhi ","Teng ","Ju ","Ji ","Fei ","Qu ","Dian ","Jia ","Xian ","Cha ","Bing ","Ni ","Zheng ","Yong ","Jing ","Quan ","Chong ","Tong ","Yi ","Kai ","Wei ","Hui ","Duo ","Yang ","Chi ","Zhi ","Hen ","Ya ","Mei ","Dou ","Jing ","Xiao ","Tong ","Tu ","Mang ","Pi ","Xiao ","Suan ","Pu ","Li ","Zhi ","Cuo ","Duo ","Wu ","Sha ","Lao ","Shou ","Huan ","Xian ","Yi ","Peng ","Zhang ","Guan ","Tan ","Fei ","Ma ","Lin ","Chi ","Ji ","Dian ","An ","Chi ","Bi ","Bei ","Min ","Gu ","Dui ","E ","Wei " ];

},{}],86:[function(require,module,exports){
module.exports = [ "Yu ","Cui ","Ya ","Zhu ","Cu ","Dan ","Shen ","Zhung ","Ji ","Yu ","Hou ","Feng ","La ","Yang ","Shen ","Tu ","Yu ","Gua ","Wen ","Huan ","Ku ","Jia ","Yin ","Yi ","Lu ","Sao ","Jue ","Chi ","Xi ","Guan ","Yi ","Wen ","Ji ","Chuang ","Ban ","Lei ","Liu ","Chai ","Shou ","Nue ","Dian ","Da ","Pie ","Tan ","Zhang ","Biao ","Shen ","Cu ","Luo ","Yi ","Zong ","Chou ","Zhang ","Zhai ","Sou ","Suo ","Que ","Diao ","Lou ","Lu ","Mo ","Jin ","Yin ","Ying ","Huang ","Fu ","Liao ","Long ","Qiao ","Liu ","Lao ","Xian ","Fei ","Dan ","Yin ","He ","Yan ","Ban ","Xian ","Guan ","Guai ","Nong ","Yu ","Wei ","Yi ","Yong ","Pi ","Lei ","Li ","Shu ","Dan ","Lin ","Dian ","Lin ","Lai ","Pie ","Ji ","Chi ","Yang ","Xian ","Jie ","Zheng ","[?] ","Li ","Huo ","Lai ","Shaku ","Dian ","Xian ","Ying ","Yin ","Qu ","Yong ","Tan ","Dian ","Luo ","Luan ","Luan ","Bo ","[?] ","Gui ","Po ","Fa ","Deng ","Fa ","Bai ","Bai ","Qie ","Bi ","Zao ","Zao ","Mao ","De ","Pa ","Jie ","Huang ","Gui ","Ci ","Ling ","Gao ","Mo ","Ji ","Jiao ","Peng ","Gao ","Ai ","E ","Hao ","Han ","Bi ","Wan ","Chou ","Qian ","Xi ","Ai ","Jiong ","Hao ","Huang ","Hao ","Ze ","Cui ","Hao ","Xiao ","Ye ","Po ","Hao ","Jiao ","Ai ","Xing ","Huang ","Li ","Piao ","He ","Jiao ","Pi ","Gan ","Pao ","Zhou ","Jun ","Qiu ","Cun ","Que ","Zha ","Gu ","Jun ","Jun ","Zhou ","Zha ","Gu ","Zhan ","Du ","Min ","Qi ","Ying ","Yu ","Bei ","Zhao ","Zhong ","Pen ","He ","Ying ","He ","Yi ","Bo ","Wan ","He ","Ang ","Zhan ","Yan ","Jian ","He ","Yu ","Kui ","Fan ","Gai ","Dao ","Pan ","Fu ","Qiu ","Sheng ","Dao ","Lu ","Zhan ","Meng ","Li ","Jin ","Xu ","Jian ","Pan ","Guan ","An ","Lu ","Shu ","Zhou ","Dang ","An ","Gu ","Li ","Mu ","Cheng ","Gan ","Xu ","Mang ","Mang ","Zhi ","Qi ","Ruan ","Tian ","Xiang ","Dun ","Xin ","Xi ","Pan ","Feng ","Dun ","Min " ];

},{}],87:[function(require,module,exports){
module.exports = [ "Ming ","Sheng ","Shi ","Yun ","Mian ","Pan ","Fang ","Miao ","Dan ","Mei ","Mao ","Kan ","Xian ","Ou ","Shi ","Yang ","Zheng ","Yao ","Shen ","Huo ","Da ","Zhen ","Kuang ","Ju ","Shen ","Chi ","Sheng ","Mei ","Mo ","Zhu ","Zhen ","Zhen ","Mian ","Di ","Yuan ","Die ","Yi ","Zi ","Zi ","Chao ","Zha ","Xuan ","Bing ","Mi ","Long ","Sui ","Dong ","Mi ","Die ","Yi ","Er ","Ming ","Xuan ","Chi ","Kuang ","Juan ","Mou ","Zhen ","Tiao ","Yang ","Yan ","Mo ","Zhong ","Mai ","Zhao ","Zheng ","Mei ","Jun ","Shao ","Han ","Huan ","Di ","Cheng ","Cuo ","Juan ","E ","Wan ","Xian ","Xi ","Kun ","Lai ","Jian ","Shan ","Tian ","Hun ","Wan ","Ling ","Shi ","Qiong ","Lie ","Yai ","Jing ","Zheng ","Li ","Lai ","Sui ","Juan ","Shui ","Sui ","Du ","Bi ","Bi ","Mu ","Hun ","Ni ","Lu ","Yi ","Jie ","Cai ","Zhou ","Yu ","Hun ","Ma ","Xia ","Xing ","Xi ","Gun ","Cai ","Chun ","Jian ","Mei ","Du ","Hou ","Xuan ","Ti ","Kui ","Gao ","Rui ","Mou ","Xu ","Fa ","Wen ","Miao ","Chou ","Kui ","Mi ","Weng ","Kou ","Dang ","Chen ","Ke ","Sou ","Xia ","Qiong ","Mao ","Ming ","Man ","Shui ","Ze ","Zhang ","Yi ","Diao ","Ou ","Mo ","Shun ","Cong ","Lou ","Chi ","Man ","Piao ","Cheng ","Ji ","Meng ","[?] ","Run ","Pie ","Xi ","Qiao ","Pu ","Zhu ","Deng ","Shen ","Shun ","Liao ","Che ","Xian ","Kan ","Ye ","Xu ","Tong ","Mou ","Lin ","Kui ","Xian ","Ye ","Ai ","Hui ","Zhan ","Jian ","Gu ","Zhao ","Qu ","Wei ","Chou ","Sao ","Ning ","Xun ","Yao ","Huo ","Meng ","Mian ","Bin ","Mian ","Li ","Kuang ","Jue ","Xuan ","Mian ","Huo ","Lu ","Meng ","Long ","Guan ","Man ","Xi ","Chu ","Tang ","Kan ","Zhu ","Mao ","Jin ","Lin ","Yu ","Shuo ","Ce ","Jue ","Shi ","Yi ","Shen ","Zhi ","Hou ","Shen ","Ying ","Ju ","Zhou ","Jiao ","Cuo ","Duan ","Ai ","Jiao ","Zeng ","Huo ","Bai ","Shi ","Ding ","Qi ","Ji ","Zi ","Gan ","Wu ","Tuo ","Ku ","Qiang ","Xi ","Fan ","Kuang " ];

},{}],88:[function(require,module,exports){
module.exports = [ "Dang ","Ma ","Sha ","Dan ","Jue ","Li ","Fu ","Min ","Nuo ","Huo ","Kang ","Zhi ","Qi ","Kan ","Jie ","Fen ","E ","Ya ","Pi ","Zhe ","Yan ","Sui ","Zhuan ","Che ","Dun ","Pan ","Yan ","[?] ","Feng ","Fa ","Mo ","Zha ","Qu ","Yu ","Luo ","Tuo ","Tuo ","Di ","Zhai ","Zhen ","Ai ","Fei ","Mu ","Zhu ","Li ","Bian ","Nu ","Ping ","Peng ","Ling ","Pao ","Le ","Po ","Bo ","Po ","Shen ","Za ","Nuo ","Li ","Long ","Tong ","[?] ","Li ","Aragane ","Chu ","Keng ","Quan ","Zhu ","Kuang ","Huo ","E ","Nao ","Jia ","Lu ","Wei ","Ai ","Luo ","Ken ","Xing ","Yan ","Tong ","Peng ","Xi ","[?] ","Hong ","Shuo ","Xia ","Qiao ","[?] ","Wei ","Qiao ","[?] ","Keng ","Xiao ","Que ","Chan ","Lang ","Hong ","Yu ","Xiao ","Xia ","Mang ","Long ","Iong ","Che ","Che ","E ","Liu ","Ying ","Mang ","Que ","Yan ","Sha ","Kun ","Yu ","[?] ","Kaki ","Lu ","Chen ","Jian ","Nue ","Song ","Zhuo ","Keng ","Peng ","Yan ","Zhui ","Kong ","Ceng ","Qi ","Zong ","Qing ","Lin ","Jun ","Bo ","Ding ","Min ","Diao ","Jian ","He ","Lu ","Ai ","Sui ","Que ","Ling ","Bei ","Yin ","Dui ","Wu ","Qi ","Lun ","Wan ","Dian ","Gang ","Pei ","Qi ","Chen ","Ruan ","Yan ","Die ","Ding ","Du ","Tuo ","Jie ","Ying ","Bian ","Ke ","Bi ","Wei ","Shuo ","Zhen ","Duan ","Xia ","Dang ","Ti ","Nao ","Peng ","Jian ","Di ","Tan ","Cha ","Seki ","Qi ","[?] ","Feng ","Xuan ","Que ","Que ","Ma ","Gong ","Nian ","Su ","E ","Ci ","Liu ","Si ","Tang ","Bang ","Hua ","Pi ","Wei ","Sang ","Lei ","Cuo ","Zhen ","Xia ","Qi ","Lian ","Pan ","Wei ","Yun ","Dui ","Zhe ","Ke ","La ","[?] ","Qing ","Gun ","Zhuan ","Chan ","Qi ","Ao ","Peng ","Lu ","Lu ","Kan ","Qiang ","Chen ","Yin ","Lei ","Biao ","Qi ","Mo ","Qi ","Cui ","Zong ","Qing ","Chuo ","[?] ","Ji ","Shan ","Lao ","Qu ","Zeng ","Deng ","Jian ","Xi ","Lin ","Ding ","Dian ","Huang ","Pan ","Za ","Qiao ","Di ","Li " ];

},{}],89:[function(require,module,exports){
module.exports = [ "Tani ","Jiao ","[?] ","Zhang ","Qiao ","Dun ","Xian ","Yu ","Zhui ","He ","Huo ","Zhai ","Lei ","Ke ","Chu ","Ji ","Que ","Dang ","Yi ","Jiang ","Pi ","Pi ","Yu ","Pin ","Qi ","Ai ","Kai ","Jian ","Yu ","Ruan ","Meng ","Pao ","Ci ","[?] ","[?] ","Mie ","Ca ","Xian ","Kuang ","Lei ","Lei ","Zhi ","Li ","Li ","Fan ","Que ","Pao ","Ying ","Li ","Long ","Long ","Mo ","Bo ","Shuang ","Guan ","Lan ","Zan ","Yan ","Shi ","Shi ","Li ","Reng ","She ","Yue ","Si ","Qi ","Ta ","Ma ","Xie ","Xian ","Xian ","Zhi ","Qi ","Zhi ","Beng ","Dui ","Zhong ","[?] ","Yi ","Shi ","You ","Zhi ","Tiao ","Fu ","Fu ","Mi ","Zu ","Zhi ","Suan ","Mei ","Zuo ","Qu ","Hu ","Zhu ","Shen ","Sui ","Ci ","Chai ","Mi ","Lu ","Yu ","Xiang ","Wu ","Tiao ","Piao ","Zhu ","Gui ","Xia ","Zhi ","Ji ","Gao ","Zhen ","Gao ","Shui ","Jin ","Chen ","Gai ","Kun ","Di ","Dao ","Huo ","Tao ","Qi ","Gu ","Guan ","Zui ","Ling ","Lu ","Bing ","Jin ","Dao ","Zhi ","Lu ","Shan ","Bei ","Zhe ","Hui ","You ","Xi ","Yin ","Zi ","Huo ","Zhen ","Fu ","Yuan ","Wu ","Xian ","Yang ","Ti ","Yi ","Mei ","Si ","Di ","[?] ","Zhuo ","Zhen ","Yong ","Ji ","Gao ","Tang ","Si ","Ma ","Ta ","[?] ","Xuan ","Qi ","Yu ","Xi ","Ji ","Si ","Chan ","Tan ","Kuai ","Sui ","Li ","Nong ","Ni ","Dao ","Li ","Rang ","Yue ","Ti ","Zan ","Lei ","Rou ","Yu ","Yu ","Chi ","Xie ","Qin ","He ","Tu ","Xiu ","Si ","Ren ","Tu ","Zi ","Cha ","Gan ","Yi ","Xian ","Bing ","Nian ","Qiu ","Qiu ","Chong ","Fen ","Hao ","Yun ","Ke ","Miao ","Zhi ","Geng ","Bi ","Zhi ","Yu ","Mi ","Ku ","Ban ","Pi ","Ni ","Li ","You ","Zu ","Pi ","Ba ","Ling ","Mo ","Cheng ","Nian ","Qin ","Yang ","Zuo ","Zhi ","Zhi ","Shu ","Ju ","Zi ","Huo ","Ji ","Cheng ","Tong ","Zhi ","Huo ","He ","Yin ","Zi ","Zhi ","Jie ","Ren ","Du ","Yi ","Zhu ","Hui ","Nong ","Fu " ];

},{}],90:[function(require,module,exports){
module.exports = [ "Xi ","Kao ","Lang ","Fu ","Ze ","Shui ","Lu ","Kun ","Gan ","Geng ","Ti ","Cheng ","Tu ","Shao ","Shui ","Ya ","Lun ","Lu ","Gu ","Zuo ","Ren ","Zhun ","Bang ","Bai ","Ji ","Zhi ","Zhi ","Kun ","Leng ","Peng ","Ke ","Bing ","Chou ","Zu ","Yu ","Su ","Lue ","[?] ","Yi ","Xi ","Bian ","Ji ","Fu ","Bi ","Nuo ","Jie ","Zhong ","Zong ","Xu ","Cheng ","Dao ","Wen ","Lian ","Zi ","Yu ","Ji ","Xu ","Zhen ","Zhi ","Dao ","Jia ","Ji ","Gao ","Gao ","Gu ","Rong ","Sui ","You ","Ji ","Kang ","Mu ","Shan ","Men ","Zhi ","Ji ","Lu ","Su ","Ji ","Ying ","Wen ","Qiu ","Se ","[?] ","Yi ","Huang ","Qie ","Ji ","Sui ","Xiao ","Pu ","Jiao ","Zhuo ","Tong ","Sai ","Lu ","Sui ","Nong ","Se ","Hui ","Rang ","Nuo ","Yu ","Bin ","Ji ","Tui ","Wen ","Cheng ","Huo ","Gong ","Lu ","Biao ","[?] ","Rang ","Zhuo ","Li ","Zan ","Xue ","Wa ","Jiu ","Qiong ","Xi ","Qiong ","Kong ","Yu ","Sen ","Jing ","Yao ","Chuan ","Zhun ","Tu ","Lao ","Qie ","Zhai ","Yao ","Bian ","Bao ","Yao ","Bing ","Wa ","Zhu ","Jiao ","Qiao ","Diao ","Wu ","Gui ","Yao ","Zhi ","Chuang ","Yao ","Tiao ","Jiao ","Chuang ","Jiong ","Xiao ","Cheng ","Kou ","Cuan ","Wo ","Dan ","Ku ","Ke ","Zhui ","Xu ","Su ","Guan ","Kui ","Dou ","[?] ","Yin ","Wo ","Wa ","Ya ","Yu ","Ju ","Qiong ","Yao ","Yao ","Tiao ","Chao ","Yu ","Tian ","Diao ","Ju ","Liao ","Xi ","Wu ","Kui ","Chuang ","Zhao ","[?] ","Kuan ","Long ","Cheng ","Cui ","Piao ","Zao ","Cuan ","Qiao ","Qiong ","Dou ","Zao ","Long ","Qie ","Li ","Chu ","Shi ","Fou ","Qian ","Chu ","Hong ","Qi ","Qian ","Gong ","Shi ","Shu ","Miao ","Ju ","Zhan ","Zhu ","Ling ","Long ","Bing ","Jing ","Jing ","Zhang ","Yi ","Si ","Jun ","Hong ","Tong ","Song ","Jing ","Diao ","Yi ","Shu ","Jing ","Qu ","Jie ","Ping ","Duan ","Shao ","Zhuan ","Ceng ","Deng ","Cui ","Huai ","Jing ","Kan ","Jing ","Zhu ","Zhu ","Le ","Peng ","Yu ","Chi ","Gan " ];

},{}],91:[function(require,module,exports){
module.exports = [ "Mang ","Zhu ","Utsubo ","Du ","Ji ","Xiao ","Ba ","Suan ","Ji ","Zhen ","Zhao ","Sun ","Ya ","Zhui ","Yuan ","Hu ","Gang ","Xiao ","Cen ","Pi ","Bi ","Jian ","Yi ","Dong ","Shan ","Sheng ","Xia ","Di ","Zhu ","Na ","Chi ","Gu ","Li ","Qie ","Min ","Bao ","Tiao ","Si ","Fu ","Ce ","Ben ","Pei ","Da ","Zi ","Di ","Ling ","Ze ","Nu ","Fu ","Gou ","Fan ","Jia ","Ge ","Fan ","Shi ","Mao ","Po ","Sey ","Jian ","Qiong ","Long ","Souke ","Bian ","Luo ","Gui ","Qu ","Chi ","Yin ","Yao ","Xian ","Bi ","Qiong ","Gua ","Deng ","Jiao ","Jin ","Quan ","Sun ","Ru ","Fa ","Kuang ","Zhu ","Tong ","Ji ","Da ","Xing ","Ce ","Zhong ","Kou ","Lai ","Bi ","Shai ","Dang ","Zheng ","Ce ","Fu ","Yun ","Tu ","Pa ","Li ","Lang ","Ju ","Guan ","Jian ","Han ","Tong ","Xia ","Zhi ","Cheng ","Suan ","Shi ","Zhu ","Zuo ","Xiao ","Shao ","Ting ","Ce ","Yan ","Gao ","Kuai ","Gan ","Chou ","Kago ","Gang ","Yun ","O ","Qian ","Xiao ","Jian ","Pu ","Lai ","Zou ","Bi ","Bi ","Bi ","Ge ","Chi ","Guai ","Yu ","Jian ","Zhao ","Gu ","Chi ","Zheng ","Jing ","Sha ","Zhou ","Lu ","Bo ","Ji ","Lin ","Suan ","Jun ","Fu ","Zha ","Gu ","Kong ","Qian ","Quan ","Jun ","Chui ","Guan ","Yuan ","Ce ","Ju ","Bo ","Ze ","Qie ","Tuo ","Luo ","Dan ","Xiao ","Ruo ","Jian ","Xuan ","Bian ","Sun ","Xiang ","Xian ","Ping ","Zhen ","Sheng ","Hu ","Shi ","Zhu ","Yue ","Chun ","Lu ","Wu ","Dong ","Xiao ","Ji ","Jie ","Huang ","Xing ","Mei ","Fan ","Chui ","Zhuan ","Pian ","Feng ","Zhu ","Hong ","Qie ","Hou ","Qiu ","Miao ","Qian ","[?] ","Kui ","Sik ","Lou ","Yun ","He ","Tang ","Yue ","Chou ","Gao ","Fei ","Ruo ","Zheng ","Gou ","Nie ","Qian ","Xiao ","Cuan ","Gong ","Pang ","Du ","Li ","Bi ","Zhuo ","Chu ","Shai ","Chi ","Zhu ","Qiang ","Long ","Lan ","Jian ","Bu ","Li ","Hui ","Bi ","Di ","Cong ","Yan ","Peng ","Sen ","Zhuan ","Pai ","Piao ","Dou ","Yu ","Mie ","Zhuan " ];

},{}],92:[function(require,module,exports){
module.exports = [ "Ze ","Xi ","Guo ","Yi ","Hu ","Chan ","Kou ","Cu ","Ping ","Chou ","Ji ","Gui ","Su ","Lou ","Zha ","Lu ","Nian ","Suo ","Cuan ","Sasara ","Suo ","Le ","Duan ","Yana ","Xiao ","Bo ","Mi ","Si ","Dang ","Liao ","Dan ","Dian ","Fu ","Jian ","Min ","Kui ","Dai ","Qiao ","Deng ","Huang ","Sun ","Lao ","Zan ","Xiao ","Du ","Shi ","Zan ","[?] ","Pai ","Hata ","Pai ","Gan ","Ju ","Du ","Lu ","Yan ","Bo ","Dang ","Sai ","Ke ","Long ","Qian ","Lian ","Bo ","Zhou ","Lai ","[?] ","Lan ","Kui ","Yu ","Yue ","Hao ","Zhen ","Tai ","Ti ","Mi ","Chou ","Ji ","[?] ","Hata ","Teng ","Zhuan ","Zhou ","Fan ","Sou ","Zhou ","Kuji ","Zhuo ","Teng ","Lu ","Lu ","Jian ","Tuo ","Ying ","Yu ","Lai ","Long ","Shinshi ","Lian ","Lan ","Qian ","Yue ","Zhong ","Qu ","Lian ","Bian ","Duan ","Zuan ","Li ","Si ","Luo ","Ying ","Yue ","Zhuo ","Xu ","Mi ","Di ","Fan ","Shen ","Zhe ","Shen ","Nu ","Xie ","Lei ","Xian ","Zi ","Ni ","Cun ","[?] ","Qian ","Kume ","Bi ","Ban ","Wu ","Sha ","Kang ","Rou ","Fen ","Bi ","Cui ","[?] ","Li ","Chi ","Nukamiso ","Ro ","Ba ","Li ","Gan ","Ju ","Po ","Mo ","Cu ","Nian ","Zhou ","Li ","Su ","Tiao ","Li ","Qi ","Su ","Hong ","Tong ","Zi ","Ce ","Yue ","Zhou ","Lin ","Zhuang ","Bai ","[?] ","Fen ","Ji ","[?] ","Sukumo ","Liang ","Xian ","Fu ","Liang ","Can ","Geng ","Li ","Yue ","Lu ","Ju ","Qi ","Cui ","Bai ","Zhang ","Lin ","Zong ","Jing ","Guo ","Kouji ","San ","San ","Tang ","Bian ","Rou ","Mian ","Hou ","Xu ","Zong ","Hu ","Jian ","Zan ","Ci ","Li ","Xie ","Fu ","Ni ","Bei ","Gu ","Xiu ","Gao ","Tang ","Qiu ","Sukumo ","Cao ","Zhuang ","Tang ","Mi ","San ","Fen ","Zao ","Kang ","Jiang ","Mo ","San ","San ","Nuo ","Xi ","Liang ","Jiang ","Kuai ","Bo ","Huan ","[?] ","Zong ","Xian ","Nuo ","Tuan ","Nie ","Li ","Zuo ","Di ","Nie ","Tiao ","Lan ","Mi ","Jiao ","Jiu ","Xi ","Gong ","Zheng ","Jiu ","You " ];

},{}],93:[function(require,module,exports){
module.exports = [ "Ji ","Cha ","Zhou ","Xun ","Yue ","Hong ","Yu ","He ","Wan ","Ren ","Wen ","Wen ","Qiu ","Na ","Zi ","Tou ","Niu ","Fou ","Jie ","Shu ","Chun ","Pi ","Yin ","Sha ","Hong ","Zhi ","Ji ","Fen ","Yun ","Ren ","Dan ","Jin ","Su ","Fang ","Suo ","Cui ","Jiu ","Zha ","Kinu ","Jin ","Fu ","Zhi ","Ci ","Zi ","Chou ","Hong ","Zha ","Lei ","Xi ","Fu ","Xie ","Shen ","Bei ","Zhu ","Qu ","Ling ","Zhu ","Shao ","Gan ","Yang ","Fu ","Tuo ","Zhen ","Dai ","Zhuo ","Shi ","Zhong ","Xian ","Zu ","Jiong ","Ban ","Ju ","Mo ","Shu ","Zui ","Wata ","Jing ","Ren ","Heng ","Xie ","Jie ","Zhu ","Chou ","Gua ","Bai ","Jue ","Kuang ","Hu ","Ci ","Geng ","Geng ","Tao ","Xie ","Ku ","Jiao ","Quan ","Gai ","Luo ","Xuan ","Bing ","Xian ","Fu ","Gei ","Tong ","Rong ","Tiao ","Yin ","Lei ","Xie ","Quan ","Xu ","Lun ","Die ","Tong ","Si ","Jiang ","Xiang ","Hui ","Jue ","Zhi ","Jian ","Juan ","Chi ","Mian ","Zhen ","Lu ","Cheng ","Qiu ","Shu ","Bang ","Tong ","Xiao ","Wan ","Qin ","Geng ","Xiu ","Ti ","Xiu ","Xie ","Hong ","Xi ","Fu ","Ting ","Sui ","Dui ","Kun ","Fu ","Jing ","Hu ","Zhi ","Yan ","Jiong ","Feng ","Ji ","Sok ","Kase ","Zong ","Lin ","Duo ","Li ","Lu ","Liang ","Chou ","Quan ","Shao ","Qi ","Qi ","Zhun ","Qi ","Wan ","Qian ","Xian ","Shou ","Wei ","Qi ","Tao ","Wan ","Gang ","Wang ","Beng ","Zhui ","Cai ","Guo ","Cui ","Lun ","Liu ","Qi ","Zhan ","Bei ","Chuo ","Ling ","Mian ","Qi ","Qie ","Tan ","Zong ","Gun ","Zou ","Yi ","Zi ","Xing ","Liang ","Jin ","Fei ","Rui ","Min ","Yu ","Zong ","Fan ","Lu ","Xu ","Yingl ","Zhang ","Kasuri ","Xu ","Xiang ","Jian ","Ke ","Xian ","Ruan ","Mian ","Qi ","Duan ","Zhong ","Di ","Min ","Miao ","Yuan ","Xie ","Bao ","Si ","Qiu ","Bian ","Huan ","Geng ","Cong ","Mian ","Wei ","Fu ","Wei ","Yu ","Gou ","Miao ","Xie ","Lian ","Zong ","Bian ","Yun ","Yin ","Ti ","Gua ","Zhi ","Yun ","Cheng ","Chan ","Dai " ];

},{}],94:[function(require,module,exports){
module.exports = [ "Xia ","Yuan ","Zong ","Xu ","Nawa ","Odoshi ","Geng ","Sen ","Ying ","Jin ","Yi ","Zhui ","Ni ","Bang ","Gu ","Pan ","Zhou ","Jian ","Cuo ","Quan ","Shuang ","Yun ","Xia ","Shuai ","Xi ","Rong ","Tao ","Fu ","Yun ","Zhen ","Gao ","Ru ","Hu ","Zai ","Teng ","Xian ","Su ","Zhen ","Zong ","Tao ","Horo ","Cai ","Bi ","Feng ","Cu ","Li ","Suo ","Yin ","Xi ","Zong ","Lei ","Zhuan ","Qian ","Man ","Zhi ","Lu ","Mo ","Piao ","Lian ","Mi ","Xuan ","Zong ","Ji ","Shan ","Sui ","Fan ","Shuai ","Beng ","Yi ","Sao ","Mou ","Zhou ","Qiang ","Hun ","Sem ","Xi ","Jung ","Xiu ","Ran ","Xuan ","Hui ","Qiao ","Zeng ","Zuo ","Zhi ","Shan ","San ","Lin ","Yu ","Fan ","Liao ","Chuo ","Zun ","Jian ","Rao ","Chan ","Rui ","Xiu ","Hui ","Hua ","Zuan ","Xi ","Qiang ","Un ","Da ","Sheng ","Hui ","Xi ","Se ","Jian ","Jiang ","Huan ","Zao ","Cong ","Jie ","Jiao ","Bo ","Chan ","Yi ","Nao ","Sui ","Yi ","Shai ","Xu ","Ji ","Bin ","Qian ","Lan ","Pu ","Xun ","Zuan ","Qi ","Peng ","Li ","Mo ","Lei ","Xie ","Zuan ","Kuang ","You ","Xu ","Lei ","Xian ","Chan ","Kou ","Lu ","Chan ","Ying ","Cai ","Xiang ","Xian ","Zui ","Zuan ","Luo ","Xi ","Dao ","Lan ","Lei ","Lian ","Si ","Jiu ","Yu ","Hong ","Zhou ","Xian ","He ","Yue ","Ji ","Wan ","Kuang ","Ji ","Ren ","Wei ","Yun ","Hong ","Chun ","Pi ","Sha ","Gang ","Na ","Ren ","Zong ","Lun ","Fen ","Zhi ","Wen ","Fang ","Zhu ","Yin ","Niu ","Shu ","Xian ","Gan ","Xie ","Fu ","Lian ","Zu ","Shen ","Xi ","Zhi ","Zhong ","Zhou ","Ban ","Fu ","Zhuo ","Shao ","Yi ","Jing ","Dai ","Bang ","Rong ","Jie ","Ku ","Rao ","Die ","Heng ","Hui ","Gei ","Xuan ","Jiang ","Luo ","Jue ","Jiao ","Tong ","Geng ","Xiao ","Juan ","Xiu ","Xi ","Sui ","Tao ","Ji ","Ti ","Ji ","Xu ","Ling ","[?] ","Xu ","Qi ","Fei ","Chuo ","Zhang ","Gun ","Sheng ","Wei ","Mian ","Shou ","Beng ","Chou ","Tao ","Liu ","Quan ","Zong ","Zhan ","Wan ","Lu " ];

},{}],95:[function(require,module,exports){
module.exports = [ "Zhui ","Zi ","Ke ","Xiang ","Jian ","Mian ","Lan ","Ti ","Miao ","Qi ","Yun ","Hui ","Si ","Duo ","Duan ","Bian ","Xian ","Gou ","Zhui ","Huan ","Di ","Lu ","Bian ","Min ","Yuan ","Jin ","Fu ","Ru ","Zhen ","Feng ","Shuai ","Gao ","Chan ","Li ","Yi ","Jian ","Bin ","Piao ","Man ","Lei ","Ying ","Suo ","Mou ","Sao ","Xie ","Liao ","Shan ","Zeng ","Jiang ","Qian ","Zao ","Huan ","Jiao ","Zuan ","Fou ","Xie ","Gang ","Fou ","Que ","Fou ","Kaakeru ","Bo ","Ping ","Hou ","[?] ","Gang ","Ying ","Ying ","Qing ","Xia ","Guan ","Zun ","Tan ","Chang ","Qi ","Weng ","Ying ","Lei ","Tan ","Lu ","Guan ","Wang ","Wang ","Gang ","Wang ","Han ","[?] ","Luo ","Fu ","Mi ","Fa ","Gu ","Zhu ","Ju ","Mao ","Gu ","Min ","Gang ","Ba ","Gua ","Ti ","Juan ","Fu ","Lin ","Yan ","Zhao ","Zui ","Gua ","Zhuo ","Yu ","Zhi ","An ","Fa ","Nan ","Shu ","Si ","Pi ","Ma ","Liu ","Ba ","Fa ","Li ","Chao ","Wei ","Bi ","Ji ","Zeng ","Tong ","Liu ","Ji ","Juan ","Mi ","Zhao ","Luo ","Pi ","Ji ","Ji ","Luan ","Yang ","Mie ","Qiang ","Ta ","Mei ","Yang ","You ","You ","Fen ","Ba ","Gao ","Yang ","Gu ","Qiang ","Zang ","Gao ","Ling ","Yi ","Zhu ","Di ","Xiu ","Qian ","Yi ","Xian ","Rong ","Qun ","Qun ","Qian ","Huan ","Zui ","Xian ","Yi ","Yashinau ","Qiang ","Xian ","Yu ","Geng ","Jie ","Tang ","Yuan ","Xi ","Fan ","Shan ","Fen ","Shan ","Lian ","Lei ","Geng ","Nou ","Qiang ","Chan ","Yu ","Gong ","Yi ","Chong ","Weng ","Fen ","Hong ","Chi ","Chi ","Cui ","Fu ","Xia ","Pen ","Yi ","La ","Yi ","Pi ","Ling ","Liu ","Zhi ","Qu ","Xi ","Xie ","Xiang ","Xi ","Xi ","Qi ","Qiao ","Hui ","Hui ","Xiao ","Se ","Hong ","Jiang ","Di ","Cui ","Fei ","Tao ","Sha ","Chi ","Zhu ","Jian ","Xuan ","Shi ","Pian ","Zong ","Wan ","Hui ","Hou ","He ","He ","Han ","Ao ","Piao ","Yi ","Lian ","Qu ","[?] ","Lin ","Pen ","Qiao ","Ao ","Fan ","Yi ","Hui ","Xuan ","Dao " ];

},{}],96:[function(require,module,exports){
module.exports = [ "Yao ","Lao ","[?] ","Kao ","Mao ","Zhe ","Qi ","Gou ","Gou ","Gou ","Die ","Die ","Er ","Shua ","Ruan ","Er ","Nai ","Zhuan ","Lei ","Ting ","Zi ","Geng ","Chao ","Hao ","Yun ","Pa ","Pi ","Chi ","Si ","Chu ","Jia ","Ju ","He ","Chu ","Lao ","Lun ","Ji ","Tang ","Ou ","Lou ","Nou ","Gou ","Pang ","Ze ","Lou ","Ji ","Lao ","Huo ","You ","Mo ","Huai ","Er ","Zhe ","Ting ","Ye ","Da ","Song ","Qin ","Yun ","Chi ","Dan ","Dan ","Hong ","Geng ","Zhi ","[?] ","Nie ","Dan ","Zhen ","Che ","Ling ","Zheng ","You ","Wa ","Liao ","Long ","Zhi ","Ning ","Tiao ","Er ","Ya ","Die ","Gua ","[?] ","Lian ","Hao ","Sheng ","Lie ","Pin ","Jing ","Ju ","Bi ","Di ","Guo ","Wen ","Xu ","Ping ","Cong ","Shikato ","[?] ","Ting ","Yu ","Cong ","Kui ","Tsuraneru ","Kui ","Cong ","Lian ","Weng ","Kui ","Lian ","Lian ","Cong ","Ao ","Sheng ","Song ","Ting ","Kui ","Nie ","Zhi ","Dan ","Ning ","Qie ","Ji ","Ting ","Ting ","Long ","Yu ","Yu ","Zhao ","Si ","Su ","Yi ","Su ","Si ","Zhao ","Zhao ","Rou ","Yi ","Le ","Ji ","Qiu ","Ken ","Cao ","Ge ","Di ","Huan ","Huang ","Yi ","Ren ","Xiao ","Ru ","Zhou ","Yuan ","Du ","Gang ","Rong ","Gan ","Cha ","Wo ","Chang ","Gu ","Zhi ","Han ","Fu ","Fei ","Fen ","Pei ","Pang ","Jian ","Fang ","Zhun ","You ","Na ","Hang ","Ken ","Ran ","Gong ","Yu ","Wen ","Yao ","Jin ","Pi ","Qian ","Xi ","Xi ","Fei ","Ken ","Jing ","Tai ","Shen ","Zhong ","Zhang ","Xie ","Shen ","Wei ","Zhou ","Die ","Dan ","Fei ","Ba ","Bo ","Qu ","Tian ","Bei ","Gua ","Tai ","Zi ","Ku ","Zhi ","Ni ","Ping ","Zi ","Fu ","Pang ","Zhen ","Xian ","Zuo ","Pei ","Jia ","Sheng ","Zhi ","Bao ","Mu ","Qu ","Hu ","Ke ","Yi ","Yin ","Xu ","Yang ","Long ","Dong ","Ka ","Lu ","Jing ","Nu ","Yan ","Pang ","Kua ","Yi ","Guang ","Gai ","Ge ","Dong ","Zhi ","Xiao ","Xiong ","Xiong ","Er ","E ","Xing ","Pian ","Neng ","Zi ","Gui " ];

},{}],97:[function(require,module,exports){
module.exports = [ "Cheng ","Tiao ","Zhi ","Cui ","Mei ","Xie ","Cui ","Xie ","Mo ","Mai ","Ji ","Obiyaakasu ","[?] ","Kuai ","Sa ","Zang ","Qi ","Nao ","Mi ","Nong ","Luan ","Wan ","Bo ","Wen ","Guan ","Qiu ","Jiao ","Jing ","Rou ","Heng ","Cuo ","Lie ","Shan ","Ting ","Mei ","Chun ","Shen ","Xie ","De ","Zui ","Cu ","Xiu ","Xin ","Tuo ","Pao ","Cheng ","Nei ","Fu ","Dou ","Tuo ","Niao ","Noy ","Pi ","Gu ","Gua ","Li ","Lian ","Zhang ","Cui ","Jie ","Liang ","Zhou ","Pi ","Biao ","Lun ","Pian ","Guo ","Kui ","Chui ","Dan ","Tian ","Nei ","Jing ","Jie ","La ","Yi ","An ","Ren ","Shen ","Chuo ","Fu ","Fu ","Ju ","Fei ","Qiang ","Wan ","Dong ","Pi ","Guo ","Zong ","Ding ","Wu ","Mei ","Ruan ","Zhuan ","Zhi ","Cou ","Gua ","Ou ","Di ","An ","Xing ","Nao ","Yu ","Chuan ","Nan ","Yun ","Zhong ","Rou ","E ","Sai ","Tu ","Yao ","Jian ","Wei ","Jiao ","Yu ","Jia ","Duan ","Bi ","Chang ","Fu ","Xian ","Ni ","Mian ","Wa ","Teng ","Tui ","Bang ","Qian ","Lu ","Wa ","Sou ","Tang ","Su ","Zhui ","Ge ","Yi ","Bo ","Liao ","Ji ","Pi ","Xie ","Gao ","Lu ","Bin ","Ou ","Chang ","Lu ","Guo ","Pang ","Chuai ","Piao ","Jiang ","Fu ","Tang ","Mo ","Xi ","Zhuan ","Lu ","Jiao ","Ying ","Lu ","Zhi ","Tara ","Chun ","Lian ","Tong ","Peng ","Ni ","Zha ","Liao ","Cui ","Gui ","Xiao ","Teng ","Fan ","Zhi ","Jiao ","Shan ","Wu ","Cui ","Run ","Xiang ","Sui ","Fen ","Ying ","Tan ","Zhua ","Dan ","Kuai ","Nong ","Tun ","Lian ","Bi ","Yong ","Jue ","Chu ","Yi ","Juan ","La ","Lian ","Sao ","Tun ","Gu ","Qi ","Cui ","Bin ","Xun ","Ru ","Huo ","Zang ","Xian ","Biao ","Xing ","Kuan ","La ","Yan ","Lu ","Huo ","Zang ","Luo ","Qu ","Zang ","Luan ","Ni ","Zang ","Chen ","Qian ","Wo ","Guang ","Zang ","Lin ","Guang ","Zi ","Jiao ","Nie ","Chou ","Ji ","Gao ","Chou ","Mian ","Nie ","Zhi ","Zhi ","Ge ","Jian ","Die ","Zhi ","Xiu ","Tai ","Zhen ","Jiu ","Xian ","Yu ","Cha " ];

},{}],98:[function(require,module,exports){
module.exports = [ "Yao ","Yu ","Chong ","Xi ","Xi ","Jiu ","Yu ","Yu ","Xing ","Ju ","Jiu ","Xin ","She ","She ","Yadoru ","Jiu ","Shi ","Tan ","Shu ","Shi ","Tian ","Dan ","Pu ","Pu ","Guan ","Hua ","Tan ","Chuan ","Shun ","Xia ","Wu ","Zhou ","Dao ","Gang ","Shan ","Yi ","[?] ","Pa ","Tai ","Fan ","Ban ","Chuan ","Hang ","Fang ","Ban ","Que ","Hesaki ","Zhong ","Jian ","Cang ","Ling ","Zhu ","Ze ","Duo ","Bo ","Xian ","Ge ","Chuan ","Jia ","Lu ","Hong ","Pang ","Xi ","[?] ","Fu ","Zao ","Feng ","Li ","Shao ","Yu ","Lang ","Ting ","[?] ","Wei ","Bo ","Meng ","Nian ","Ju ","Huang ","Shou ","Zong ","Bian ","Mao ","Die ","[?] ","Bang ","Cha ","Yi ","Sao ","Cang ","Cao ","Lou ","Dai ","Sori ","Yao ","Tong ","Yofune ","Dang ","Tan ","Lu ","Yi ","Jie ","Jian ","Huo ","Meng ","Qi ","Lu ","Lu ","Chan ","Shuang ","Gen ","Liang ","Jian ","Jian ","Se ","Yan ","Fu ","Ping ","Yan ","Yan ","Cao ","Cao ","Yi ","Le ","Ting ","Qiu ","Ai ","Nai ","Tiao ","Jiao ","Jie ","Peng ","Wan ","Yi ","Chai ","Mian ","Mie ","Gan ","Qian ","Yu ","Yu ","Shuo ","Qiong ","Tu ","Xia ","Qi ","Mang ","Zi ","Hui ","Sui ","Zhi ","Xiang ","Bi ","Fu ","Tun ","Wei ","Wu ","Zhi ","Qi ","Shan ","Wen ","Qian ","Ren ","Fou ","Kou ","Jie ","Lu ","Xu ","Ji ","Qin ","Qi ","Yuan ","Fen ","Ba ","Rui ","Xin ","Ji ","Hua ","Hua ","Fang ","Wu ","Jue ","Gou ","Zhi ","Yun ","Qin ","Ao ","Chu ","Mao ","Ya ","Fei ","Reng ","Hang ","Cong ","Yin ","You ","Bian ","Yi ","Susa ","Wei ","Li ","Pi ","E ","Xian ","Chang ","Cang ","Meng ","Su ","Yi ","Yuan ","Ran ","Ling ","Tai ","Tiao ","Di ","Miao ","Qiong ","Li ","Yong ","Ke ","Mu ","Pei ","Bao ","Gou ","Min ","Yi ","Yi ","Ju ","Pi ","Ruo ","Ku ","Zhu ","Ni ","Bo ","Bing ","Shan ","Qiu ","Yao ","Xian ","Ben ","Hong ","Ying ","Zha ","Dong ","Ju ","Die ","Nie ","Gan ","Hu ","Ping ","Mei ","Fu ","Sheng ","Gu ","Bi ","Wei " ];

},{}],99:[function(require,module,exports){
module.exports = [ "Fu ","Zhuo ","Mao ","Fan ","Qie ","Mao ","Mao ","Ba ","Zi ","Mo ","Zi ","Di ","Chi ","Ji ","Jing ","Long ","[?] ","Niao ","[?] ","Xue ","Ying ","Qiong ","Ge ","Ming ","Li ","Rong ","Yin ","Gen ","Qian ","Chai ","Chen ","Yu ","Xiu ","Zi ","Lie ","Wu ","Ji ","Kui ","Ce ","Chong ","Ci ","Gou ","Guang ","Mang ","Chi ","Jiao ","Jiao ","Fu ","Yu ","Zhu ","Zi ","Jiang ","Hui ","Yin ","Cha ","Fa ","Rong ","Ru ","Chong ","Mang ","Tong ","Zhong ","[?] ","Zhu ","Xun ","Huan ","Kua ","Quan ","Gai ","Da ","Jing ","Xing ","Quan ","Cao ","Jing ","Er ","An ","Shou ","Chi ","Ren ","Jian ","Ti ","Huang ","Ping ","Li ","Jin ","Lao ","Shu ","Zhuang ","Da ","Jia ","Rao ","Bi ","Ze ","Qiao ","Hui ","Qi ","Dang ","[?] ","Rong ","Hun ","Ying ","Luo ","Ying ","Xun ","Jin ","Sun ","Yin ","Mai ","Hong ","Zhou ","Yao ","Du ","Wei ","Chu ","Dou ","Fu ","Ren ","Yin ","He ","Bi ","Bu ","Yun ","Di ","Tu ","Sui ","Sui ","Cheng ","Chen ","Wu ","Bie ","Xi ","Geng ","Li ","Fu ","Zhu ","Mo ","Li ","Zhuang ","Ji ","Duo ","Qiu ","Sha ","Suo ","Chen ","Feng ","Ju ","Mei ","Meng ","Xing ","Jing ","Che ","Xin ","Jun ","Yan ","Ting ","Diao ","Cuo ","Wan ","Han ","You ","Cuo ","Jia ","Wang ","You ","Niu ","Shao ","Xian ","Lang ","Fu ","E ","Mo ","Wen ","Jie ","Nan ","Mu ","Kan ","Lai ","Lian ","Shi ","Wo ","Usagi ","Lian ","Huo ","You ","Ying ","Ying ","Nuc ","Chun ","Mang ","Mang ","Ci ","Wan ","Jing ","Di ","Qu ","Dong ","Jian ","Zou ","Gu ","La ","Lu ","Ju ","Wei ","Jun ","Nie ","Kun ","He ","Pu ","Zi ","Gao ","Guo ","Fu ","Lun ","Chang ","Chou ","Song ","Chui ","Zhan ","Men ","Cai ","Ba ","Li ","Tu ","Bo ","Han ","Bao ","Qin ","Juan ","Xi ","Qin ","Di ","Jie ","Pu ","Dang ","Jin ","Zhao ","Tai ","Geng ","Hua ","Gu ","Ling ","Fei ","Jin ","An ","Wang ","Beng ","Zhou ","Yan ","Ju ","Jian ","Lin ","Tan ","Shu ","Tian ","Dao " ];

},{}],100:[function(require,module,exports){
module.exports = [ "Hu ","Qi ","He ","Cui ","Tao ","Chun ","Bei ","Chang ","Huan ","Fei ","Lai ","Qi ","Meng ","Ping ","Wei ","Dan ","Sha ","Huan ","Yan ","Yi ","Tiao ","Qi ","Wan ","Ce ","Nai ","Kutabireru ","Tuo ","Jiu ","Tie ","Luo ","[?] ","[?] ","Meng ","[?] ","Yaji ","[?] ","Ying ","Ying ","Ying ","Xiao ","Sa ","Qiu ","Ke ","Xiang ","Wan ","Yu ","Yu ","Fu ","Lian ","Xuan ","Yuan ","Nan ","Ze ","Wo ","Chun ","Xiao ","Yu ","Pian ","Mao ","An ","E ","Luo ","Ying ","Huo ","Gua ","Jiang ","Mian ","Zuo ","Zuo ","Ju ","Bao ","Rou ","Xi ","Xie ","An ","Qu ","Jian ","Fu ","Lu ","Jing ","Pen ","Feng ","Hong ","Hong ","Hou ","Yan ","Tu ","Zhu ","Zi ","Xiang ","Shen ","Ge ","Jie ","Jing ","Mi ","Huang ","Shen ","Pu ","Gai ","Dong ","Zhou ","Qian ","Wei ","Bo ","Wei ","Pa ","Ji ","Hu ","Zang ","Jia ","Duan ","Yao ","Jun ","Cong ","Quan ","Wei ","Xian ","Kui ","Ting ","Hun ","Xi ","Shi ","Qi ","Lan ","Zong ","Yao ","Yuan ","Mei ","Yun ","Shu ","Di ","Zhuan ","Guan ","Sukumo ","Xue ","Chan ","Kai ","Kui ","[?] ","Jiang ","Lou ","Wei ","Pai ","[?] ","Sou ","Yin ","Shi ","Chun ","Shi ","Yun ","Zhen ","Lang ","Nu ","Meng ","He ","Que ","Suan ","Yuan ","Li ","Ju ","Xi ","Pang ","Chu ","Xu ","Tu ","Liu ","Wo ","Zhen ","Qian ","Zu ","Po ","Cuo ","Yuan ","Chu ","Yu ","Kuai ","Pan ","Pu ","Pu ","Na ","Shuo ","Xi ","Fen ","Yun ","Zheng ","Jian ","Ji ","Ruo ","Cang ","En ","Mi ","Hao ","Sun ","Zhen ","Ming ","Sou ","Xu ","Liu ","Xi ","Gu ","Lang ","Rong ","Weng ","Gai ","Cuo ","Shi ","Tang ","Luo ","Ru ","Suo ","Xian ","Bei ","Yao ","Gui ","Bi ","Zong ","Gun ","Za ","Xiu ","Ce ","Hai ","Lan ","[?] ","Ji ","Li ","Can ","Lang ","Yu ","[?] ","Ying ","Mo ","Diao ","Tiao ","Mao ","Tong ","Zhu ","Peng ","An ","Lian ","Cong ","Xi ","Ping ","Qiu ","Jin ","Chun ","Jie ","Wei ","Tui ","Cao ","Yu ","Yi ","Ji ","Liao ","Bi ","Lu ","Su " ];

},{}],101:[function(require,module,exports){
module.exports = [ "Bu ","Zhang ","Luo ","Jiang ","Man ","Yan ","Ling ","Ji ","Piao ","Gun ","Han ","Di ","Su ","Lu ","She ","Shang ","Di ","Mie ","Xun ","Man ","Bo ","Di ","Cuo ","Zhe ","Sen ","Xuan ","Wei ","Hu ","Ao ","Mi ","Lou ","Cu ","Zhong ","Cai ","Po ","Jiang ","Mi ","Cong ","Niao ","Hui ","Jun ","Yin ","Jian ","Yan ","Shu ","Yin ","Kui ","Chen ","Hu ","Sha ","Kou ","Qian ","Ma ","Zang ","Sonoko ","Qiang ","Dou ","Lian ","Lin ","Kou ","Ai ","Bi ","Li ","Wei ","Ji ","Xun ","Sheng ","Fan ","Meng ","Ou ","Chan ","Dian ","Xun ","Jiao ","Rui ","Rui ","Lei ","Yu ","Qiao ","Chu ","Hua ","Jian ","Mai ","Yun ","Bao ","You ","Qu ","Lu ","Rao ","Hui ","E ","Teng ","Fei ","Jue ","Zui ","Fa ","Ru ","Fen ","Kui ","Shun ","Rui ","Ya ","Xu ","Fu ","Jue ","Dang ","Wu ","Tong ","Si ","Xiao ","Xi ","Long ","Yun ","[?] ","Qi ","Jian ","Yun ","Sun ","Ling ","Yu ","Xia ","Yong ","Ji ","Hong ","Si ","Nong ","Lei ","Xuan ","Yun ","Yu ","Xi ","Hao ","Bo ","Hao ","Ai ","Wei ","Hui ","Wei ","Ji ","Ci ","Xiang ","Luan ","Mie ","Yi ","Leng ","Jiang ","Can ","Shen ","Qiang ","Lian ","Ke ","Yuan ","Da ","Ti ","Tang ","Xie ","Bi ","Zhan ","Sun ","Lian ","Fan ","Ding ","Jie ","Gu ","Xie ","Shu ","Jian ","Kao ","Hong ","Sa ","Xin ","Xun ","Yao ","Hie ","Sou ","Shu ","Xun ","Dui ","Pin ","Wei ","Neng ","Chou ","Mai ","Ru ","Piao ","Tai ","Qi ","Zao ","Chen ","Zhen ","Er ","Ni ","Ying ","Gao ","Cong ","Xiao ","Qi ","Fa ","Jian ","Xu ","Kui ","Jie ","Bian ","Diao ","Mi ","Lan ","Jin ","Cang ","Miao ","Qiong ","Qie ","Xian ","[?] ","Ou ","Xian ","Su ","Lu ","Yi ","Xu ","Xie ","Li ","Yi ","La ","Lei ","Xiao ","Di ","Zhi ","Bei ","Teng ","Yao ","Mo ","Huan ","Piao ","Fan ","Sou ","Tan ","Tui ","Qiong ","Qiao ","Wei ","Liu ","Hui ","[?] ","Gao ","Yun ","[?] ","Li ","Shu ","Chu ","Ai ","Lin ","Zao ","Xuan ","Chen ","Lai ","Huo " ];

},{}],102:[function(require,module,exports){
module.exports = [ "Tuo ","Wu ","Rui ","Rui ","Qi ","Heng ","Lu ","Su ","Tui ","Mang ","Yun ","Pin ","Yu ","Xun ","Ji ","Jiong ","Xian ","Mo ","Hagi ","Su ","Jiong ","[?] ","Nie ","Bo ","Rang ","Yi ","Xian ","Yu ","Ju ","Lian ","Lian ","Yin ","Qiang ","Ying ","Long ","Tong ","Wei ","Yue ","Ling ","Qu ","Yao ","Fan ","Mi ","Lan ","Kui ","Lan ","Ji ","Dang ","Katsura ","Lei ","Lei ","Hua ","Feng ","Zhi ","Wei ","Kui ","Zhan ","Huai ","Li ","Ji ","Mi ","Lei ","Huai ","Luo ","Ji ","Kui ","Lu ","Jian ","San ","[?] ","Lei ","Quan ","Xiao ","Yi ","Luan ","Men ","Bie ","Hu ","Hu ","Lu ","Nue ","Lu ","Si ","Xiao ","Qian ","Chu ","Hu ","Xu ","Cuo ","Fu ","Xu ","Xu ","Lu ","Hu ","Yu ","Hao ","Jiao ","Ju ","Guo ","Bao ","Yan ","Zhan ","Zhan ","Kui ","Ban ","Xi ","Shu ","Chong ","Qiu ","Diao ","Ji ","Qiu ","Cheng ","Shi ","[?] ","Di ","Zhe ","She ","Yu ","Gan ","Zi ","Hong ","Hui ","Meng ","Ge ","Sui ","Xia ","Chai ","Shi ","Yi ","Ma ","Xiang ","Fang ","E ","Pa ","Chi ","Qian ","Wen ","Wen ","Rui ","Bang ","Bi ","Yue ","Yue ","Jun ","Qi ","Ran ","Yin ","Qi ","Tian ","Yuan ","Jue ","Hui ","Qin ","Qi ","Zhong ","Ya ","Ci ","Mu ","Wang ","Fen ","Fen ","Hang ","Gong ","Zao ","Fu ","Ran ","Jie ","Fu ","Chi ","Dou ","Piao ","Xian ","Ni ","Te ","Qiu ","You ","Zha ","Ping ","Chi ","You ","He ","Han ","Ju ","Li ","Fu ","Ran ","Zha ","Gou ","Pi ","Bo ","Xian ","Zhu ","Diao ","Bie ","Bing ","Gu ","Ran ","Qu ","She ","Tie ","Ling ","Gu ","Dan ","Gu ","Ying ","Li ","Cheng ","Qu ","Mou ","Ge ","Ci ","Hui ","Hui ","Mang ","Fu ","Yang ","Wa ","Lie ","Zhu ","Yi ","Xian ","Kuo ","Jiao ","Li ","Yi ","Ping ","Ji ","Ha ","She ","Yi ","Wang ","Mo ","Qiong ","Qie ","Gui ","Gong ","Zhi ","Man ","Ebi ","Zhi ","Jia ","Rao ","Si ","Qi ","Xing ","Lie ","Qiu ","Shao ","Yong ","Jia ","Shui ","Che ","Bai ","E ","Han " ];

},{}],103:[function(require,module,exports){
module.exports = [ "Shu ","Xuan ","Feng ","Shen ","Zhen ","Fu ","Xian ","Zhe ","Wu ","Fu ","Li ","Lang ","Bi ","Chu ","Yuan ","You ","Jie ","Dan ","Yan ","Ting ","Dian ","Shui ","Hui ","Gua ","Zhi ","Song ","Fei ","Ju ","Mi ","Qi ","Qi ","Yu ","Jun ","Zha ","Meng ","Qiang ","Si ","Xi ","Lun ","Li ","Die ","Tiao ","Tao ","Kun ","Gan ","Han ","Yu ","Bang ","Fei ","Pi ","Wei ","Dun ","Yi ","Yuan ","Su ","Quan ","Qian ","Rui ","Ni ","Qing ","Wei ","Liang ","Guo ","Wan ","Dong ","E ","Ban ","Di ","Wang ","Can ","Yang ","Ying ","Guo ","Chan ","[?] ","La ","Ke ","Ji ","He ","Ting ","Mai ","Xu ","Mian ","Yu ","Jie ","Shi ","Xuan ","Huang ","Yan ","Bian ","Rou ","Wei ","Fu ","Yuan ","Mei ","Wei ","Fu ","Ruan ","Xie ","You ","Qiu ","Mao ","Xia ","Ying ","Shi ","Chong ","Tang ","Zhu ","Zong ","Ti ","Fu ","Yuan ","Hui ","Meng ","La ","Du ","Hu ","Qiu ","Die ","Li ","Gua ","Yun ","Ju ","Nan ","Lou ","Qun ","Rong ","Ying ","Jiang ","[?] ","Lang ","Pang ","Si ","Xi ","Ci ","Xi ","Yuan ","Weng ","Lian ","Sou ","Ban ","Rong ","Rong ","Ji ","Wu ","Qiu ","Han ","Qin ","Yi ","Bi ","Hua ","Tang ","Yi ","Du ","Nai ","He ","Hu ","Hui ","Ma ","Ming ","Yi ","Wen ","Ying ","Teng ","Yu ","Cang ","So ","Ebi ","Man ","[?] ","Shang ","Zhe ","Cao ","Chi ","Di ","Ao ","Lu ","Wei ","Zhi ","Tang ","Chen ","Piao ","Qu ","Pi ","Yu ","Jian ","Luo ","Lou ","Qin ","Zhong ","Yin ","Jiang ","Shuai ","Wen ","Jiao ","Wan ","Zhi ","Zhe ","Ma ","Ma ","Guo ","Liu ","Mao ","Xi ","Cong ","Li ","Man ","Xiao ","Kamakiri ","Zhang ","Mang ","Xiang ","Mo ","Zui ","Si ","Qiu ","Te ","Zhi ","Peng ","Peng ","Jiao ","Qu ","Bie ","Liao ","Pan ","Gui ","Xi ","Ji ","Zhuan ","Huang ","Fei ","Lao ","Jue ","Jue ","Hui ","Yin ","Chan ","Jiao ","Shan ","Rao ","Xiao ","Mou ","Chong ","Xun ","Si ","[?] ","Cheng ","Dang ","Li ","Xie ","Shan ","Yi ","Jing ","Da ","Chan ","Qi " ];

},{}],104:[function(require,module,exports){
module.exports = [ "Ci ","Xiang ","She ","Luo ","Qin ","Ying ","Chai ","Li ","Ze ","Xuan ","Lian ","Zhu ","Ze ","Xie ","Mang ","Xie ","Qi ","Rong ","Jian ","Meng ","Hao ","Ruan ","Huo ","Zhuo ","Jie ","Bin ","He ","Mie ","Fan ","Lei ","Jie ","La ","Mi ","Li ","Chun ","Li ","Qiu ","Nie ","Lu ","Du ","Xiao ","Zhu ","Long ","Li ","Long ","Feng ","Ye ","Beng ","Shang ","Gu ","Juan ","Ying ","[?] ","Xi ","Can ","Qu ","Quan ","Du ","Can ","Man ","Jue ","Jie ","Zhu ","Zha ","Xie ","Huang ","Niu ","Pei ","Nu ","Xin ","Zhong ","Mo ","Er ","Ke ","Mie ","Xi ","Xing ","Yan ","Kan ","Yuan ","[?] ","Ling ","Xuan ","Shu ","Xian ","Tong ","Long ","Jie ","Xian ","Ya ","Hu ","Wei ","Dao ","Chong ","Wei ","Dao ","Zhun ","Heng ","Qu ","Yi ","Yi ","Bu ","Gan ","Yu ","Biao ","Cha ","Yi ","Shan ","Chen ","Fu ","Gun ","Fen ","Shuai ","Jie ","Na ","Zhong ","Dan ","Ri ","Zhong ","Zhong ","Xie ","Qi ","Xie ","Ran ","Zhi ","Ren ","Qin ","Jin ","Jun ","Yuan ","Mei ","Chai ","Ao ","Niao ","Hui ","Ran ","Jia ","Tuo ","Ling ","Dai ","Bao ","Pao ","Yao ","Zuo ","Bi ","Shao ","Tan ","Ju ","He ","Shu ","Xiu ","Zhen ","Yi ","Pa ","Bo ","Di ","Wa ","Fu ","Gun ","Zhi ","Zhi ","Ran ","Pan ","Yi ","Mao ","Tuo ","Na ","Kou ","Xian ","Chan ","Qu ","Bei ","Gun ","Xi ","Ne ","Bo ","Horo ","Fu ","Yi ","Chi ","Ku ","Ren ","Jiang ","Jia ","Cun ","Mo ","Jie ","Er ","Luo ","Ru ","Zhu ","Gui ","Yin ","Cai ","Lie ","Kamishimo ","Yuki ","Zhuang ","Dang ","[?] ","Kun ","Ken ","Niao ","Shu ","Jia ","Kun ","Cheng ","Li ","Juan ","Shen ","Pou ","Ge ","Yi ","Yu ","Zhen ","Liu ","Qiu ","Qun ","Ji ","Yi ","Bu ","Zhuang ","Shui ","Sha ","Qun ","Li ","Lian ","Lian ","Ku ","Jian ","Fou ","Chan ","Bi ","Gun ","Tao ","Yuan ","Ling ","Chi ","Chang ","Chou ","Duo ","Biao ","Liang ","Chang ","Pei ","Pei ","Fei ","Yuan ","Luo ","Guo ","Yan ","Du ","Xi ","Zhi ","Ju ","Qi " ];

},{}],105:[function(require,module,exports){
module.exports = [ "Ji ","Zhi ","Gua ","Ken ","Che ","Ti ","Ti ","Fu ","Chong ","Xie ","Bian ","Die ","Kun ","Duan ","Xiu ","Xiu ","He ","Yuan ","Bao ","Bao ","Fu ","Yu ","Tuan ","Yan ","Hui ","Bei ","Chu ","Lu ","Ena ","Hitoe ","Yun ","Da ","Gou ","Da ","Huai ","Rong ","Yuan ","Ru ","Nai ","Jiong ","Suo ","Ban ","Tun ","Chi ","Sang ","Niao ","Ying ","Jie ","Qian ","Huai ","Ku ","Lian ","Bao ","Li ","Zhe ","Shi ","Lu ","Yi ","Die ","Xie ","Xian ","Wei ","Biao ","Cao ","Ji ","Jiang ","Sen ","Bao ","Xiang ","Chihaya ","Pu ","Jian ","Zhuan ","Jian ","Zui ","Ji ","Dan ","Za ","Fan ","Bo ","Xiang ","Xin ","Bie ","Rao ","Man ","Lan ","Ao ","Duo ","Gui ","Cao ","Sui ","Nong ","Chan ","Lian ","Bi ","Jin ","Dang ","Shu ","Tan ","Bi ","Lan ","Pu ","Ru ","Zhi ","[?] ","Shu ","Wa ","Shi ","Bai ","Xie ","Bo ","Chen ","Lai ","Long ","Xi ","Xian ","Lan ","Zhe ","Dai ","Tasuki ","Zan ","Shi ","Jian ","Pan ","Yi ","Ran ","Ya ","Xi ","Xi ","Yao ","Feng ","Tan ","[?] ","Biao ","Fu ","Ba ","He ","Ji ","Ji ","Jian ","Guan ","Bian ","Yan ","Gui ","Jue ","Pian ","Mao ","Mi ","Mi ","Mie ","Shi ","Si ","Zhan ","Luo ","Jue ","Mi ","Tiao ","Lian ","Yao ","Zhi ","Jun ","Xi ","Shan ","Wei ","Xi ","Tian ","Yu ","Lan ","E ","Du ","Qin ","Pang ","Ji ","Ming ","Ying ","Gou ","Qu ","Zhan ","Jin ","Guan ","Deng ","Jian ","Luo ","Qu ","Jian ","Wei ","Jue ","Qu ","Luo ","Lan ","Shen ","Di ","Guan ","Jian ","Guan ","Yan ","Gui ","Mi ","Shi ","Zhan ","Lan ","Jue ","Ji ","Xi ","Di ","Tian ","Yu ","Gou ","Jin ","Qu ","Jiao ","Jiu ","Jin ","Cu ","Jue ","Zhi ","Chao ","Ji ","Gu ","Dan ","Zui ","Di ","Shang ","Hua ","Quan ","Ge ","Chi ","Jie ","Gui ","Gong ","Hong ","Jie ","Hun ","Qiu ","Xing ","Su ","Ni ","Ji ","Lu ","Zhi ","Zha ","Bi ","Xing ","Hu ","Shang ","Gong ","Zhi ","Xue ","Chu ","Xi ","Yi ","Lu ","Jue ","Xi ","Yan ","Xi " ];

},{}],106:[function(require,module,exports){
module.exports = [ "Yan ","Yan ","Ding ","Fu ","Qiu ","Qiu ","Jiao ","Hong ","Ji ","Fan ","Xun ","Diao ","Hong ","Cha ","Tao ","Xu ","Jie ","Yi ","Ren ","Xun ","Yin ","Shan ","Qi ","Tuo ","Ji ","Xun ","Yin ","E ","Fen ","Ya ","Yao ","Song ","Shen ","Yin ","Xin ","Jue ","Xiao ","Ne ","Chen ","You ","Zhi ","Xiong ","Fang ","Xin ","Chao ","She ","Xian ","Sha ","Tun ","Xu ","Yi ","Yi ","Su ","Chi ","He ","Shen ","He ","Xu ","Zhen ","Zhu ","Zheng ","Gou ","Zi ","Zi ","Zhan ","Gu ","Fu ","Quan ","Die ","Ling ","Di ","Yang ","Li ","Nao ","Pan ","Zhou ","Gan ","Yi ","Ju ","Ao ","Zha ","Tuo ","Yi ","Qu ","Zhao ","Ping ","Bi ","Xiong ","Qu ","Ba ","Da ","Zu ","Tao ","Zhu ","Ci ","Zhe ","Yong ","Xu ","Xun ","Yi ","Huang ","He ","Shi ","Cha ","Jiao ","Shi ","Hen ","Cha ","Gou ","Gui ","Quan ","Hui ","Jie ","Hua ","Gai ","Xiang ","Wei ","Shen ","Chou ","Tong ","Mi ","Zhan ","Ming ","E ","Hui ","Yan ","Xiong ","Gua ","Er ","Beng ","Tiao ","Chi ","Lei ","Zhu ","Kuang ","Kua ","Wu ","Yu ","Teng ","Ji ","Zhi ","Ren ","Su ","Lang ","E ","Kuang ","E ","Shi ","Ting ","Dan ","Bo ","Chan ","You ","Heng ","Qiao ","Qin ","Shua ","An ","Yu ","Xiao ","Cheng ","Jie ","Xian ","Wu ","Wu ","Gao ","Song ","Pu ","Hui ","Jing ","Shuo ","Zhen ","Shuo ","Du ","Yasashi ","Chang ","Shui ","Jie ","Ke ","Qu ","Cong ","Xiao ","Sui ","Wang ","Xuan ","Fei ","Chi ","Ta ","Yi ","Na ","Yin ","Diao ","Pi ","Chuo ","Chan ","Chen ","Zhun ","Ji ","Qi ","Tan ","Zhui ","Wei ","Ju ","Qing ","Jian ","Zheng ","Ze ","Zou ","Qian ","Zhuo ","Liang ","Jian ","Zhu ","Hao ","Lun ","Shen ","Biao ","Huai ","Pian ","Yu ","Die ","Xu ","Pian ","Shi ","Xuan ","Shi ","Hun ","Hua ","E ","Zhong ","Di ","Xie ","Fu ","Pu ","Ting ","Jian ","Qi ","Yu ","Zi ","Chuan ","Xi ","Hui ","Yin ","An ","Xian ","Nan ","Chen ","Feng ","Zhu ","Yang ","Yan ","Heng ","Xuan ","Ge ","Nuo ","Qi " ];

},{}],107:[function(require,module,exports){
module.exports = [ "Mou ","Ye ","Wei ","[?] ","Teng ","Zou ","Shan ","Jian ","Bo ","Ku ","Huang ","Huo ","Ge ","Ying ","Mi ","Xiao ","Mi ","Xi ","Qiang ","Chen ","Nue ","Ti ","Su ","Bang ","Chi ","Qian ","Shi ","Jiang ","Yuan ","Xie ","Xue ","Tao ","Yao ","Yao ","[?] ","Yu ","Biao ","Cong ","Qing ","Li ","Mo ","Mo ","Shang ","Zhe ","Miu ","Jian ","Ze ","Jie ","Lian ","Lou ","Can ","Ou ","Guan ","Xi ","Zhuo ","Ao ","Ao ","Jin ","Zhe ","Yi ","Hu ","Jiang ","Man ","Chao ","Han ","Hua ","Chan ","Xu ","Zeng ","Se ","Xi ","She ","Dui ","Zheng ","Nao ","Lan ","E ","Ying ","Jue ","Ji ","Zun ","Jiao ","Bo ","Hui ","Zhuan ","Mu ","Zen ","Zha ","Shi ","Qiao ","Tan ","Zen ","Pu ","Sheng ","Xuan ","Zao ","Tan ","Dang ","Sui ","Qian ","Ji ","Jiao ","Jing ","Lian ","Nou ","Yi ","Ai ","Zhan ","Pi ","Hui ","Hua ","Yi ","Yi ","Shan ","Rang ","Nou ","Qian ","Zhui ","Ta ","Hu ","Zhou ","Hao ","Ye ","Ying ","Jian ","Yu ","Jian ","Hui ","Du ","Zhe ","Xuan ","Zan ","Lei ","Shen ","Wei ","Chan ","Li ","Yi ","Bian ","Zhe ","Yan ","E ","Chou ","Wei ","Chou ","Yao ","Chan ","Rang ","Yin ","Lan ","Chen ","Huo ","Zhe ","Huan ","Zan ","Yi ","Dang ","Zhan ","Yan ","Du ","Yan ","Ji ","Ding ","Fu ","Ren ","Ji ","Jie ","Hong ","Tao ","Rang ","Shan ","Qi ","Tuo ","Xun ","Yi ","Xun ","Ji ","Ren ","Jiang ","Hui ","Ou ","Ju ","Ya ","Ne ","Xu ","E ","Lun ","Xiong ","Song ","Feng ","She ","Fang ","Jue ","Zheng ","Gu ","He ","Ping ","Zu ","Shi ","Xiong ","Zha ","Su ","Zhen ","Di ","Zou ","Ci ","Qu ","Zhao ","Bi ","Yi ","Yi ","Kuang ","Lei ","Shi ","Gua ","Shi ","Jie ","Hui ","Cheng ","Zhu ","Shen ","Hua ","Dan ","Gou ","Quan ","Gui ","Xun ","Yi ","Zheng ","Gai ","Xiang ","Cha ","Hun ","Xu ","Zhou ","Jie ","Wu ","Yu ","Qiao ","Wu ","Gao ","You ","Hui ","Kuang ","Shuo ","Song ","Ai ","Qing ","Zhu ","Zou ","Nuo ","Du ","Zhuo ","Fei ","Ke ","Wei " ];

},{}],108:[function(require,module,exports){
module.exports = [ "Yu ","Shui ","Shen ","Diao ","Chan ","Liang ","Zhun ","Sui ","Tan ","Shen ","Yi ","Mou ","Chen ","Die ","Huang ","Jian ","Xie ","Nue ","Ye ","Wei ","E ","Yu ","Xuan ","Chan ","Zi ","An ","Yan ","Di ","Mi ","Pian ","Xu ","Mo ","Dang ","Su ","Xie ","Yao ","Bang ","Shi ","Qian ","Mi ","Jin ","Man ","Zhe ","Jian ","Miu ","Tan ","Zen ","Qiao ","Lan ","Pu ","Jue ","Yan ","Qian ","Zhan ","Chen ","Gu ","Qian ","Hong ","Xia ","Jue ","Hong ","Han ","Hong ","Xi ","Xi ","Huo ","Liao ","Han ","Du ","Long ","Dou ","Jiang ","Qi ","Shi ","Li ","Deng ","Wan ","Bi ","Shu ","Xian ","Feng ","Zhi ","Zhi ","Yan ","Yan ","Shi ","Chu ","Hui ","Tun ","Yi ","Tun ","Yi ","Jian ","Ba ","Hou ","E ","Cu ","Xiang ","Huan ","Jian ","Ken ","Gai ","Qu ","Fu ","Xi ","Bin ","Hao ","Yu ","Zhu ","Jia ","[?] ","Xi ","Bo ","Wen ","Huan ","Bin ","Di ","Zong ","Fen ","Yi ","Zhi ","Bao ","Chai ","Han ","Pi ","Na ","Pi ","Gou ","Na ","You ","Diao ","Mo ","Si ","Xiu ","Huan ","Kun ","He ","He ","Mo ","Han ","Mao ","Li ","Ni ","Bi ","Yu ","Jia ","Tuan ","Mao ","Pi ","Xi ","E ","Ju ","Mo ","Chu ","Tan ","Huan ","Jue ","Bei ","Zhen ","Yuan ","Fu ","Cai ","Gong ","Te ","Yi ","Hang ","Wan ","Pin ","Huo ","Fan ","Tan ","Guan ","Ze ","Zhi ","Er ","Zhu ","Shi ","Bi ","Zi ","Er ","Gui ","Pian ","Bian ","Mai ","Dai ","Sheng ","Kuang ","Fei ","Tie ","Yi ","Chi ","Mao ","He ","Bi ","Lu ","Ren ","Hui ","Gai ","Pian ","Zi ","Jia ","Xu ","Zei ","Jiao ","Gai ","Zang ","Jian ","Ying ","Xun ","Zhen ","She ","Bin ","Bin ","Qiu ","She ","Chuan ","Zang ","Zhou ","Lai ","Zan ","Si ","Chen ","Shang ","Tian ","Pei ","Geng ","Xian ","Mai ","Jian ","Sui ","Fu ","Tan ","Cong ","Cong ","Zhi ","Ji ","Zhang ","Du ","Jin ","Xiong ","Shun ","Yun ","Bao ","Zai ","Lai ","Feng ","Cang ","Ji ","Sheng ","Ai ","Zhuan ","Fu ","Gou ","Sai ","Ze ","Liao " ];

},{}],109:[function(require,module,exports){
module.exports = [ "Wei ","Bai ","Chen ","Zhuan ","Zhi ","Zhui ","Biao ","Yun ","Zeng ","Tan ","Zan ","Yan ","[?] ","Shan ","Wan ","Ying ","Jin ","Gan ","Xian ","Zang ","Bi ","Du ","Shu ","Yan ","[?] ","Xuan ","Long ","Gan ","Zang ","Bei ","Zhen ","Fu ","Yuan ","Gong ","Cai ","Ze ","Xian ","Bai ","Zhang ","Huo ","Zhi ","Fan ","Tan ","Pin ","Bian ","Gou ","Zhu ","Guan ","Er ","Jian ","Bi ","Shi ","Tie ","Gui ","Kuang ","Dai ","Mao ","Fei ","He ","Yi ","Zei ","Zhi ","Jia ","Hui ","Zi ","Ren ","Lu ","Zang ","Zi ","Gai ","Jin ","Qiu ","Zhen ","Lai ","She ","Fu ","Du ","Ji ","Shu ","Shang ","Si ","Bi ","Zhou ","Geng ","Pei ","Tan ","Lai ","Feng ","Zhui ","Fu ","Zhuan ","Sai ","Ze ","Yan ","Zan ","Yun ","Zeng ","Shan ","Ying ","Gan ","Chi ","Xi ","She ","Nan ","Xiong ","Xi ","Cheng ","He ","Cheng ","Zhe ","Xia ","Tang ","Zou ","Zou ","Li ","Jiu ","Fu ","Zhao ","Gan ","Qi ","Shan ","Qiong ","Qin ","Xian ","Ci ","Jue ","Qin ","Chi ","Ci ","Chen ","Chen ","Die ","Ju ","Chao ","Di ","Se ","Zhan ","Zhu ","Yue ","Qu ","Jie ","Chi ","Chu ","Gua ","Xue ","Ci ","Tiao ","Duo ","Lie ","Gan ","Suo ","Cu ","Xi ","Zhao ","Su ","Yin ","Ju ","Jian ","Que ","Tang ","Chuo ","Cui ","Lu ","Qu ","Dang ","Qiu ","Zi ","Ti ","Qu ","Chi ","Huang ","Qiao ","Qiao ","Yao ","Zao ","Ti ","[?] ","Zan ","Zan ","Zu ","Pa ","Bao ","Ku ","Ke ","Dun ","Jue ","Fu ","Chen ","Jian ","Fang ","Zhi ","Sa ","Yue ","Pa ","Qi ","Yue ","Qiang ","Tuo ","Tai ","Yi ","Nian ","Ling ","Mei ","Ba ","Die ","Ku ","Tuo ","Jia ","Ci ","Pao ","Qia ","Zhu ","Ju ","Die ","Zhi ","Fu ","Pan ","Ju ","Shan ","Bo ","Ni ","Ju ","Li ","Gen ","Yi ","Ji ","Dai ","Xian ","Jiao ","Duo ","Zhu ","Zhuan ","Kua ","Zhuai ","Gui ","Qiong ","Kui ","Xiang ","Chi ","Lu ","Beng ","Zhi ","Jia ","Tiao ","Cai ","Jian ","Ta ","Qiao ","Bi ","Xian ","Duo ","Ji ","Ju ","Ji ","Shu ","Tu " ];

},{}],110:[function(require,module,exports){
module.exports = [ "Chu ","Jing ","Nie ","Xiao ","Bo ","Chi ","Qun ","Mou ","Shu ","Lang ","Yong ","Jiao ","Chou ","Qiao ","[?] ","Ta ","Jian ","Qi ","Wo ","Wei ","Zhuo ","Jie ","Ji ","Nie ","Ju ","Ju ","Lun ","Lu ","Leng ","Huai ","Ju ","Chi ","Wan ","Quan ","Ti ","Bo ","Zu ","Qie ","Ji ","Cu ","Zong ","Cai ","Zong ","Peng ","Zhi ","Zheng ","Dian ","Zhi ","Yu ","Duo ","Dun ","Chun ","Yong ","Zhong ","Di ","Zhe ","Chen ","Chuai ","Jian ","Gua ","Tang ","Ju ","Fu ","Zu ","Die ","Pian ","Rou ","Nuo ","Ti ","Cha ","Tui ","Jian ","Dao ","Cuo ","Xi ","Ta ","Qiang ","Zhan ","Dian ","Ti ","Ji ","Nie ","Man ","Liu ","Zhan ","Bi ","Chong ","Lu ","Liao ","Cu ","Tang ","Dai ","Suo ","Xi ","Kui ","Ji ","Zhi ","Qiang ","Di ","Man ","Zong ","Lian ","Beng ","Zao ","Nian ","Bie ","Tui ","Ju ","Deng ","Ceng ","Xian ","Fan ","Chu ","Zhong ","Dun ","Bo ","Cu ","Zu ","Jue ","Jue ","Lin ","Ta ","Qiao ","Qiao ","Pu ","Liao ","Dun ","Cuan ","Kuang ","Zao ","Ta ","Bi ","Bi ","Zhu ","Ju ","Chu ","Qiao ","Dun ","Chou ","Ji ","Wu ","Yue ","Nian ","Lin ","Lie ","Zhi ","Li ","Zhi ","Chan ","Chu ","Duan ","Wei ","Long ","Lin ","Xian ","Wei ","Zuan ","Lan ","Xie ","Rang ","Xie ","Nie ","Ta ","Qu ","Jie ","Cuan ","Zuan ","Xi ","Kui ","Jue ","Lin ","Shen ","Gong ","Dan ","Segare ","Qu ","Ti ","Duo ","Duo ","Gong ","Lang ","Nerau ","Luo ","Ai ","Ji ","Ju ","Tang ","Utsuke ","[?] ","Yan ","Shitsuke ","Kang ","Qu ","Lou ","Lao ","Tuo ","Zhi ","Yagate ","Ti ","Dao ","Yagate ","Yu ","Che ","Ya ","Gui ","Jun ","Wei ","Yue ","Xin ","Di ","Xuan ","Fan ","Ren ","Shan ","Qiang ","Shu ","Tun ","Chen ","Dai ","E ","Na ","Qi ","Mao ","Ruan ","Ren ","Fan ","Zhuan ","Hong ","Hu ","Qu ","Huang ","Di ","Ling ","Dai ","Ao ","Zhen ","Fan ","Kuang ","Ang ","Peng ","Bei ","Gu ","Ku ","Pao ","Zhu ","Rong ","E ","Ba ","Zhou ","Zhi ","Yao ","Ke ","Yi ","Qing ","Shi ","Ping " ];

},{}],111:[function(require,module,exports){
module.exports = [ "Er ","Qiong ","Ju ","Jiao ","Guang ","Lu ","Kai ","Quan ","Zhou ","Zai ","Zhi ","She ","Liang ","Yu ","Shao ","You ","Huan ","Yun ","Zhe ","Wan ","Fu ","Qing ","Zhou ","Ni ","Ling ","Zhe ","Zhan ","Liang ","Zi ","Hui ","Wang ","Chuo ","Guo ","Kan ","Yi ","Peng ","Qian ","Gun ","Nian ","Pian ","Guan ","Bei ","Lun ","Pai ","Liang ","Ruan ","Rou ","Ji ","Yang ","Xian ","Chuan ","Cou ","Qun ","Ge ","You ","Hong ","Shu ","Fu ","Zi ","Fu ","Wen ","Ben ","Zhan ","Yu ","Wen ","Tao ","Gu ","Zhen ","Xia ","Yuan ","Lu ","Jiu ","Chao ","Zhuan ","Wei ","Hun ","Sori ","Che ","Jiao ","Zhan ","Pu ","Lao ","Fen ","Fan ","Lin ","Ge ","Se ","Kan ","Huan ","Yi ","Ji ","Dui ","Er ","Yu ","Xian ","Hong ","Lei ","Pei ","Li ","Li ","Lu ","Lin ","Che ","Ya ","Gui ","Xuan ","Di ","Ren ","Zhuan ","E ","Lun ","Ruan ","Hong ","Ku ","Ke ","Lu ","Zhou ","Zhi ","Yi ","Hu ","Zhen ","Li ","Yao ","Qing ","Shi ","Zai ","Zhi ","Jiao ","Zhou ","Quan ","Lu ","Jiao ","Zhe ","Fu ","Liang ","Nian ","Bei ","Hui ","Gun ","Wang ","Liang ","Chuo ","Zi ","Cou ","Fu ","Ji ","Wen ","Shu ","Pei ","Yuan ","Xia ","Zhan ","Lu ","Che ","Lin ","Xin ","Gu ","Ci ","Ci ","Pi ","Zui ","Bian ","La ","La ","Ci ","Xue ","Ban ","Bian ","Bian ","Bian ","[?] ","Bian ","Ban ","Ci ","Bian ","Bian ","Chen ","Ru ","Nong ","Nong ","Zhen ","Chuo ","Chuo ","Suberu ","Reng ","Bian ","Bian ","Sip ","Ip ","Liao ","Da ","Chan ","Gan ","Qian ","Yu ","Yu ","Qi ","Xun ","Yi ","Guo ","Mai ","Qi ","Za ","Wang ","Jia ","Zhun ","Ying ","Ti ","Yun ","Jin ","Hang ","Ya ","Fan ","Wu ","Da ","E ","Huan ","Zhe ","Totemo ","Jin ","Yuan ","Wei ","Lian ","Chi ","Che ","Ni ","Tiao ","Zhi ","Yi ","Jiong ","Jia ","Chen ","Dai ","Er ","Di ","Po ","Wang ","Die ","Ze ","Tao ","Shu ","Tuo ","Kep ","Jing ","Hui ","Tong ","You ","Mi ","Beng ","Ji ","Nai ","Yi ","Jie ","Zhui ","Lie ","Xun " ];

},{}],112:[function(require,module,exports){
module.exports = [ "Tui ","Song ","Gua ","Tao ","Pang ","Hou ","Ni ","Dun ","Jiong ","Xuan ","Xun ","Bu ","You ","Xiao ","Qiu ","Tou ","Zhu ","Qiu ","Di ","Di ","Tu ","Jing ","Ti ","Dou ","Yi ","Zhe ","Tong ","Guang ","Wu ","Shi ","Cheng ","Su ","Zao ","Qun ","Feng ","Lian ","Suo ","Hui ","Li ","Sako ","Lai ","Ben ","Cuo ","Jue ","Beng ","Huan ","Dai ","Lu ","You ","Zhou ","Jin ","Yu ","Chuo ","Kui ","Wei ","Ti ","Yi ","Da ","Yuan ","Luo ","Bi ","Nuo ","Yu ","Dang ","Sui ","Dun ","Sui ","Yan ","Chuan ","Chi ","Ti ","Yu ","Shi ","Zhen ","You ","Yun ","E ","Bian ","Guo ","E ","Xia ","Huang ","Qiu ","Dao ","Da ","Wei ","Appare ","Yi ","Gou ","Yao ","Chu ","Liu ","Xun ","Ta ","Di ","Chi ","Yuan ","Su ","Ta ","Qian ","[?] ","Yao ","Guan ","Zhang ","Ao ","Shi ","Ce ","Chi ","Su ","Zao ","Zhe ","Dun ","Di ","Lou ","Chi ","Cuo ","Lin ","Zun ","Rao ","Qian ","Xuan ","Yu ","Yi ","Wu ","Liao ","Ju ","Shi ","Bi ","Yao ","Mai ","Xie ","Sui ","Huan ","Zhan ","Teng ","Er ","Miao ","Bian ","Bian ","La ","Li ","Yuan ","Yao ","Luo ","Li ","Yi ","Ting ","Deng ","Qi ","Yong ","Shan ","Han ","Yu ","Mang ","Ru ","Qiong ","[?] ","Kuang ","Fu ","Kang ","Bin ","Fang ","Xing ","Na ","Xin ","Shen ","Bang ","Yuan ","Cun ","Huo ","Xie ","Bang ","Wu ","Ju ","You ","Han ","Tai ","Qiu ","Bi ","Pei ","Bing ","Shao ","Bei ","Wa ","Di ","Zou ","Ye ","Lin ","Kuang ","Gui ","Zhu ","Shi ","Ku ","Yu ","Gai ","Ge ","Xi ","Zhi ","Ji ","Xun ","Hou ","Xing ","Jiao ","Xi ","Gui ","Nuo ","Lang ","Jia ","Kuai ","Zheng ","Otoko ","Yun ","Yan ","Cheng ","Dou ","Chi ","Lu ","Fu ","Wu ","Fu ","Gao ","Hao ","Lang ","Jia ","Geng ","Jun ","Ying ","Bo ","Xi ","Bei ","Li ","Yun ","Bu ","Xiao ","Qi ","Pi ","Qing ","Guo ","Zhou ","Tan ","Zou ","Ping ","Lai ","Ni ","Chen ","You ","Bu ","Xiang ","Dan ","Ju ","Yong ","Qiao ","Yi ","Du ","Yan ","Mei " ];

},{}],113:[function(require,module,exports){
module.exports = [ "Ruo ","Bei ","E ","Yu ","Juan ","Yu ","Yun ","Hou ","Kui ","Xiang ","Xiang ","Sou ","Tang ","Ming ","Xi ","Ru ","Chu ","Zi ","Zou ","Ju ","Wu ","Xiang ","Yun ","Hao ","Yong ","Bi ","Mo ","Chao ","Fu ","Liao ","Yin ","Zhuan ","Hu ","Qiao ","Yan ","Zhang ","Fan ","Qiao ","Xu ","Deng ","Bi ","Xin ","Bi ","Ceng ","Wei ","Zheng ","Mao ","Shan ","Lin ","Po ","Dan ","Meng ","Ye ","Cao ","Kuai ","Feng ","Meng ","Zou ","Kuang ","Lian ","Zan ","Chan ","You ","Qi ","Yan ","Chan ","Zan ","Ling ","Huan ","Xi ","Feng ","Zan ","Li ","You ","Ding ","Qiu ","Zhuo ","Pei ","Zhou ","Yi ","Hang ","Yu ","Jiu ","Yan ","Zui ","Mao ","Dan ","Xu ","Tou ","Zhen ","Fen ","Sakenomoto ","[?] ","Yun ","Tai ","Tian ","Qia ","Tuo ","Zuo ","Han ","Gu ","Su ","Po ","Chou ","Zai ","Ming ","Luo ","Chuo ","Chou ","You ","Tong ","Zhi ","Xian ","Jiang ","Cheng ","Yin ","Tu ","Xiao ","Mei ","Ku ","Suan ","Lei ","Pu ","Zui ","Hai ","Yan ","Xi ","Niang ","Wei ","Lu ","Lan ","Yan ","Tao ","Pei ","Zhan ","Chun ","Tan ","Zui ","Chuo ","Cu ","Kun ","Ti ","Mian ","Du ","Hu ","Xu ","Xing ","Tan ","Jiu ","Chun ","Yun ","Po ","Ke ","Sou ","Mi ","Quan ","Chou ","Cuo ","Yun ","Yong ","Ang ","Zha ","Hai ","Tang ","Jiang ","Piao ","Shan ","Yu ","Li ","Zao ","Lao ","Yi ","Jiang ","Pu ","Jiao ","Xi ","Tan ","Po ","Nong ","Yi ","Li ","Ju ","Jiao ","Yi ","Niang ","Ru ","Xun ","Chou ","Yan ","Ling ","Mi ","Mi ","Niang ","Xin ","Jiao ","Xi ","Mi ","Yan ","Bian ","Cai ","Shi ","You ","Shi ","Shi ","Li ","Zhong ","Ye ","Liang ","Li ","Jin ","Jin ","Qiu ","Yi ","Diao ","Dao ","Zhao ","Ding ","Po ","Qiu ","He ","Fu ","Zhen ","Zhi ","Ba ","Luan ","Fu ","Nai ","Diao ","Shan ","Qiao ","Kou ","Chuan ","Zi ","Fan ","Yu ","Hua ","Han ","Gong ","Qi ","Mang ","Ri ","Di ","Si ","Xi ","Yi ","Chai ","Shi ","Tu ","Xi ","Nu ","Qian ","Ishiyumi ","Jian ","Pi ","Ye ","Yin " ];

},{}],114:[function(require,module,exports){
module.exports = [ "Ba ","Fang ","Chen ","Xing ","Tou ","Yue ","Yan ","Fu ","Pi ","Na ","Xin ","E ","Jue ","Dun ","Gou ","Yin ","Qian ","Ban ","Ji ","Ren ","Chao ","Niu ","Fen ","Yun ","Ji ","Qin ","Pi ","Guo ","Hong ","Yin ","Jun ","Shi ","Yi ","Zhong ","Nie ","Gai ","Ri ","Huo ","Tai ","Kang ","Habaki ","Irori ","Ngaak ","[?] ","Duo ","Zi ","Ni ","Tu ","Shi ","Min ","Gu ","E ","Ling ","Bing ","Yi ","Gu ","Ba ","Pi ","Yu ","Si ","Zuo ","Bu ","You ","Dian ","Jia ","Zhen ","Shi ","Shi ","Tie ","Ju ","Zhan ","Shi ","She ","Xuan ","Zhao ","Bao ","He ","Bi ","Sheng ","Chu ","Shi ","Bo ","Zhu ","Chi ","Za ","Po ","Tong ","Qian ","Fu ","Zhai ","Liu ","Qian ","Fu ","Li ","Yue ","Pi ","Yang ","Ban ","Bo ","Jie ","Gou ","Shu ","Zheng ","Mu ","Ni ","Nie ","Di ","Jia ","Mu ","Dan ","Shen ","Yi ","Si ","Kuang ","Ka ","Bei ","Jian ","Tong ","Xing ","Hong ","Jiao ","Chi ","Er ","Ge ","Bing ","Shi ","Mou ","Jia ","Yin ","Jun ","Zhou ","Chong ","Shang ","Tong ","Mo ","Lei ","Ji ","Yu ","Xu ","Ren ","Zun ","Zhi ","Qiong ","Shan ","Chi ","Xian ","Xing ","Quan ","Pi ","Tie ","Zhu ","Hou ","Ming ","Kua ","Yao ","Xian ","Xian ","Xiu ","Jun ","Cha ","Lao ","Ji ","Pi ","Ru ","Mi ","Yi ","Yin ","Guang ","An ","Diou ","You ","Se ","Kao ","Qian ","Luan ","Kasugai ","Ai ","Diao ","Han ","Rui ","Shi ","Keng ","Qiu ","Xiao ","Zhe ","Xiu ","Zang ","Ti ","Cuo ","Gua ","Gong ","Zhong ","Dou ","Lu ","Mei ","Lang ","Wan ","Xin ","Yun ","Bei ","Wu ","Su ","Yu ","Chan ","Ting ","Bo ","Han ","Jia ","Hong ","Cuan ","Feng ","Chan ","Wan ","Zhi ","Si ","Xuan ","Wu ","Wu ","Tiao ","Gong ","Zhuo ","Lue ","Xing ","Qian ","Shen ","Han ","Lue ","Xie ","Chu ","Zheng ","Ju ","Xian ","Tie ","Mang ","Pu ","Li ","Pan ","Rui ","Cheng ","Gao ","Li ","Te ","Pyeng ","Zhu ","[?] ","Tu ","Liu ","Zui ","Ju ","Chang ","Yuan ","Jian ","Gang ","Diao ","Tao ","Chang " ];

},{}],115:[function(require,module,exports){
module.exports = [ "Lun ","Kua ","Ling ","Bei ","Lu ","Li ","Qiang ","Pou ","Juan ","Min ","Zui ","Peng ","An ","Pi ","Xian ","Ya ","Zhui ","Lei ","A ","Kong ","Ta ","Kun ","Du ","Wei ","Chui ","Zi ","Zheng ","Ben ","Nie ","Cong ","Qun ","Tan ","Ding ","Qi ","Qian ","Zhuo ","Qi ","Yu ","Jin ","Guan ","Mao ","Chang ","Tian ","Xi ","Lian ","Tao ","Gu ","Cuo ","Shu ","Zhen ","Lu ","Meng ","Lu ","Hua ","Biao ","Ga ","Lai ","Ken ","Kazari ","Bu ","Nai ","Wan ","Zan ","[?] ","De ","Xian ","[?] ","Huo ","Liang ","[?] ","Men ","Kai ","Ying ","Di ","Lian ","Guo ","Xian ","Du ","Tu ","Wei ","Cong ","Fu ","Rou ","Ji ","E ","Rou ","Chen ","Ti ","Zha ","Hong ","Yang ","Duan ","Xia ","Yu ","Keng ","Xing ","Huang ","Wei ","Fu ","Zhao ","Cha ","Qie ","She ","Hong ","Kui ","Tian ","Mou ","Qiao ","Qiao ","Hou ","Tou ","Cong ","Huan ","Ye ","Min ","Jian ","Duan ","Jian ","Song ","Kui ","Hu ","Xuan ","Duo ","Jie ","Zhen ","Bian ","Zhong ","Zi ","Xiu ","Ye ","Mei ","Pai ","Ai ","Jie ","[?] ","Mei ","Chuo ","Ta ","Bang ","Xia ","Lian ","Suo ","Xi ","Liu ","Zu ","Ye ","Nou ","Weng ","Rong ","Tang ","Suo ","Qiang ","Ge ","Shuo ","Chui ","Bo ","Pan ","Sa ","Bi ","Sang ","Gang ","Zi ","Wu ","Ying ","Huang ","Tiao ","Liu ","Kai ","Sun ","Sha ","Sou ","Wan ","Hao ","Zhen ","Zhen ","Luo ","Yi ","Yuan ","Tang ","Nie ","Xi ","Jia ","Ge ","Ma ","Juan ","Kasugai ","Habaki ","Suo ","[?] ","[?] ","[?] ","Na ","Lu ","Suo ","Ou ","Zu ","Tuan ","Xiu ","Guan ","Xuan ","Lian ","Shou ","Ao ","Man ","Mo ","Luo ","Bi ","Wei ","Liu ","Di ","Qiao ","Cong ","Yi ","Lu ","Ao ","Keng ","Qiang ","Cui ","Qi ","Chang ","Tang ","Man ","Yong ","Chan ","Feng ","Jing ","Biao ","Shu ","Lou ","Xiu ","Cong ","Long ","Zan ","Jian ","Cao ","Li ","Xia ","Xi ","Kang ","[?] ","Beng ","[?] ","[?] ","Zheng ","Lu ","Hua ","Ji ","Pu ","Hui ","Qiang ","Po ","Lin ","Suo ","Xiu ","San ","Cheng " ];

},{}],116:[function(require,module,exports){
module.exports = [ "Kui ","Si ","Liu ","Nao ","Heng ","Pie ","Sui ","Fan ","Qiao ","Quan ","Yang ","Tang ","Xiang ","Jue ","Jiao ","Zun ","Liao ","Jie ","Lao ","Dui ","Tan ","Zan ","Ji ","Jian ","Zhong ","Deng ","Ya ","Ying ","Dui ","Jue ","Nou ","Ti ","Pu ","Tie ","[?] ","[?] ","Ding ","Shan ","Kai ","Jian ","Fei ","Sui ","Lu ","Juan ","Hui ","Yu ","Lian ","Zhuo ","Qiao ","Qian ","Zhuo ","Lei ","Bi ","Tie ","Huan ","Ye ","Duo ","Guo ","Dang ","Ju ","Fen ","Da ","Bei ","Yi ","Ai ","Zong ","Xun ","Diao ","Zhu ","Heng ","Zhui ","Ji ","Nie ","Ta ","Huo ","Qing ","Bin ","Ying ","Kui ","Ning ","Xu ","Jian ","Jian ","Yari ","Cha ","Zhi ","Mie ","Li ","Lei ","Ji ","Zuan ","Kuang ","Shang ","Peng ","La ","Du ","Shuo ","Chuo ","Lu ","Biao ","Bao ","Lu ","[?] ","[?] ","Long ","E ","Lu ","Xin ","Jian ","Lan ","Bo ","Jian ","Yao ","Chan ","Xiang ","Jian ","Xi ","Guan ","Cang ","Nie ","Lei ","Cuan ","Qu ","Pan ","Luo ","Zuan ","Luan ","Zao ","Nie ","Jue ","Tang ","Shu ","Lan ","Jin ","Qiu ","Yi ","Zhen ","Ding ","Zhao ","Po ","Diao ","Tu ","Qian ","Chuan ","Shan ","Ji ","Fan ","Diao ","Men ","Nu ","Xi ","Chai ","Xing ","Gai ","Bu ","Tai ","Ju ","Dun ","Chao ","Zhong ","Na ","Bei ","Gang ","Ban ","Qian ","Yao ","Qin ","Jun ","Wu ","Gou ","Kang ","Fang ","Huo ","Tou ","Niu ","Ba ","Yu ","Qian ","Zheng ","Qian ","Gu ","Bo ","E ","Po ","Bu ","Ba ","Yue ","Zuan ","Mu ","Dan ","Jia ","Dian ","You ","Tie ","Bo ","Ling ","Shuo ","Qian ","Liu ","Bao ","Shi ","Xuan ","She ","Bi ","Ni ","Pi ","Duo ","Xing ","Kao ","Lao ","Er ","Mang ","Ya ","You ","Cheng ","Jia ","Ye ","Nao ","Zhi ","Dang ","Tong ","Lu ","Diao ","Yin ","Kai ","Zha ","Zhu ","Xian ","Ting ","Diu ","Xian ","Hua ","Quan ","Sha ","Jia ","Yao ","Ge ","Ming ","Zheng ","Se ","Jiao ","Yi ","Chan ","Chong ","Tang ","An ","Yin ","Ru ","Zhu ","Lao ","Pu ","Wu ","Lai ","Te ","Lian ","Keng " ];

},{}],117:[function(require,module,exports){
module.exports = [ "Xiao ","Suo ","Li ","Zheng ","Chu ","Guo ","Gao ","Tie ","Xiu ","Cuo ","Lue ","Feng ","Xin ","Liu ","Kai ","Jian ","Rui ","Ti ","Lang ","Qian ","Ju ","A ","Qiang ","Duo ","Tian ","Cuo ","Mao ","Ben ","Qi ","De ","Kua ","Kun ","Chang ","Xi ","Gu ","Luo ","Chui ","Zhui ","Jin ","Zhi ","Xian ","Juan ","Huo ","Pou ","Tan ","Ding ","Jian ","Ju ","Meng ","Zi ","Qie ","Ying ","Kai ","Qiang ","Song ","E ","Cha ","Qiao ","Zhong ","Duan ","Sou ","Huang ","Huan ","Ai ","Du ","Mei ","Lou ","Zi ","Fei ","Mei ","Mo ","Zhen ","Bo ","Ge ","Nie ","Tang ","Juan ","Nie ","Na ","Liu ","Hao ","Bang ","Yi ","Jia ","Bin ","Rong ","Biao ","Tang ","Man ","Luo ","Beng ","Yong ","Jing ","Di ","Zu ","Xuan ","Liu ","Tan ","Jue ","Liao ","Pu ","Lu ","Dui ","Lan ","Pu ","Cuan ","Qiang ","Deng ","Huo ","Lei ","Huan ","Zhuo ","Lian ","Yi ","Cha ","Biao ","La ","Chan ","Xiang ","Chang ","Chang ","Jiu ","Ao ","Die ","Qu ","Liao ","Mi ","Chang ","Men ","Ma ","Shuan ","Shan ","Huo ","Men ","Yan ","Bi ","Han ","Bi ","San ","Kai ","Kang ","Beng ","Hong ","Run ","San ","Xian ","Xian ","Jian ","Min ","Xia ","Yuru ","Dou ","Zha ","Nao ","Jian ","Peng ","Xia ","Ling ","Bian ","Bi ","Run ","He ","Guan ","Ge ","Ge ","Fa ","Chu ","Hong ","Gui ","Min ","Se ","Kun ","Lang ","Lu ","Ting ","Sha ","Ju ","Yue ","Yue ","Chan ","Qu ","Lin ","Chang ","Shai ","Kun ","Yan ","Min ","Yan ","E ","Hun ","Yu ","Wen ","Xiang ","Bao ","Xiang ","Qu ","Yao ","Wen ","Ban ","An ","Wei ","Yin ","Kuo ","Que ","Lan ","Du ","[?] ","Phwung ","Tian ","Nie ","Ta ","Kai ","He ","Que ","Chuang ","Guan ","Dou ","Qi ","Kui ","Tang ","Guan ","Piao ","Kan ","Xi ","Hui ","Chan ","Pi ","Dang ","Huan ","Ta ","Wen ","[?] ","Men ","Shuan ","Shan ","Yan ","Han ","Bi ","Wen ","Chuang ","Run ","Wei ","Xian ","Hong ","Jian ","Min ","Kang ","Men ","Zha ","Nao ","Gui ","Wen ","Ta ","Min ","Lu ","Kai " ];

},{}],118:[function(require,module,exports){
module.exports = [ "Fa ","Ge ","He ","Kun ","Jiu ","Yue ","Lang ","Du ","Yu ","Yan ","Chang ","Xi ","Wen ","Hun ","Yan ","E ","Chan ","Lan ","Qu ","Hui ","Kuo ","Que ","Ge ","Tian ","Ta ","Que ","Kan ","Huan ","Fu ","Fu ","Le ","Dui ","Xin ","Qian ","Wu ","Yi ","Tuo ","Yin ","Yang ","Dou ","E ","Sheng ","Ban ","Pei ","Keng ","Yun ","Ruan ","Zhi ","Pi ","Jing ","Fang ","Yang ","Yin ","Zhen ","Jie ","Cheng ","E ","Qu ","Di ","Zu ","Zuo ","Dian ","Ling ","A ","Tuo ","Tuo ","Po ","Bing ","Fu ","Ji ","Lu ","Long ","Chen ","Xing ","Duo ","Lou ","Mo ","Jiang ","Shu ","Duo ","Xian ","Er ","Gui ","Yu ","Gai ","Shan ","Xun ","Qiao ","Xing ","Chun ","Fu ","Bi ","Xia ","Shan ","Sheng ","Zhi ","Pu ","Dou ","Yuan ","Zhen ","Chu ","Xian ","Tou ","Nie ","Yun ","Xian ","Pei ","Pei ","Zou ","Yi ","Dui ","Lun ","Yin ","Ju ","Chui ","Chen ","Pi ","Ling ","Tao ","Xian ","Lu ","Sheng ","Xian ","Yin ","Zhu ","Yang ","Reng ","Shan ","Chong ","Yan ","Yin ","Yu ","Ti ","Yu ","Long ","Wei ","Wei ","Nie ","Dui ","Sui ","An ","Huang ","Jie ","Sui ","Yin ","Gai ","Yan ","Hui ","Ge ","Yun ","Wu ","Wei ","Ai ","Xi ","Tang ","Ji ","Zhang ","Dao ","Ao ","Xi ","Yin ","[?] ","Rao ","Lin ","Tui ","Deng ","Pi ","Sui ","Sui ","Yu ","Xian ","Fen ","Ni ","Er ","Ji ","Dao ","Xi ","Yin ","E ","Hui ","Long ","Xi ","Li ","Li ","Li ","Zhui ","He ","Zhi ","Zhun ","Jun ","Nan ","Yi ","Que ","Yan ","Qian ","Ya ","Xiong ","Ya ","Ji ","Gu ","Huan ","Zhi ","Gou ","Jun ","Ci ","Yong ","Ju ","Chu ","Hu ","Za ","Luo ","Yu ","Chou ","Diao ","Sui ","Han ","Huo ","Shuang ","Guan ","Chu ","Za ","Yong ","Ji ","Xi ","Chou ","Liu ","Li ","Nan ","Xue ","Za ","Ji ","Ji ","Yu ","Yu ","Xue ","Na ","Fou ","Se ","Mu ","Wen ","Fen ","Pang ","Yun ","Li ","Li ","Ang ","Ling ","Lei ","An ","Bao ","Meng ","Dian ","Dang ","Xing ","Wu ","Zhao " ];

},{}],119:[function(require,module,exports){
module.exports = [ "Xu ","Ji ","Mu ","Chen ","Xiao ","Zha ","Ting ","Zhen ","Pei ","Mei ","Ling ","Qi ","Chou ","Huo ","Sha ","Fei ","Weng ","Zhan ","Yin ","Ni ","Chou ","Tun ","Lin ","[?] ","Dong ","Ying ","Wu ","Ling ","Shuang ","Ling ","Xia ","Hong ","Yin ","Mo ","Mai ","Yun ","Liu ","Meng ","Bin ","Wu ","Wei ","Huo ","Yin ","Xi ","Yi ","Ai ","Dan ","Deng ","Xian ","Yu ","Lu ","Long ","Dai ","Ji ","Pang ","Yang ","Ba ","Pi ","Wei ","[?] ","Xi ","Ji ","Mai ","Meng ","Meng ","Lei ","Li ","Huo ","Ai ","Fei ","Dai ","Long ","Ling ","Ai ","Feng ","Li ","Bao ","[?] ","He ","He ","Bing ","Qing ","Qing ","Jing ","Tian ","Zhen ","Jing ","Cheng ","Qing ","Jing ","Jing ","Dian ","Jing ","Tian ","Fei ","Fei ","Kao ","Mi ","Mian ","Mian ","Pao ","Ye ","Tian ","Hui ","Ye ","Ge ","Ding ","Cha ","Jian ","Ren ","Di ","Du ","Wu ","Ren ","Qin ","Jin ","Xue ","Niu ","Ba ","Yin ","Sa ","Na ","Mo ","Zu ","Da ","Ban ","Yi ","Yao ","Tao ","Tuo ","Jia ","Hong ","Pao ","Yang ","Tomo ","Yin ","Jia ","Tao ","Ji ","Xie ","An ","An ","Hen ","Gong ","Kohaze ","Da ","Qiao ","Ting ","Wan ","Ying ","Sui ","Tiao ","Qiao ","Xuan ","Kong ","Beng ","Ta ","Zhang ","Bing ","Kuo ","Ju ","La ","Xie ","Rou ","Bang ","Yi ","Qiu ","Qiu ","He ","Xiao ","Mu ","Ju ","Jian ","Bian ","Di ","Jian ","On ","Tao ","Gou ","Ta ","Bei ","Xie ","Pan ","Ge ","Bi ","Kuo ","Tang ","Lou ","Gui ","Qiao ","Xue ","Ji ","Jian ","Jiang ","Chan ","Da ","Huo ","Xian ","Qian ","Du ","Wa ","Jian ","Lan ","Wei ","Ren ","Fu ","Mei ","Juan ","Ge ","Wei ","Qiao ","Han ","Chang ","[?] ","Rou ","Xun ","She ","Wei ","Ge ","Bei ","Tao ","Gou ","Yun ","[?] ","Bi ","Wei ","Hui ","Du ","Wa ","Du ","Wei ","Ren ","Fu ","Han ","Wei ","Yun ","Tao ","Jiu ","Jiu ","Xian ","Xie ","Xian ","Ji ","Yin ","Za ","Yun ","Shao ","Le ","Peng ","Heng ","Ying ","Yun ","Peng ","Yin ","Yin ","Xiang " ];

},{}],120:[function(require,module,exports){
module.exports = [ "Hu ","Ye ","Ding ","Qing ","Pan ","Xiang ","Shun ","Han ","Xu ","Yi ","Xu ","Gu ","Song ","Kui ","Qi ","Hang ","Yu ","Wan ","Ban ","Dun ","Di ","Dan ","Pan ","Po ","Ling ","Ce ","Jing ","Lei ","He ","Qiao ","E ","E ","Wei ","Jie ","Gua ","Shen ","Yi ","Shen ","Hai ","Dui ","Pian ","Ping ","Lei ","Fu ","Jia ","Tou ","Hui ","Kui ","Jia ","Le ","Tian ","Cheng ","Ying ","Jun ","Hu ","Han ","Jing ","Tui ","Tui ","Pin ","Lai ","Tui ","Zi ","Zi ","Chui ","Ding ","Lai ","Yan ","Han ","Jian ","Ke ","Cui ","Jiong ","Qin ","Yi ","Sai ","Ti ","E ","E ","Yan ","Hun ","Kan ","Yong ","Zhuan ","Yan ","Xian ","Xin ","Yi ","Yuan ","Sang ","Dian ","Dian ","Jiang ","Ku ","Lei ","Liao ","Piao ","Yi ","Man ","Qi ","Rao ","Hao ","Qiao ","Gu ","Xun ","Qian ","Hui ","Zhan ","Ru ","Hong ","Bin ","Xian ","Pin ","Lu ","Lan ","Nie ","Quan ","Ye ","Ding ","Qing ","Han ","Xiang ","Shun ","Xu ","Xu ","Wan ","Gu ","Dun ","Qi ","Ban ","Song ","Hang ","Yu ","Lu ","Ling ","Po ","Jing ","Jie ","Jia ","Tian ","Han ","Ying ","Jiong ","Hai ","Yi ","Pin ","Hui ","Tui ","Han ","Ying ","Ying ","Ke ","Ti ","Yong ","E ","Zhuan ","Yan ","E ","Nie ","Man ","Dian ","Sang ","Hao ","Lei ","Zhan ","Ru ","Pin ","Quan ","Feng ","Biao ","Oroshi ","Fu ","Xia ","Zhan ","Biao ","Sa ","Ba ","Tai ","Lie ","Gua ","Xuan ","Shao ","Ju ","Bi ","Si ","Wei ","Yang ","Yao ","Sou ","Kai ","Sao ","Fan ","Liu ","Xi ","Liao ","Piao ","Piao ","Liu ","Biao ","Biao ","Biao ","Liao ","[?] ","Se ","Feng ","Biao ","Feng ","Yang ","Zhan ","Biao ","Sa ","Ju ","Si ","Sou ","Yao ","Liu ","Piao ","Biao ","Biao ","Fei ","Fan ","Fei ","Fei ","Shi ","Shi ","Can ","Ji ","Ding ","Si ","Tuo ","Zhan ","Sun ","Xiang ","Tun ","Ren ","Yu ","Juan ","Chi ","Yin ","Fan ","Fan ","Sun ","Yin ","Zhu ","Yi ","Zhai ","Bi ","Jie ","Tao ","Liu ","Ci ","Tie ","Si ","Bao ","Shi ","Duo " ];

},{}],121:[function(require,module,exports){
module.exports = [ "Hai ","Ren ","Tian ","Jiao ","Jia ","Bing ","Yao ","Tong ","Ci ","Xiang ","Yang ","Yang ","Er ","Yan ","Le ","Yi ","Can ","Bo ","Nei ","E ","Bu ","Jun ","Dou ","Su ","Yu ","Shi ","Yao ","Hun ","Guo ","Shi ","Jian ","Zhui ","Bing ","Xian ","Bu ","Ye ","Tan ","Fei ","Zhang ","Wei ","Guan ","E ","Nuan ","Hun ","Hu ","Huang ","Tie ","Hui ","Jian ","Hou ","He ","Xing ","Fen ","Wei ","Gu ","Cha ","Song ","Tang ","Bo ","Gao ","Xi ","Kui ","Liu ","Sou ","Tao ","Ye ","Yun ","Mo ","Tang ","Man ","Bi ","Yu ","Xiu ","Jin ","San ","Kui ","Zhuan ","Shan ","Chi ","Dan ","Yi ","Ji ","Rao ","Cheng ","Yong ","Tao ","Hui ","Xiang ","Zhan ","Fen ","Hai ","Meng ","Yan ","Mo ","Chan ","Xiang ","Luo ","Zuan ","Nang ","Shi ","Ding ","Ji ","Tuo ","Xing ","Tun ","Xi ","Ren ","Yu ","Chi ","Fan ","Yin ","Jian ","Shi ","Bao ","Si ","Duo ","Yi ","Er ","Rao ","Xiang ","Jia ","Le ","Jiao ","Yi ","Bing ","Bo ","Dou ","E ","Yu ","Nei ","Jun ","Guo ","Hun ","Xian ","Guan ","Cha ","Kui ","Gu ","Sou ","Chan ","Ye ","Mo ","Bo ","Liu ","Xiu ","Jin ","Man ","San ","Zhuan ","Nang ","Shou ","Kui ","Guo ","Xiang ","Fen ","Ba ","Ni ","Bi ","Bo ","Tu ","Han ","Fei ","Jian ","An ","Ai ","Fu ","Xian ","Wen ","Xin ","Fen ","Bin ","Xing ","Ma ","Yu ","Feng ","Han ","Di ","Tuo ","Tuo ","Chi ","Xun ","Zhu ","Zhi ","Pei ","Xin ","Ri ","Sa ","Yin ","Wen ","Zhi ","Dan ","Lu ","You ","Bo ","Bao ","Kuai ","Tuo ","Yi ","Qu ","[?] ","Qu ","Jiong ","Bo ","Zhao ","Yuan ","Peng ","Zhou ","Ju ","Zhu ","Nu ","Ju ","Pi ","Zang ","Jia ","Ling ","Zhen ","Tai ","Fu ","Yang ","Shi ","Bi ","Tuo ","Tuo ","Si ","Liu ","Ma ","Pian ","Tao ","Zhi ","Rong ","Teng ","Dong ","Xun ","Quan ","Shen ","Jiong ","Er ","Hai ","Bo ","Zhu ","Yin ","Luo ","Shuu ","Dan ","Xie ","Liu ","Ju ","Song ","Qin ","Mang ","Liang ","Han ","Tu ","Xuan ","Tui ","Jun " ];

},{}],122:[function(require,module,exports){
module.exports = [ "E ","Cheng ","Xin ","Ai ","Lu ","Zhui ","Zhou ","She ","Pian ","Kun ","Tao ","Lai ","Zong ","Ke ","Qi ","Qi ","Yan ","Fei ","Sao ","Yan ","Jie ","Yao ","Wu ","Pian ","Cong ","Pian ","Qian ","Fei ","Huang ","Jian ","Huo ","Yu ","Ti ","Quan ","Xia ","Zong ","Kui ","Rou ","Si ","Gua ","Tuo ","Kui ","Sou ","Qian ","Cheng ","Zhi ","Liu ","Pang ","Teng ","Xi ","Cao ","Du ","Yan ","Yuan ","Zou ","Sao ","Shan ","Li ","Zhi ","Shuang ","Lu ","Xi ","Luo ","Zhang ","Mo ","Ao ","Can ","Piao ","Cong ","Qu ","Bi ","Zhi ","Yu ","Xu ","Hua ","Bo ","Su ","Xiao ","Lin ","Chan ","Dun ","Liu ","Tuo ","Zeng ","Tan ","Jiao ","Tie ","Yan ","Luo ","Zhan ","Jing ","Yi ","Ye ","Tuo ","Bin ","Zou ","Yan ","Peng ","Lu ","Teng ","Xiang ","Ji ","Shuang ","Ju ","Xi ","Huan ","Li ","Biao ","Ma ","Yu ","Tuo ","Xun ","Chi ","Qu ","Ri ","Bo ","Lu ","Zang ","Shi ","Si ","Fu ","Ju ","Zou ","Zhu ","Tuo ","Nu ","Jia ","Yi ","Tai ","Xiao ","Ma ","Yin ","Jiao ","Hua ","Luo ","Hai ","Pian ","Biao ","Li ","Cheng ","Yan ","Xin ","Qin ","Jun ","Qi ","Qi ","Ke ","Zhui ","Zong ","Su ","Can ","Pian ","Zhi ","Kui ","Sao ","Wu ","Ao ","Liu ","Qian ","Shan ","Piao ","Luo ","Cong ","Chan ","Zou ","Ji ","Shuang ","Xiang ","Gu ","Wei ","Wei ","Wei ","Yu ","Gan ","Yi ","Ang ","Tou ","Xie ","Bao ","Bi ","Chi ","Ti ","Di ","Ku ","Hai ","Qiao ","Gou ","Kua ","Ge ","Tui ","Geng ","Pian ","Bi ","Ke ","Ka ","Yu ","Sui ","Lou ","Bo ","Xiao ","Pang ","Bo ","Ci ","Kuan ","Bin ","Mo ","Liao ","Lou ","Nao ","Du ","Zang ","Sui ","Ti ","Bin ","Kuan ","Lu ","Gao ","Gao ","Qiao ","Kao ","Qiao ","Lao ","Zao ","Biao ","Kun ","Kun ","Ti ","Fang ","Xiu ","Ran ","Mao ","Dan ","Kun ","Bin ","Fa ","Tiao ","Peng ","Zi ","Fa ","Ran ","Ti ","Pao ","Pi ","Mao ","Fu ","Er ","Rong ","Qu ","Gong ","Xiu ","Gua ","Ji ","Peng ","Zhua ","Shao ","Sha " ];

},{}],123:[function(require,module,exports){
module.exports = [ "Ti ","Li ","Bin ","Zong ","Ti ","Peng ","Song ","Zheng ","Quan ","Zong ","Shun ","Jian ","Duo ","Hu ","La ","Jiu ","Qi ","Lian ","Zhen ","Bin ","Peng ","Mo ","San ","Man ","Man ","Seng ","Xu ","Lie ","Qian ","Qian ","Nong ","Huan ","Kuai ","Ning ","Bin ","Lie ","Rang ","Dou ","Dou ","Nao ","Hong ","Xi ","Dou ","Han ","Dou ","Dou ","Jiu ","Chang ","Yu ","Yu ","Li ","Juan ","Fu ","Qian ","Gui ","Zong ","Liu ","Gui ","Shang ","Yu ","Gui ","Mei ","Ji ","Qi ","Jie ","Kui ","Hun ","Ba ","Po ","Mei ","Xu ","Yan ","Xiao ","Liang ","Yu ","Tui ","Qi ","Wang ","Liang ","Wei ","Jian ","Chi ","Piao ","Bi ","Mo ","Ji ","Xu ","Chou ","Yan ","Zhan ","Yu ","Dao ","Ren ","Ji ","Eri ","Gong ","Tuo ","Diao ","Ji ","Xu ","E ","E ","Sha ","Hang ","Tun ","Mo ","Jie ","Shen ","Fan ","Yuan ","Bi ","Lu ","Wen ","Hu ","Lu ","Za ","Fang ","Fen ","Na ","You ","Namazu ","Todo ","He ","Xia ","Qu ","Han ","Pi ","Ling ","Tuo ","Bo ","Qiu ","Ping ","Fu ","Bi ","Ji ","Wei ","Ju ","Diao ","Bo ","You ","Gun ","Pi ","Nian ","Xing ","Tai ","Bao ","Fu ","Zha ","Ju ","Gu ","Kajika ","Tong ","[?] ","Ta ","Jie ","Shu ","Hou ","Xiang ","Er ","An ","Wei ","Tiao ","Zhu ","Yin ","Lie ","Luo ","Tong ","Yi ","Qi ","Bing ","Wei ","Jiao ","Bu ","Gui ","Xian ","Ge ","Hui ","Bora ","Mate ","Kao ","Gori ","Duo ","Jun ","Ti ","Man ","Xiao ","Za ","Sha ","Qin ","Yu ","Nei ","Zhe ","Gun ","Geng ","Su ","Wu ","Qiu ","Ting ","Fu ","Wan ","You ","Li ","Sha ","Sha ","Gao ","Meng ","Ugui ","Asari ","Subashiri ","Kazunoko ","Yong ","Ni ","Zi ","Qi ","Qing ","Xiang ","Nei ","Chun ","Ji ","Diao ","Qie ","Gu ","Zhou ","Dong ","Lai ","Fei ","Ni ","Yi ","Kun ","Lu ","Jiu ","Chang ","Jing ","Lun ","Ling ","Zou ","Li ","Meng ","Zong ","Zhi ","Nian ","Shachi ","Dojou ","Sukesou ","Shi ","Shen ","Hun ","Shi ","Hou ","Xing ","Zhu ","La ","Zong ","Ji ","Bian ","Bian " ];

},{}],124:[function(require,module,exports){
module.exports = [ "Huan ","Quan ","Ze ","Wei ","Wei ","Yu ","Qun ","Rou ","Die ","Huang ","Lian ","Yan ","Qiu ","Qiu ","Jian ","Bi ","E ","Yang ","Fu ","Sai ","Jian ","Xia ","Tuo ","Hu ","Muroaji ","Ruo ","Haraka ","Wen ","Jian ","Hao ","Wu ","Fang ","Sao ","Liu ","Ma ","Shi ","Shi ","Yin ","Z ","Teng ","Ta ","Yao ","Ge ","Rong ","Qian ","Qi ","Wen ","Ruo ","Hatahata ","Lian ","Ao ","Le ","Hui ","Min ","Ji ","Tiao ","Qu ","Jian ","Sao ","Man ","Xi ","Qiu ","Biao ","Ji ","Ji ","Zhu ","Jiang ","Qiu ","Zhuan ","Yong ","Zhang ","Kang ","Xue ","Bie ","Jue ","Qu ","Xiang ","Bo ","Jiao ","Xun ","Su ","Huang ","Zun ","Shan ","Shan ","Fan ","Jue ","Lin ","Xun ","Miao ","Xi ","Eso ","Kyou ","Fen ","Guan ","Hou ","Kuai ","Zei ","Sao ","Zhan ","Gan ","Gui ","Sheng ","Li ","Chang ","Hatahata ","Shiira ","Mutsu ","Ru ","Ji ","Xu ","Huo ","Shiira ","Li ","Lie ","Li ","Mie ","Zhen ","Xiang ","E ","Lu ","Guan ","Li ","Xian ","Yu ","Dao ","Ji ","You ","Tun ","Lu ","Fang ","Ba ","He ","Bo ","Ping ","Nian ","Lu ","You ","Zha ","Fu ","Bo ","Bao ","Hou ","Pi ","Tai ","Gui ","Jie ","Kao ","Wei ","Er ","Tong ","Ze ","Hou ","Kuai ","Ji ","Jiao ","Xian ","Za ","Xiang ","Xun ","Geng ","Li ","Lian ","Jian ","Li ","Shi ","Tiao ","Gun ","Sha ","Wan ","Jun ","Ji ","Yong ","Qing ","Ling ","Qi ","Zou ","Fei ","Kun ","Chang ","Gu ","Ni ","Nian ","Diao ","Jing ","Shen ","Shi ","Zi ","Fen ","Die ","Bi ","Chang ","Shi ","Wen ","Wei ","Sai ","E ","Qiu ","Fu ","Huang ","Quan ","Jiang ","Bian ","Sao ","Ao ","Qi ","Ta ","Yin ","Yao ","Fang ","Jian ","Le ","Biao ","Xue ","Bie ","Man ","Min ","Yong ","Wei ","Xi ","Jue ","Shan ","Lin ","Zun ","Huo ","Gan ","Li ","Zhan ","Guan ","Niao ","Yi ","Fu ","Li ","Jiu ","Bu ","Yan ","Fu ","Diao ","Ji ","Feng ","Nio ","Gan ","Shi ","Feng ","Ming ","Bao ","Yuan ","Zhi ","Hu ","Qin ","Fu ","Fen ","Wen ","Jian ","Shi ","Yu " ];

},{}],125:[function(require,module,exports){
module.exports = [ "Fou ","Yiao ","Jue ","Jue ","Pi ","Huan ","Zhen ","Bao ","Yan ","Ya ","Zheng ","Fang ","Feng ","Wen ","Ou ","Te ","Jia ","Nu ","Ling ","Mie ","Fu ","Tuo ","Wen ","Li ","Bian ","Zhi ","Ge ","Yuan ","Zi ","Qu ","Xiao ","Zhi ","Dan ","Ju ","You ","Gu ","Zhong ","Yu ","Yang ","Rong ","Ya ","Tie ","Yu ","Shigi ","Ying ","Zhui ","Wu ","Er ","Gua ","Ai ","Zhi ","Yan ","Heng ","Jiao ","Ji ","Lie ","Zhu ","Ren ","Yi ","Hong ","Luo ","Ru ","Mou ","Ge ","Ren ","Jiao ","Xiu ","Zhou ","Zhi ","Luo ","Chidori ","Toki ","Ten ","Luan ","Jia ","Ji ","Yu ","Huan ","Tuo ","Bu ","Wu ","Juan ","Yu ","Bo ","Xun ","Xun ","Bi ","Xi ","Jun ","Ju ","Tu ","Jing ","Ti ","E ","E ","Kuang ","Hu ","Wu ","Shen ","Lai ","Ikaruga ","Kakesu ","Lu ","Ping ","Shu ","Fu ","An ","Zhao ","Peng ","Qin ","Qian ","Bei ","Diao ","Lu ","Que ","Jian ","Ju ","Tu ","Ya ","Yuan ","Qi ","Li ","Ye ","Zhui ","Kong ","Zhui ","Kun ","Sheng ","Qi ","Jing ","Yi ","Yi ","Jing ","Zi ","Lai ","Dong ","Qi ","Chun ","Geng ","Ju ","Qu ","Isuka ","Kikuitadaki ","Ji ","Shu ","[?] ","Chi ","Miao ","Rou ","An ","Qiu ","Ti ","Hu ","Ti ","E ","Jie ","Mao ","Fu ","Chun ","Tu ","Yan ","He ","Yuan ","Pian ","Yun ","Mei ","Hu ","Ying ","Dun ","Mu ","Ju ","Tsugumi ","Cang ","Fang ","Gu ","Ying ","Yuan ","Xuan ","Weng ","Shi ","He ","Chu ","Tang ","Xia ","Ruo ","Liu ","Ji ","Gu ","Jian ","Zhun ","Han ","Zi ","Zi ","Ni ","Yao ","Yan ","Ji ","Li ","Tian ","Kou ","Ti ","Ti ","Ni ","Tu ","Ma ","Jiao ","Gao ","Tian ","Chen ","Li ","Zhuan ","Zhe ","Ao ","Yao ","Yi ","Ou ","Chi ","Zhi ","Liao ","Rong ","Lou ","Bi ","Shuang ","Zhuo ","Yu ","Wu ","Jue ","Yin ","Quan ","Si ","Jiao ","Yi ","Hua ","Bi ","Ying ","Su ","Huang ","Fan ","Jiao ","Liao ","Yan ","Kao ","Jiu ","Xian ","Xian ","Tu ","Mai ","Zun ","Yu ","Ying ","Lu ","Tuan ","Xian ","Xue ","Yi ","Pi " ];

},{}],126:[function(require,module,exports){
module.exports = [ "Shu ","Luo ","Qi ","Yi ","Ji ","Zhe ","Yu ","Zhan ","Ye ","Yang ","Pi ","Ning ","Huo ","Mi ","Ying ","Meng ","Di ","Yue ","Yu ","Lei ","Bao ","Lu ","He ","Long ","Shuang ","Yue ","Ying ","Guan ","Qu ","Li ","Luan ","Niao ","Jiu ","Ji ","Yuan ","Ming ","Shi ","Ou ","Ya ","Cang ","Bao ","Zhen ","Gu ","Dong ","Lu ","Ya ","Xiao ","Yang ","Ling ","Zhi ","Qu ","Yuan ","Xue ","Tuo ","Si ","Zhi ","Er ","Gua ","Xiu ","Heng ","Zhou ","Ge ","Luan ","Hong ","Wu ","Bo ","Li ","Juan ","Hu ","E ","Yu ","Xian ","Ti ","Wu ","Que ","Miao ","An ","Kun ","Bei ","Peng ","Qian ","Chun ","Geng ","Yuan ","Su ","Hu ","He ","E ","Gu ","Qiu ","Zi ","Mei ","Mu ","Ni ","Yao ","Weng ","Liu ","Ji ","Ni ","Jian ","He ","Yi ","Ying ","Zhe ","Liao ","Liao ","Jiao ","Jiu ","Yu ","Lu ","Xuan ","Zhan ","Ying ","Huo ","Meng ","Guan ","Shuang ","Lu ","Jin ","Ling ","Jian ","Xian ","Cuo ","Jian ","Jian ","Yan ","Cuo ","Lu ","You ","Cu ","Ji ","Biao ","Cu ","Biao ","Zhu ","Jun ","Zhu ","Jian ","Mi ","Mi ","Wu ","Liu ","Chen ","Jun ","Lin ","Ni ","Qi ","Lu ","Jiu ","Jun ","Jing ","Li ","Xiang ","Yan ","Jia ","Mi ","Li ","She ","Zhang ","Lin ","Jing ","Ji ","Ling ","Yan ","Cu ","Mai ","Mai ","Ge ","Chao ","Fu ","Mian ","Mian ","Fu ","Pao ","Qu ","Qu ","Mou ","Fu ","Xian ","Lai ","Qu ","Mian ","[?] ","Feng ","Fu ","Qu ","Mian ","Ma ","Mo ","Mo ","Hui ","Ma ","Zou ","Nen ","Fen ","Huang ","Huang ","Jin ","Guang ","Tian ","Tou ","Heng ","Xi ","Kuang ","Heng ","Shu ","Li ","Nian ","Chi ","Hei ","Hei ","Yi ","Qian ","Dan ","Xi ","Tuan ","Mo ","Mo ","Qian ","Dai ","Chu ","You ","Dian ","Yi ","Xia ","Yan ","Qu ","Mei ","Yan ","Jing ","Yu ","Li ","Dang ","Du ","Can ","Yin ","An ","Yan ","Tan ","An ","Zhen ","Dai ","Can ","Yi ","Mei ","Dan ","Yan ","Du ","Lu ","Zhi ","Fen ","Fu ","Fu ","Min ","Min ","Yuan " ];

},{}],127:[function(require,module,exports){
module.exports = [ "Cu ","Qu ","Chao ","Wa ","Zhu ","Zhi ","Mang ","Ao ","Bie ","Tuo ","Bi ","Yuan ","Chao ","Tuo ","Ding ","Mi ","Nai ","Ding ","Zi ","Gu ","Gu ","Dong ","Fen ","Tao ","Yuan ","Pi ","Chang ","Gao ","Qi ","Yuan ","Tang ","Teng ","Shu ","Shu ","Fen ","Fei ","Wen ","Ba ","Diao ","Tuo ","Tong ","Qu ","Sheng ","Shi ","You ","Shi ","Ting ","Wu ","Nian ","Jing ","Hun ","Ju ","Yan ","Tu ","Ti ","Xi ","Xian ","Yan ","Lei ","Bi ","Yao ","Qiu ","Han ","Wu ","Wu ","Hou ","Xi ","Ge ","Zha ","Xiu ","Weng ","Zha ","Nong ","Nang ","Qi ","Zhai ","Ji ","Zi ","Ji ","Ji ","Qi ","Ji ","Chi ","Chen ","Chen ","He ","Ya ","Ken ","Xie ","Pao ","Cuo ","Shi ","Zi ","Chi ","Nian ","Ju ","Tiao ","Ling ","Ling ","Chu ","Quan ","Xie ","Ken ","Nie ","Jiu ","Yao ","Chuo ","Kun ","Yu ","Chu ","Yi ","Ni ","Cuo ","Zou ","Qu ","Nen ","Xian ","Ou ","E ","Wo ","Yi ","Chuo ","Zou ","Dian ","Chu ","Jin ","Ya ","Chi ","Chen ","He ","Ken ","Ju ","Ling ","Pao ","Tiao ","Zi ","Ken ","Yu ","Chuo ","Qu ","Wo ","Long ","Pang ","Gong ","Pang ","Yan ","Long ","Long ","Gong ","Kan ","Ta ","Ling ","Ta ","Long ","Gong ","Kan ","Gui ","Qiu ","Bie ","Gui ","Yue ","Chui ","He ","Jue ","Xie ","Yu ","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],128:[function(require,module,exports){
module.exports = [ "it","ix","i","ip","iet","iex","ie","iep","at","ax","a","ap","uox","uo","uop","ot","ox","o","op","ex","e","wu","bit","bix","bi","bip","biet","biex","bie","biep","bat","bax","ba","bap","buox","buo","buop","bot","box","bo","bop","bex","be","bep","but","bux","bu","bup","burx","bur","byt","byx","by","byp","byrx","byr","pit","pix","pi","pip","piex","pie","piep","pat","pax","pa","pap","puox","puo","puop","pot","pox","po","pop","put","pux","pu","pup","purx","pur","pyt","pyx","py","pyp","pyrx","pyr","bbit","bbix","bbi","bbip","bbiet","bbiex","bbie","bbiep","bbat","bbax","bba","bbap","bbuox","bbuo","bbuop","bbot","bbox","bbo","bbop","bbex","bbe","bbep","bbut","bbux","bbu","bbup","bburx","bbur","bbyt","bbyx","bby","bbyp","nbit","nbix","nbi","nbip","nbiex","nbie","nbiep","nbat","nbax","nba","nbap","nbot","nbox","nbo","nbop","nbut","nbux","nbu","nbup","nburx","nbur","nbyt","nbyx","nby","nbyp","nbyrx","nbyr","hmit","hmix","hmi","hmip","hmiex","hmie","hmiep","hmat","hmax","hma","hmap","hmuox","hmuo","hmuop","hmot","hmox","hmo","hmop","hmut","hmux","hmu","hmup","hmurx","hmur","hmyx","hmy","hmyp","hmyrx","hmyr","mit","mix","mi","mip","miex","mie","miep","mat","max","ma","map","muot","muox","muo","muop","mot","mox","mo","mop","mex","me","mut","mux","mu","mup","murx","mur","myt","myx","my","myp","fit","fix","fi","fip","fat","fax","fa","fap","fox","fo","fop","fut","fux","fu","fup","furx","fur","fyt","fyx","fy","fyp","vit","vix","vi","vip","viet","viex","vie","viep","vat","vax","va","vap","vot","vox","vo","vop","vex","vep","vut","vux","vu","vup","vurx","vur","vyt","vyx","vy","vyp","vyrx","vyr" ];

},{}],129:[function(require,module,exports){
module.exports = [ "dit","dix","di","dip","diex","die","diep","dat","dax","da","dap","duox","duo","dot","dox","do","dop","dex","de","dep","dut","dux","du","dup","durx","dur","tit","tix","ti","tip","tiex","tie","tiep","tat","tax","ta","tap","tuot","tuox","tuo","tuop","tot","tox","to","top","tex","te","tep","tut","tux","tu","tup","turx","tur","ddit","ddix","ddi","ddip","ddiex","ddie","ddiep","ddat","ddax","dda","ddap","dduox","dduo","dduop","ddot","ddox","ddo","ddop","ddex","dde","ddep","ddut","ddux","ddu","ddup","ddurx","ddur","ndit","ndix","ndi","ndip","ndiex","ndie","ndat","ndax","nda","ndap","ndot","ndox","ndo","ndop","ndex","nde","ndep","ndut","ndux","ndu","ndup","ndurx","ndur","hnit","hnix","hni","hnip","hniet","hniex","hnie","hniep","hnat","hnax","hna","hnap","hnuox","hnuo","hnot","hnox","hnop","hnex","hne","hnep","hnut","nit","nix","ni","nip","niex","nie","niep","nax","na","nap","nuox","nuo","nuop","not","nox","no","nop","nex","ne","nep","nut","nux","nu","nup","nurx","nur","hlit","hlix","hli","hlip","hliex","hlie","hliep","hlat","hlax","hla","hlap","hluox","hluo","hluop","hlox","hlo","hlop","hlex","hle","hlep","hlut","hlux","hlu","hlup","hlurx","hlur","hlyt","hlyx","hly","hlyp","hlyrx","hlyr","lit","lix","li","lip","liet","liex","lie","liep","lat","lax","la","lap","luot","luox","luo","luop","lot","lox","lo","lop","lex","le","lep","lut","lux","lu","lup","lurx","lur","lyt","lyx","ly","lyp","lyrx","lyr","git","gix","gi","gip","giet","giex","gie","giep","gat","gax","ga","gap","guot","guox","guo","guop","got","gox","go","gop","get","gex","ge","gep","gut","gux","gu","gup","gurx","gur","kit","kix","ki","kip","kiex","kie","kiep","kat" ];

},{}],130:[function(require,module,exports){
module.exports = [ "kax","ka","kap","kuox","kuo","kuop","kot","kox","ko","kop","ket","kex","ke","kep","kut","kux","ku","kup","kurx","kur","ggit","ggix","ggi","ggiex","ggie","ggiep","ggat","ggax","gga","ggap","gguot","gguox","gguo","gguop","ggot","ggox","ggo","ggop","gget","ggex","gge","ggep","ggut","ggux","ggu","ggup","ggurx","ggur","mgiex","mgie","mgat","mgax","mga","mgap","mguox","mguo","mguop","mgot","mgox","mgo","mgop","mgex","mge","mgep","mgut","mgux","mgu","mgup","mgurx","mgur","hxit","hxix","hxi","hxip","hxiet","hxiex","hxie","hxiep","hxat","hxax","hxa","hxap","hxuot","hxuox","hxuo","hxuop","hxot","hxox","hxo","hxop","hxex","hxe","hxep","ngiex","ngie","ngiep","ngat","ngax","nga","ngap","nguot","nguox","nguo","ngot","ngox","ngo","ngop","ngex","nge","ngep","hit","hiex","hie","hat","hax","ha","hap","huot","huox","huo","huop","hot","hox","ho","hop","hex","he","hep","wat","wax","wa","wap","wuox","wuo","wuop","wox","wo","wop","wex","we","wep","zit","zix","zi","zip","ziex","zie","ziep","zat","zax","za","zap","zuox","zuo","zuop","zot","zox","zo","zop","zex","ze","zep","zut","zux","zu","zup","zurx","zur","zyt","zyx","zy","zyp","zyrx","zyr","cit","cix","ci","cip","ciet","ciex","cie","ciep","cat","cax","ca","cap","cuox","cuo","cuop","cot","cox","co","cop","cex","ce","cep","cut","cux","cu","cup","curx","cur","cyt","cyx","cy","cyp","cyrx","cyr","zzit","zzix","zzi","zzip","zziet","zziex","zzie","zziep","zzat","zzax","zza","zzap","zzox","zzo","zzop","zzex","zze","zzep","zzux","zzu","zzup","zzurx","zzur","zzyt","zzyx","zzy","zzyp","zzyrx","zzyr","nzit","nzix","nzi","nzip","nziex","nzie","nziep","nzat","nzax","nza","nzap","nzuox","nzuo","nzox","nzop","nzex","nze","nzux","nzu" ];

},{}],131:[function(require,module,exports){
module.exports = [ "nzup","nzurx","nzur","nzyt","nzyx","nzy","nzyp","nzyrx","nzyr","sit","six","si","sip","siex","sie","siep","sat","sax","sa","sap","suox","suo","suop","sot","sox","so","sop","sex","se","sep","sut","sux","su","sup","surx","sur","syt","syx","sy","syp","syrx","syr","ssit","ssix","ssi","ssip","ssiex","ssie","ssiep","ssat","ssax","ssa","ssap","ssot","ssox","sso","ssop","ssex","sse","ssep","ssut","ssux","ssu","ssup","ssyt","ssyx","ssy","ssyp","ssyrx","ssyr","zhat","zhax","zha","zhap","zhuox","zhuo","zhuop","zhot","zhox","zho","zhop","zhet","zhex","zhe","zhep","zhut","zhux","zhu","zhup","zhurx","zhur","zhyt","zhyx","zhy","zhyp","zhyrx","zhyr","chat","chax","cha","chap","chuot","chuox","chuo","chuop","chot","chox","cho","chop","chet","chex","che","chep","chux","chu","chup","churx","chur","chyt","chyx","chy","chyp","chyrx","chyr","rrax","rra","rruox","rruo","rrot","rrox","rro","rrop","rret","rrex","rre","rrep","rrut","rrux","rru","rrup","rrurx","rrur","rryt","rryx","rry","rryp","rryrx","rryr","nrat","nrax","nra","nrap","nrox","nro","nrop","nret","nrex","nre","nrep","nrut","nrux","nru","nrup","nrurx","nrur","nryt","nryx","nry","nryp","nryrx","nryr","shat","shax","sha","shap","shuox","shuo","shuop","shot","shox","sho","shop","shet","shex","she","shep","shut","shux","shu","shup","shurx","shur","shyt","shyx","shy","shyp","shyrx","shyr","rat","rax","ra","rap","ruox","ruo","ruop","rot","rox","ro","rop","rex","re","rep","rut","rux","ru","rup","rurx","rur","ryt","ryx","ry","ryp","ryrx","ryr","jit","jix","ji","jip","jiet","jiex","jie","jiep","juot","juox","juo","juop","jot","jox","jo","jop","jut","jux","ju","jup","jurx","jur","jyt","jyx","jy","jyp","jyrx","jyr","qit","qix","qi","qip" ];

},{}],132:[function(require,module,exports){
module.exports = [ "qiet","qiex","qie","qiep","quot","quox","quo","quop","qot","qox","qo","qop","qut","qux","qu","qup","qurx","qur","qyt","qyx","qy","qyp","qyrx","qyr","jjit","jjix","jji","jjip","jjiet","jjiex","jjie","jjiep","jjuox","jjuo","jjuop","jjot","jjox","jjo","jjop","jjut","jjux","jju","jjup","jjurx","jjur","jjyt","jjyx","jjy","jjyp","njit","njix","nji","njip","njiet","njiex","njie","njiep","njuox","njuo","njot","njox","njo","njop","njux","nju","njup","njurx","njur","njyt","njyx","njy","njyp","njyrx","njyr","nyit","nyix","nyi","nyip","nyiet","nyiex","nyie","nyiep","nyuox","nyuo","nyuop","nyot","nyox","nyo","nyop","nyut","nyux","nyu","nyup","xit","xix","xi","xip","xiet","xiex","xie","xiep","xuox","xuo","xot","xox","xo","xop","xyt","xyx","xy","xyp","xyrx","xyr","yit","yix","yi","yip","yiet","yiex","yie","yiep","yuot","yuox","yuo","yuop","yot","yox","yo","yop","yut","yux","yu","yup","yurx","yur","yyt","yyx","yy","yyp","yyrx","yyr","[?]","[?]","[?]","Qot","Li","Kit","Nyip","Cyp","Ssi","Ggop","Gep","Mi","Hxit","Lyr","Bbut","Mop","Yo","Put","Hxuo","Tat","Ga","[?]","[?]","Ddur","Bur","Gguo","Nyop","Tu","Op","Jjut","Zot","Pyt","Hmo","Yit","Vur","Shy","Vep","Za","Jo","[?]","Jjy","Got","Jjie","Wo","Du","Shur","Lie","Cy","Cuop","Cip","Hxop","Shat","[?]","Shop","Che","Zziet","[?]","Ke","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],133:[function(require,module,exports){
module.exports = [ "ga","gag","gagg","gags","gan","ganj","ganh","gad","gal","galg","galm","galb","gals","galt","galp","galh","gam","gab","gabs","gas","gass","gang","gaj","gac","gak","gat","gap","gah","gae","gaeg","gaegg","gaegs","gaen","gaenj","gaenh","gaed","gael","gaelg","gaelm","gaelb","gaels","gaelt","gaelp","gaelh","gaem","gaeb","gaebs","gaes","gaess","gaeng","gaej","gaec","gaek","gaet","gaep","gaeh","gya","gyag","gyagg","gyags","gyan","gyanj","gyanh","gyad","gyal","gyalg","gyalm","gyalb","gyals","gyalt","gyalp","gyalh","gyam","gyab","gyabs","gyas","gyass","gyang","gyaj","gyac","gyak","gyat","gyap","gyah","gyae","gyaeg","gyaegg","gyaegs","gyaen","gyaenj","gyaenh","gyaed","gyael","gyaelg","gyaelm","gyaelb","gyaels","gyaelt","gyaelp","gyaelh","gyaem","gyaeb","gyaebs","gyaes","gyaess","gyaeng","gyaej","gyaec","gyaek","gyaet","gyaep","gyaeh","geo","geog","geogg","geogs","geon","geonj","geonh","geod","geol","geolg","geolm","geolb","geols","geolt","geolp","geolh","geom","geob","geobs","geos","geoss","geong","geoj","geoc","geok","geot","geop","geoh","ge","geg","gegg","gegs","gen","genj","genh","ged","gel","gelg","gelm","gelb","gels","gelt","gelp","gelh","gem","geb","gebs","ges","gess","geng","gej","gec","gek","get","gep","geh","gyeo","gyeog","gyeogg","gyeogs","gyeon","gyeonj","gyeonh","gyeod","gyeol","gyeolg","gyeolm","gyeolb","gyeols","gyeolt","gyeolp","gyeolh","gyeom","gyeob","gyeobs","gyeos","gyeoss","gyeong","gyeoj","gyeoc","gyeok","gyeot","gyeop","gyeoh","gye","gyeg","gyegg","gyegs","gyen","gyenj","gyenh","gyed","gyel","gyelg","gyelm","gyelb","gyels","gyelt","gyelp","gyelh","gyem","gyeb","gyebs","gyes","gyess","gyeng","gyej","gyec","gyek","gyet","gyep","gyeh","go","gog","gogg","gogs","gon","gonj","gonh","god","gol","golg","golm","golb","gols","golt","golp","golh","gom","gob","gobs","gos","goss","gong","goj","goc","gok","got","gop","goh","gwa","gwag","gwagg","gwags" ];

},{}],134:[function(require,module,exports){
module.exports = [ "gwan","gwanj","gwanh","gwad","gwal","gwalg","gwalm","gwalb","gwals","gwalt","gwalp","gwalh","gwam","gwab","gwabs","gwas","gwass","gwang","gwaj","gwac","gwak","gwat","gwap","gwah","gwae","gwaeg","gwaegg","gwaegs","gwaen","gwaenj","gwaenh","gwaed","gwael","gwaelg","gwaelm","gwaelb","gwaels","gwaelt","gwaelp","gwaelh","gwaem","gwaeb","gwaebs","gwaes","gwaess","gwaeng","gwaej","gwaec","gwaek","gwaet","gwaep","gwaeh","goe","goeg","goegg","goegs","goen","goenj","goenh","goed","goel","goelg","goelm","goelb","goels","goelt","goelp","goelh","goem","goeb","goebs","goes","goess","goeng","goej","goec","goek","goet","goep","goeh","gyo","gyog","gyogg","gyogs","gyon","gyonj","gyonh","gyod","gyol","gyolg","gyolm","gyolb","gyols","gyolt","gyolp","gyolh","gyom","gyob","gyobs","gyos","gyoss","gyong","gyoj","gyoc","gyok","gyot","gyop","gyoh","gu","gug","gugg","gugs","gun","gunj","gunh","gud","gul","gulg","gulm","gulb","guls","gult","gulp","gulh","gum","gub","gubs","gus","guss","gung","guj","guc","guk","gut","gup","guh","gweo","gweog","gweogg","gweogs","gweon","gweonj","gweonh","gweod","gweol","gweolg","gweolm","gweolb","gweols","gweolt","gweolp","gweolh","gweom","gweob","gweobs","gweos","gweoss","gweong","gweoj","gweoc","gweok","gweot","gweop","gweoh","gwe","gweg","gwegg","gwegs","gwen","gwenj","gwenh","gwed","gwel","gwelg","gwelm","gwelb","gwels","gwelt","gwelp","gwelh","gwem","gweb","gwebs","gwes","gwess","gweng","gwej","gwec","gwek","gwet","gwep","gweh","gwi","gwig","gwigg","gwigs","gwin","gwinj","gwinh","gwid","gwil","gwilg","gwilm","gwilb","gwils","gwilt","gwilp","gwilh","gwim","gwib","gwibs","gwis","gwiss","gwing","gwij","gwic","gwik","gwit","gwip","gwih","gyu","gyug","gyugg","gyugs","gyun","gyunj","gyunh","gyud","gyul","gyulg","gyulm","gyulb","gyuls","gyult","gyulp","gyulh","gyum","gyub","gyubs","gyus","gyuss","gyung","gyuj","gyuc","gyuk","gyut","gyup","gyuh","geu","geug","geugg","geugs","geun","geunj","geunh","geud" ];

},{}],135:[function(require,module,exports){
module.exports = [ "geul","geulg","geulm","geulb","geuls","geult","geulp","geulh","geum","geub","geubs","geus","geuss","geung","geuj","geuc","geuk","geut","geup","geuh","gyi","gyig","gyigg","gyigs","gyin","gyinj","gyinh","gyid","gyil","gyilg","gyilm","gyilb","gyils","gyilt","gyilp","gyilh","gyim","gyib","gyibs","gyis","gyiss","gying","gyij","gyic","gyik","gyit","gyip","gyih","gi","gig","gigg","gigs","gin","ginj","ginh","gid","gil","gilg","gilm","gilb","gils","gilt","gilp","gilh","gim","gib","gibs","gis","giss","ging","gij","gic","gik","git","gip","gih","gga","ggag","ggagg","ggags","ggan","gganj","gganh","ggad","ggal","ggalg","ggalm","ggalb","ggals","ggalt","ggalp","ggalh","ggam","ggab","ggabs","ggas","ggass","ggang","ggaj","ggac","ggak","ggat","ggap","ggah","ggae","ggaeg","ggaegg","ggaegs","ggaen","ggaenj","ggaenh","ggaed","ggael","ggaelg","ggaelm","ggaelb","ggaels","ggaelt","ggaelp","ggaelh","ggaem","ggaeb","ggaebs","ggaes","ggaess","ggaeng","ggaej","ggaec","ggaek","ggaet","ggaep","ggaeh","ggya","ggyag","ggyagg","ggyags","ggyan","ggyanj","ggyanh","ggyad","ggyal","ggyalg","ggyalm","ggyalb","ggyals","ggyalt","ggyalp","ggyalh","ggyam","ggyab","ggyabs","ggyas","ggyass","ggyang","ggyaj","ggyac","ggyak","ggyat","ggyap","ggyah","ggyae","ggyaeg","ggyaegg","ggyaegs","ggyaen","ggyaenj","ggyaenh","ggyaed","ggyael","ggyaelg","ggyaelm","ggyaelb","ggyaels","ggyaelt","ggyaelp","ggyaelh","ggyaem","ggyaeb","ggyaebs","ggyaes","ggyaess","ggyaeng","ggyaej","ggyaec","ggyaek","ggyaet","ggyaep","ggyaeh","ggeo","ggeog","ggeogg","ggeogs","ggeon","ggeonj","ggeonh","ggeod","ggeol","ggeolg","ggeolm","ggeolb","ggeols","ggeolt","ggeolp","ggeolh","ggeom","ggeob","ggeobs","ggeos","ggeoss","ggeong","ggeoj","ggeoc","ggeok","ggeot","ggeop","ggeoh","gge","ggeg","ggegg","ggegs","ggen","ggenj","ggenh","gged","ggel","ggelg","ggelm","ggelb","ggels","ggelt","ggelp","ggelh","ggem","ggeb","ggebs","gges","ggess","ggeng","ggej","ggec","ggek","gget","ggep","ggeh","ggyeo","ggyeog","ggyeogg","ggyeogs","ggyeon","ggyeonj","ggyeonh","ggyeod","ggyeol","ggyeolg","ggyeolm","ggyeolb" ];

},{}],136:[function(require,module,exports){
module.exports = [ "ggyeols","ggyeolt","ggyeolp","ggyeolh","ggyeom","ggyeob","ggyeobs","ggyeos","ggyeoss","ggyeong","ggyeoj","ggyeoc","ggyeok","ggyeot","ggyeop","ggyeoh","ggye","ggyeg","ggyegg","ggyegs","ggyen","ggyenj","ggyenh","ggyed","ggyel","ggyelg","ggyelm","ggyelb","ggyels","ggyelt","ggyelp","ggyelh","ggyem","ggyeb","ggyebs","ggyes","ggyess","ggyeng","ggyej","ggyec","ggyek","ggyet","ggyep","ggyeh","ggo","ggog","ggogg","ggogs","ggon","ggonj","ggonh","ggod","ggol","ggolg","ggolm","ggolb","ggols","ggolt","ggolp","ggolh","ggom","ggob","ggobs","ggos","ggoss","ggong","ggoj","ggoc","ggok","ggot","ggop","ggoh","ggwa","ggwag","ggwagg","ggwags","ggwan","ggwanj","ggwanh","ggwad","ggwal","ggwalg","ggwalm","ggwalb","ggwals","ggwalt","ggwalp","ggwalh","ggwam","ggwab","ggwabs","ggwas","ggwass","ggwang","ggwaj","ggwac","ggwak","ggwat","ggwap","ggwah","ggwae","ggwaeg","ggwaegg","ggwaegs","ggwaen","ggwaenj","ggwaenh","ggwaed","ggwael","ggwaelg","ggwaelm","ggwaelb","ggwaels","ggwaelt","ggwaelp","ggwaelh","ggwaem","ggwaeb","ggwaebs","ggwaes","ggwaess","ggwaeng","ggwaej","ggwaec","ggwaek","ggwaet","ggwaep","ggwaeh","ggoe","ggoeg","ggoegg","ggoegs","ggoen","ggoenj","ggoenh","ggoed","ggoel","ggoelg","ggoelm","ggoelb","ggoels","ggoelt","ggoelp","ggoelh","ggoem","ggoeb","ggoebs","ggoes","ggoess","ggoeng","ggoej","ggoec","ggoek","ggoet","ggoep","ggoeh","ggyo","ggyog","ggyogg","ggyogs","ggyon","ggyonj","ggyonh","ggyod","ggyol","ggyolg","ggyolm","ggyolb","ggyols","ggyolt","ggyolp","ggyolh","ggyom","ggyob","ggyobs","ggyos","ggyoss","ggyong","ggyoj","ggyoc","ggyok","ggyot","ggyop","ggyoh","ggu","ggug","ggugg","ggugs","ggun","ggunj","ggunh","ggud","ggul","ggulg","ggulm","ggulb","gguls","ggult","ggulp","ggulh","ggum","ggub","ggubs","ggus","gguss","ggung","gguj","gguc","gguk","ggut","ggup","gguh","ggweo","ggweog","ggweogg","ggweogs","ggweon","ggweonj","ggweonh","ggweod","ggweol","ggweolg","ggweolm","ggweolb","ggweols","ggweolt","ggweolp","ggweolh","ggweom","ggweob","ggweobs","ggweos","ggweoss","ggweong","ggweoj","ggweoc","ggweok","ggweot","ggweop","ggweoh","ggwe","ggweg","ggwegg","ggwegs","ggwen","ggwenj","ggwenh","ggwed","ggwel","ggwelg","ggwelm","ggwelb","ggwels","ggwelt","ggwelp","ggwelh" ];

},{}],137:[function(require,module,exports){
module.exports = [ "ggwem","ggweb","ggwebs","ggwes","ggwess","ggweng","ggwej","ggwec","ggwek","ggwet","ggwep","ggweh","ggwi","ggwig","ggwigg","ggwigs","ggwin","ggwinj","ggwinh","ggwid","ggwil","ggwilg","ggwilm","ggwilb","ggwils","ggwilt","ggwilp","ggwilh","ggwim","ggwib","ggwibs","ggwis","ggwiss","ggwing","ggwij","ggwic","ggwik","ggwit","ggwip","ggwih","ggyu","ggyug","ggyugg","ggyugs","ggyun","ggyunj","ggyunh","ggyud","ggyul","ggyulg","ggyulm","ggyulb","ggyuls","ggyult","ggyulp","ggyulh","ggyum","ggyub","ggyubs","ggyus","ggyuss","ggyung","ggyuj","ggyuc","ggyuk","ggyut","ggyup","ggyuh","ggeu","ggeug","ggeugg","ggeugs","ggeun","ggeunj","ggeunh","ggeud","ggeul","ggeulg","ggeulm","ggeulb","ggeuls","ggeult","ggeulp","ggeulh","ggeum","ggeub","ggeubs","ggeus","ggeuss","ggeung","ggeuj","ggeuc","ggeuk","ggeut","ggeup","ggeuh","ggyi","ggyig","ggyigg","ggyigs","ggyin","ggyinj","ggyinh","ggyid","ggyil","ggyilg","ggyilm","ggyilb","ggyils","ggyilt","ggyilp","ggyilh","ggyim","ggyib","ggyibs","ggyis","ggyiss","ggying","ggyij","ggyic","ggyik","ggyit","ggyip","ggyih","ggi","ggig","ggigg","ggigs","ggin","gginj","gginh","ggid","ggil","ggilg","ggilm","ggilb","ggils","ggilt","ggilp","ggilh","ggim","ggib","ggibs","ggis","ggiss","gging","ggij","ggic","ggik","ggit","ggip","ggih","na","nag","nagg","nags","nan","nanj","nanh","nad","nal","nalg","nalm","nalb","nals","nalt","nalp","nalh","nam","nab","nabs","nas","nass","nang","naj","nac","nak","nat","nap","nah","nae","naeg","naegg","naegs","naen","naenj","naenh","naed","nael","naelg","naelm","naelb","naels","naelt","naelp","naelh","naem","naeb","naebs","naes","naess","naeng","naej","naec","naek","naet","naep","naeh","nya","nyag","nyagg","nyags","nyan","nyanj","nyanh","nyad","nyal","nyalg","nyalm","nyalb","nyals","nyalt","nyalp","nyalh","nyam","nyab","nyabs","nyas","nyass","nyang","nyaj","nyac","nyak","nyat","nyap","nyah","nyae","nyaeg","nyaegg","nyaegs","nyaen","nyaenj","nyaenh","nyaed","nyael","nyaelg","nyaelm","nyaelb","nyaels","nyaelt","nyaelp","nyaelh","nyaem","nyaeb","nyaebs","nyaes" ];

},{}],138:[function(require,module,exports){
module.exports = [ "nyaess","nyaeng","nyaej","nyaec","nyaek","nyaet","nyaep","nyaeh","neo","neog","neogg","neogs","neon","neonj","neonh","neod","neol","neolg","neolm","neolb","neols","neolt","neolp","neolh","neom","neob","neobs","neos","neoss","neong","neoj","neoc","neok","neot","neop","neoh","ne","neg","negg","negs","nen","nenj","nenh","ned","nel","nelg","nelm","nelb","nels","nelt","nelp","nelh","nem","neb","nebs","nes","ness","neng","nej","nec","nek","net","nep","neh","nyeo","nyeog","nyeogg","nyeogs","nyeon","nyeonj","nyeonh","nyeod","nyeol","nyeolg","nyeolm","nyeolb","nyeols","nyeolt","nyeolp","nyeolh","nyeom","nyeob","nyeobs","nyeos","nyeoss","nyeong","nyeoj","nyeoc","nyeok","nyeot","nyeop","nyeoh","nye","nyeg","nyegg","nyegs","nyen","nyenj","nyenh","nyed","nyel","nyelg","nyelm","nyelb","nyels","nyelt","nyelp","nyelh","nyem","nyeb","nyebs","nyes","nyess","nyeng","nyej","nyec","nyek","nyet","nyep","nyeh","no","nog","nogg","nogs","non","nonj","nonh","nod","nol","nolg","nolm","nolb","nols","nolt","nolp","nolh","nom","nob","nobs","nos","noss","nong","noj","noc","nok","not","nop","noh","nwa","nwag","nwagg","nwags","nwan","nwanj","nwanh","nwad","nwal","nwalg","nwalm","nwalb","nwals","nwalt","nwalp","nwalh","nwam","nwab","nwabs","nwas","nwass","nwang","nwaj","nwac","nwak","nwat","nwap","nwah","nwae","nwaeg","nwaegg","nwaegs","nwaen","nwaenj","nwaenh","nwaed","nwael","nwaelg","nwaelm","nwaelb","nwaels","nwaelt","nwaelp","nwaelh","nwaem","nwaeb","nwaebs","nwaes","nwaess","nwaeng","nwaej","nwaec","nwaek","nwaet","nwaep","nwaeh","noe","noeg","noegg","noegs","noen","noenj","noenh","noed","noel","noelg","noelm","noelb","noels","noelt","noelp","noelh","noem","noeb","noebs","noes","noess","noeng","noej","noec","noek","noet","noep","noeh","nyo","nyog","nyogg","nyogs","nyon","nyonj","nyonh","nyod","nyol","nyolg","nyolm","nyolb","nyols","nyolt","nyolp","nyolh","nyom","nyob","nyobs","nyos","nyoss","nyong","nyoj","nyoc" ];

},{}],139:[function(require,module,exports){
module.exports = [ "nyok","nyot","nyop","nyoh","nu","nug","nugg","nugs","nun","nunj","nunh","nud","nul","nulg","nulm","nulb","nuls","nult","nulp","nulh","num","nub","nubs","nus","nuss","nung","nuj","nuc","nuk","nut","nup","nuh","nweo","nweog","nweogg","nweogs","nweon","nweonj","nweonh","nweod","nweol","nweolg","nweolm","nweolb","nweols","nweolt","nweolp","nweolh","nweom","nweob","nweobs","nweos","nweoss","nweong","nweoj","nweoc","nweok","nweot","nweop","nweoh","nwe","nweg","nwegg","nwegs","nwen","nwenj","nwenh","nwed","nwel","nwelg","nwelm","nwelb","nwels","nwelt","nwelp","nwelh","nwem","nweb","nwebs","nwes","nwess","nweng","nwej","nwec","nwek","nwet","nwep","nweh","nwi","nwig","nwigg","nwigs","nwin","nwinj","nwinh","nwid","nwil","nwilg","nwilm","nwilb","nwils","nwilt","nwilp","nwilh","nwim","nwib","nwibs","nwis","nwiss","nwing","nwij","nwic","nwik","nwit","nwip","nwih","nyu","nyug","nyugg","nyugs","nyun","nyunj","nyunh","nyud","nyul","nyulg","nyulm","nyulb","nyuls","nyult","nyulp","nyulh","nyum","nyub","nyubs","nyus","nyuss","nyung","nyuj","nyuc","nyuk","nyut","nyup","nyuh","neu","neug","neugg","neugs","neun","neunj","neunh","neud","neul","neulg","neulm","neulb","neuls","neult","neulp","neulh","neum","neub","neubs","neus","neuss","neung","neuj","neuc","neuk","neut","neup","neuh","nyi","nyig","nyigg","nyigs","nyin","nyinj","nyinh","nyid","nyil","nyilg","nyilm","nyilb","nyils","nyilt","nyilp","nyilh","nyim","nyib","nyibs","nyis","nyiss","nying","nyij","nyic","nyik","nyit","nyip","nyih","ni","nig","nigg","nigs","nin","ninj","ninh","nid","nil","nilg","nilm","nilb","nils","nilt","nilp","nilh","nim","nib","nibs","nis","niss","ning","nij","nic","nik","nit","nip","nih","da","dag","dagg","dags","dan","danj","danh","dad","dal","dalg","dalm","dalb","dals","dalt","dalp","dalh","dam","dab","dabs","das","dass","dang","daj","dac","dak","dat","dap","dah" ];

},{}],140:[function(require,module,exports){
module.exports = [ "dae","daeg","daegg","daegs","daen","daenj","daenh","daed","dael","daelg","daelm","daelb","daels","daelt","daelp","daelh","daem","daeb","daebs","daes","daess","daeng","daej","daec","daek","daet","daep","daeh","dya","dyag","dyagg","dyags","dyan","dyanj","dyanh","dyad","dyal","dyalg","dyalm","dyalb","dyals","dyalt","dyalp","dyalh","dyam","dyab","dyabs","dyas","dyass","dyang","dyaj","dyac","dyak","dyat","dyap","dyah","dyae","dyaeg","dyaegg","dyaegs","dyaen","dyaenj","dyaenh","dyaed","dyael","dyaelg","dyaelm","dyaelb","dyaels","dyaelt","dyaelp","dyaelh","dyaem","dyaeb","dyaebs","dyaes","dyaess","dyaeng","dyaej","dyaec","dyaek","dyaet","dyaep","dyaeh","deo","deog","deogg","deogs","deon","deonj","deonh","deod","deol","deolg","deolm","deolb","deols","deolt","deolp","deolh","deom","deob","deobs","deos","deoss","deong","deoj","deoc","deok","deot","deop","deoh","de","deg","degg","degs","den","denj","denh","ded","del","delg","delm","delb","dels","delt","delp","delh","dem","deb","debs","des","dess","deng","dej","dec","dek","det","dep","deh","dyeo","dyeog","dyeogg","dyeogs","dyeon","dyeonj","dyeonh","dyeod","dyeol","dyeolg","dyeolm","dyeolb","dyeols","dyeolt","dyeolp","dyeolh","dyeom","dyeob","dyeobs","dyeos","dyeoss","dyeong","dyeoj","dyeoc","dyeok","dyeot","dyeop","dyeoh","dye","dyeg","dyegg","dyegs","dyen","dyenj","dyenh","dyed","dyel","dyelg","dyelm","dyelb","dyels","dyelt","dyelp","dyelh","dyem","dyeb","dyebs","dyes","dyess","dyeng","dyej","dyec","dyek","dyet","dyep","dyeh","do","dog","dogg","dogs","don","donj","donh","dod","dol","dolg","dolm","dolb","dols","dolt","dolp","dolh","dom","dob","dobs","dos","doss","dong","doj","doc","dok","dot","dop","doh","dwa","dwag","dwagg","dwags","dwan","dwanj","dwanh","dwad","dwal","dwalg","dwalm","dwalb","dwals","dwalt","dwalp","dwalh","dwam","dwab","dwabs","dwas","dwass","dwang","dwaj","dwac","dwak","dwat","dwap","dwah","dwae","dwaeg","dwaegg","dwaegs" ];

},{}],141:[function(require,module,exports){
module.exports = [ "dwaen","dwaenj","dwaenh","dwaed","dwael","dwaelg","dwaelm","dwaelb","dwaels","dwaelt","dwaelp","dwaelh","dwaem","dwaeb","dwaebs","dwaes","dwaess","dwaeng","dwaej","dwaec","dwaek","dwaet","dwaep","dwaeh","doe","doeg","doegg","doegs","doen","doenj","doenh","doed","doel","doelg","doelm","doelb","doels","doelt","doelp","doelh","doem","doeb","doebs","does","doess","doeng","doej","doec","doek","doet","doep","doeh","dyo","dyog","dyogg","dyogs","dyon","dyonj","dyonh","dyod","dyol","dyolg","dyolm","dyolb","dyols","dyolt","dyolp","dyolh","dyom","dyob","dyobs","dyos","dyoss","dyong","dyoj","dyoc","dyok","dyot","dyop","dyoh","du","dug","dugg","dugs","dun","dunj","dunh","dud","dul","dulg","dulm","dulb","duls","dult","dulp","dulh","dum","dub","dubs","dus","duss","dung","duj","duc","duk","dut","dup","duh","dweo","dweog","dweogg","dweogs","dweon","dweonj","dweonh","dweod","dweol","dweolg","dweolm","dweolb","dweols","dweolt","dweolp","dweolh","dweom","dweob","dweobs","dweos","dweoss","dweong","dweoj","dweoc","dweok","dweot","dweop","dweoh","dwe","dweg","dwegg","dwegs","dwen","dwenj","dwenh","dwed","dwel","dwelg","dwelm","dwelb","dwels","dwelt","dwelp","dwelh","dwem","dweb","dwebs","dwes","dwess","dweng","dwej","dwec","dwek","dwet","dwep","dweh","dwi","dwig","dwigg","dwigs","dwin","dwinj","dwinh","dwid","dwil","dwilg","dwilm","dwilb","dwils","dwilt","dwilp","dwilh","dwim","dwib","dwibs","dwis","dwiss","dwing","dwij","dwic","dwik","dwit","dwip","dwih","dyu","dyug","dyugg","dyugs","dyun","dyunj","dyunh","dyud","dyul","dyulg","dyulm","dyulb","dyuls","dyult","dyulp","dyulh","dyum","dyub","dyubs","dyus","dyuss","dyung","dyuj","dyuc","dyuk","dyut","dyup","dyuh","deu","deug","deugg","deugs","deun","deunj","deunh","deud","deul","deulg","deulm","deulb","deuls","deult","deulp","deulh","deum","deub","deubs","deus","deuss","deung","deuj","deuc","deuk","deut","deup","deuh","dyi","dyig","dyigg","dyigs","dyin","dyinj","dyinh","dyid" ];

},{}],142:[function(require,module,exports){
module.exports = [ "dyil","dyilg","dyilm","dyilb","dyils","dyilt","dyilp","dyilh","dyim","dyib","dyibs","dyis","dyiss","dying","dyij","dyic","dyik","dyit","dyip","dyih","di","dig","digg","digs","din","dinj","dinh","did","dil","dilg","dilm","dilb","dils","dilt","dilp","dilh","dim","dib","dibs","dis","diss","ding","dij","dic","dik","dit","dip","dih","dda","ddag","ddagg","ddags","ddan","ddanj","ddanh","ddad","ddal","ddalg","ddalm","ddalb","ddals","ddalt","ddalp","ddalh","ddam","ddab","ddabs","ddas","ddass","ddang","ddaj","ddac","ddak","ddat","ddap","ddah","ddae","ddaeg","ddaegg","ddaegs","ddaen","ddaenj","ddaenh","ddaed","ddael","ddaelg","ddaelm","ddaelb","ddaels","ddaelt","ddaelp","ddaelh","ddaem","ddaeb","ddaebs","ddaes","ddaess","ddaeng","ddaej","ddaec","ddaek","ddaet","ddaep","ddaeh","ddya","ddyag","ddyagg","ddyags","ddyan","ddyanj","ddyanh","ddyad","ddyal","ddyalg","ddyalm","ddyalb","ddyals","ddyalt","ddyalp","ddyalh","ddyam","ddyab","ddyabs","ddyas","ddyass","ddyang","ddyaj","ddyac","ddyak","ddyat","ddyap","ddyah","ddyae","ddyaeg","ddyaegg","ddyaegs","ddyaen","ddyaenj","ddyaenh","ddyaed","ddyael","ddyaelg","ddyaelm","ddyaelb","ddyaels","ddyaelt","ddyaelp","ddyaelh","ddyaem","ddyaeb","ddyaebs","ddyaes","ddyaess","ddyaeng","ddyaej","ddyaec","ddyaek","ddyaet","ddyaep","ddyaeh","ddeo","ddeog","ddeogg","ddeogs","ddeon","ddeonj","ddeonh","ddeod","ddeol","ddeolg","ddeolm","ddeolb","ddeols","ddeolt","ddeolp","ddeolh","ddeom","ddeob","ddeobs","ddeos","ddeoss","ddeong","ddeoj","ddeoc","ddeok","ddeot","ddeop","ddeoh","dde","ddeg","ddegg","ddegs","dden","ddenj","ddenh","dded","ddel","ddelg","ddelm","ddelb","ddels","ddelt","ddelp","ddelh","ddem","ddeb","ddebs","ddes","ddess","ddeng","ddej","ddec","ddek","ddet","ddep","ddeh","ddyeo","ddyeog","ddyeogg","ddyeogs","ddyeon","ddyeonj","ddyeonh","ddyeod","ddyeol","ddyeolg","ddyeolm","ddyeolb","ddyeols","ddyeolt","ddyeolp","ddyeolh","ddyeom","ddyeob","ddyeobs","ddyeos","ddyeoss","ddyeong","ddyeoj","ddyeoc","ddyeok","ddyeot","ddyeop","ddyeoh","ddye","ddyeg","ddyegg","ddyegs","ddyen","ddyenj","ddyenh","ddyed","ddyel","ddyelg","ddyelm","ddyelb" ];

},{}],143:[function(require,module,exports){
module.exports = [ "ddyels","ddyelt","ddyelp","ddyelh","ddyem","ddyeb","ddyebs","ddyes","ddyess","ddyeng","ddyej","ddyec","ddyek","ddyet","ddyep","ddyeh","ddo","ddog","ddogg","ddogs","ddon","ddonj","ddonh","ddod","ddol","ddolg","ddolm","ddolb","ddols","ddolt","ddolp","ddolh","ddom","ddob","ddobs","ddos","ddoss","ddong","ddoj","ddoc","ddok","ddot","ddop","ddoh","ddwa","ddwag","ddwagg","ddwags","ddwan","ddwanj","ddwanh","ddwad","ddwal","ddwalg","ddwalm","ddwalb","ddwals","ddwalt","ddwalp","ddwalh","ddwam","ddwab","ddwabs","ddwas","ddwass","ddwang","ddwaj","ddwac","ddwak","ddwat","ddwap","ddwah","ddwae","ddwaeg","ddwaegg","ddwaegs","ddwaen","ddwaenj","ddwaenh","ddwaed","ddwael","ddwaelg","ddwaelm","ddwaelb","ddwaels","ddwaelt","ddwaelp","ddwaelh","ddwaem","ddwaeb","ddwaebs","ddwaes","ddwaess","ddwaeng","ddwaej","ddwaec","ddwaek","ddwaet","ddwaep","ddwaeh","ddoe","ddoeg","ddoegg","ddoegs","ddoen","ddoenj","ddoenh","ddoed","ddoel","ddoelg","ddoelm","ddoelb","ddoels","ddoelt","ddoelp","ddoelh","ddoem","ddoeb","ddoebs","ddoes","ddoess","ddoeng","ddoej","ddoec","ddoek","ddoet","ddoep","ddoeh","ddyo","ddyog","ddyogg","ddyogs","ddyon","ddyonj","ddyonh","ddyod","ddyol","ddyolg","ddyolm","ddyolb","ddyols","ddyolt","ddyolp","ddyolh","ddyom","ddyob","ddyobs","ddyos","ddyoss","ddyong","ddyoj","ddyoc","ddyok","ddyot","ddyop","ddyoh","ddu","ddug","ddugg","ddugs","ddun","ddunj","ddunh","ddud","ddul","ddulg","ddulm","ddulb","dduls","ddult","ddulp","ddulh","ddum","ddub","ddubs","ddus","dduss","ddung","dduj","dduc","dduk","ddut","ddup","dduh","ddweo","ddweog","ddweogg","ddweogs","ddweon","ddweonj","ddweonh","ddweod","ddweol","ddweolg","ddweolm","ddweolb","ddweols","ddweolt","ddweolp","ddweolh","ddweom","ddweob","ddweobs","ddweos","ddweoss","ddweong","ddweoj","ddweoc","ddweok","ddweot","ddweop","ddweoh","ddwe","ddweg","ddwegg","ddwegs","ddwen","ddwenj","ddwenh","ddwed","ddwel","ddwelg","ddwelm","ddwelb","ddwels","ddwelt","ddwelp","ddwelh","ddwem","ddweb","ddwebs","ddwes","ddwess","ddweng","ddwej","ddwec","ddwek","ddwet","ddwep","ddweh","ddwi","ddwig","ddwigg","ddwigs","ddwin","ddwinj","ddwinh","ddwid","ddwil","ddwilg","ddwilm","ddwilb","ddwils","ddwilt","ddwilp","ddwilh" ];

},{}],144:[function(require,module,exports){
module.exports = [ "ddwim","ddwib","ddwibs","ddwis","ddwiss","ddwing","ddwij","ddwic","ddwik","ddwit","ddwip","ddwih","ddyu","ddyug","ddyugg","ddyugs","ddyun","ddyunj","ddyunh","ddyud","ddyul","ddyulg","ddyulm","ddyulb","ddyuls","ddyult","ddyulp","ddyulh","ddyum","ddyub","ddyubs","ddyus","ddyuss","ddyung","ddyuj","ddyuc","ddyuk","ddyut","ddyup","ddyuh","ddeu","ddeug","ddeugg","ddeugs","ddeun","ddeunj","ddeunh","ddeud","ddeul","ddeulg","ddeulm","ddeulb","ddeuls","ddeult","ddeulp","ddeulh","ddeum","ddeub","ddeubs","ddeus","ddeuss","ddeung","ddeuj","ddeuc","ddeuk","ddeut","ddeup","ddeuh","ddyi","ddyig","ddyigg","ddyigs","ddyin","ddyinj","ddyinh","ddyid","ddyil","ddyilg","ddyilm","ddyilb","ddyils","ddyilt","ddyilp","ddyilh","ddyim","ddyib","ddyibs","ddyis","ddyiss","ddying","ddyij","ddyic","ddyik","ddyit","ddyip","ddyih","ddi","ddig","ddigg","ddigs","ddin","ddinj","ddinh","ddid","ddil","ddilg","ddilm","ddilb","ddils","ddilt","ddilp","ddilh","ddim","ddib","ddibs","ddis","ddiss","dding","ddij","ddic","ddik","ddit","ddip","ddih","ra","rag","ragg","rags","ran","ranj","ranh","rad","ral","ralg","ralm","ralb","rals","ralt","ralp","ralh","ram","rab","rabs","ras","rass","rang","raj","rac","rak","rat","rap","rah","rae","raeg","raegg","raegs","raen","raenj","raenh","raed","rael","raelg","raelm","raelb","raels","raelt","raelp","raelh","raem","raeb","raebs","raes","raess","raeng","raej","raec","raek","raet","raep","raeh","rya","ryag","ryagg","ryags","ryan","ryanj","ryanh","ryad","ryal","ryalg","ryalm","ryalb","ryals","ryalt","ryalp","ryalh","ryam","ryab","ryabs","ryas","ryass","ryang","ryaj","ryac","ryak","ryat","ryap","ryah","ryae","ryaeg","ryaegg","ryaegs","ryaen","ryaenj","ryaenh","ryaed","ryael","ryaelg","ryaelm","ryaelb","ryaels","ryaelt","ryaelp","ryaelh","ryaem","ryaeb","ryaebs","ryaes","ryaess","ryaeng","ryaej","ryaec","ryaek","ryaet","ryaep","ryaeh","reo","reog","reogg","reogs","reon","reonj","reonh","reod","reol","reolg","reolm","reolb","reols","reolt","reolp","reolh","reom","reob","reobs","reos" ];

},{}],145:[function(require,module,exports){
module.exports = [ "reoss","reong","reoj","reoc","reok","reot","reop","reoh","re","reg","regg","regs","ren","renj","renh","red","rel","relg","relm","relb","rels","relt","relp","relh","rem","reb","rebs","res","ress","reng","rej","rec","rek","ret","rep","reh","ryeo","ryeog","ryeogg","ryeogs","ryeon","ryeonj","ryeonh","ryeod","ryeol","ryeolg","ryeolm","ryeolb","ryeols","ryeolt","ryeolp","ryeolh","ryeom","ryeob","ryeobs","ryeos","ryeoss","ryeong","ryeoj","ryeoc","ryeok","ryeot","ryeop","ryeoh","rye","ryeg","ryegg","ryegs","ryen","ryenj","ryenh","ryed","ryel","ryelg","ryelm","ryelb","ryels","ryelt","ryelp","ryelh","ryem","ryeb","ryebs","ryes","ryess","ryeng","ryej","ryec","ryek","ryet","ryep","ryeh","ro","rog","rogg","rogs","ron","ronj","ronh","rod","rol","rolg","rolm","rolb","rols","rolt","rolp","rolh","rom","rob","robs","ros","ross","rong","roj","roc","rok","rot","rop","roh","rwa","rwag","rwagg","rwags","rwan","rwanj","rwanh","rwad","rwal","rwalg","rwalm","rwalb","rwals","rwalt","rwalp","rwalh","rwam","rwab","rwabs","rwas","rwass","rwang","rwaj","rwac","rwak","rwat","rwap","rwah","rwae","rwaeg","rwaegg","rwaegs","rwaen","rwaenj","rwaenh","rwaed","rwael","rwaelg","rwaelm","rwaelb","rwaels","rwaelt","rwaelp","rwaelh","rwaem","rwaeb","rwaebs","rwaes","rwaess","rwaeng","rwaej","rwaec","rwaek","rwaet","rwaep","rwaeh","roe","roeg","roegg","roegs","roen","roenj","roenh","roed","roel","roelg","roelm","roelb","roels","roelt","roelp","roelh","roem","roeb","roebs","roes","roess","roeng","roej","roec","roek","roet","roep","roeh","ryo","ryog","ryogg","ryogs","ryon","ryonj","ryonh","ryod","ryol","ryolg","ryolm","ryolb","ryols","ryolt","ryolp","ryolh","ryom","ryob","ryobs","ryos","ryoss","ryong","ryoj","ryoc","ryok","ryot","ryop","ryoh","ru","rug","rugg","rugs","run","runj","runh","rud","rul","rulg","rulm","rulb","ruls","rult","rulp","rulh","rum","rub","rubs","rus","russ","rung","ruj","ruc" ];

},{}],146:[function(require,module,exports){
module.exports = [ "ruk","rut","rup","ruh","rweo","rweog","rweogg","rweogs","rweon","rweonj","rweonh","rweod","rweol","rweolg","rweolm","rweolb","rweols","rweolt","rweolp","rweolh","rweom","rweob","rweobs","rweos","rweoss","rweong","rweoj","rweoc","rweok","rweot","rweop","rweoh","rwe","rweg","rwegg","rwegs","rwen","rwenj","rwenh","rwed","rwel","rwelg","rwelm","rwelb","rwels","rwelt","rwelp","rwelh","rwem","rweb","rwebs","rwes","rwess","rweng","rwej","rwec","rwek","rwet","rwep","rweh","rwi","rwig","rwigg","rwigs","rwin","rwinj","rwinh","rwid","rwil","rwilg","rwilm","rwilb","rwils","rwilt","rwilp","rwilh","rwim","rwib","rwibs","rwis","rwiss","rwing","rwij","rwic","rwik","rwit","rwip","rwih","ryu","ryug","ryugg","ryugs","ryun","ryunj","ryunh","ryud","ryul","ryulg","ryulm","ryulb","ryuls","ryult","ryulp","ryulh","ryum","ryub","ryubs","ryus","ryuss","ryung","ryuj","ryuc","ryuk","ryut","ryup","ryuh","reu","reug","reugg","reugs","reun","reunj","reunh","reud","reul","reulg","reulm","reulb","reuls","reult","reulp","reulh","reum","reub","reubs","reus","reuss","reung","reuj","reuc","reuk","reut","reup","reuh","ryi","ryig","ryigg","ryigs","ryin","ryinj","ryinh","ryid","ryil","ryilg","ryilm","ryilb","ryils","ryilt","ryilp","ryilh","ryim","ryib","ryibs","ryis","ryiss","rying","ryij","ryic","ryik","ryit","ryip","ryih","ri","rig","rigg","rigs","rin","rinj","rinh","rid","ril","rilg","rilm","rilb","rils","rilt","rilp","rilh","rim","rib","ribs","ris","riss","ring","rij","ric","rik","rit","rip","rih","ma","mag","magg","mags","man","manj","manh","mad","mal","malg","malm","malb","mals","malt","malp","malh","mam","mab","mabs","mas","mass","mang","maj","mac","mak","mat","map","mah","mae","maeg","maegg","maegs","maen","maenj","maenh","maed","mael","maelg","maelm","maelb","maels","maelt","maelp","maelh","maem","maeb","maebs","maes","maess","maeng","maej","maec","maek","maet","maep","maeh" ];

},{}],147:[function(require,module,exports){
module.exports = [ "mya","myag","myagg","myags","myan","myanj","myanh","myad","myal","myalg","myalm","myalb","myals","myalt","myalp","myalh","myam","myab","myabs","myas","myass","myang","myaj","myac","myak","myat","myap","myah","myae","myaeg","myaegg","myaegs","myaen","myaenj","myaenh","myaed","myael","myaelg","myaelm","myaelb","myaels","myaelt","myaelp","myaelh","myaem","myaeb","myaebs","myaes","myaess","myaeng","myaej","myaec","myaek","myaet","myaep","myaeh","meo","meog","meogg","meogs","meon","meonj","meonh","meod","meol","meolg","meolm","meolb","meols","meolt","meolp","meolh","meom","meob","meobs","meos","meoss","meong","meoj","meoc","meok","meot","meop","meoh","me","meg","megg","megs","men","menj","menh","med","mel","melg","melm","melb","mels","melt","melp","melh","mem","meb","mebs","mes","mess","meng","mej","mec","mek","met","mep","meh","myeo","myeog","myeogg","myeogs","myeon","myeonj","myeonh","myeod","myeol","myeolg","myeolm","myeolb","myeols","myeolt","myeolp","myeolh","myeom","myeob","myeobs","myeos","myeoss","myeong","myeoj","myeoc","myeok","myeot","myeop","myeoh","mye","myeg","myegg","myegs","myen","myenj","myenh","myed","myel","myelg","myelm","myelb","myels","myelt","myelp","myelh","myem","myeb","myebs","myes","myess","myeng","myej","myec","myek","myet","myep","myeh","mo","mog","mogg","mogs","mon","monj","monh","mod","mol","molg","molm","molb","mols","molt","molp","molh","mom","mob","mobs","mos","moss","mong","moj","moc","mok","mot","mop","moh","mwa","mwag","mwagg","mwags","mwan","mwanj","mwanh","mwad","mwal","mwalg","mwalm","mwalb","mwals","mwalt","mwalp","mwalh","mwam","mwab","mwabs","mwas","mwass","mwang","mwaj","mwac","mwak","mwat","mwap","mwah","mwae","mwaeg","mwaegg","mwaegs","mwaen","mwaenj","mwaenh","mwaed","mwael","mwaelg","mwaelm","mwaelb","mwaels","mwaelt","mwaelp","mwaelh","mwaem","mwaeb","mwaebs","mwaes","mwaess","mwaeng","mwaej","mwaec","mwaek","mwaet","mwaep","mwaeh","moe","moeg","moegg","moegs" ];

},{}],148:[function(require,module,exports){
module.exports = [ "moen","moenj","moenh","moed","moel","moelg","moelm","moelb","moels","moelt","moelp","moelh","moem","moeb","moebs","moes","moess","moeng","moej","moec","moek","moet","moep","moeh","myo","myog","myogg","myogs","myon","myonj","myonh","myod","myol","myolg","myolm","myolb","myols","myolt","myolp","myolh","myom","myob","myobs","myos","myoss","myong","myoj","myoc","myok","myot","myop","myoh","mu","mug","mugg","mugs","mun","munj","munh","mud","mul","mulg","mulm","mulb","muls","mult","mulp","mulh","mum","mub","mubs","mus","muss","mung","muj","muc","muk","mut","mup","muh","mweo","mweog","mweogg","mweogs","mweon","mweonj","mweonh","mweod","mweol","mweolg","mweolm","mweolb","mweols","mweolt","mweolp","mweolh","mweom","mweob","mweobs","mweos","mweoss","mweong","mweoj","mweoc","mweok","mweot","mweop","mweoh","mwe","mweg","mwegg","mwegs","mwen","mwenj","mwenh","mwed","mwel","mwelg","mwelm","mwelb","mwels","mwelt","mwelp","mwelh","mwem","mweb","mwebs","mwes","mwess","mweng","mwej","mwec","mwek","mwet","mwep","mweh","mwi","mwig","mwigg","mwigs","mwin","mwinj","mwinh","mwid","mwil","mwilg","mwilm","mwilb","mwils","mwilt","mwilp","mwilh","mwim","mwib","mwibs","mwis","mwiss","mwing","mwij","mwic","mwik","mwit","mwip","mwih","myu","myug","myugg","myugs","myun","myunj","myunh","myud","myul","myulg","myulm","myulb","myuls","myult","myulp","myulh","myum","myub","myubs","myus","myuss","myung","myuj","myuc","myuk","myut","myup","myuh","meu","meug","meugg","meugs","meun","meunj","meunh","meud","meul","meulg","meulm","meulb","meuls","meult","meulp","meulh","meum","meub","meubs","meus","meuss","meung","meuj","meuc","meuk","meut","meup","meuh","myi","myig","myigg","myigs","myin","myinj","myinh","myid","myil","myilg","myilm","myilb","myils","myilt","myilp","myilh","myim","myib","myibs","myis","myiss","mying","myij","myic","myik","myit","myip","myih","mi","mig","migg","migs","min","minj","minh","mid" ];

},{}],149:[function(require,module,exports){
module.exports = [ "mil","milg","milm","milb","mils","milt","milp","milh","mim","mib","mibs","mis","miss","ming","mij","mic","mik","mit","mip","mih","ba","bag","bagg","bags","ban","banj","banh","bad","bal","balg","balm","balb","bals","balt","balp","balh","bam","bab","babs","bas","bass","bang","baj","bac","bak","bat","bap","bah","bae","baeg","baegg","baegs","baen","baenj","baenh","baed","bael","baelg","baelm","baelb","baels","baelt","baelp","baelh","baem","baeb","baebs","baes","baess","baeng","baej","baec","baek","baet","baep","baeh","bya","byag","byagg","byags","byan","byanj","byanh","byad","byal","byalg","byalm","byalb","byals","byalt","byalp","byalh","byam","byab","byabs","byas","byass","byang","byaj","byac","byak","byat","byap","byah","byae","byaeg","byaegg","byaegs","byaen","byaenj","byaenh","byaed","byael","byaelg","byaelm","byaelb","byaels","byaelt","byaelp","byaelh","byaem","byaeb","byaebs","byaes","byaess","byaeng","byaej","byaec","byaek","byaet","byaep","byaeh","beo","beog","beogg","beogs","beon","beonj","beonh","beod","beol","beolg","beolm","beolb","beols","beolt","beolp","beolh","beom","beob","beobs","beos","beoss","beong","beoj","beoc","beok","beot","beop","beoh","be","beg","begg","begs","ben","benj","benh","bed","bel","belg","belm","belb","bels","belt","belp","belh","bem","beb","bebs","bes","bess","beng","bej","bec","bek","bet","bep","beh","byeo","byeog","byeogg","byeogs","byeon","byeonj","byeonh","byeod","byeol","byeolg","byeolm","byeolb","byeols","byeolt","byeolp","byeolh","byeom","byeob","byeobs","byeos","byeoss","byeong","byeoj","byeoc","byeok","byeot","byeop","byeoh","bye","byeg","byegg","byegs","byen","byenj","byenh","byed","byel","byelg","byelm","byelb","byels","byelt","byelp","byelh","byem","byeb","byebs","byes","byess","byeng","byej","byec","byek","byet","byep","byeh","bo","bog","bogg","bogs","bon","bonj","bonh","bod","bol","bolg","bolm","bolb" ];

},{}],150:[function(require,module,exports){
module.exports = [ "bols","bolt","bolp","bolh","bom","bob","bobs","bos","boss","bong","boj","boc","bok","bot","bop","boh","bwa","bwag","bwagg","bwags","bwan","bwanj","bwanh","bwad","bwal","bwalg","bwalm","bwalb","bwals","bwalt","bwalp","bwalh","bwam","bwab","bwabs","bwas","bwass","bwang","bwaj","bwac","bwak","bwat","bwap","bwah","bwae","bwaeg","bwaegg","bwaegs","bwaen","bwaenj","bwaenh","bwaed","bwael","bwaelg","bwaelm","bwaelb","bwaels","bwaelt","bwaelp","bwaelh","bwaem","bwaeb","bwaebs","bwaes","bwaess","bwaeng","bwaej","bwaec","bwaek","bwaet","bwaep","bwaeh","boe","boeg","boegg","boegs","boen","boenj","boenh","boed","boel","boelg","boelm","boelb","boels","boelt","boelp","boelh","boem","boeb","boebs","boes","boess","boeng","boej","boec","boek","boet","boep","boeh","byo","byog","byogg","byogs","byon","byonj","byonh","byod","byol","byolg","byolm","byolb","byols","byolt","byolp","byolh","byom","byob","byobs","byos","byoss","byong","byoj","byoc","byok","byot","byop","byoh","bu","bug","bugg","bugs","bun","bunj","bunh","bud","bul","bulg","bulm","bulb","buls","bult","bulp","bulh","bum","bub","bubs","bus","buss","bung","buj","buc","buk","but","bup","buh","bweo","bweog","bweogg","bweogs","bweon","bweonj","bweonh","bweod","bweol","bweolg","bweolm","bweolb","bweols","bweolt","bweolp","bweolh","bweom","bweob","bweobs","bweos","bweoss","bweong","bweoj","bweoc","bweok","bweot","bweop","bweoh","bwe","bweg","bwegg","bwegs","bwen","bwenj","bwenh","bwed","bwel","bwelg","bwelm","bwelb","bwels","bwelt","bwelp","bwelh","bwem","bweb","bwebs","bwes","bwess","bweng","bwej","bwec","bwek","bwet","bwep","bweh","bwi","bwig","bwigg","bwigs","bwin","bwinj","bwinh","bwid","bwil","bwilg","bwilm","bwilb","bwils","bwilt","bwilp","bwilh","bwim","bwib","bwibs","bwis","bwiss","bwing","bwij","bwic","bwik","bwit","bwip","bwih","byu","byug","byugg","byugs","byun","byunj","byunh","byud","byul","byulg","byulm","byulb","byuls","byult","byulp","byulh" ];

},{}],151:[function(require,module,exports){
module.exports = [ "byum","byub","byubs","byus","byuss","byung","byuj","byuc","byuk","byut","byup","byuh","beu","beug","beugg","beugs","beun","beunj","beunh","beud","beul","beulg","beulm","beulb","beuls","beult","beulp","beulh","beum","beub","beubs","beus","beuss","beung","beuj","beuc","beuk","beut","beup","beuh","byi","byig","byigg","byigs","byin","byinj","byinh","byid","byil","byilg","byilm","byilb","byils","byilt","byilp","byilh","byim","byib","byibs","byis","byiss","bying","byij","byic","byik","byit","byip","byih","bi","big","bigg","bigs","bin","binj","binh","bid","bil","bilg","bilm","bilb","bils","bilt","bilp","bilh","bim","bib","bibs","bis","biss","bing","bij","bic","bik","bit","bip","bih","bba","bbag","bbagg","bbags","bban","bbanj","bbanh","bbad","bbal","bbalg","bbalm","bbalb","bbals","bbalt","bbalp","bbalh","bbam","bbab","bbabs","bbas","bbass","bbang","bbaj","bbac","bbak","bbat","bbap","bbah","bbae","bbaeg","bbaegg","bbaegs","bbaen","bbaenj","bbaenh","bbaed","bbael","bbaelg","bbaelm","bbaelb","bbaels","bbaelt","bbaelp","bbaelh","bbaem","bbaeb","bbaebs","bbaes","bbaess","bbaeng","bbaej","bbaec","bbaek","bbaet","bbaep","bbaeh","bbya","bbyag","bbyagg","bbyags","bbyan","bbyanj","bbyanh","bbyad","bbyal","bbyalg","bbyalm","bbyalb","bbyals","bbyalt","bbyalp","bbyalh","bbyam","bbyab","bbyabs","bbyas","bbyass","bbyang","bbyaj","bbyac","bbyak","bbyat","bbyap","bbyah","bbyae","bbyaeg","bbyaegg","bbyaegs","bbyaen","bbyaenj","bbyaenh","bbyaed","bbyael","bbyaelg","bbyaelm","bbyaelb","bbyaels","bbyaelt","bbyaelp","bbyaelh","bbyaem","bbyaeb","bbyaebs","bbyaes","bbyaess","bbyaeng","bbyaej","bbyaec","bbyaek","bbyaet","bbyaep","bbyaeh","bbeo","bbeog","bbeogg","bbeogs","bbeon","bbeonj","bbeonh","bbeod","bbeol","bbeolg","bbeolm","bbeolb","bbeols","bbeolt","bbeolp","bbeolh","bbeom","bbeob","bbeobs","bbeos","bbeoss","bbeong","bbeoj","bbeoc","bbeok","bbeot","bbeop","bbeoh","bbe","bbeg","bbegg","bbegs","bben","bbenj","bbenh","bbed","bbel","bbelg","bbelm","bbelb","bbels","bbelt","bbelp","bbelh","bbem","bbeb","bbebs","bbes" ];

},{}],152:[function(require,module,exports){
module.exports = [ "bbess","bbeng","bbej","bbec","bbek","bbet","bbep","bbeh","bbyeo","bbyeog","bbyeogg","bbyeogs","bbyeon","bbyeonj","bbyeonh","bbyeod","bbyeol","bbyeolg","bbyeolm","bbyeolb","bbyeols","bbyeolt","bbyeolp","bbyeolh","bbyeom","bbyeob","bbyeobs","bbyeos","bbyeoss","bbyeong","bbyeoj","bbyeoc","bbyeok","bbyeot","bbyeop","bbyeoh","bbye","bbyeg","bbyegg","bbyegs","bbyen","bbyenj","bbyenh","bbyed","bbyel","bbyelg","bbyelm","bbyelb","bbyels","bbyelt","bbyelp","bbyelh","bbyem","bbyeb","bbyebs","bbyes","bbyess","bbyeng","bbyej","bbyec","bbyek","bbyet","bbyep","bbyeh","bbo","bbog","bbogg","bbogs","bbon","bbonj","bbonh","bbod","bbol","bbolg","bbolm","bbolb","bbols","bbolt","bbolp","bbolh","bbom","bbob","bbobs","bbos","bboss","bbong","bboj","bboc","bbok","bbot","bbop","bboh","bbwa","bbwag","bbwagg","bbwags","bbwan","bbwanj","bbwanh","bbwad","bbwal","bbwalg","bbwalm","bbwalb","bbwals","bbwalt","bbwalp","bbwalh","bbwam","bbwab","bbwabs","bbwas","bbwass","bbwang","bbwaj","bbwac","bbwak","bbwat","bbwap","bbwah","bbwae","bbwaeg","bbwaegg","bbwaegs","bbwaen","bbwaenj","bbwaenh","bbwaed","bbwael","bbwaelg","bbwaelm","bbwaelb","bbwaels","bbwaelt","bbwaelp","bbwaelh","bbwaem","bbwaeb","bbwaebs","bbwaes","bbwaess","bbwaeng","bbwaej","bbwaec","bbwaek","bbwaet","bbwaep","bbwaeh","bboe","bboeg","bboegg","bboegs","bboen","bboenj","bboenh","bboed","bboel","bboelg","bboelm","bboelb","bboels","bboelt","bboelp","bboelh","bboem","bboeb","bboebs","bboes","bboess","bboeng","bboej","bboec","bboek","bboet","bboep","bboeh","bbyo","bbyog","bbyogg","bbyogs","bbyon","bbyonj","bbyonh","bbyod","bbyol","bbyolg","bbyolm","bbyolb","bbyols","bbyolt","bbyolp","bbyolh","bbyom","bbyob","bbyobs","bbyos","bbyoss","bbyong","bbyoj","bbyoc","bbyok","bbyot","bbyop","bbyoh","bbu","bbug","bbugg","bbugs","bbun","bbunj","bbunh","bbud","bbul","bbulg","bbulm","bbulb","bbuls","bbult","bbulp","bbulh","bbum","bbub","bbubs","bbus","bbuss","bbung","bbuj","bbuc","bbuk","bbut","bbup","bbuh","bbweo","bbweog","bbweogg","bbweogs","bbweon","bbweonj","bbweonh","bbweod","bbweol","bbweolg","bbweolm","bbweolb","bbweols","bbweolt","bbweolp","bbweolh","bbweom","bbweob","bbweobs","bbweos","bbweoss","bbweong","bbweoj","bbweoc" ];

},{}],153:[function(require,module,exports){
module.exports = [ "bbweok","bbweot","bbweop","bbweoh","bbwe","bbweg","bbwegg","bbwegs","bbwen","bbwenj","bbwenh","bbwed","bbwel","bbwelg","bbwelm","bbwelb","bbwels","bbwelt","bbwelp","bbwelh","bbwem","bbweb","bbwebs","bbwes","bbwess","bbweng","bbwej","bbwec","bbwek","bbwet","bbwep","bbweh","bbwi","bbwig","bbwigg","bbwigs","bbwin","bbwinj","bbwinh","bbwid","bbwil","bbwilg","bbwilm","bbwilb","bbwils","bbwilt","bbwilp","bbwilh","bbwim","bbwib","bbwibs","bbwis","bbwiss","bbwing","bbwij","bbwic","bbwik","bbwit","bbwip","bbwih","bbyu","bbyug","bbyugg","bbyugs","bbyun","bbyunj","bbyunh","bbyud","bbyul","bbyulg","bbyulm","bbyulb","bbyuls","bbyult","bbyulp","bbyulh","bbyum","bbyub","bbyubs","bbyus","bbyuss","bbyung","bbyuj","bbyuc","bbyuk","bbyut","bbyup","bbyuh","bbeu","bbeug","bbeugg","bbeugs","bbeun","bbeunj","bbeunh","bbeud","bbeul","bbeulg","bbeulm","bbeulb","bbeuls","bbeult","bbeulp","bbeulh","bbeum","bbeub","bbeubs","bbeus","bbeuss","bbeung","bbeuj","bbeuc","bbeuk","bbeut","bbeup","bbeuh","bbyi","bbyig","bbyigg","bbyigs","bbyin","bbyinj","bbyinh","bbyid","bbyil","bbyilg","bbyilm","bbyilb","bbyils","bbyilt","bbyilp","bbyilh","bbyim","bbyib","bbyibs","bbyis","bbyiss","bbying","bbyij","bbyic","bbyik","bbyit","bbyip","bbyih","bbi","bbig","bbigg","bbigs","bbin","bbinj","bbinh","bbid","bbil","bbilg","bbilm","bbilb","bbils","bbilt","bbilp","bbilh","bbim","bbib","bbibs","bbis","bbiss","bbing","bbij","bbic","bbik","bbit","bbip","bbih","sa","sag","sagg","sags","san","sanj","sanh","sad","sal","salg","salm","salb","sals","salt","salp","salh","sam","sab","sabs","sas","sass","sang","saj","sac","sak","sat","sap","sah","sae","saeg","saegg","saegs","saen","saenj","saenh","saed","sael","saelg","saelm","saelb","saels","saelt","saelp","saelh","saem","saeb","saebs","saes","saess","saeng","saej","saec","saek","saet","saep","saeh","sya","syag","syagg","syags","syan","syanj","syanh","syad","syal","syalg","syalm","syalb","syals","syalt","syalp","syalh","syam","syab","syabs","syas","syass","syang","syaj","syac","syak","syat","syap","syah" ];

},{}],154:[function(require,module,exports){
module.exports = [ "syae","syaeg","syaegg","syaegs","syaen","syaenj","syaenh","syaed","syael","syaelg","syaelm","syaelb","syaels","syaelt","syaelp","syaelh","syaem","syaeb","syaebs","syaes","syaess","syaeng","syaej","syaec","syaek","syaet","syaep","syaeh","seo","seog","seogg","seogs","seon","seonj","seonh","seod","seol","seolg","seolm","seolb","seols","seolt","seolp","seolh","seom","seob","seobs","seos","seoss","seong","seoj","seoc","seok","seot","seop","seoh","se","seg","segg","segs","sen","senj","senh","sed","sel","selg","selm","selb","sels","selt","selp","selh","sem","seb","sebs","ses","sess","seng","sej","sec","sek","set","sep","seh","syeo","syeog","syeogg","syeogs","syeon","syeonj","syeonh","syeod","syeol","syeolg","syeolm","syeolb","syeols","syeolt","syeolp","syeolh","syeom","syeob","syeobs","syeos","syeoss","syeong","syeoj","syeoc","syeok","syeot","syeop","syeoh","sye","syeg","syegg","syegs","syen","syenj","syenh","syed","syel","syelg","syelm","syelb","syels","syelt","syelp","syelh","syem","syeb","syebs","syes","syess","syeng","syej","syec","syek","syet","syep","syeh","so","sog","sogg","sogs","son","sonj","sonh","sod","sol","solg","solm","solb","sols","solt","solp","solh","som","sob","sobs","sos","soss","song","soj","soc","sok","sot","sop","soh","swa","swag","swagg","swags","swan","swanj","swanh","swad","swal","swalg","swalm","swalb","swals","swalt","swalp","swalh","swam","swab","swabs","swas","swass","swang","swaj","swac","swak","swat","swap","swah","swae","swaeg","swaegg","swaegs","swaen","swaenj","swaenh","swaed","swael","swaelg","swaelm","swaelb","swaels","swaelt","swaelp","swaelh","swaem","swaeb","swaebs","swaes","swaess","swaeng","swaej","swaec","swaek","swaet","swaep","swaeh","soe","soeg","soegg","soegs","soen","soenj","soenh","soed","soel","soelg","soelm","soelb","soels","soelt","soelp","soelh","soem","soeb","soebs","soes","soess","soeng","soej","soec","soek","soet","soep","soeh","syo","syog","syogg","syogs" ];

},{}],155:[function(require,module,exports){
module.exports = [ "syon","syonj","syonh","syod","syol","syolg","syolm","syolb","syols","syolt","syolp","syolh","syom","syob","syobs","syos","syoss","syong","syoj","syoc","syok","syot","syop","syoh","su","sug","sugg","sugs","sun","sunj","sunh","sud","sul","sulg","sulm","sulb","suls","sult","sulp","sulh","sum","sub","subs","sus","suss","sung","suj","suc","suk","sut","sup","suh","sweo","sweog","sweogg","sweogs","sweon","sweonj","sweonh","sweod","sweol","sweolg","sweolm","sweolb","sweols","sweolt","sweolp","sweolh","sweom","sweob","sweobs","sweos","sweoss","sweong","sweoj","sweoc","sweok","sweot","sweop","sweoh","swe","sweg","swegg","swegs","swen","swenj","swenh","swed","swel","swelg","swelm","swelb","swels","swelt","swelp","swelh","swem","sweb","swebs","swes","swess","sweng","swej","swec","swek","swet","swep","sweh","swi","swig","swigg","swigs","swin","swinj","swinh","swid","swil","swilg","swilm","swilb","swils","swilt","swilp","swilh","swim","swib","swibs","swis","swiss","swing","swij","swic","swik","swit","swip","swih","syu","syug","syugg","syugs","syun","syunj","syunh","syud","syul","syulg","syulm","syulb","syuls","syult","syulp","syulh","syum","syub","syubs","syus","syuss","syung","syuj","syuc","syuk","syut","syup","syuh","seu","seug","seugg","seugs","seun","seunj","seunh","seud","seul","seulg","seulm","seulb","seuls","seult","seulp","seulh","seum","seub","seubs","seus","seuss","seung","seuj","seuc","seuk","seut","seup","seuh","syi","syig","syigg","syigs","syin","syinj","syinh","syid","syil","syilg","syilm","syilb","syils","syilt","syilp","syilh","syim","syib","syibs","syis","syiss","sying","syij","syic","syik","syit","syip","syih","si","sig","sigg","sigs","sin","sinj","sinh","sid","sil","silg","silm","silb","sils","silt","silp","silh","sim","sib","sibs","sis","siss","sing","sij","sic","sik","sit","sip","sih","ssa","ssag","ssagg","ssags","ssan","ssanj","ssanh","ssad" ];

},{}],156:[function(require,module,exports){
module.exports = [ "ssal","ssalg","ssalm","ssalb","ssals","ssalt","ssalp","ssalh","ssam","ssab","ssabs","ssas","ssass","ssang","ssaj","ssac","ssak","ssat","ssap","ssah","ssae","ssaeg","ssaegg","ssaegs","ssaen","ssaenj","ssaenh","ssaed","ssael","ssaelg","ssaelm","ssaelb","ssaels","ssaelt","ssaelp","ssaelh","ssaem","ssaeb","ssaebs","ssaes","ssaess","ssaeng","ssaej","ssaec","ssaek","ssaet","ssaep","ssaeh","ssya","ssyag","ssyagg","ssyags","ssyan","ssyanj","ssyanh","ssyad","ssyal","ssyalg","ssyalm","ssyalb","ssyals","ssyalt","ssyalp","ssyalh","ssyam","ssyab","ssyabs","ssyas","ssyass","ssyang","ssyaj","ssyac","ssyak","ssyat","ssyap","ssyah","ssyae","ssyaeg","ssyaegg","ssyaegs","ssyaen","ssyaenj","ssyaenh","ssyaed","ssyael","ssyaelg","ssyaelm","ssyaelb","ssyaels","ssyaelt","ssyaelp","ssyaelh","ssyaem","ssyaeb","ssyaebs","ssyaes","ssyaess","ssyaeng","ssyaej","ssyaec","ssyaek","ssyaet","ssyaep","ssyaeh","sseo","sseog","sseogg","sseogs","sseon","sseonj","sseonh","sseod","sseol","sseolg","sseolm","sseolb","sseols","sseolt","sseolp","sseolh","sseom","sseob","sseobs","sseos","sseoss","sseong","sseoj","sseoc","sseok","sseot","sseop","sseoh","sse","sseg","ssegg","ssegs","ssen","ssenj","ssenh","ssed","ssel","sselg","sselm","sselb","ssels","sselt","sselp","sselh","ssem","sseb","ssebs","sses","ssess","sseng","ssej","ssec","ssek","sset","ssep","sseh","ssyeo","ssyeog","ssyeogg","ssyeogs","ssyeon","ssyeonj","ssyeonh","ssyeod","ssyeol","ssyeolg","ssyeolm","ssyeolb","ssyeols","ssyeolt","ssyeolp","ssyeolh","ssyeom","ssyeob","ssyeobs","ssyeos","ssyeoss","ssyeong","ssyeoj","ssyeoc","ssyeok","ssyeot","ssyeop","ssyeoh","ssye","ssyeg","ssyegg","ssyegs","ssyen","ssyenj","ssyenh","ssyed","ssyel","ssyelg","ssyelm","ssyelb","ssyels","ssyelt","ssyelp","ssyelh","ssyem","ssyeb","ssyebs","ssyes","ssyess","ssyeng","ssyej","ssyec","ssyek","ssyet","ssyep","ssyeh","sso","ssog","ssogg","ssogs","sson","ssonj","ssonh","ssod","ssol","ssolg","ssolm","ssolb","ssols","ssolt","ssolp","ssolh","ssom","ssob","ssobs","ssos","ssoss","ssong","ssoj","ssoc","ssok","ssot","ssop","ssoh","sswa","sswag","sswagg","sswags","sswan","sswanj","sswanh","sswad","sswal","sswalg","sswalm","sswalb" ];

},{}],157:[function(require,module,exports){
module.exports = [ "sswals","sswalt","sswalp","sswalh","sswam","sswab","sswabs","sswas","sswass","sswang","sswaj","sswac","sswak","sswat","sswap","sswah","sswae","sswaeg","sswaegg","sswaegs","sswaen","sswaenj","sswaenh","sswaed","sswael","sswaelg","sswaelm","sswaelb","sswaels","sswaelt","sswaelp","sswaelh","sswaem","sswaeb","sswaebs","sswaes","sswaess","sswaeng","sswaej","sswaec","sswaek","sswaet","sswaep","sswaeh","ssoe","ssoeg","ssoegg","ssoegs","ssoen","ssoenj","ssoenh","ssoed","ssoel","ssoelg","ssoelm","ssoelb","ssoels","ssoelt","ssoelp","ssoelh","ssoem","ssoeb","ssoebs","ssoes","ssoess","ssoeng","ssoej","ssoec","ssoek","ssoet","ssoep","ssoeh","ssyo","ssyog","ssyogg","ssyogs","ssyon","ssyonj","ssyonh","ssyod","ssyol","ssyolg","ssyolm","ssyolb","ssyols","ssyolt","ssyolp","ssyolh","ssyom","ssyob","ssyobs","ssyos","ssyoss","ssyong","ssyoj","ssyoc","ssyok","ssyot","ssyop","ssyoh","ssu","ssug","ssugg","ssugs","ssun","ssunj","ssunh","ssud","ssul","ssulg","ssulm","ssulb","ssuls","ssult","ssulp","ssulh","ssum","ssub","ssubs","ssus","ssuss","ssung","ssuj","ssuc","ssuk","ssut","ssup","ssuh","ssweo","ssweog","ssweogg","ssweogs","ssweon","ssweonj","ssweonh","ssweod","ssweol","ssweolg","ssweolm","ssweolb","ssweols","ssweolt","ssweolp","ssweolh","ssweom","ssweob","ssweobs","ssweos","ssweoss","ssweong","ssweoj","ssweoc","ssweok","ssweot","ssweop","ssweoh","sswe","ssweg","sswegg","sswegs","sswen","sswenj","sswenh","sswed","sswel","sswelg","sswelm","sswelb","sswels","sswelt","sswelp","sswelh","sswem","ssweb","sswebs","sswes","sswess","ssweng","sswej","sswec","sswek","sswet","sswep","ssweh","sswi","sswig","sswigg","sswigs","sswin","sswinj","sswinh","sswid","sswil","sswilg","sswilm","sswilb","sswils","sswilt","sswilp","sswilh","sswim","sswib","sswibs","sswis","sswiss","sswing","sswij","sswic","sswik","sswit","sswip","sswih","ssyu","ssyug","ssyugg","ssyugs","ssyun","ssyunj","ssyunh","ssyud","ssyul","ssyulg","ssyulm","ssyulb","ssyuls","ssyult","ssyulp","ssyulh","ssyum","ssyub","ssyubs","ssyus","ssyuss","ssyung","ssyuj","ssyuc","ssyuk","ssyut","ssyup","ssyuh","sseu","sseug","sseugg","sseugs","sseun","sseunj","sseunh","sseud","sseul","sseulg","sseulm","sseulb","sseuls","sseult","sseulp","sseulh" ];

},{}],158:[function(require,module,exports){
module.exports = [ "sseum","sseub","sseubs","sseus","sseuss","sseung","sseuj","sseuc","sseuk","sseut","sseup","sseuh","ssyi","ssyig","ssyigg","ssyigs","ssyin","ssyinj","ssyinh","ssyid","ssyil","ssyilg","ssyilm","ssyilb","ssyils","ssyilt","ssyilp","ssyilh","ssyim","ssyib","ssyibs","ssyis","ssyiss","ssying","ssyij","ssyic","ssyik","ssyit","ssyip","ssyih","ssi","ssig","ssigg","ssigs","ssin","ssinj","ssinh","ssid","ssil","ssilg","ssilm","ssilb","ssils","ssilt","ssilp","ssilh","ssim","ssib","ssibs","ssis","ssiss","ssing","ssij","ssic","ssik","ssit","ssip","ssih","a","ag","agg","ags","an","anj","anh","ad","al","alg","alm","alb","als","alt","alp","alh","am","ab","abs","as","ass","ang","aj","ac","ak","at","ap","ah","ae","aeg","aegg","aegs","aen","aenj","aenh","aed","ael","aelg","aelm","aelb","aels","aelt","aelp","aelh","aem","aeb","aebs","aes","aess","aeng","aej","aec","aek","aet","aep","aeh","ya","yag","yagg","yags","yan","yanj","yanh","yad","yal","yalg","yalm","yalb","yals","yalt","yalp","yalh","yam","yab","yabs","yas","yass","yang","yaj","yac","yak","yat","yap","yah","yae","yaeg","yaegg","yaegs","yaen","yaenj","yaenh","yaed","yael","yaelg","yaelm","yaelb","yaels","yaelt","yaelp","yaelh","yaem","yaeb","yaebs","yaes","yaess","yaeng","yaej","yaec","yaek","yaet","yaep","yaeh","eo","eog","eogg","eogs","eon","eonj","eonh","eod","eol","eolg","eolm","eolb","eols","eolt","eolp","eolh","eom","eob","eobs","eos","eoss","eong","eoj","eoc","eok","eot","eop","eoh","e","eg","egg","egs","en","enj","enh","ed","el","elg","elm","elb","els","elt","elp","elh","em","eb","ebs","es","ess","eng","ej","ec","ek","et","ep","eh","yeo","yeog","yeogg","yeogs","yeon","yeonj","yeonh","yeod","yeol","yeolg","yeolm","yeolb","yeols","yeolt","yeolp","yeolh","yeom","yeob","yeobs","yeos" ];

},{}],159:[function(require,module,exports){
module.exports = [ "yeoss","yeong","yeoj","yeoc","yeok","yeot","yeop","yeoh","ye","yeg","yegg","yegs","yen","yenj","yenh","yed","yel","yelg","yelm","yelb","yels","yelt","yelp","yelh","yem","yeb","yebs","yes","yess","yeng","yej","yec","yek","yet","yep","yeh","o","og","ogg","ogs","on","onj","onh","od","ol","olg","olm","olb","ols","olt","olp","olh","om","ob","obs","os","oss","ong","oj","oc","ok","ot","op","oh","wa","wag","wagg","wags","wan","wanj","wanh","wad","wal","walg","walm","walb","wals","walt","walp","walh","wam","wab","wabs","was","wass","wang","waj","wac","wak","wat","wap","wah","wae","waeg","waegg","waegs","waen","waenj","waenh","waed","wael","waelg","waelm","waelb","waels","waelt","waelp","waelh","waem","waeb","waebs","waes","waess","waeng","waej","waec","waek","waet","waep","waeh","oe","oeg","oegg","oegs","oen","oenj","oenh","oed","oel","oelg","oelm","oelb","oels","oelt","oelp","oelh","oem","oeb","oebs","oes","oess","oeng","oej","oec","oek","oet","oep","oeh","yo","yog","yogg","yogs","yon","yonj","yonh","yod","yol","yolg","yolm","yolb","yols","yolt","yolp","yolh","yom","yob","yobs","yos","yoss","yong","yoj","yoc","yok","yot","yop","yoh","u","ug","ugg","ugs","un","unj","unh","ud","ul","ulg","ulm","ulb","uls","ult","ulp","ulh","um","ub","ubs","us","uss","ung","uj","uc","uk","ut","up","uh","weo","weog","weogg","weogs","weon","weonj","weonh","weod","weol","weolg","weolm","weolb","weols","weolt","weolp","weolh","weom","weob","weobs","weos","weoss","weong","weoj","weoc","weok","weot","weop","weoh","we","weg","wegg","wegs","wen","wenj","wenh","wed","wel","welg","welm","welb","wels","welt","welp","welh","wem","web","webs","wes","wess","weng","wej","wec" ];

},{}],160:[function(require,module,exports){
module.exports = [ "wek","wet","wep","weh","wi","wig","wigg","wigs","win","winj","winh","wid","wil","wilg","wilm","wilb","wils","wilt","wilp","wilh","wim","wib","wibs","wis","wiss","wing","wij","wic","wik","wit","wip","wih","yu","yug","yugg","yugs","yun","yunj","yunh","yud","yul","yulg","yulm","yulb","yuls","yult","yulp","yulh","yum","yub","yubs","yus","yuss","yung","yuj","yuc","yuk","yut","yup","yuh","eu","eug","eugg","eugs","eun","eunj","eunh","eud","eul","eulg","eulm","eulb","euls","eult","eulp","eulh","eum","eub","eubs","eus","euss","eung","euj","euc","euk","eut","eup","euh","yi","yig","yigg","yigs","yin","yinj","yinh","yid","yil","yilg","yilm","yilb","yils","yilt","yilp","yilh","yim","yib","yibs","yis","yiss","ying","yij","yic","yik","yit","yip","yih","i","ig","igg","igs","in","inj","inh","id","il","ilg","ilm","ilb","ils","ilt","ilp","ilh","im","ib","ibs","is","iss","ing","ij","ic","ik","it","ip","ih","ja","jag","jagg","jags","jan","janj","janh","jad","jal","jalg","jalm","jalb","jals","jalt","jalp","jalh","jam","jab","jabs","jas","jass","jang","jaj","jac","jak","jat","jap","jah","jae","jaeg","jaegg","jaegs","jaen","jaenj","jaenh","jaed","jael","jaelg","jaelm","jaelb","jaels","jaelt","jaelp","jaelh","jaem","jaeb","jaebs","jaes","jaess","jaeng","jaej","jaec","jaek","jaet","jaep","jaeh","jya","jyag","jyagg","jyags","jyan","jyanj","jyanh","jyad","jyal","jyalg","jyalm","jyalb","jyals","jyalt","jyalp","jyalh","jyam","jyab","jyabs","jyas","jyass","jyang","jyaj","jyac","jyak","jyat","jyap","jyah","jyae","jyaeg","jyaegg","jyaegs","jyaen","jyaenj","jyaenh","jyaed","jyael","jyaelg","jyaelm","jyaelb","jyaels","jyaelt","jyaelp","jyaelh","jyaem","jyaeb","jyaebs","jyaes","jyaess","jyaeng","jyaej","jyaec","jyaek","jyaet","jyaep","jyaeh" ];

},{}],161:[function(require,module,exports){
module.exports = [ "jeo","jeog","jeogg","jeogs","jeon","jeonj","jeonh","jeod","jeol","jeolg","jeolm","jeolb","jeols","jeolt","jeolp","jeolh","jeom","jeob","jeobs","jeos","jeoss","jeong","jeoj","jeoc","jeok","jeot","jeop","jeoh","je","jeg","jegg","jegs","jen","jenj","jenh","jed","jel","jelg","jelm","jelb","jels","jelt","jelp","jelh","jem","jeb","jebs","jes","jess","jeng","jej","jec","jek","jet","jep","jeh","jyeo","jyeog","jyeogg","jyeogs","jyeon","jyeonj","jyeonh","jyeod","jyeol","jyeolg","jyeolm","jyeolb","jyeols","jyeolt","jyeolp","jyeolh","jyeom","jyeob","jyeobs","jyeos","jyeoss","jyeong","jyeoj","jyeoc","jyeok","jyeot","jyeop","jyeoh","jye","jyeg","jyegg","jyegs","jyen","jyenj","jyenh","jyed","jyel","jyelg","jyelm","jyelb","jyels","jyelt","jyelp","jyelh","jyem","jyeb","jyebs","jyes","jyess","jyeng","jyej","jyec","jyek","jyet","jyep","jyeh","jo","jog","jogg","jogs","jon","jonj","jonh","jod","jol","jolg","jolm","jolb","jols","jolt","jolp","jolh","jom","job","jobs","jos","joss","jong","joj","joc","jok","jot","jop","joh","jwa","jwag","jwagg","jwags","jwan","jwanj","jwanh","jwad","jwal","jwalg","jwalm","jwalb","jwals","jwalt","jwalp","jwalh","jwam","jwab","jwabs","jwas","jwass","jwang","jwaj","jwac","jwak","jwat","jwap","jwah","jwae","jwaeg","jwaegg","jwaegs","jwaen","jwaenj","jwaenh","jwaed","jwael","jwaelg","jwaelm","jwaelb","jwaels","jwaelt","jwaelp","jwaelh","jwaem","jwaeb","jwaebs","jwaes","jwaess","jwaeng","jwaej","jwaec","jwaek","jwaet","jwaep","jwaeh","joe","joeg","joegg","joegs","joen","joenj","joenh","joed","joel","joelg","joelm","joelb","joels","joelt","joelp","joelh","joem","joeb","joebs","joes","joess","joeng","joej","joec","joek","joet","joep","joeh","jyo","jyog","jyogg","jyogs","jyon","jyonj","jyonh","jyod","jyol","jyolg","jyolm","jyolb","jyols","jyolt","jyolp","jyolh","jyom","jyob","jyobs","jyos","jyoss","jyong","jyoj","jyoc","jyok","jyot","jyop","jyoh","ju","jug","jugg","jugs" ];

},{}],162:[function(require,module,exports){
module.exports = [ "jun","junj","junh","jud","jul","julg","julm","julb","juls","jult","julp","julh","jum","jub","jubs","jus","juss","jung","juj","juc","juk","jut","jup","juh","jweo","jweog","jweogg","jweogs","jweon","jweonj","jweonh","jweod","jweol","jweolg","jweolm","jweolb","jweols","jweolt","jweolp","jweolh","jweom","jweob","jweobs","jweos","jweoss","jweong","jweoj","jweoc","jweok","jweot","jweop","jweoh","jwe","jweg","jwegg","jwegs","jwen","jwenj","jwenh","jwed","jwel","jwelg","jwelm","jwelb","jwels","jwelt","jwelp","jwelh","jwem","jweb","jwebs","jwes","jwess","jweng","jwej","jwec","jwek","jwet","jwep","jweh","jwi","jwig","jwigg","jwigs","jwin","jwinj","jwinh","jwid","jwil","jwilg","jwilm","jwilb","jwils","jwilt","jwilp","jwilh","jwim","jwib","jwibs","jwis","jwiss","jwing","jwij","jwic","jwik","jwit","jwip","jwih","jyu","jyug","jyugg","jyugs","jyun","jyunj","jyunh","jyud","jyul","jyulg","jyulm","jyulb","jyuls","jyult","jyulp","jyulh","jyum","jyub","jyubs","jyus","jyuss","jyung","jyuj","jyuc","jyuk","jyut","jyup","jyuh","jeu","jeug","jeugg","jeugs","jeun","jeunj","jeunh","jeud","jeul","jeulg","jeulm","jeulb","jeuls","jeult","jeulp","jeulh","jeum","jeub","jeubs","jeus","jeuss","jeung","jeuj","jeuc","jeuk","jeut","jeup","jeuh","jyi","jyig","jyigg","jyigs","jyin","jyinj","jyinh","jyid","jyil","jyilg","jyilm","jyilb","jyils","jyilt","jyilp","jyilh","jyim","jyib","jyibs","jyis","jyiss","jying","jyij","jyic","jyik","jyit","jyip","jyih","ji","jig","jigg","jigs","jin","jinj","jinh","jid","jil","jilg","jilm","jilb","jils","jilt","jilp","jilh","jim","jib","jibs","jis","jiss","jing","jij","jic","jik","jit","jip","jih","jja","jjag","jjagg","jjags","jjan","jjanj","jjanh","jjad","jjal","jjalg","jjalm","jjalb","jjals","jjalt","jjalp","jjalh","jjam","jjab","jjabs","jjas","jjass","jjang","jjaj","jjac","jjak","jjat","jjap","jjah","jjae","jjaeg","jjaegg","jjaegs","jjaen","jjaenj","jjaenh","jjaed" ];

},{}],163:[function(require,module,exports){
module.exports = [ "jjael","jjaelg","jjaelm","jjaelb","jjaels","jjaelt","jjaelp","jjaelh","jjaem","jjaeb","jjaebs","jjaes","jjaess","jjaeng","jjaej","jjaec","jjaek","jjaet","jjaep","jjaeh","jjya","jjyag","jjyagg","jjyags","jjyan","jjyanj","jjyanh","jjyad","jjyal","jjyalg","jjyalm","jjyalb","jjyals","jjyalt","jjyalp","jjyalh","jjyam","jjyab","jjyabs","jjyas","jjyass","jjyang","jjyaj","jjyac","jjyak","jjyat","jjyap","jjyah","jjyae","jjyaeg","jjyaegg","jjyaegs","jjyaen","jjyaenj","jjyaenh","jjyaed","jjyael","jjyaelg","jjyaelm","jjyaelb","jjyaels","jjyaelt","jjyaelp","jjyaelh","jjyaem","jjyaeb","jjyaebs","jjyaes","jjyaess","jjyaeng","jjyaej","jjyaec","jjyaek","jjyaet","jjyaep","jjyaeh","jjeo","jjeog","jjeogg","jjeogs","jjeon","jjeonj","jjeonh","jjeod","jjeol","jjeolg","jjeolm","jjeolb","jjeols","jjeolt","jjeolp","jjeolh","jjeom","jjeob","jjeobs","jjeos","jjeoss","jjeong","jjeoj","jjeoc","jjeok","jjeot","jjeop","jjeoh","jje","jjeg","jjegg","jjegs","jjen","jjenj","jjenh","jjed","jjel","jjelg","jjelm","jjelb","jjels","jjelt","jjelp","jjelh","jjem","jjeb","jjebs","jjes","jjess","jjeng","jjej","jjec","jjek","jjet","jjep","jjeh","jjyeo","jjyeog","jjyeogg","jjyeogs","jjyeon","jjyeonj","jjyeonh","jjyeod","jjyeol","jjyeolg","jjyeolm","jjyeolb","jjyeols","jjyeolt","jjyeolp","jjyeolh","jjyeom","jjyeob","jjyeobs","jjyeos","jjyeoss","jjyeong","jjyeoj","jjyeoc","jjyeok","jjyeot","jjyeop","jjyeoh","jjye","jjyeg","jjyegg","jjyegs","jjyen","jjyenj","jjyenh","jjyed","jjyel","jjyelg","jjyelm","jjyelb","jjyels","jjyelt","jjyelp","jjyelh","jjyem","jjyeb","jjyebs","jjyes","jjyess","jjyeng","jjyej","jjyec","jjyek","jjyet","jjyep","jjyeh","jjo","jjog","jjogg","jjogs","jjon","jjonj","jjonh","jjod","jjol","jjolg","jjolm","jjolb","jjols","jjolt","jjolp","jjolh","jjom","jjob","jjobs","jjos","jjoss","jjong","jjoj","jjoc","jjok","jjot","jjop","jjoh","jjwa","jjwag","jjwagg","jjwags","jjwan","jjwanj","jjwanh","jjwad","jjwal","jjwalg","jjwalm","jjwalb","jjwals","jjwalt","jjwalp","jjwalh","jjwam","jjwab","jjwabs","jjwas","jjwass","jjwang","jjwaj","jjwac","jjwak","jjwat","jjwap","jjwah","jjwae","jjwaeg","jjwaegg","jjwaegs","jjwaen","jjwaenj","jjwaenh","jjwaed","jjwael","jjwaelg","jjwaelm","jjwaelb" ];

},{}],164:[function(require,module,exports){
module.exports = [ "jjwaels","jjwaelt","jjwaelp","jjwaelh","jjwaem","jjwaeb","jjwaebs","jjwaes","jjwaess","jjwaeng","jjwaej","jjwaec","jjwaek","jjwaet","jjwaep","jjwaeh","jjoe","jjoeg","jjoegg","jjoegs","jjoen","jjoenj","jjoenh","jjoed","jjoel","jjoelg","jjoelm","jjoelb","jjoels","jjoelt","jjoelp","jjoelh","jjoem","jjoeb","jjoebs","jjoes","jjoess","jjoeng","jjoej","jjoec","jjoek","jjoet","jjoep","jjoeh","jjyo","jjyog","jjyogg","jjyogs","jjyon","jjyonj","jjyonh","jjyod","jjyol","jjyolg","jjyolm","jjyolb","jjyols","jjyolt","jjyolp","jjyolh","jjyom","jjyob","jjyobs","jjyos","jjyoss","jjyong","jjyoj","jjyoc","jjyok","jjyot","jjyop","jjyoh","jju","jjug","jjugg","jjugs","jjun","jjunj","jjunh","jjud","jjul","jjulg","jjulm","jjulb","jjuls","jjult","jjulp","jjulh","jjum","jjub","jjubs","jjus","jjuss","jjung","jjuj","jjuc","jjuk","jjut","jjup","jjuh","jjweo","jjweog","jjweogg","jjweogs","jjweon","jjweonj","jjweonh","jjweod","jjweol","jjweolg","jjweolm","jjweolb","jjweols","jjweolt","jjweolp","jjweolh","jjweom","jjweob","jjweobs","jjweos","jjweoss","jjweong","jjweoj","jjweoc","jjweok","jjweot","jjweop","jjweoh","jjwe","jjweg","jjwegg","jjwegs","jjwen","jjwenj","jjwenh","jjwed","jjwel","jjwelg","jjwelm","jjwelb","jjwels","jjwelt","jjwelp","jjwelh","jjwem","jjweb","jjwebs","jjwes","jjwess","jjweng","jjwej","jjwec","jjwek","jjwet","jjwep","jjweh","jjwi","jjwig","jjwigg","jjwigs","jjwin","jjwinj","jjwinh","jjwid","jjwil","jjwilg","jjwilm","jjwilb","jjwils","jjwilt","jjwilp","jjwilh","jjwim","jjwib","jjwibs","jjwis","jjwiss","jjwing","jjwij","jjwic","jjwik","jjwit","jjwip","jjwih","jjyu","jjyug","jjyugg","jjyugs","jjyun","jjyunj","jjyunh","jjyud","jjyul","jjyulg","jjyulm","jjyulb","jjyuls","jjyult","jjyulp","jjyulh","jjyum","jjyub","jjyubs","jjyus","jjyuss","jjyung","jjyuj","jjyuc","jjyuk","jjyut","jjyup","jjyuh","jjeu","jjeug","jjeugg","jjeugs","jjeun","jjeunj","jjeunh","jjeud","jjeul","jjeulg","jjeulm","jjeulb","jjeuls","jjeult","jjeulp","jjeulh","jjeum","jjeub","jjeubs","jjeus","jjeuss","jjeung","jjeuj","jjeuc","jjeuk","jjeut","jjeup","jjeuh","jjyi","jjyig","jjyigg","jjyigs","jjyin","jjyinj","jjyinh","jjyid","jjyil","jjyilg","jjyilm","jjyilb","jjyils","jjyilt","jjyilp","jjyilh" ];

},{}],165:[function(require,module,exports){
module.exports = [ "jjyim","jjyib","jjyibs","jjyis","jjyiss","jjying","jjyij","jjyic","jjyik","jjyit","jjyip","jjyih","jji","jjig","jjigg","jjigs","jjin","jjinj","jjinh","jjid","jjil","jjilg","jjilm","jjilb","jjils","jjilt","jjilp","jjilh","jjim","jjib","jjibs","jjis","jjiss","jjing","jjij","jjic","jjik","jjit","jjip","jjih","ca","cag","cagg","cags","can","canj","canh","cad","cal","calg","calm","calb","cals","calt","calp","calh","cam","cab","cabs","cas","cass","cang","caj","cac","cak","cat","cap","cah","cae","caeg","caegg","caegs","caen","caenj","caenh","caed","cael","caelg","caelm","caelb","caels","caelt","caelp","caelh","caem","caeb","caebs","caes","caess","caeng","caej","caec","caek","caet","caep","caeh","cya","cyag","cyagg","cyags","cyan","cyanj","cyanh","cyad","cyal","cyalg","cyalm","cyalb","cyals","cyalt","cyalp","cyalh","cyam","cyab","cyabs","cyas","cyass","cyang","cyaj","cyac","cyak","cyat","cyap","cyah","cyae","cyaeg","cyaegg","cyaegs","cyaen","cyaenj","cyaenh","cyaed","cyael","cyaelg","cyaelm","cyaelb","cyaels","cyaelt","cyaelp","cyaelh","cyaem","cyaeb","cyaebs","cyaes","cyaess","cyaeng","cyaej","cyaec","cyaek","cyaet","cyaep","cyaeh","ceo","ceog","ceogg","ceogs","ceon","ceonj","ceonh","ceod","ceol","ceolg","ceolm","ceolb","ceols","ceolt","ceolp","ceolh","ceom","ceob","ceobs","ceos","ceoss","ceong","ceoj","ceoc","ceok","ceot","ceop","ceoh","ce","ceg","cegg","cegs","cen","cenj","cenh","ced","cel","celg","celm","celb","cels","celt","celp","celh","cem","ceb","cebs","ces","cess","ceng","cej","cec","cek","cet","cep","ceh","cyeo","cyeog","cyeogg","cyeogs","cyeon","cyeonj","cyeonh","cyeod","cyeol","cyeolg","cyeolm","cyeolb","cyeols","cyeolt","cyeolp","cyeolh","cyeom","cyeob","cyeobs","cyeos","cyeoss","cyeong","cyeoj","cyeoc","cyeok","cyeot","cyeop","cyeoh","cye","cyeg","cyegg","cyegs","cyen","cyenj","cyenh","cyed","cyel","cyelg","cyelm","cyelb","cyels","cyelt","cyelp","cyelh","cyem","cyeb","cyebs","cyes" ];

},{}],166:[function(require,module,exports){
module.exports = [ "cyess","cyeng","cyej","cyec","cyek","cyet","cyep","cyeh","co","cog","cogg","cogs","con","conj","conh","cod","col","colg","colm","colb","cols","colt","colp","colh","com","cob","cobs","cos","coss","cong","coj","coc","cok","cot","cop","coh","cwa","cwag","cwagg","cwags","cwan","cwanj","cwanh","cwad","cwal","cwalg","cwalm","cwalb","cwals","cwalt","cwalp","cwalh","cwam","cwab","cwabs","cwas","cwass","cwang","cwaj","cwac","cwak","cwat","cwap","cwah","cwae","cwaeg","cwaegg","cwaegs","cwaen","cwaenj","cwaenh","cwaed","cwael","cwaelg","cwaelm","cwaelb","cwaels","cwaelt","cwaelp","cwaelh","cwaem","cwaeb","cwaebs","cwaes","cwaess","cwaeng","cwaej","cwaec","cwaek","cwaet","cwaep","cwaeh","coe","coeg","coegg","coegs","coen","coenj","coenh","coed","coel","coelg","coelm","coelb","coels","coelt","coelp","coelh","coem","coeb","coebs","coes","coess","coeng","coej","coec","coek","coet","coep","coeh","cyo","cyog","cyogg","cyogs","cyon","cyonj","cyonh","cyod","cyol","cyolg","cyolm","cyolb","cyols","cyolt","cyolp","cyolh","cyom","cyob","cyobs","cyos","cyoss","cyong","cyoj","cyoc","cyok","cyot","cyop","cyoh","cu","cug","cugg","cugs","cun","cunj","cunh","cud","cul","culg","culm","culb","culs","cult","culp","culh","cum","cub","cubs","cus","cuss","cung","cuj","cuc","cuk","cut","cup","cuh","cweo","cweog","cweogg","cweogs","cweon","cweonj","cweonh","cweod","cweol","cweolg","cweolm","cweolb","cweols","cweolt","cweolp","cweolh","cweom","cweob","cweobs","cweos","cweoss","cweong","cweoj","cweoc","cweok","cweot","cweop","cweoh","cwe","cweg","cwegg","cwegs","cwen","cwenj","cwenh","cwed","cwel","cwelg","cwelm","cwelb","cwels","cwelt","cwelp","cwelh","cwem","cweb","cwebs","cwes","cwess","cweng","cwej","cwec","cwek","cwet","cwep","cweh","cwi","cwig","cwigg","cwigs","cwin","cwinj","cwinh","cwid","cwil","cwilg","cwilm","cwilb","cwils","cwilt","cwilp","cwilh","cwim","cwib","cwibs","cwis","cwiss","cwing","cwij","cwic" ];

},{}],167:[function(require,module,exports){
module.exports = [ "cwik","cwit","cwip","cwih","cyu","cyug","cyugg","cyugs","cyun","cyunj","cyunh","cyud","cyul","cyulg","cyulm","cyulb","cyuls","cyult","cyulp","cyulh","cyum","cyub","cyubs","cyus","cyuss","cyung","cyuj","cyuc","cyuk","cyut","cyup","cyuh","ceu","ceug","ceugg","ceugs","ceun","ceunj","ceunh","ceud","ceul","ceulg","ceulm","ceulb","ceuls","ceult","ceulp","ceulh","ceum","ceub","ceubs","ceus","ceuss","ceung","ceuj","ceuc","ceuk","ceut","ceup","ceuh","cyi","cyig","cyigg","cyigs","cyin","cyinj","cyinh","cyid","cyil","cyilg","cyilm","cyilb","cyils","cyilt","cyilp","cyilh","cyim","cyib","cyibs","cyis","cyiss","cying","cyij","cyic","cyik","cyit","cyip","cyih","ci","cig","cigg","cigs","cin","cinj","cinh","cid","cil","cilg","cilm","cilb","cils","cilt","cilp","cilh","cim","cib","cibs","cis","ciss","cing","cij","cic","cik","cit","cip","cih","ka","kag","kagg","kags","kan","kanj","kanh","kad","kal","kalg","kalm","kalb","kals","kalt","kalp","kalh","kam","kab","kabs","kas","kass","kang","kaj","kac","kak","kat","kap","kah","kae","kaeg","kaegg","kaegs","kaen","kaenj","kaenh","kaed","kael","kaelg","kaelm","kaelb","kaels","kaelt","kaelp","kaelh","kaem","kaeb","kaebs","kaes","kaess","kaeng","kaej","kaec","kaek","kaet","kaep","kaeh","kya","kyag","kyagg","kyags","kyan","kyanj","kyanh","kyad","kyal","kyalg","kyalm","kyalb","kyals","kyalt","kyalp","kyalh","kyam","kyab","kyabs","kyas","kyass","kyang","kyaj","kyac","kyak","kyat","kyap","kyah","kyae","kyaeg","kyaegg","kyaegs","kyaen","kyaenj","kyaenh","kyaed","kyael","kyaelg","kyaelm","kyaelb","kyaels","kyaelt","kyaelp","kyaelh","kyaem","kyaeb","kyaebs","kyaes","kyaess","kyaeng","kyaej","kyaec","kyaek","kyaet","kyaep","kyaeh","keo","keog","keogg","keogs","keon","keonj","keonh","keod","keol","keolg","keolm","keolb","keols","keolt","keolp","keolh","keom","keob","keobs","keos","keoss","keong","keoj","keoc","keok","keot","keop","keoh" ];

},{}],168:[function(require,module,exports){
module.exports = [ "ke","keg","kegg","kegs","ken","kenj","kenh","ked","kel","kelg","kelm","kelb","kels","kelt","kelp","kelh","kem","keb","kebs","kes","kess","keng","kej","kec","kek","ket","kep","keh","kyeo","kyeog","kyeogg","kyeogs","kyeon","kyeonj","kyeonh","kyeod","kyeol","kyeolg","kyeolm","kyeolb","kyeols","kyeolt","kyeolp","kyeolh","kyeom","kyeob","kyeobs","kyeos","kyeoss","kyeong","kyeoj","kyeoc","kyeok","kyeot","kyeop","kyeoh","kye","kyeg","kyegg","kyegs","kyen","kyenj","kyenh","kyed","kyel","kyelg","kyelm","kyelb","kyels","kyelt","kyelp","kyelh","kyem","kyeb","kyebs","kyes","kyess","kyeng","kyej","kyec","kyek","kyet","kyep","kyeh","ko","kog","kogg","kogs","kon","konj","konh","kod","kol","kolg","kolm","kolb","kols","kolt","kolp","kolh","kom","kob","kobs","kos","koss","kong","koj","koc","kok","kot","kop","koh","kwa","kwag","kwagg","kwags","kwan","kwanj","kwanh","kwad","kwal","kwalg","kwalm","kwalb","kwals","kwalt","kwalp","kwalh","kwam","kwab","kwabs","kwas","kwass","kwang","kwaj","kwac","kwak","kwat","kwap","kwah","kwae","kwaeg","kwaegg","kwaegs","kwaen","kwaenj","kwaenh","kwaed","kwael","kwaelg","kwaelm","kwaelb","kwaels","kwaelt","kwaelp","kwaelh","kwaem","kwaeb","kwaebs","kwaes","kwaess","kwaeng","kwaej","kwaec","kwaek","kwaet","kwaep","kwaeh","koe","koeg","koegg","koegs","koen","koenj","koenh","koed","koel","koelg","koelm","koelb","koels","koelt","koelp","koelh","koem","koeb","koebs","koes","koess","koeng","koej","koec","koek","koet","koep","koeh","kyo","kyog","kyogg","kyogs","kyon","kyonj","kyonh","kyod","kyol","kyolg","kyolm","kyolb","kyols","kyolt","kyolp","kyolh","kyom","kyob","kyobs","kyos","kyoss","kyong","kyoj","kyoc","kyok","kyot","kyop","kyoh","ku","kug","kugg","kugs","kun","kunj","kunh","kud","kul","kulg","kulm","kulb","kuls","kult","kulp","kulh","kum","kub","kubs","kus","kuss","kung","kuj","kuc","kuk","kut","kup","kuh","kweo","kweog","kweogg","kweogs" ];

},{}],169:[function(require,module,exports){
module.exports = [ "kweon","kweonj","kweonh","kweod","kweol","kweolg","kweolm","kweolb","kweols","kweolt","kweolp","kweolh","kweom","kweob","kweobs","kweos","kweoss","kweong","kweoj","kweoc","kweok","kweot","kweop","kweoh","kwe","kweg","kwegg","kwegs","kwen","kwenj","kwenh","kwed","kwel","kwelg","kwelm","kwelb","kwels","kwelt","kwelp","kwelh","kwem","kweb","kwebs","kwes","kwess","kweng","kwej","kwec","kwek","kwet","kwep","kweh","kwi","kwig","kwigg","kwigs","kwin","kwinj","kwinh","kwid","kwil","kwilg","kwilm","kwilb","kwils","kwilt","kwilp","kwilh","kwim","kwib","kwibs","kwis","kwiss","kwing","kwij","kwic","kwik","kwit","kwip","kwih","kyu","kyug","kyugg","kyugs","kyun","kyunj","kyunh","kyud","kyul","kyulg","kyulm","kyulb","kyuls","kyult","kyulp","kyulh","kyum","kyub","kyubs","kyus","kyuss","kyung","kyuj","kyuc","kyuk","kyut","kyup","kyuh","keu","keug","keugg","keugs","keun","keunj","keunh","keud","keul","keulg","keulm","keulb","keuls","keult","keulp","keulh","keum","keub","keubs","keus","keuss","keung","keuj","keuc","keuk","keut","keup","keuh","kyi","kyig","kyigg","kyigs","kyin","kyinj","kyinh","kyid","kyil","kyilg","kyilm","kyilb","kyils","kyilt","kyilp","kyilh","kyim","kyib","kyibs","kyis","kyiss","kying","kyij","kyic","kyik","kyit","kyip","kyih","ki","kig","kigg","kigs","kin","kinj","kinh","kid","kil","kilg","kilm","kilb","kils","kilt","kilp","kilh","kim","kib","kibs","kis","kiss","king","kij","kic","kik","kit","kip","kih","ta","tag","tagg","tags","tan","tanj","tanh","tad","tal","talg","talm","talb","tals","talt","talp","talh","tam","tab","tabs","tas","tass","tang","taj","tac","tak","tat","tap","tah","tae","taeg","taegg","taegs","taen","taenj","taenh","taed","tael","taelg","taelm","taelb","taels","taelt","taelp","taelh","taem","taeb","taebs","taes","taess","taeng","taej","taec","taek","taet","taep","taeh","tya","tyag","tyagg","tyags","tyan","tyanj","tyanh","tyad" ];

},{}],170:[function(require,module,exports){
module.exports = [ "tyal","tyalg","tyalm","tyalb","tyals","tyalt","tyalp","tyalh","tyam","tyab","tyabs","tyas","tyass","tyang","tyaj","tyac","tyak","tyat","tyap","tyah","tyae","tyaeg","tyaegg","tyaegs","tyaen","tyaenj","tyaenh","tyaed","tyael","tyaelg","tyaelm","tyaelb","tyaels","tyaelt","tyaelp","tyaelh","tyaem","tyaeb","tyaebs","tyaes","tyaess","tyaeng","tyaej","tyaec","tyaek","tyaet","tyaep","tyaeh","teo","teog","teogg","teogs","teon","teonj","teonh","teod","teol","teolg","teolm","teolb","teols","teolt","teolp","teolh","teom","teob","teobs","teos","teoss","teong","teoj","teoc","teok","teot","teop","teoh","te","teg","tegg","tegs","ten","tenj","tenh","ted","tel","telg","telm","telb","tels","telt","telp","telh","tem","teb","tebs","tes","tess","teng","tej","tec","tek","tet","tep","teh","tyeo","tyeog","tyeogg","tyeogs","tyeon","tyeonj","tyeonh","tyeod","tyeol","tyeolg","tyeolm","tyeolb","tyeols","tyeolt","tyeolp","tyeolh","tyeom","tyeob","tyeobs","tyeos","tyeoss","tyeong","tyeoj","tyeoc","tyeok","tyeot","tyeop","tyeoh","tye","tyeg","tyegg","tyegs","tyen","tyenj","tyenh","tyed","tyel","tyelg","tyelm","tyelb","tyels","tyelt","tyelp","tyelh","tyem","tyeb","tyebs","tyes","tyess","tyeng","tyej","tyec","tyek","tyet","tyep","tyeh","to","tog","togg","togs","ton","tonj","tonh","tod","tol","tolg","tolm","tolb","tols","tolt","tolp","tolh","tom","tob","tobs","tos","toss","tong","toj","toc","tok","tot","top","toh","twa","twag","twagg","twags","twan","twanj","twanh","twad","twal","twalg","twalm","twalb","twals","twalt","twalp","twalh","twam","twab","twabs","twas","twass","twang","twaj","twac","twak","twat","twap","twah","twae","twaeg","twaegg","twaegs","twaen","twaenj","twaenh","twaed","twael","twaelg","twaelm","twaelb","twaels","twaelt","twaelp","twaelh","twaem","twaeb","twaebs","twaes","twaess","twaeng","twaej","twaec","twaek","twaet","twaep","twaeh","toe","toeg","toegg","toegs","toen","toenj","toenh","toed","toel","toelg","toelm","toelb" ];

},{}],171:[function(require,module,exports){
module.exports = [ "toels","toelt","toelp","toelh","toem","toeb","toebs","toes","toess","toeng","toej","toec","toek","toet","toep","toeh","tyo","tyog","tyogg","tyogs","tyon","tyonj","tyonh","tyod","tyol","tyolg","tyolm","tyolb","tyols","tyolt","tyolp","tyolh","tyom","tyob","tyobs","tyos","tyoss","tyong","tyoj","tyoc","tyok","tyot","tyop","tyoh","tu","tug","tugg","tugs","tun","tunj","tunh","tud","tul","tulg","tulm","tulb","tuls","tult","tulp","tulh","tum","tub","tubs","tus","tuss","tung","tuj","tuc","tuk","tut","tup","tuh","tweo","tweog","tweogg","tweogs","tweon","tweonj","tweonh","tweod","tweol","tweolg","tweolm","tweolb","tweols","tweolt","tweolp","tweolh","tweom","tweob","tweobs","tweos","tweoss","tweong","tweoj","tweoc","tweok","tweot","tweop","tweoh","twe","tweg","twegg","twegs","twen","twenj","twenh","twed","twel","twelg","twelm","twelb","twels","twelt","twelp","twelh","twem","tweb","twebs","twes","twess","tweng","twej","twec","twek","twet","twep","tweh","twi","twig","twigg","twigs","twin","twinj","twinh","twid","twil","twilg","twilm","twilb","twils","twilt","twilp","twilh","twim","twib","twibs","twis","twiss","twing","twij","twic","twik","twit","twip","twih","tyu","tyug","tyugg","tyugs","tyun","tyunj","tyunh","tyud","tyul","tyulg","tyulm","tyulb","tyuls","tyult","tyulp","tyulh","tyum","tyub","tyubs","tyus","tyuss","tyung","tyuj","tyuc","tyuk","tyut","tyup","tyuh","teu","teug","teugg","teugs","teun","teunj","teunh","teud","teul","teulg","teulm","teulb","teuls","teult","teulp","teulh","teum","teub","teubs","teus","teuss","teung","teuj","teuc","teuk","teut","teup","teuh","tyi","tyig","tyigg","tyigs","tyin","tyinj","tyinh","tyid","tyil","tyilg","tyilm","tyilb","tyils","tyilt","tyilp","tyilh","tyim","tyib","tyibs","tyis","tyiss","tying","tyij","tyic","tyik","tyit","tyip","tyih","ti","tig","tigg","tigs","tin","tinj","tinh","tid","til","tilg","tilm","tilb","tils","tilt","tilp","tilh" ];

},{}],172:[function(require,module,exports){
module.exports = [ "tim","tib","tibs","tis","tiss","ting","tij","tic","tik","tit","tip","tih","pa","pag","pagg","pags","pan","panj","panh","pad","pal","palg","palm","palb","pals","palt","palp","palh","pam","pab","pabs","pas","pass","pang","paj","pac","pak","pat","pap","pah","pae","paeg","paegg","paegs","paen","paenj","paenh","paed","pael","paelg","paelm","paelb","paels","paelt","paelp","paelh","paem","paeb","paebs","paes","paess","paeng","paej","paec","paek","paet","paep","paeh","pya","pyag","pyagg","pyags","pyan","pyanj","pyanh","pyad","pyal","pyalg","pyalm","pyalb","pyals","pyalt","pyalp","pyalh","pyam","pyab","pyabs","pyas","pyass","pyang","pyaj","pyac","pyak","pyat","pyap","pyah","pyae","pyaeg","pyaegg","pyaegs","pyaen","pyaenj","pyaenh","pyaed","pyael","pyaelg","pyaelm","pyaelb","pyaels","pyaelt","pyaelp","pyaelh","pyaem","pyaeb","pyaebs","pyaes","pyaess","pyaeng","pyaej","pyaec","pyaek","pyaet","pyaep","pyaeh","peo","peog","peogg","peogs","peon","peonj","peonh","peod","peol","peolg","peolm","peolb","peols","peolt","peolp","peolh","peom","peob","peobs","peos","peoss","peong","peoj","peoc","peok","peot","peop","peoh","pe","peg","pegg","pegs","pen","penj","penh","ped","pel","pelg","pelm","pelb","pels","pelt","pelp","pelh","pem","peb","pebs","pes","pess","peng","pej","pec","pek","pet","pep","peh","pyeo","pyeog","pyeogg","pyeogs","pyeon","pyeonj","pyeonh","pyeod","pyeol","pyeolg","pyeolm","pyeolb","pyeols","pyeolt","pyeolp","pyeolh","pyeom","pyeob","pyeobs","pyeos","pyeoss","pyeong","pyeoj","pyeoc","pyeok","pyeot","pyeop","pyeoh","pye","pyeg","pyegg","pyegs","pyen","pyenj","pyenh","pyed","pyel","pyelg","pyelm","pyelb","pyels","pyelt","pyelp","pyelh","pyem","pyeb","pyebs","pyes","pyess","pyeng","pyej","pyec","pyek","pyet","pyep","pyeh","po","pog","pogg","pogs","pon","ponj","ponh","pod","pol","polg","polm","polb","pols","polt","polp","polh","pom","pob","pobs","pos" ];

},{}],173:[function(require,module,exports){
module.exports = [ "poss","pong","poj","poc","pok","pot","pop","poh","pwa","pwag","pwagg","pwags","pwan","pwanj","pwanh","pwad","pwal","pwalg","pwalm","pwalb","pwals","pwalt","pwalp","pwalh","pwam","pwab","pwabs","pwas","pwass","pwang","pwaj","pwac","pwak","pwat","pwap","pwah","pwae","pwaeg","pwaegg","pwaegs","pwaen","pwaenj","pwaenh","pwaed","pwael","pwaelg","pwaelm","pwaelb","pwaels","pwaelt","pwaelp","pwaelh","pwaem","pwaeb","pwaebs","pwaes","pwaess","pwaeng","pwaej","pwaec","pwaek","pwaet","pwaep","pwaeh","poe","poeg","poegg","poegs","poen","poenj","poenh","poed","poel","poelg","poelm","poelb","poels","poelt","poelp","poelh","poem","poeb","poebs","poes","poess","poeng","poej","poec","poek","poet","poep","poeh","pyo","pyog","pyogg","pyogs","pyon","pyonj","pyonh","pyod","pyol","pyolg","pyolm","pyolb","pyols","pyolt","pyolp","pyolh","pyom","pyob","pyobs","pyos","pyoss","pyong","pyoj","pyoc","pyok","pyot","pyop","pyoh","pu","pug","pugg","pugs","pun","punj","punh","pud","pul","pulg","pulm","pulb","puls","pult","pulp","pulh","pum","pub","pubs","pus","puss","pung","puj","puc","puk","put","pup","puh","pweo","pweog","pweogg","pweogs","pweon","pweonj","pweonh","pweod","pweol","pweolg","pweolm","pweolb","pweols","pweolt","pweolp","pweolh","pweom","pweob","pweobs","pweos","pweoss","pweong","pweoj","pweoc","pweok","pweot","pweop","pweoh","pwe","pweg","pwegg","pwegs","pwen","pwenj","pwenh","pwed","pwel","pwelg","pwelm","pwelb","pwels","pwelt","pwelp","pwelh","pwem","pweb","pwebs","pwes","pwess","pweng","pwej","pwec","pwek","pwet","pwep","pweh","pwi","pwig","pwigg","pwigs","pwin","pwinj","pwinh","pwid","pwil","pwilg","pwilm","pwilb","pwils","pwilt","pwilp","pwilh","pwim","pwib","pwibs","pwis","pwiss","pwing","pwij","pwic","pwik","pwit","pwip","pwih","pyu","pyug","pyugg","pyugs","pyun","pyunj","pyunh","pyud","pyul","pyulg","pyulm","pyulb","pyuls","pyult","pyulp","pyulh","pyum","pyub","pyubs","pyus","pyuss","pyung","pyuj","pyuc" ];

},{}],174:[function(require,module,exports){
module.exports = [ "pyuk","pyut","pyup","pyuh","peu","peug","peugg","peugs","peun","peunj","peunh","peud","peul","peulg","peulm","peulb","peuls","peult","peulp","peulh","peum","peub","peubs","peus","peuss","peung","peuj","peuc","peuk","peut","peup","peuh","pyi","pyig","pyigg","pyigs","pyin","pyinj","pyinh","pyid","pyil","pyilg","pyilm","pyilb","pyils","pyilt","pyilp","pyilh","pyim","pyib","pyibs","pyis","pyiss","pying","pyij","pyic","pyik","pyit","pyip","pyih","pi","pig","pigg","pigs","pin","pinj","pinh","pid","pil","pilg","pilm","pilb","pils","pilt","pilp","pilh","pim","pib","pibs","pis","piss","ping","pij","pic","pik","pit","pip","pih","ha","hag","hagg","hags","han","hanj","hanh","had","hal","halg","halm","halb","hals","halt","halp","halh","ham","hab","habs","has","hass","hang","haj","hac","hak","hat","hap","hah","hae","haeg","haegg","haegs","haen","haenj","haenh","haed","hael","haelg","haelm","haelb","haels","haelt","haelp","haelh","haem","haeb","haebs","haes","haess","haeng","haej","haec","haek","haet","haep","haeh","hya","hyag","hyagg","hyags","hyan","hyanj","hyanh","hyad","hyal","hyalg","hyalm","hyalb","hyals","hyalt","hyalp","hyalh","hyam","hyab","hyabs","hyas","hyass","hyang","hyaj","hyac","hyak","hyat","hyap","hyah","hyae","hyaeg","hyaegg","hyaegs","hyaen","hyaenj","hyaenh","hyaed","hyael","hyaelg","hyaelm","hyaelb","hyaels","hyaelt","hyaelp","hyaelh","hyaem","hyaeb","hyaebs","hyaes","hyaess","hyaeng","hyaej","hyaec","hyaek","hyaet","hyaep","hyaeh","heo","heog","heogg","heogs","heon","heonj","heonh","heod","heol","heolg","heolm","heolb","heols","heolt","heolp","heolh","heom","heob","heobs","heos","heoss","heong","heoj","heoc","heok","heot","heop","heoh","he","heg","hegg","hegs","hen","henj","henh","hed","hel","helg","helm","helb","hels","helt","help","helh","hem","heb","hebs","hes","hess","heng","hej","hec","hek","het","hep","heh" ];

},{}],175:[function(require,module,exports){
module.exports = [ "hyeo","hyeog","hyeogg","hyeogs","hyeon","hyeonj","hyeonh","hyeod","hyeol","hyeolg","hyeolm","hyeolb","hyeols","hyeolt","hyeolp","hyeolh","hyeom","hyeob","hyeobs","hyeos","hyeoss","hyeong","hyeoj","hyeoc","hyeok","hyeot","hyeop","hyeoh","hye","hyeg","hyegg","hyegs","hyen","hyenj","hyenh","hyed","hyel","hyelg","hyelm","hyelb","hyels","hyelt","hyelp","hyelh","hyem","hyeb","hyebs","hyes","hyess","hyeng","hyej","hyec","hyek","hyet","hyep","hyeh","ho","hog","hogg","hogs","hon","honj","honh","hod","hol","holg","holm","holb","hols","holt","holp","holh","hom","hob","hobs","hos","hoss","hong","hoj","hoc","hok","hot","hop","hoh","hwa","hwag","hwagg","hwags","hwan","hwanj","hwanh","hwad","hwal","hwalg","hwalm","hwalb","hwals","hwalt","hwalp","hwalh","hwam","hwab","hwabs","hwas","hwass","hwang","hwaj","hwac","hwak","hwat","hwap","hwah","hwae","hwaeg","hwaegg","hwaegs","hwaen","hwaenj","hwaenh","hwaed","hwael","hwaelg","hwaelm","hwaelb","hwaels","hwaelt","hwaelp","hwaelh","hwaem","hwaeb","hwaebs","hwaes","hwaess","hwaeng","hwaej","hwaec","hwaek","hwaet","hwaep","hwaeh","hoe","hoeg","hoegg","hoegs","hoen","hoenj","hoenh","hoed","hoel","hoelg","hoelm","hoelb","hoels","hoelt","hoelp","hoelh","hoem","hoeb","hoebs","hoes","hoess","hoeng","hoej","hoec","hoek","hoet","hoep","hoeh","hyo","hyog","hyogg","hyogs","hyon","hyonj","hyonh","hyod","hyol","hyolg","hyolm","hyolb","hyols","hyolt","hyolp","hyolh","hyom","hyob","hyobs","hyos","hyoss","hyong","hyoj","hyoc","hyok","hyot","hyop","hyoh","hu","hug","hugg","hugs","hun","hunj","hunh","hud","hul","hulg","hulm","hulb","huls","hult","hulp","hulh","hum","hub","hubs","hus","huss","hung","huj","huc","huk","hut","hup","huh","hweo","hweog","hweogg","hweogs","hweon","hweonj","hweonh","hweod","hweol","hweolg","hweolm","hweolb","hweols","hweolt","hweolp","hweolh","hweom","hweob","hweobs","hweos","hweoss","hweong","hweoj","hweoc","hweok","hweot","hweop","hweoh","hwe","hweg","hwegg","hwegs" ];

},{}],176:[function(require,module,exports){
module.exports = [ "hwen","hwenj","hwenh","hwed","hwel","hwelg","hwelm","hwelb","hwels","hwelt","hwelp","hwelh","hwem","hweb","hwebs","hwes","hwess","hweng","hwej","hwec","hwek","hwet","hwep","hweh","hwi","hwig","hwigg","hwigs","hwin","hwinj","hwinh","hwid","hwil","hwilg","hwilm","hwilb","hwils","hwilt","hwilp","hwilh","hwim","hwib","hwibs","hwis","hwiss","hwing","hwij","hwic","hwik","hwit","hwip","hwih","hyu","hyug","hyugg","hyugs","hyun","hyunj","hyunh","hyud","hyul","hyulg","hyulm","hyulb","hyuls","hyult","hyulp","hyulh","hyum","hyub","hyubs","hyus","hyuss","hyung","hyuj","hyuc","hyuk","hyut","hyup","hyuh","heu","heug","heugg","heugs","heun","heunj","heunh","heud","heul","heulg","heulm","heulb","heuls","heult","heulp","heulh","heum","heub","heubs","heus","heuss","heung","heuj","heuc","heuk","heut","heup","heuh","hyi","hyig","hyigg","hyigs","hyin","hyinj","hyinh","hyid","hyil","hyilg","hyilm","hyilb","hyils","hyilt","hyilp","hyilh","hyim","hyib","hyibs","hyis","hyiss","hying","hyij","hyic","hyik","hyit","hyip","hyih","hi","hig","higg","higs","hin","hinj","hinh","hid","hil","hilg","hilm","hilb","hils","hilt","hilp","hilh","him","hib","hibs","his","hiss","hing","hij","hic","hik","hit","hip","hih","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],177:[function(require,module,exports){
module.exports = [ "Kay ","Kayng ","Ke ","Ko ","Kol ","Koc ","Kwi ","Kwi ","Kyun ","Kul ","Kum ","Na ","Na ","Na ","La ","Na ","Na ","Na ","Na ","Na ","Nak ","Nak ","Nak ","Nak ","Nak ","Nak ","Nak ","Nan ","Nan ","Nan ","Nan ","Nan ","Nan ","Nam ","Nam ","Nam ","Nam ","Nap ","Nap ","Nap ","Nang ","Nang ","Nang ","Nang ","Nang ","Nay ","Nayng ","No ","No ","No ","No ","No ","No ","No ","No ","No ","No ","No ","No ","Nok ","Nok ","Nok ","Nok ","Nok ","Nok ","Non ","Nong ","Nong ","Nong ","Nong ","Noy ","Noy ","Noy ","Noy ","Nwu ","Nwu ","Nwu ","Nwu ","Nwu ","Nwu ","Nwu ","Nwu ","Nuk ","Nuk ","Num ","Nung ","Nung ","Nung ","Nung ","Nung ","Twu ","La ","Lak ","Lak ","Lan ","Lyeng ","Lo ","Lyul ","Li ","Pey ","Pen ","Pyen ","Pwu ","Pwul ","Pi ","Sak ","Sak ","Sam ","Sayk ","Sayng ","Sep ","Sey ","Sway ","Sin ","Sim ","Sip ","Ya ","Yak ","Yak ","Yang ","Yang ","Yang ","Yang ","Yang ","Yang ","Yang ","Yang ","Ye ","Ye ","Ye ","Ye ","Ye ","Ye ","Ye ","Ye ","Ye ","Ye ","Ye ","Yek ","Yek ","Yek ","Yek ","Yen ","Yen ","Yen ","Yen ","Yen ","Yen ","Yen ","Yen ","Yen ","Yen ","Yen ","Yen ","Yen ","Yen ","Yel ","Yel ","Yel ","Yel ","Yel ","Yel ","Yem ","Yem ","Yem ","Yem ","Yem ","Yep ","Yeng ","Yeng ","Yeng ","Yeng ","Yeng ","Yeng ","Yeng ","Yeng ","Yeng ","Yeng ","Yeng ","Yeng ","Yeng ","Yey ","Yey ","Yey ","Yey ","O ","Yo ","Yo ","Yo ","Yo ","Yo ","Yo ","Yo ","Yo ","Yo ","Yo ","Yong ","Wun ","Wen ","Yu ","Yu ","Yu ","Yu ","Yu ","Yu ","Yu ","Yu ","Yu ","Yu ","Yuk ","Yuk ","Yuk ","Yun ","Yun ","Yun ","Yun ","Yul ","Yul ","Yul ","Yul ","Yung ","I ","I ","I ","I ","I ","I ","I ","I ","I ","I ","I ","I ","I ","I ","Ik ","Ik ","In ","In ","In ","In ","In ","In ","In ","Im ","Im ","Im ","Ip ","Ip ","Ip ","Cang ","Cek ","Ci ","Cip ","Cha ","Chek " ];

},{}],178:[function(require,module,exports){
module.exports = [ "Chey ","Thak ","Thak ","Thang ","Thayk ","Thong ","Pho ","Phok ","Hang ","Hang ","Hyen ","Hwak ","Wu ","Huo ","[?] ","[?] ","Zhong ","[?] ","Qing ","[?] ","[?] ","Xi ","Zhu ","Yi ","Li ","Shen ","Xiang ","Fu ","Jing ","Jing ","Yu ","[?] ","Hagi ","[?] ","Zhu ","[?] ","[?] ","Yi ","Du ","[?] ","[?] ","[?] ","Fan ","Si ","Guan ","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]" ];

},{}],179:[function(require,module,exports){
module.exports = [ "ff","fi","fl","ffi","ffl","st","st","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","mn","me","mi","vn","mkh","[?]","[?]","[?]","[?]","[?]","yi","","ay","`","","d","h","k","l","m","m","t","+","sh","s","sh","s","a","a","","b","g","d","h","v","z","[?]","t","y","k","k","l","[?]","l","[?]","n","n","[?]","p","p","[?]","ts","ts","r","sh","t","vo","b","k","p","l","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","" ];

},{}],180:[function(require,module,exports){
module.exports = [ "","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","" ];

},{}],181:[function(require,module,exports){
module.exports = [ "","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","[?]","[?]","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","","","","","","","","","","","","","[?]","[?]","[?]" ];

},{}],182:[function(require,module,exports){
module.exports = [ "[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","","","","~","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","..","--","-","_","_","(",") ","{","} ","[","] ","[(",")] ","<<",">> ","<","> ","[","] ","{","}","[?]","[?]","[?]","[?]","","","","","","","",",",",",".","",";",":","?","!","-","(",")","{","}","{","}","#","&","*","+","-","<",">","=","","\\","$","%","@","[?]","[?]","[?]","[?]","","","","[?]","","[?]","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","[?]","[?]","" ];

},{}],183:[function(require,module,exports){
module.exports = [ "[?]","!","\"","#","$","%","&","'","(",")","*","+",",","-",".","/","0","1","2","3","4","5","6","7","8","9",":",";","<","=",">","?","@","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","[","\\","]","^","_","`","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z","{","|","}","~","[?]","[?]",".","[","]",",","*","wo","a","i","u","e","o","ya","yu","yo","tu","+","a","i","u","e","o","ka","ki","ku","ke","ko","sa","si","su","se","so","ta","ti","tu","te","to","na","ni","nu","ne","no","ha","hi","hu","he","ho","ma","mi","mu","me","mo","ya","yu","yo","ra","ri","ru","re","ro","wa","n",":",";","","g","gg","gs","n","nj","nh","d","dd","r","lg","lm","lb","ls","lt","lp","rh","m","b","bb","bs","s","ss","","j","jj","c","k","t","p","h","[?]","[?]","[?]","a","ae","ya","yae","eo","e","[?]","[?]","yeo","ye","o","wa","wae","oe","[?]","[?]","yo","u","weo","we","wi","yu","[?]","[?]","eu","yi","i","[?]","[?]","[?]","/C","PS","!","-","|","Y=","W=","[?]","|","-","|","-","|","#","O","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","[?]","{","|","}","","","","" ];

},{}],184:[function(require,module,exports){
/**
 * Unidecode takes UTF-8 data and tries to represent it in US-ASCII characters (i.e., the universally displayable characters between 0x00 and 0x7F).
 * The representation is almost always an attempt at transliteration -- i.e., conveying, in Roman letters, the pronunciation expressed by the text in
 * some other writing system.
 *
 * The tables used (in data) are converted from the tables provided in the perl library Text::Unidecode (http://search.cpan.org/dist/Text-Unidecode/lib/Text/Unidecode.pm)
 * and are distributed under the perl license
 *
 * @author Francois-Guillaume Ribreau
 *
 * Based on the port of unidecode for php
 */

'use strict';

var tr = {};
var utf8_rx = /(?![\x00-\x7F]|[\xC0-\xDF][\x80-\xBF]|[\xE0-\xEF][\x80-\xBF]{2}|[\xF0-\xF7][\x80-\xBF]{3})./g;

module.exports = function (str) {
  return str.replace(utf8_rx, unidecode_internal_replace);
};

function unidecode_internal_replace(match) {
  var utf16 = utf8_to_utf16(match);

  if (utf16 > 0xFFFF) {
    return '_';
  } else {

    var h = utf16 >> 8;
    var l = utf16 & 0xFF;

    // (18) 18 > h < 1e (30)
    if (h > 24 && h < 30) return '';

    //(d7) 215 > h < 249 (f9) no supported
    if (h > 215 && h < 249) return '';

    if (!tr[h]) {
      switch (dec2hex(h)) {
      case '00':
        tr[h] = require('./data/x00');
        break;
      case '01':
        tr[h] = require('./data/x01');
        break;
      case '02':
        tr[h] = require('./data/x02');
        break;
      case '03':
        tr[h] = require('./data/x03');
        break;
      case '04':
        tr[h] = require('./data/x04');
        break;
      case '05':
        tr[h] = require('./data/x05');
        break;
      case '06':
        tr[h] = require('./data/x06');
        break;
      case '07':
        tr[h] = require('./data/x07');
        break;
      case '09':
        tr[h] = require('./data/x09');
        break;
      case '0a':
        tr[h] = require('./data/x0a');
        break;
      case '0b':
        tr[h] = require('./data/x0b');
        break;
      case '0c':
        tr[h] = require('./data/x0c');
        break;
      case '0d':
        tr[h] = require('./data/x0d');
        break;
      case '0e':
        tr[h] = require('./data/x0e');
        break;
      case '0f':
        tr[h] = require('./data/x0f');
        break;
      case '10':
        tr[h] = require('./data/x10');
        break;
      case '11':
        tr[h] = require('./data/x11');
        break;
      case '12':
        tr[h] = require('./data/x12');
        break;
      case '13':
        tr[h] = require('./data/x13');
        break;
      case '14':
        tr[h] = require('./data/x14');
        break;
      case '15':
        tr[h] = require('./data/x15');
        break;
      case '16':
        tr[h] = require('./data/x16');
        break;
      case '17':
        tr[h] = require('./data/x17');
        break;
      case '18':
        tr[h] = require('./data/x18');
        break;
      case '1e':
        tr[h] = require('./data/x1e');
        break;
      case '1f':
        tr[h] = require('./data/x1f');
        break;
      case '20':
        tr[h] = require('./data/x20');
        break;
      case '21':
        tr[h] = require('./data/x21');
        break;
      case '22':
        tr[h] = require('./data/x22');
        break;
      case '23':
        tr[h] = require('./data/x23');
        break;
      case '24':
        tr[h] = require('./data/x24');
        break;
      case '25':
        tr[h] = require('./data/x25');
        break;
      case '26':
        tr[h] = require('./data/x26');
        break;
      case '27':
        tr[h] = require('./data/x27');
        break;
      case '28':
        tr[h] = require('./data/x28');
        break;
      case '2e':
        tr[h] = require('./data/x2e');
        break;
      case '2f':
        tr[h] = require('./data/x2f');
        break;
      case '30':
        tr[h] = require('./data/x30');
        break;
      case '31':
        tr[h] = require('./data/x31');
        break;
      case '32':
        tr[h] = require('./data/x32');
        break;
      case '33':
        tr[h] = require('./data/x33');
        break;
      case '4d':
        tr[h] = require('./data/x4d');
        break;
      case '4e':
        tr[h] = require('./data/x4e');
        break;
      case '4f':
        tr[h] = require('./data/x4f');
        break;
      case '50':
        tr[h] = require('./data/x50');
        break;
      case '51':
        tr[h] = require('./data/x51');
        break;
      case '52':
        tr[h] = require('./data/x52');
        break;
      case '53':
        tr[h] = require('./data/x53');
        break;
      case '54':
        tr[h] = require('./data/x54');
        break;
      case '55':
        tr[h] = require('./data/x55');
        break;
      case '56':
        tr[h] = require('./data/x56');
        break;
      case '57':
        tr[h] = require('./data/x57');
        break;
      case '58':
        tr[h] = require('./data/x58');
        break;
      case '59':
        tr[h] = require('./data/x59');
        break;
      case '5a':
        tr[h] = require('./data/x5a');
        break;
      case '5b':
        tr[h] = require('./data/x5b');
        break;
      case '5c':
        tr[h] = require('./data/x5c');
        break;
      case '5d':
        tr[h] = require('./data/x5d');
        break;
      case '5e':
        tr[h] = require('./data/x5e');
        break;
      case '5f':
        tr[h] = require('./data/x5f');
        break;
      case '60':
        tr[h] = require('./data/x60');
        break;
      case '61':
        tr[h] = require('./data/x61');
        break;
      case '62':
        tr[h] = require('./data/x62');
        break;
      case '63':
        tr[h] = require('./data/x63');
        break;
      case '64':
        tr[h] = require('./data/x64');
        break;
      case '65':
        tr[h] = require('./data/x65');
        break;
      case '66':
        tr[h] = require('./data/x66');
        break;
      case '67':
        tr[h] = require('./data/x67');
        break;
      case '68':
        tr[h] = require('./data/x68');
        break;
      case '69':
        tr[h] = require('./data/x69');
        break;
      case '6a':
        tr[h] = require('./data/x6a');
        break;
      case '6b':
        tr[h] = require('./data/x6b');
        break;
      case '6c':
        tr[h] = require('./data/x6c');
        break;
      case '6d':
        tr[h] = require('./data/x6d');
        break;
      case '6e':
        tr[h] = require('./data/x6e');
        break;
      case '6f':
        tr[h] = require('./data/x6f');
        break;
      case '70':
        tr[h] = require('./data/x70');
        break;
      case '71':
        tr[h] = require('./data/x71');
        break;
      case '72':
        tr[h] = require('./data/x72');
        break;
      case '73':
        tr[h] = require('./data/x73');
        break;
      case '74':
        tr[h] = require('./data/x74');
        break;
      case '75':
        tr[h] = require('./data/x75');
        break;
      case '76':
        tr[h] = require('./data/x76');
        break;
      case '77':
        tr[h] = require('./data/x77');
        break;
      case '78':
        tr[h] = require('./data/x78');
        break;
      case '79':
        tr[h] = require('./data/x79');
        break;
      case '7a':
        tr[h] = require('./data/x7a');
        break;
      case '7b':
        tr[h] = require('./data/x7b');
        break;
      case '7c':
        tr[h] = require('./data/x7c');
        break;
      case '7d':
        tr[h] = require('./data/x7d');
        break;
      case '7e':
        tr[h] = require('./data/x7e');
        break;
      case '7f':
        tr[h] = require('./data/x7f');
        break;
      case '80':
        tr[h] = require('./data/x80');
        break;
      case '81':
        tr[h] = require('./data/x81');
        break;
      case '82':
        tr[h] = require('./data/x82');
        break;
      case '83':
        tr[h] = require('./data/x83');
        break;
      case '84':
        tr[h] = require('./data/x84');
        break;
      case '85':
        tr[h] = require('./data/x85');
        break;
      case '86':
        tr[h] = require('./data/x86');
        break;
      case '87':
        tr[h] = require('./data/x87');
        break;
      case '88':
        tr[h] = require('./data/x88');
        break;
      case '89':
        tr[h] = require('./data/x89');
        break;
      case '8a':
        tr[h] = require('./data/x8a');
        break;
      case '8b':
        tr[h] = require('./data/x8b');
        break;
      case '8c':
        tr[h] = require('./data/x8c');
        break;
      case '8d':
        tr[h] = require('./data/x8d');
        break;
      case '8e':
        tr[h] = require('./data/x8e');
        break;
      case '8f':
        tr[h] = require('./data/x8f');
        break;
      case '90':
        tr[h] = require('./data/x90');
        break;
      case '91':
        tr[h] = require('./data/x91');
        break;
      case '92':
        tr[h] = require('./data/x92');
        break;
      case '93':
        tr[h] = require('./data/x93');
        break;
      case '94':
        tr[h] = require('./data/x94');
        break;
      case '95':
        tr[h] = require('./data/x95');
        break;
      case '96':
        tr[h] = require('./data/x96');
        break;
      case '97':
        tr[h] = require('./data/x97');
        break;
      case '98':
        tr[h] = require('./data/x98');
        break;
      case '99':
        tr[h] = require('./data/x99');
        break;
      case '9a':
        tr[h] = require('./data/x9a');
        break;
      case '9b':
        tr[h] = require('./data/x9b');
        break;
      case '9c':
        tr[h] = require('./data/x9c');
        break;
      case '9d':
        tr[h] = require('./data/x9d');
        break;
      case '9e':
        tr[h] = require('./data/x9e');
        break;
      case '9f':
        tr[h] = require('./data/x9f');
        break;
      case 'a0':
        tr[h] = require('./data/xa0');
        break;
      case 'a1':
        tr[h] = require('./data/xa1');
        break;
      case 'a2':
        tr[h] = require('./data/xa2');
        break;
      case 'a3':
        tr[h] = require('./data/xa3');
        break;
      case 'a4':
        tr[h] = require('./data/xa4');
        break;
      case 'ac':
        tr[h] = require('./data/xac');
        break;
      case 'ad':
        tr[h] = require('./data/xad');
        break;
      case 'ae':
        tr[h] = require('./data/xae');
        break;
      case 'af':
        tr[h] = require('./data/xaf');
        break;
      case 'b0':
        tr[h] = require('./data/xb0');
        break;
      case 'b1':
        tr[h] = require('./data/xb1');
        break;
      case 'b2':
        tr[h] = require('./data/xb2');
        break;
      case 'b3':
        tr[h] = require('./data/xb3');
        break;
      case 'b4':
        tr[h] = require('./data/xb4');
        break;
      case 'b5':
        tr[h] = require('./data/xb5');
        break;
      case 'b6':
        tr[h] = require('./data/xb6');
        break;
      case 'b7':
        tr[h] = require('./data/xb7');
        break;
      case 'b8':
        tr[h] = require('./data/xb8');
        break;
      case 'b9':
        tr[h] = require('./data/xb9');
        break;
      case 'ba':
        tr[h] = require('./data/xba');
        break;
      case 'bb':
        tr[h] = require('./data/xbb');
        break;
      case 'bc':
        tr[h] = require('./data/xbc');
        break;
      case 'bd':
        tr[h] = require('./data/xbd');
        break;
      case 'be':
        tr[h] = require('./data/xbe');
        break;
      case 'bf':
        tr[h] = require('./data/xbf');
        break;
      case 'c0':
        tr[h] = require('./data/xc0');
        break;
      case 'c1':
        tr[h] = require('./data/xc1');
        break;
      case 'c2':
        tr[h] = require('./data/xc2');
        break;
      case 'c3':
        tr[h] = require('./data/xc3');
        break;
      case 'c4':
        tr[h] = require('./data/xc4');
        break;
      case 'c5':
        tr[h] = require('./data/xc5');
        break;
      case 'c6':
        tr[h] = require('./data/xc6');
        break;
      case 'c7':
        tr[h] = require('./data/xc7');
        break;
      case 'c8':
        tr[h] = require('./data/xc8');
        break;
      case 'c9':
        tr[h] = require('./data/xc9');
        break;
      case 'ca':
        tr[h] = require('./data/xca');
        break;
      case 'cb':
        tr[h] = require('./data/xcb');
        break;
      case 'cc':
        tr[h] = require('./data/xcc');
        break;
      case 'cd':
        tr[h] = require('./data/xcd');
        break;
      case 'ce':
        tr[h] = require('./data/xce');
        break;
      case 'cf':
        tr[h] = require('./data/xcf');
        break;
      case 'd0':
        tr[h] = require('./data/xd0');
        break;
      case 'd1':
        tr[h] = require('./data/xd1');
        break;
      case 'd2':
        tr[h] = require('./data/xd2');
        break;
      case 'd3':
        tr[h] = require('./data/xd3');
        break;
      case 'd4':
        tr[h] = require('./data/xd4');
        break;
      case 'd5':
        tr[h] = require('./data/xd5');
        break;
      case 'd6':
        tr[h] = require('./data/xd6');
        break;
      case 'd7':
        tr[h] = require('./data/xd7');
        break;
      case 'f9':
        tr[h] = require('./data/xf9');
        break;
      case 'fa':
        tr[h] = require('./data/xfa');
        break;
      case 'fb':
        tr[h] = require('./data/xfb');
        break;
      case 'fc':
        tr[h] = require('./data/xfc');
        break;
      case 'fd':
        tr[h] = require('./data/xfd');
        break;
      case 'fe':
        tr[h] = require('./data/xfe');
        break;
      case 'ff':
        tr[h] = require('./data/xff');
        break;
      default:
        // console.error("Unidecode file not found for h=", h);
        return '';
      }
    }

    return tr[h][l];
  }
}

function dec2hex(i) {
  return (i + 0x100).toString(16).substr(-2);
}

function utf8_to_utf16(raw) {
  var b1, b2, b3, b4,
    x, y, z;

  while (Array.isArray(raw)) raw = raw[0];

  switch (raw.length) {
  case 1:
    return ord(raw);

    // http://en.wikipedia.org/wiki/UTF-8
  case 2:
    b1 = ord(raw.substr(0, 1));
    b2 = ord(raw.substr(1, 1));

    x = ((b1 & 0x03) << 6) | (b2 & 0x3F);
    y = (b1 & 0x1C) >> 2;

    return (y << 8) | x;

  case 3:
    b1 = ord(raw.substr(0, 1));
    b2 = ord(raw.substr(1, 1));
    b3 = ord(raw.substr(2, 1));

    x = ((b2 & 0x03) << 6) | (b3 & 0x3F);
    y = ((b1 & 0x0F) << 4) | ((b2 & 0x3C) >> 2);

    return (y << 8) | x;

  default:
    b1 = ord(raw.substr(0, 1));
    b2 = ord(raw.substr(1, 1));
    b3 = ord(raw.substr(2, 1));
    b4 = ord(raw.substr(3, 1));

    x = ((b3 & 0x03) << 6) | (b4 & 0x3F);
    y = ((b2 & 0x0F) << 4) | ((b3 & 0x3C) >> 2);
    z = ((b1 & 0x07) << 5) | ((b2 & 0x30) >> 4);

    return (z << 16) | (y << 8) | x;
  }
}

/* From php.js */

function ord(string) {
  // Returns the codepoint value of a character
  //
  // version: 1109.2015
  // discuss at: http://phpjs.org/functions/ord
  // +   original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // +   bugfixed by: Onno Marsman
  // +   improved by: Brett Zamir (http://brett-zamir.me)
  // +   input by: incidence
  // *     example 1: ord('K');
  // *     returns 1: 75
  // *     example 2: ord('\uD800\uDC00'); // surrogate pair to create a single Unicode character
  // *     returns 2: 65536
  var str = string + '',
    code = str.charCodeAt(0);
  if (0xD800 <= code && code <= 0xDBFF) { // High surrogate (could change last hex to 0xDB7F to treat high private surrogates as single characters)
    var hi = code;
    if (str.length === 1) {
      return code; // This is just a high surrogate with no following low surrogate, so we return its value;
      // we could also throw an error as it is not a complete character, but someone may want to know
    }
    var low = str.charCodeAt(1);
    return ((hi - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000;
  }
  if (0xDC00 <= code && code <= 0xDFFF) { // Low surrogate
    return code; // This is just a low surrogate with no preceding high surrogate, so we return its value;
    // we could also throw an error as it is not a complete character, but someone may want to know
  }
  return code;
}

},{"./data/x00":4,"./data/x01":5,"./data/x02":6,"./data/x03":7,"./data/x04":8,"./data/x05":9,"./data/x06":10,"./data/x07":11,"./data/x09":12,"./data/x0a":13,"./data/x0b":14,"./data/x0c":15,"./data/x0d":16,"./data/x0e":17,"./data/x0f":18,"./data/x10":19,"./data/x11":20,"./data/x12":21,"./data/x13":22,"./data/x14":23,"./data/x15":24,"./data/x16":25,"./data/x17":26,"./data/x18":27,"./data/x1e":28,"./data/x1f":29,"./data/x20":30,"./data/x21":31,"./data/x22":32,"./data/x23":33,"./data/x24":34,"./data/x25":35,"./data/x26":36,"./data/x27":37,"./data/x28":38,"./data/x2e":39,"./data/x2f":40,"./data/x30":41,"./data/x31":42,"./data/x32":43,"./data/x33":44,"./data/x4d":45,"./data/x4e":46,"./data/x4f":47,"./data/x50":48,"./data/x51":49,"./data/x52":50,"./data/x53":51,"./data/x54":52,"./data/x55":53,"./data/x56":54,"./data/x57":55,"./data/x58":56,"./data/x59":57,"./data/x5a":58,"./data/x5b":59,"./data/x5c":60,"./data/x5d":61,"./data/x5e":62,"./data/x5f":63,"./data/x60":64,"./data/x61":65,"./data/x62":66,"./data/x63":67,"./data/x64":68,"./data/x65":69,"./data/x66":70,"./data/x67":71,"./data/x68":72,"./data/x69":73,"./data/x6a":74,"./data/x6b":75,"./data/x6c":76,"./data/x6d":77,"./data/x6e":78,"./data/x6f":79,"./data/x70":80,"./data/x71":81,"./data/x72":82,"./data/x73":83,"./data/x74":84,"./data/x75":85,"./data/x76":86,"./data/x77":87,"./data/x78":88,"./data/x79":89,"./data/x7a":90,"./data/x7b":91,"./data/x7c":92,"./data/x7d":93,"./data/x7e":94,"./data/x7f":95,"./data/x80":96,"./data/x81":97,"./data/x82":98,"./data/x83":99,"./data/x84":100,"./data/x85":101,"./data/x86":102,"./data/x87":103,"./data/x88":104,"./data/x89":105,"./data/x8a":106,"./data/x8b":107,"./data/x8c":108,"./data/x8d":109,"./data/x8e":110,"./data/x8f":111,"./data/x90":112,"./data/x91":113,"./data/x92":114,"./data/x93":115,"./data/x94":116,"./data/x95":117,"./data/x96":118,"./data/x97":119,"./data/x98":120,"./data/x99":121,"./data/x9a":122,"./data/x9b":123,"./data/x9c":124,"./data/x9d":125,"./data/x9e":126,"./data/x9f":127,"./data/xa0":128,"./data/xa1":129,"./data/xa2":130,"./data/xa3":131,"./data/xa4":132,"./data/xac":133,"./data/xad":134,"./data/xae":135,"./data/xaf":136,"./data/xb0":137,"./data/xb1":138,"./data/xb2":139,"./data/xb3":140,"./data/xb4":141,"./data/xb5":142,"./data/xb6":143,"./data/xb7":144,"./data/xb8":145,"./data/xb9":146,"./data/xba":147,"./data/xbb":148,"./data/xbc":149,"./data/xbd":150,"./data/xbe":151,"./data/xbf":152,"./data/xc0":153,"./data/xc1":154,"./data/xc2":155,"./data/xc3":156,"./data/xc4":157,"./data/xc5":158,"./data/xc6":159,"./data/xc7":160,"./data/xc8":161,"./data/xc9":162,"./data/xca":163,"./data/xcb":164,"./data/xcc":165,"./data/xcd":166,"./data/xce":167,"./data/xcf":168,"./data/xd0":169,"./data/xd1":170,"./data/xd2":171,"./data/xd3":172,"./data/xd4":173,"./data/xd5":174,"./data/xd6":175,"./data/xd7":176,"./data/xf9":177,"./data/xfa":178,"./data/xfb":179,"./data/xfc":180,"./data/xfd":181,"./data/xfe":182,"./data/xff":183}],185:[function(require,module,exports){
"use strict";

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

var unidecode = require('unidecode');
/* TODO v3
 * - Set default transformers as exports
 * - ESM with multiple exports
 * - Deprecate defaultTransformers
 * - Deprecate parseOptions, use a config object instead
 * - Deprecate null as separator
 * - Add support to NFKD normalize, make unidecode an option (full?)
 * - Browser support
 * - Add sentence case transformer
 * - Supported characters:
 *   - default: ALPHA / DIGIT / "-" / "." / "_" / "~"
 *   - path: ALPHA / DIGIT / "-" / "." / "_" / "~" / "!" / "$" / "&" /
 *           "'" / "(" / ")" / "*" / "+" / "," / ";" / "=" / "@"
 *     - ":" is non-zero-length segment without any colon, allow it?
 *   - query: ALPHA / DIGIT / "-" / "." / "_" / "~" / "!" / "$" / "'" / "(" /
 *            ")" / "*" / "+" / "," / ";" / "=" / "@" / "/" / "?"
 *     - "&" is commonly used to separate key/value pairs, allow it?
 *   - hash: ALPHA / DIGIT / "-" / "." / "_" / "~" / "!" / "$" / "&" / "'" /
 *           "(" / ")" / "*" / "+" / "," / ";" / "=" / "@" / "/" / "?"
 */


var INVALID_SEPARATOR = /[^-._~]/;
var CONVERT = /[A-Za-z\d]+/g;
var REVERT = /[^-._~]+/g;
var BASE = '(?:[a-z](?=[A-Z])|[A-Z](?=[A-Z][a-z]))';
var CONVERT_CAMELCASE = new RegExp("[A-Za-z0-9]*?".concat(BASE, "|[A-Za-z0-9]+"), 'g');
var REVERT_CAMELCASE = new RegExp("[^-._~]*?".concat(BASE, "|[^-._~]+"), 'g');
var REVERT_CAMELCASE_WITH_EMPTY_SEPARATOR = new RegExp(".*?".concat(BASE, "|.+"), 'g');
/**
* Check and return validated options
*/

function parseOptions(options) {
  var camelCase;
  var separator;
  var transformer;

  if (2 === options.length) {
    var _options = _slicedToArray(options, 2);

    separator = _options[0];
    transformer = _options[1];
    validate({
      separator: separator,
      transformer: transformer
    });
  } else if (1 === options.length) {
    var option = options[0];

    if (false === option || 'function' === typeof option) {
      transformer = option;
      /* Don't validate */
    } else if (defaultTransformers[option]) {
      /* TODO Remove in v3 */
      transformer = option;
      validate({
        transformer: transformer
      });
      /* Throw deprecation error */
    } else if (typeof option === 'string') {
      separator = option;
      validate({
        separator: separator
      });
    } else if (option != null) {
      camelCase = option.camelCase;
      separator = option.separator;
      transformer = option.transformer;
      validate({
        camelCase: camelCase,
        separator: separator,
        transformer: transformer
      });
    }
  }

  if (defaultTransformers[transformer]) {
    /* Remove in v3.0.0 */
    transformer = defaultTransformers[transformer];
  }

  return {
    camelCase: camelCase,
    separator: separator == null ? void 0 : separator,
    transformer: transformer
  };
}
/**
* Validate options
*/


function validate(_ref) {
  var camelCase = _ref.camelCase,
      separator = _ref.separator,
      transformer = _ref.transformer;

  if (camelCase !== undefined) {
    if (typeof camelCase !== 'boolean') {
      throw new Error("camelCase must be a boolean: \"".concat(camelCase, "\"."));
    }
  }

  if (separator != null) {
    if ('string' !== typeof separator) {
      throw new Error("separator must be a string: \"".concat(separator, "\"."));
    } else if (INVALID_SEPARATOR.test(separator)) {
      throw new Error("separator has invalid characters: \"".concat(separator, "\"."));
    }
  }

  if (transformer != null) {
    if (transformer !== false && typeof transformer !== 'function') {
      if (typeof transformer === 'string' && defaultTransformers[transformer]) {
        throw new Error('Using transformer name as string was deprecated');
        /* TODO Remove in v3 */
      } else {
        throw new Error("transformer must be a function: \"".concat(transformer, "\"."));
      }
    }
  }
}

var UrlSlug = /*#__PURE__*/function () {
  _createClass(UrlSlug, null, [{
    key: "LOWERCASE_TRANSFORMER",
    value: function LOWERCASE_TRANSFORMER(fragments, separator) {
      return fragments.join(separator).toLowerCase();
    }
  }, {
    key: "UPPERCASE_TRANSFORMER",
    value: function UPPERCASE_TRANSFORMER(fragments, separator) {
      return fragments.join(separator).toUpperCase();
    }
  }, {
    key: "TITLECASE_TRANSFORMER",
    value: function TITLECASE_TRANSFORMER(fragments, separator) {
      return fragments.map(function (fragment) {
        return fragment.charAt(0).toUpperCase() + fragment.slice(1).toLowerCase();
      }).join(separator);
    }
    /**
    * Creates a new instance of url-slug
    */

  }]);

  function UrlSlug() {
    _classCallCheck(this, UrlSlug);

    for (var _len = arguments.length, options = new Array(_len), _key = 0; _key < _len; _key++) {
      options[_key] = arguments[_key];
    }

    var _parseOptions = parseOptions(options),
        _parseOptions$camelCa = _parseOptions.camelCase,
        camelCase = _parseOptions$camelCa === void 0 ? true : _parseOptions$camelCa,
        _parseOptions$separat = _parseOptions.separator,
        separator = _parseOptions$separat === void 0 ? '-' : _parseOptions$separat,
        _parseOptions$transfo = _parseOptions.transformer,
        transformer = _parseOptions$transfo === void 0 ? UrlSlug.LOWERCASE_TRANSFORMER : _parseOptions$transfo;

    this.camelCase = camelCase;
    this.separator = separator;
    this.transformer = transformer;
  }
  /**
  * Converts a string into a slug
  */


  _createClass(UrlSlug, [{
    key: "convert",
    value: function convert(string) {
      for (var _len2 = arguments.length, options = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
        options[_key2 - 1] = arguments[_key2];
      }

      var _parseOptions2 = parseOptions(options),
          _parseOptions2$camelC = _parseOptions2.camelCase,
          camelCase = _parseOptions2$camelC === void 0 ? this.camelCase : _parseOptions2$camelC,
          _parseOptions2$separa = _parseOptions2.separator,
          separator = _parseOptions2$separa === void 0 ? this.separator : _parseOptions2$separa,
          _parseOptions2$transf = _parseOptions2.transformer,
          transformer = _parseOptions2$transf === void 0 ? this.transformer : _parseOptions2$transf;

      var fragments = unidecode(String(string)).match(camelCase ? CONVERT_CAMELCASE : CONVERT);

      if (!fragments) {
        return '';
      }

      return transformer ? transformer(fragments, separator) : fragments.join(separator);
    }
    /**
    * Reverts a slug back to a string
    */

  }, {
    key: "revert",
    value: function revert(slug) {
      for (var _len3 = arguments.length, options = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
        options[_key3 - 1] = arguments[_key3];
      }

      var _parseOptions3 = parseOptions(options),
          _parseOptions3$camelC = _parseOptions3.camelCase,
          camelCase = _parseOptions3$camelC === void 0 ? false : _parseOptions3$camelC,
          _parseOptions3$separa = _parseOptions3.separator,
          separator = _parseOptions3$separa === void 0 ? null : _parseOptions3$separa,
          _parseOptions3$transf = _parseOptions3.transformer,
          transformer = _parseOptions3$transf === void 0 ? false : _parseOptions3$transf;

      var fragments;
      slug = String(slug);
      /* Determine which method will be used split the slug */

      if ('' === separator) {
        fragments = slug.match(REVERT_CAMELCASE_WITH_EMPTY_SEPARATOR);
      } else if ('string' === typeof separator) {
        fragments = slug.split(separator);
      } else {
        fragments = slug.match(camelCase ? REVERT_CAMELCASE : REVERT);
      }

      if (!fragments) {
        return '';
      }

      return transformer ? transformer(fragments, ' ') : fragments.join(' ');
    }
  }]);

  return UrlSlug;
}();
/**
* Builtin transformers
*/


var defaultTransformers = {
  /* TODO Deprecate in v3 */
  lowercase: UrlSlug.LOWERCASE_TRANSFORMER,
  uppercase: UrlSlug.UPPERCASE_TRANSFORMER,
  titlecase: UrlSlug.TITLECASE_TRANSFORMER
};
/* Prepare the global instance and export it */

var urlSlug = new UrlSlug();
var global = urlSlug.convert.bind(urlSlug);
global.UrlSlug = UrlSlug;
global.convert = global;
global.revert = urlSlug.revert.bind(urlSlug);
global.transformers = defaultTransformers;
/* TODO Deprecate in v3 */

module.exports = global;
},{"unidecode":184}],186:[function(require,module,exports){
var domtoimage = require('dom-to-image');
var slugify = require('slugify');
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
        img.dataset.slug = urlSlug(striptags(text.innerHTML));
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
    copyTextToClipboard(text.innerHTML);
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
},{"dom-to-image":1,"slugify":2,"striptags":3,"url-slug":185}]},{},[186]);
